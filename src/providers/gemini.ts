const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function validateGeminiApiKey(apiKey: string): Promise<void> {
  const response = await fetch(GEMINI_MODELS_URL, {
    headers: { 'x-goog-api-key': apiKey }
  })
  if (response.ok) return
  if (response.status === 401 || response.status === 403) {
    throw new Error('A chave Gemini foi recusada. Crie uma chave restrita à Gemini API no Google AI Studio.')
  }
  throw new Error(`Não foi possível validar Gemini (${response.status}).`)
}
