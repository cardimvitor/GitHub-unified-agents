import { providerCredentials, type ProviderId } from '@/storage/provider-credentials'

export type ChatProvider = Exclude<ProviderId, 'gemini'> | 'gemini'

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

async function responseJson(response: Response) {
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = data as { error?: { message?: string }; message?: string }
    throw new Error(record.error?.message || record.message || `O provider retornou HTTP ${response.status}.`)
  }
  return data
}

export async function askProvider(provider: ChatProvider, prompt: string) {
  const key = await providerCredentials.read(provider)
  if (!key) throw new Error('Conecte este provider antes de enviar uma mensagem.')

  if (provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    })
    const data = await responseJson(response) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = asText(data.candidates?.[0]?.content?.parts?.[0]?.text)
    if (!text) throw new Error('Gemini não retornou texto para esta solicitação.')
    return text
  }

  if (provider === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }] })
    })
    const data = await responseJson(response) as { choices?: Array<{ message?: { content?: string } }> }
    const text = asText(data.choices?.[0]?.message?.content)
    if (!text) throw new Error('DeepSeek não retornou texto para esta solicitação.')
    return text
  }

  if (provider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'anthropic-version': '2023-06-01', 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await responseJson(response) as { content?: Array<{ type?: string; text?: string }> }
    const text = asText(data.content?.find((part) => part.type === 'text')?.text)
    if (!text) throw new Error('Claude não retornou texto para esta solicitação.')
    return text
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4.1-mini', input: prompt })
  })
  const data = await responseJson(response) as { output_text?: string }
  const text = asText(data.output_text)
  if (!text) throw new Error('OpenAI não retornou texto para esta solicitação.')
  return text
}
