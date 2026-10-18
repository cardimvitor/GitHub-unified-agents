import * as Crypto from 'expo-crypto'
import ChatGptAuth from '../../modules/chatgpt-auth'
import { chatGptSession } from '@/storage/chatgpt-session'

const AUTH_URL = 'https://auth.openai.com/api/accounts/authorize'
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
const RESOURCE = 'https://api.openai.com/v1'

export type PendingChatGptLogin = { state: string; verifier: string; redirectUri: string }

function base64Url(bytes: Uint8Array) {
  let value = ''
  bytes.forEach((byte) => { value += String.fromCharCode(byte) })
  return globalThis.btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function beginChatGptLogin() {
  const [{ redirectUri }, stateBytes, verifierBytes] = await Promise.all([
    ChatGptAuth.startCallbackListener(),
    Crypto.getRandomBytesAsync(32),
    Crypto.getRandomBytesAsync(64)
  ])
  const state = base64Url(stateBytes)
  const verifier = base64Url(verifierBytes)
  const challenge = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const params = new URLSearchParams({
    client_id: 'dynamic_agent_client',
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    agent_name_hint: 'GitHub Unified Agents'
  })
  return { url: `${AUTH_URL}?${params.toString()}`, pending: { state, verifier, redirectUri } satisfies PendingChatGptLogin }
}

export async function finishChatGptLogin(callback: { code: string; state: string; clientId: string }, pending: PendingChatGptLogin) {
  if (callback.state !== pending.state) throw new Error('A resposta de login não corresponde a esta solicitação.')
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: callback.clientId, code: callback.code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }).toString() })
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'ChatGPT não aceitou a autorização.')
  await chatGptSession.save({ accessToken: data.access_token, refreshToken: data.refresh_token, clientId: callback.clientId, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined })
}
