import { githubSession } from '@/storage/github-session'

// Environment que guarda os secrets dos agentes. Os jobs dos agentes declaram `environment: agents`.
export const AGENTS_ENVIRONMENT = 'agents'

const API = 'https://api.github.com'

async function call<T>(token: string, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; message: string }> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {})
    }
  })
  if (response.status === 401) {
    await githubSession.clear()
    throw new Error('O GitHub recusou o login salvo (token expirado ou revogado). Conecte o GitHub de novo na tela inicial.')
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null) as T | null
  const message = (data as { message?: string } | null)?.message ?? ''
  return { ok: response.ok, status: response.status, data, message }
}

export async function repositoryInfo(token: string, fullName: string) {
  const result = await call<{ id: number; private: boolean }>(token, `/repos/${fullName}`)
  if (!result.data) throw new Error(`Repositório ${fullName} não encontrado.`)
  return { id: result.data.id, private: result.data.private }
}

// Cria o environment `agents`. Se a conta puder exigir aprovação, o usuário atual vira revisor obrigatório.
// Em repositório privado nos planos Free, Pro e Team a aprovação não é aceita: cria sem revisor e avisa.
export async function ensureAgentsEnvironment(token: string, fullName: string): Promise<{ repositoryId: number; protected: boolean; message: string }> {
  const repo = await repositoryInfo(token, fullName)
  const user = await call<{ id: number }>(token, '/user')
  if (!user.data) throw new Error('Não foi possível identificar sua conta GitHub.')
  const withReviewer = await call(token, `/repos/${fullName}/environments/${AGENTS_ENVIRONMENT}`, {
    method: 'PUT',
    body: JSON.stringify({ reviewers: [{ type: 'User', id: user.data.id }] })
  })
  if (withReviewer.ok) {
    return { repositoryId: repo.id, protected: true, message: 'Environment agents criado: cada execução espera sua aprovação.' }
  }
  const plain = await call(token, `/repos/${fullName}/environments/${AGENTS_ENVIRONMENT}`, { method: 'PUT', body: JSON.stringify({}) })
  if (!plain.ok) throw new Error(`Não foi possível criar o environment agents (${plain.status}). ${plain.message}`)
  return {
    repositoryId: repo.id,
    protected: false,
    message: 'Environment agents criado sem aprovação obrigatória: neste repositório a exigência de revisor não está disponível no plano atual. Os agentes rodam sem a sua aprovação.'
  }
}

export async function environmentSecretNames(token: string, repositoryId: number): Promise<string[]> {
  const result = await call<{ secrets: Array<{ name: string }> }>(token, `/repositories/${repositoryId}/environments/${AGENTS_ENVIRONMENT}/secrets`)
  return (result.data?.secrets ?? []).map((secret) => secret.name)
}
