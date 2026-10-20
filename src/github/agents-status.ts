// Estado dos agentes no repositório: Issues com menção, execuções e aprovações do environment `agents`.
const API = 'https://api.github.com'
export const AGENT_MENTIONS = ['@claude', '@codex', '@deepseek'] as const

export type AgentIssue = { number: number; title: string; state: string; url: string; mentions: string[] }
export type AgentRun = { id: number; name: string; title: string; status: string; conclusion: string | null; url: string }
export type PendingRun = { runId: number; title: string; environmentId: number; url: string }

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {})
    }
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(data.message ? `GitHub recusou: ${data.message} (${response.status}).` : `GitHub respondeu com ${response.status}.`)
  }
  return response.status === 204 ? (null as T) : response.json() as Promise<T>
}

export async function listAgentIssues(token: string, fullName: string): Promise<AgentIssue[]> {
  const issues = await gh<Array<{ number: number; title: string; state: string; html_url: string; body: string | null; pull_request?: unknown }>>(
    token, `/repos/${fullName}/issues?state=all&per_page=30&sort=created&direction=desc`
  )
  return issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      mentions: AGENT_MENTIONS.filter((mention) => (issue.body ?? '').includes(mention))
    }))
    .filter((issue) => issue.mentions.length > 0)
}

export async function listRecentAgentRuns(token: string, fullName: string): Promise<AgentRun[]> {
  const data = await gh<{ workflow_runs: Array<{ id: number; name: string; display_title: string; status: string; conclusion: string | null; html_url: string }> }>(
    token, `/repos/${fullName}/actions/runs?per_page=50`
  )
  return data.workflow_runs
    .filter((run) => run.name === 'Claude Code' || run.name.startsWith('Agents'))
    .map((run) => ({ id: run.id, name: run.name, title: run.display_title, status: run.status, conclusion: run.conclusion, url: run.html_url }))
}

export async function listPendingRuns(token: string, fullName: string): Promise<PendingRun[]> {
  const waiting = await gh<{ workflow_runs: Array<{ id: number; display_title: string; html_url: string }> }>(
    token, `/repos/${fullName}/actions/runs?status=waiting&per_page=50`
  )
  const pending: PendingRun[] = []
  for (const run of waiting.workflow_runs) {
    const deployments = await gh<Array<{ environment: { id: number }; current_user_can_approve: boolean }>>(
      token, `/repos/${fullName}/actions/runs/${run.id}/pending_deployments`
    )
    const approvable = deployments.find((item) => item.current_user_can_approve)
    if (approvable) pending.push({ runId: run.id, title: run.display_title, environmentId: approvable.environment.id, url: run.html_url })
  }
  return pending
}

export async function approveRun(token: string, fullName: string, run: PendingRun) {
  await gh(token, `/repos/${fullName}/actions/runs/${run.runId}/pending_deployments`, {
    method: 'POST',
    body: JSON.stringify({ environment_ids: [run.environmentId], state: 'approved', comment: 'Aprovado pelo app' })
  })
}
