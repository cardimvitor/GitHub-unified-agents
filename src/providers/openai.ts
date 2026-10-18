function messageFor(status: number) {
  if (status === 401 || status === 403) return 'A chave OpenAI foi recusada. Confira a chave e o acesso da conta.'
  return `OpenAI não respondeu à validação (HTTP ${status}). Tente novamente.`
}

export async function validateOpenAiApiKey(apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  })

  if (!response.ok) throw new Error(messageFor(response.status))
}
