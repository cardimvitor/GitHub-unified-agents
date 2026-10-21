function messageFor(status: number) {
  if (status === 401 || status === 403) return 'The DeepSeek key was rejected. Check the key and its permissions.'
  return `DeepSeek did not respond to validation (HTTP ${status}). Try again.`
}

export async function validateDeepSeekApiKey(apiKey: string) {
  const response = await fetch('https://api.deepseek.com/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  })

  if (!response.ok) throw new Error(messageFor(response.status))
}
