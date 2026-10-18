function messageFor(status: number) {
  if (status === 401 || status === 403) return 'A chave DeepSeek foi recusada. Confira a chave e as permissões.'
  return `DeepSeek não respondeu à validação (HTTP ${status}). Tente novamente.`
}

export async function validateDeepSeekApiKey(apiKey: string) {
  const response = await fetch('https://api.deepseek.com/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  })

  if (!response.ok) throw new Error(messageFor(response.status))
}
