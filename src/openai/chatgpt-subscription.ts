import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import ChatGptAuth from '../../modules/chatgpt-auth'
import { chatGptSession, type ChatGptPlanSession } from '@/storage/chatgpt-session'

const AUTH_URL = 'https://auth.openai.com/api/accounts/authorize'
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
const RESOURCE = 'https://api.openai.com/v1'
const HOST_ID_KEY = 'chatgpt-plan-host-id'
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'

export type PendingChatGptLogin = { state: string; nonce: string; verifier: string; redirectUri: string; clientId?: string }

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
  error_description?: string
}

function base64Url(bytes: Uint8Array) {
  let value = ''
  bytes.forEach((byte) => { value += String.fromCharCode(byte) })
  return globalThis.btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function getHostId() {
  const stored = await SecureStore.getItemAsync(HOST_ID_KEY)
  if (stored) return stored
  const hostId = `urn:uuid:${Crypto.randomUUID()}`
  await SecureStore.setItemAsync(HOST_ID_KEY, hostId)
  return hostId
}

function normalizeScopes(scope?: string) {
  return (scope ?? '').split(/\s+/).filter(Boolean)
}

export async function beginChatGptLogin() {
  const [previous, hostId, { redirectUri }, stateBytes, nonceBytes, verifierBytes] = await Promise.all([
    chatGptSession.read(),
    getHostId(),
    ChatGptAuth.startCallbackListener(),
    Crypto.getRandomBytesAsync(32),
    Crypto.getRandomBytesAsync(32),
    Crypto.getRandomBytesAsync(64)
  ])
  const state = base64Url(stateBytes)
  const nonce = base64Url(nonceBytes)
  const verifier = base64Url(verifierBytes)
  const challenge = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const params = new URLSearchParams({
    client_id: previous?.clientId ?? 'dynamic_agent_client',
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    ext_agent_host_id: hostId,
    agent_name_hint: 'GitHub Unified Agents'
  })
  return { url: `${AUTH_URL}?${params.toString()}`, pending: { state, nonce, verifier, redirectUri, clientId: previous?.clientId } satisfies PendingChatGptLogin }
}

export async function finishChatGptLogin(callback: { code: string; state: string; clientId?: string }, pending: PendingChatGptLogin) {
  if (callback.state !== pending.state) throw new Error('A resposta de login não corresponde a esta solicitação.')
  const clientId = callback.clientId ?? pending.clientId
  if (!clientId) throw new Error('O ChatGPT não retornou o client ID da autorização.')
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: callback.code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }).toString() })
  const data = await response.json() as TokenResponse
  if (!response.ok || !data.access_token || !data.id_token) throw new Error(data.error_description || 'ChatGPT não aceitou a autorização.')
  const scopes = normalizeScopes(data.scope)
  if (!scopes.includes(PLAN_SCOPE)) throw new Error('A conta entrou, mas não autorizou o uso da assinatura para o chat.')
  const identity = await ChatGptAuth.verifyIdentity(data.id_token, clientId, pending.nonce)
  await chatGptSession.save({ accessToken: data.access_token, refreshToken: data.refresh_token, idToken: data.id_token, clientId, subject: identity.subject, email: identity.email, scopes, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined })
}

export async function disconnectChatGpt() {
  const session = await chatGptSession.read()
  let revoked = false
  try {
    if (session?.refreshToken) {
      const configuration = await fetch('https://auth.openai.com/.well-known/openid-configuration')
      const data = await configuration.json() as { revocation_endpoint?: string }
      if (configuration.ok && data.revocation_endpoint) {
        const response = await fetch(data.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: session.refreshToken, token_type_hint: 'refresh_token', client_id: session.clientId }).toString() })
        revoked = response.ok
      }
    }
  } finally {
    await chatGptSession.clear()
  }
  return revoked
}

export async function accessTokenForChatGpt(session: ChatGptPlanSession) {
  if (!Array.isArray(session.scopes) || !session.scopes.includes(PLAN_SCOPE)) {
    await chatGptSession.clear()
    throw new Error('Esta conexão ChatGPT precisa ser feita novamente para autorizar o chat por assinatura.')
  }
  if (!session.expiresAt || session.expiresAt - Date.now() > 120_000) return session.accessToken
  if (!session.refreshToken) {
    await chatGptSession.clear()
    throw new Error('A sessão ChatGPT expirou. Conecte sua conta novamente.')
  }
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: session.clientId, refresh_token: session.refreshToken, resource: RESOURCE }).toString() })
  const data = await response.json() as TokenResponse
  if (!response.ok || !data.access_token || !data.refresh_token) {
    await chatGptSession.clear()
    throw new Error(data.error_description || 'A sessão ChatGPT expirou. Conecte sua conta novamente.')
  }
  const scopes = normalizeScopes(data.scope)
  if (!scopes.includes(PLAN_SCOPE)) {
    await chatGptSession.clear()
    throw new Error('A assinatura ChatGPT não autorizou mais o uso no chat.')
  }
  const refreshed = { ...session, accessToken: data.access_token, refreshToken: data.refresh_token, idToken: data.id_token ?? session.idToken, scopes, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined }
  await chatGptSession.save(refreshed)
  return refreshed.accessToken
}
