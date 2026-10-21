function messageFor(status: number) {
  if (status === 401 || status === 403) return 'The OpenAI key was rejected. Check the key and the account access.'
  return `OpenAI did not respond to validation (HTTP ${status}). Try again.`
}

export async function validateOpenAiApiKey(apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  })

  if (!response.ok) throw new Error(messageFor(response.status))
}
