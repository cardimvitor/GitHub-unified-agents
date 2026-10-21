import { AGENT_TEMPLATE } from '@/github/agent-template'
import { githubSession } from '@/storage/github-session'

const API = 'https://api.github.com'

export type RepositoryInfo = { fullName: string; private: boolean; defaultBranch: string }

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {})
    }
  })
  if (response.status === 404) return null
  if (response.status === 401) {
    // Token expirado ou revogado: remove o login salvo para o app pedir a conexão de novo.
    await githubSession.clear()
    throw new Error('GitHub refused the saved login (token expired or revoked). Connect GitHub again on the home screen.')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(data.message ? `GitHub refused: ${data.message} (${response.status}).` : `GitHub responded with ${response.status}.`)
  }
  // Algumas respostas de sucesso não têm corpo (ex.: PUT de permissões responde 204).
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

type RepoPayload = { full_name: string; private: boolean; default_branch: string }
const toRepo = (repo: RepoPayload): RepositoryInfo => ({ fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch })

export async function listRepositories(token: string): Promise<RepositoryInfo[]> {
  const repos = await api<RepoPayload[]>(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator') ?? []
  return repos.map(toRepo)
}

export async function createRepository(token: string, name: string, isPrivate: boolean): Promise<RepositoryInfo> {
  const repo = await api<RepoPayload>(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name, private: isPrivate, auto_init: true, has_issues: true })
  })
  if (!repo) throw new Error('GitHub did not create the repository.')
  return toRepo(repo)
}

// Base64 de UTF-8 (btoa sozinho não aceita caracteres acentuados).
function base64Utf8(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return globalThis.btoa(binary)
}

async function fileSha(token: string, owner: string, repo: string, path: string): Promise<string | undefined> {
  const file = await api<{ sha: string }>(token, `/repos/${owner}/${repo}/contents/${path}`)
  return file?.sha
}

// Grava o setup de agentes no repositório, um arquivo por vez. Pode rodar de novo: atualiza os arquivos existentes.
export async function configureAgents(token: string, fullName: string, onProgress?: (path: string) => void) {
  const [owner, repo] = fullName.split('/')
  for (const [path, content] of Object.entries(AGENT_TEMPLATE)) {
    onProgress?.(path)
    const sha = await fileSha(token, owner, repo, path)
    await api(token, `/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'agents: configura o setup de agentes', content: base64Utf8(content), ...(sha ? { sha } : {}) })
    })
  }
}

// Nomes dos secrets do repositório (os valores nunca são lidos).
export async function listSecretNames(token: string, fullName: string): Promise<string[]> {
  const [owner, repo] = fullName.split('/')
  const data = await api<{ secrets: Array<{ name: string }> }>(token, `/repos/${owner}/${repo}/actions/secrets`)
  return (data?.secrets ?? []).map((secret) => secret.name)
}


const COPILOT_RULESET = 'Copilot code review'

// Liga a revisão automática do Copilot na branch padrão, por um ruleset. Não duplica se já existir.
// Os nomes do tipo de regra e dos parâmetros não foram conferidos contra a referência da API: se o GitHub recusar,
// a mensagem dele aparece no app e a ativação pode ser feita em Settings → Rules.
export async function enableCopilotReview(token: string, fullName: string): Promise<{ ok: boolean; message: string }> {
  const [owner, repo] = fullName.split('/')
  try {
    const existing = await api<Array<{ name: string }>>(token, `/repos/${owner}/${repo}/rulesets`) ?? []
    if (existing.some((ruleset) => ruleset.name === COPILOT_RULESET)) {
      return { ok: true, message: 'Copilot review was already on.' }
    }
    await api(token, `/repos/${owner}/${repo}/rulesets`, {
      method: 'POST',
      body: JSON.stringify({
        name: COPILOT_RULESET,
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
        rules: [{ type: 'copilot_code_review', parameters: { review_on_push: true, review_draft_pull_requests: false } }]
      })
    })
    return { ok: true, message: 'Automatic Copilot review turned on.' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, message: `Could not turn on Copilot review through the API: ${reason} Turn it on in Settings → Rules by creating a ruleset with the automatic Copilot review rule.` }
  }
}

// Permite que o GitHub Actions crie e aprove PRs, para os agentes abrirem o PR no fim da execução.
export async function allowActionsPullRequests(token: string, fullName: string): Promise<{ ok: boolean; message: string }> {
  const [owner, repo] = fullName.split('/')
  try {
    await api(token, `/repos/${owner}/${repo}/actions/permissions/workflow`, {
      method: 'PUT',
      body: JSON.stringify({ default_workflow_permissions: 'write', can_approve_pull_request_reviews: true })
    })
    return { ok: true, message: 'Actions pode criar PRs.' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, message: `Could not allow Actions to create PRs: ${reason}` }
  }
}

