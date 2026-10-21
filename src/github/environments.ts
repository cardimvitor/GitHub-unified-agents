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
    throw new Error('GitHub refused the saved login (token expired or revoked). Connect GitHub again on the home screen.')
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null) as T | null
  const message = (data as { message?: string } | null)?.message ?? ''
  return { ok: response.ok, status: response.status, data, message }
}

export async function repositoryInfo(token: string, fullName: string) {
  const result = await call<{ id: number; private: boolean }>(token, `/repos/${fullName}`)
  if (!result.data) throw new Error(`Repository ${fullName} not found.`)
  return { id: result.data.id, private: result.data.private }
}

// Cria o environment `agents`. Se a conta puder exigir aprovação, o usuário atual vira revisor obrigatório.
// Em repositório privado nos planos Free, Pro e Team a aprovação não é aceita: cria sem revisor e avisa.
// Com automatic, o environment fica sem revisor: os agentes rodam sem a sua aprovação. Os secrets continuam
// presos ao environment, então só os jobs dos agentes os recebem.
export async function ensureAgentsEnvironment(token: string, fullName: string, automatic = false): Promise<{ repositoryId: number; protected: boolean; message: string }> {
  const repo = await repositoryInfo(token, fullName)
  if (automatic) {
    const open = await call(token, `/repos/${fullName}/environments/${AGENTS_ENVIRONMENT}`, { method: 'PUT', body: JSON.stringify({ reviewers: [] }) })
    if (!open.ok) throw new Error(`Could not set up the agents environment without approval (${open.status}). ${open.message}`)
    return { repositoryId: repo.id, protected: false, message: 'Agents environment without approval: agents run automatically for repository members.' }
  }
  const user = await call<{ id: number }>(token, '/user')
  if (!user.data) throw new Error('Could not identify your GitHub account.')
  const withReviewer = await call(token, `/repos/${fullName}/environments/${AGENTS_ENVIRONMENT}`, {
    method: 'PUT',
    body: JSON.stringify({ reviewers: [{ type: 'User', id: user.data.id }] })
  })
  if (withReviewer.ok) {
    return { repositoryId: repo.id, protected: true, message: 'Agents environment created: each run waits for your approval.' }
  }
  const plain = await call(token, `/repos/${fullName}/environments/${AGENTS_ENVIRONMENT}`, { method: 'PUT', body: JSON.stringify({}) })
  if (!plain.ok) throw new Error(`Could not create the agents environment (${plain.status}). ${plain.message}`)
  return {
    repositoryId: repo.id,
    protected: false,
    message: 'Agents environment created without required approval: reviewer rules are not available for this repository on the current plan. Agents run without your approval.'
  }
}

export async function environmentSecretNames(token: string, repositoryId: number): Promise<string[]> {
  const result = await call<{ secrets: Array<{ name: string }> }>(token, `/repositories/${repositoryId}/environments/${AGENTS_ENVIRONMENT}/secrets`)
  return (result.data?.secrets ?? []).map((secret) => secret.name)
}
