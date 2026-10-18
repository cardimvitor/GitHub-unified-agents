const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export type DeviceAuthorization = {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

type TokenResponse = {
  access_token?: string
  error?: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied'
}

function clientId(): string {
  const value = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID
  if (!value) throw new Error('A configuração segura da versão não inclui o login GitHub. Contate o administrador do aplicativo.')
  return value
}

export async function beginGitHubDeviceAuthorization(): Promise<DeviceAuthorization> {
  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: new URLSearchParams({ client_id: clientId(), scope: 'repo workflow' }).toString()
  })
  if (!response.ok) throw new Error('Não foi possível iniciar o login no GitHub.')
  const payload = await response.json()
  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    expiresIn: payload.expires_in,
    interval: payload.interval
  }
}

export async function pollGitHubAccessToken(deviceCode: string): Promise<string | null> {
  const response = await fetch(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: new URLSearchParams({
      client_id: clientId(),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    }).toString()
  })
  if (!response.ok) throw new Error('Falha ao verificar o login no GitHub.')
  const payload = (await response.json()) as TokenResponse
  if (payload.access_token) return payload.access_token
  if (payload.error === 'authorization_pending' || payload.error === 'slow_down') return null
  throw new Error('A autorização no GitHub não foi concluída.')
}
