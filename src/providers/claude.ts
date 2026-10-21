function messageFor(status: number) {
  if (status === 401 || status === 403) return 'The Anthropic key was rejected. Check the key and the account access.'
  return `The Claude API did not respond to validation (HTTP ${status}). Try again.`
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
