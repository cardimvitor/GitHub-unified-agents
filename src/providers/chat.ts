import { providerCredentials, type ProviderId } from '@/storage/provider-credentials'
import { chatGptSession, type ChatGptPlanSession } from '@/storage/chatgpt-session'
import { currentChatGptSession } from '@/openai/chatgpt-subscription'
import { latestChatGptPlanModel, latestModel } from '@/providers/models'

export type ChatProvider = Exclude<ProviderId, 'gemini'> | 'gemini'

export type ChatAnswer = { text: string; model: string }

// Backend usado pelo Codex com conta ChatGPT (não é a API pública /v1).
const CHATGPT_CODEX_BASE = 'https://chatgpt.com/backend-api/codex'

async function responseJson(response: Response) {
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = data as { error?: { message?: string } | string; message?: string }
    const detail = typeof record.error === 'string' ? record.error : record.error?.message || record.message
    throw new Error(detail || `O provider retornou HTTP ${response.status}.`)
  }
  return data
}

function textFrom(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function askProvider(provider: ChatProvider, prompt: string): Promise<ChatAnswer> {
  if (provider === 'openai') {
    const subscription = await chatGptSession.read()
    if (subscription) return askChatGptPlan(subscription, prompt)
  }
  const key = await providerCredentials.read(provider)
  if (!key) throw new Error('Conecte este provider antes de enviar uma mensagem.')
  const model = await latestModel(provider, key)

  if (provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    })
    const data = await responseJson(response) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = textFrom(data.candidates?.[0]?.content?.parts?.[0]?.text)
    if (!text) throw new Error('Gemini não retornou texto para esta solicitação.')
    return { text, model }
  }

  if (provider === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await responseJson(response) as { choices?: Array<{ message?: { content?: string } }> }
    const text = textFrom(data.choices?.[0]?.message?.content)
    if (!text) throw new Error('DeepSeek não retornou texto para esta solicitação.')
    return { text, model }
  }

  if (provider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'anthropic-version': '2023-06-01', 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await responseJson(response) as { content?: Array<{ type?: string; text?: string }> }
    const text = textFrom(data.content?.find((part) => part.type === 'text')?.text)
    if (!text) throw new Error('Claude não retornou texto para esta solicitação.')
    return { text, model }
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: prompt })
  })
  const data = await responseJson(response) as { output_text?: string }
  const text = textFrom(data.output_text)
  if (!text) throw new Error('OpenAI não retornou texto para esta solicitação.')
  return { text, model }
}

async function askChatGptPlan(stored: ChatGptPlanSession, prompt: string): Promise<ChatAnswer> {
  const session = await currentChatGptSession(stored)
  const headers = { Authorization: `Bearer ${session.accessToken}`, 'ChatGPT-Account-ID': session.accountId }
  const model = await latestChatGptPlanModel(CHATGPT_CODEX_BASE, session.accessToken, session.accountId)
  const response = await fetch(`${CHATGPT_CODEX_BASE}/responses`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      model,
      instructions: 'Você ajuda a planejar tarefas de desenvolvimento. Responda em português, de forma objetiva.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      store: false,
      stream: true
    })
  })
  if (!response.ok) await responseJson(response)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('A resposta do ChatGPT não iniciou streaming.')
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  while (true) {
    const part = await reader.read()
    if (part.done) break
    buffer += decoder.decode(part.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      const event = JSON.parse(payload) as { type?: string; delta?: string; message?: string }
      if (event.type === 'response.output_text.delta') text += event.delta ?? ''
      if (event.type === 'error' || event.type === 'response.failed') throw new Error(event.message || 'ChatGPT recusou a solicitação.')
    }
  }
  if (!text) throw new Error('ChatGPT não retornou texto para esta solicitação.')
  return { text, model }
}
