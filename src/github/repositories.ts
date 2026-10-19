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
    throw new Error('O GitHub recusou o login salvo (token expirado ou revogado). Conecte o GitHub de novo na tela inicial.')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(data.message ? `GitHub recusou: ${data.message} (${response.status}).` : `GitHub respondeu com ${response.status}.`)
  }
  return response.json() as Promise<T>
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
  if (!repo) throw new Error('GitHub não criou o repositório.')
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

export const REQUIRED_SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY']
