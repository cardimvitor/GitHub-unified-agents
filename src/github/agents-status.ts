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
    throw new Error(data.message ? `GitHub refused: ${data.message} (${response.status}).` : `GitHub responded with ${response.status}.`)
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
    body: JSON.stringify({ environment_ids: [run.environmentId], state: 'approved', comment: 'Approved from the app' })
  })
}

// Uma Issue, um agente: remove menções de outros agentes do texto do plano antes de criar a Issue.
export function bodyForExecutor(plan: string, mention: string) {
  const others = AGENT_MENTIONS.filter((item) => item !== mention)
  let cleaned = plan
  for (const other of others) cleaned = cleaned.split(other).join(other.slice(1))
  return `${cleaned}\n\n---\n${mention} carry out the plan above in this repository and open a pull request.`
}

export type IssueDetail = { number: number; title: string; body: string; state: string; url: string; mentions: string[] }
export type IssueComment = { id: number; author: string; body: string; createdAt: string }

export async function getIssueDetail(token: string, fullName: string, number: number): Promise<IssueDetail> {
  const issue = await gh<{ number: number; title: string; body: string | null; state: string; html_url: string }>(token, `/repos/${fullName}/issues/${number}`)
  const body = issue.body ?? ''
  return {
    number: issue.number,
    title: issue.title,
    body,
    state: issue.state,
    url: issue.html_url,
    mentions: AGENT_MENTIONS.filter((mention) => body.includes(mention))
  }
}

export async function listIssueComments(token: string, fullName: string, number: number): Promise<IssueComment[]> {
  const comments = await gh<Array<{ id: number; body: string | null; created_at: string; user: { login: string } | null }>>(
    token, `/repos/${fullName}/issues/${number}/comments?per_page=100`
  )
  return comments.map((comment) => ({
    id: comment.id,
    author: comment.user?.login ?? 'unknown',
    body: comment.body ?? '',
    createdAt: comment.created_at
  }))
}

export async function postIssueComment(token: string, fullName: string, number: number, body: string) {
  await gh(token, `/repos/${fullName}/issues/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  })
}

// Roda os agentes de uma Issue de novo: um comentário com o texto da Issue dispara os workflows (issue_comment).
export async function runIssueAgents(token: string, fullName: string, number: number) {
  const issue = await gh<{ body: string | null }>(token, `/repos/${fullName}/issues/${number}`)
  const body = issue.body?.trim()
  if (!body) throw new Error(`Issue #${number} has no text to send to the agents.`)
  await gh(token, `/repos/${fullName}/issues/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  })
}

export async function closeIssue(token: string, fullName: string, number: number) {
  await gh(token, `/repos/${fullName}/issues/${number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' })
  })
}

