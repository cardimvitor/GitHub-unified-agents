export type GitHubRepository = {
  fullName: string
  private: boolean
  defaultBranch: string
}

export type GitHubUser = {
  login: string
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {})
    }
  })
  if (!response.ok) throw new Error(`GitHub respondeu com ${response.status}.`)
  return response.json() as Promise<T>
}

export async function getAuthenticatedGitHubUser(token: string): Promise<GitHubUser> {
  const user = await request<{ login: string }>(token, '/user')
  return { login: user.login }
}

export async function getRepository(token: string, owner: string, name: string): Promise<GitHubRepository> {
  const repository = await request<{ full_name: string; private: boolean; default_branch: string }>(
    token,
    `/repos/${owner}/${name}`
  )
  return {
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: repository.default_branch
  }
}

export async function createIssue(token: string, owner: string, name: string, title: string, body: string) {
  return request<{ html_url: string }>(token, `/repos/${owner}/${name}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, labels: ['agent-task'] })
  })
}
