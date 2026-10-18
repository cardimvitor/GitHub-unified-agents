function messageFor(status: number) {
  if (status === 401 || status === 403) return 'A chave da Anthropic foi recusada. Confira a chave e o acesso da conta.'
  return `Claude API não respondeu à validação (HTTP ${status}). Tente novamente.`
}

export async function validateClaudeApiKey(apiKey: string) {
  const response = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey
    }
  })

  if (!response.ok) throw new Error(messageFor(response.status))
}
