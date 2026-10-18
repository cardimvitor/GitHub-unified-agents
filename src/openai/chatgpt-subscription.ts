import ChatGptAuth from '../../modules/chatgpt-auth'
import { chatGptSession, type ChatGptPlanSession } from '@/storage/chatgpt-session'

// Endpoints e client usados pelo Codex CLI oficial (openai/codex, release 0.163.0).
// O login por código de dispositivo não usa redirect local, então funciona em celular.
const ISSUER = 'https://auth.openai.com'
const AUTH_API = `${ISSUER}/api/accounts`
const TOKEN_URL = `${ISSUER}/oauth/token`
const REVOKE_URL = `${ISSUER}/oauth/revoke`
const VERIFICATION_URL = `${ISSUER}/codex/device`
const DEVICE_CALLBACK_URL = `${ISSUER}/deviceauth/callback`
export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000
const REFRESH_MARGIN_MS = 120_000

export type ChatGptDeviceLogin = {
  deviceAuthId: string
  userCode: string
  verificationUrl: string
  intervalMs: number
  expiresAt: number
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  error_description?: string
}

async function readJson(response: Response, fallback: string) {
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = data as { error?: { message?: string } | string; error_description?: string; message?: string }
    const detail = typeof record.error === 'string' ? record.error : record.error?.message ?? record.error_description ?? record.message
    throw new Error(detail ? `${fallback} (${detail}).` : `${fallback} (HTTP ${response.status}).`)
  }
  return data as Record<string, unknown>
}

function jwtExpiryMs(token: string): number | undefined {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(globalThis.atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='))) as { exp?: number }
    return claims.exp ? claims.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

export async function beginChatGptDeviceLogin(): Promise<ChatGptDeviceLogin> {
  const response = await fetch(`${AUTH_API}/deviceauth/usercode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID })
  })
  const data = await readJson(response, 'Não foi possível iniciar o login ChatGPT')
  const userCode = (data.user_code ?? data.usercode) as string | undefined
  const deviceAuthId = data.device_auth_id as string | undefined
  if (!deviceAuthId || !userCode) throw new Error('ChatGPT não retornou o código de login.')
  return {
    deviceAuthId,
    userCode,
    verificationUrl: VERIFICATION_URL,
    intervalMs: Math.max(Number(data.interval ?? 5), 1) * 1000,
    expiresAt: Date.now() + LOGIN_TIMEOUT_MS
  }
}

// Retorna null enquanto o usuário ainda não confirmou o código no navegador.
export async function pollChatGptDeviceLogin(login: ChatGptDeviceLogin): Promise<ChatGptPlanSession | null> {
  const response = await fetch(`${AUTH_API}/deviceauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_auth_id: login.deviceAuthId, user_code: login.userCode })
  })
  if (response.status === 403 || response.status === 404) return null
  const grant = await readJson(response, 'O login ChatGPT foi recusado') as { authorization_code?: string; code_verifier?: string }
  if (!grant.authorization_code || !grant.code_verifier) throw new Error('ChatGPT não retornou a autorização.')

  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CHATGPT_CLIENT_ID,
      code: grant.authorization_code,
      code_verifier: grant.code_verifier,
      redirect_uri: DEVICE_CALLBACK_URL
    }).toString()
  })
  const tokens = await tokenResponse.json().catch(() => ({})) as TokenResponse
  if (!tokenResponse.ok || !tokens.access_token || !tokens.id_token) {
    throw new Error(tokens.error_description || 'ChatGPT não aceitou a autorização.')
  }

  // Sem nonce: o login por dispositivo não envia um. A assinatura, emissor, público e validade são verificados.
  const identity = await ChatGptAuth.verifyIdentity(tokens.id_token, CHATGPT_CLIENT_ID, null)
  if (!identity.accountId) throw new Error('A conta ChatGPT não informou o identificador de workspace.')
  const session: ChatGptPlanSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    clientId: CHATGPT_CLIENT_ID,
    subject: identity.subject,
    email: identity.email,
    accountId: identity.accountId,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : jwtExpiryMs(tokens.access_token)
  }
  await chatGptSession.save(session)
  return session
}

export async function disconnectChatGpt() {
  const session = await chatGptSession.read()
  let revoked = false
  try {
    if (session?.refreshToken) {
      const response = await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.refreshToken, token_type_hint: 'refresh_token', client_id: session.clientId })
      })
      revoked = response.ok
    }
  } catch {
    revoked = false
  } finally {
    await chatGptSession.clear()
  }
  return revoked
}

// Devolve uma sessão com access token válido, renovando o token rotativo quando estiver perto de expirar.
export async function currentChatGptSession(session: ChatGptPlanSession): Promise<ChatGptPlanSession> {
  // Sessões salvas por versões anteriores do app não têm accountId nem o client oficial: precisam ser refeitas.
  if (!session.accountId || session.clientId !== CHATGPT_CLIENT_ID) {
    await chatGptSession.clear()
    throw new Error('Esta conexão ChatGPT foi feita por uma versão anterior. Conecte sua conta novamente.')
  }
  if (!session.expiresAt || session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return session
  if (!session.refreshToken) {
    await chatGptSession.clear()
    throw new Error('A sessão ChatGPT expirou. Conecte sua conta novamente.')
  }
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: session.clientId,
      refresh_token: session.refreshToken,
      scope: 'openid profile email'
    }).toString()
  })
  const data = await response.json().catch(() => ({})) as TokenResponse
  if (!response.ok || !data.access_token) {
    await chatGptSession.clear()
    throw new Error(data.error_description || 'A sessão ChatGPT expirou. Conecte sua conta novamente.')
  }
  const refreshed: ChatGptPlanSession = {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? session.refreshToken,
    idToken: data.id_token ?? session.idToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : jwtExpiryMs(data.access_token)
  }
  await chatGptSession.save(refreshed)
  return refreshed
}
