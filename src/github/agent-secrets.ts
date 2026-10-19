import { AGENTS_ENVIRONMENT } from '@/github/environments'
import { setEnvironmentSecret } from '@/github/secrets'
import { currentChatGptSession } from '@/openai/chatgpt-subscription'
import { agentCredentials } from '@/storage/agent-credentials'
import { chatGptSession, type ChatGptPlanSession } from '@/storage/chatgpt-session'
import { providerCredentials } from '@/storage/provider-credentials'

export type SecretReport = { name: string; ok: boolean; detail: string }

// Formato do ~/.codex/auth.json de um login ChatGPT. Conferido com o Codex CLI 0.163.0 (`codex login status`
// reconhece o arquivo). Não confirma que os tokens sejam aceitos pelo servidor.
export function buildCodexAuthJson(session: ChatGptPlanSession) {
  return JSON.stringify({
    OPENAI_API_KEY: null,
    tokens: { id_token: session.idToken, access_token: session.accessToken, refresh_token: session.refreshToken, account_id: session.accountId },
    last_refresh: new Date().toISOString()
  })
}

// Nomes que o app não consegue enviar sozinho: o que o usuário ainda precisa cadastrar.
export function missingSecrets(existing: string[]) {
  const missing: string[] = []
  if (!existing.includes('CLAUDE_CODE_OAUTH_TOKEN')) missing.push('CLAUDE_CODE_OAUTH_TOKEN')
  if (!existing.includes('DEEPSEEK_API_KEY')) missing.push('DEEPSEEK_API_KEY')
  if (!existing.includes('OPENAI_API_KEY') && !existing.includes('CODEX_AUTH_JSON')) missing.push('OPENAI_API_KEY ou CODEX_AUTH_JSON')
  return missing
}

async function push(token: string, repositoryId: number, name: string, value: string): Promise<SecretReport> {
  try {
    await setEnvironmentSecret(token, repositoryId, AGENTS_ENVIRONMENT, name, value)
    return { name, ok: true, detail: 'enviado' }
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : 'erro ao enviar' }
  }
}

// Envia ao environment as credenciais que o app já tem. O que não existe no aparelho fica de fora e é listado.
export async function pushAgentSecrets(token: string, repositoryId: number): Promise<SecretReport[]> {
  const reports: SecretReport[] = []
  const [claude, deepseek, openai, stored] = await Promise.all([
    agentCredentials.readClaude(),
    providerCredentials.read('deepseek'),
    providerCredentials.read('openai'),
    chatGptSession.read()
  ])

  if (claude) reports.push(await push(token, repositoryId, 'CLAUDE_CODE_OAUTH_TOKEN', claude))
  else reports.push({ name: 'CLAUDE_CODE_OAUTH_TOKEN', ok: false, detail: 'o app ainda não tem o token do Claude' })

  if (deepseek) reports.push(await push(token, repositoryId, 'DEEPSEEK_API_KEY', deepseek))
  else reports.push({ name: 'DEEPSEEK_API_KEY', ok: false, detail: 'conecte o DeepSeek no app' })

  // API key é o caminho oficial para o Codex em CI. O login da assinatura só vai se não houver API key.
  if (openai) reports.push(await push(token, repositoryId, 'OPENAI_API_KEY', openai))
  else if (stored) {
    try {
      const session = await currentChatGptSession(stored)
      if (!session.refreshToken) reports.push({ name: 'CODEX_AUTH_JSON', ok: false, detail: 'a sessão ChatGPT não tem token de renovação' })
      else reports.push(await push(token, repositoryId, 'CODEX_AUTH_JSON', buildCodexAuthJson(session)))
    } catch (error) {
      reports.push({ name: 'CODEX_AUTH_JSON', ok: false, detail: error instanceof Error ? error.message : 'sessão ChatGPT inválida' })
    }
  } else reports.push({ name: 'OPENAI_API_KEY', ok: false, detail: 'conecte o ChatGPT ou a OpenAI API no app' })

  return reports
}
