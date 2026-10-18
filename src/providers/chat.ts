import { providerCredentials } from '@/storage/provider-credentials'
import { chatGptSession } from '@/storage/chatgpt-session'
import { modelPreference } from '@/storage/model-preference'
import { currentChatGptSession } from '@/openai/chatgpt-subscription'
import { listModels, type ModelTarget } from '@/providers/models'

export type ChatTarget = ModelTarget

export type ChatAnswer = { text: string; model: string }

const LABELS: Record<ChatTarget, string> = {
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  claude: 'Claude API',
  openai: 'OpenAI API',
  chatgpt: 'ChatGPT (assinatura)'
}

// Backend usado pelo Codex com conta ChatGPT (não é a API pública /v1).
const CHATGPT_CODEX_BASE = 'https://chatgpt.com/backend-api/codex'

export async function connectedTargets(): Promise<Array<{ id: ChatTarget; label: string }>> {
  const [gemini, deepseek, claude, openai, plan] = await Promise.all([
    providerCredentials.read('gemini'),
    providerCredentials.read('deepseek'),
    providerCredentials.read('claude'),
    providerCredentials.read('openai'),
    chatGptSession.read()
  ])
  const found: Array<{ id: ChatTarget; connected: boolean }> = [
    { id: 'chatgpt', connected: Boolean(plan) },
    { id: 'gemini', connected: Boolean(gemini) },
    { id: 'deepseek', connected: Boolean(deepseek) },
    { id: 'claude', connected: Boolean(claude) },
    { id: 'openai', connected: Boolean(openai) }
  ]
  return found.filter((item) => item.connected).map((item) => ({ id: item.id, label: LABELS[item.id] }))
}

// Lista de modelos de uma conexão, com o modelo que será usado (escolha salva ou o mais recente).
export async function modelsFor(target: ChatTarget) {
  const credential = await credentialFor(target)
  const models = await listModels(target, credential.token, credential.accountId)
  const saved = await modelPreference.read(target)
  const selected = saved && models.includes(saved) ? saved : null
  return { models, selected, active: selected ?? models[0] }
}

export function setModelFor(target: ChatTarget, model: string | null) {
  return modelPreference.save(target, model)
}

async function credentialFor(target: ChatTarget): Promise<{ token: string; accountId?: string }> {
  if (target === 'chatgpt') {
    const stored = await chatGptSession.read()
    if (!stored) throw new Error('Conecte a assinatura ChatGPT antes de enviar uma mensagem.')
    const session = await currentChatGptSession(stored)
    return { token: session.accessToken, accountId: session.accountId }
  }
  const key = await providerCredentials.read(target)
  if (!key) throw new Error(`Conecte ${LABELS[target]} antes de enviar uma mensagem.`)
  return { token: key }
}

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

export async function askProvider(target: ChatTarget, prompt: string): Promise<ChatAnswer> {
  const credential = await credentialFor(target)
  const { active: model } = await modelsFor(target)

  if (target === 'chatgpt') return askChatGptPlan(credential.token, credential.accountId ?? '', model, prompt)

  if (target === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': credential.token },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    })
    const data = await responseJson(response) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = textFrom(data.candidates?.[0]?.content?.parts?.[0]?.text)
    if (!text) throw new Error('Gemini não retornou texto para esta solicitação.')
    return { text, model }
  }

  if (target === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await responseJson(response) as { choices?: Array<{ message?: { content?: string } }> }
    const text = textFrom(data.choices?.[0]?.message?.content)
    if (!text) throw new Error('DeepSeek não retornou texto para esta solicitação.')
    return { text, model }
  }

  if (target === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'anthropic-version': '2023-06-01', 'x-api-key': credential.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await responseJson(response) as { content?: Array<{ type?: string; text?: string }> }
    const text = textFrom(data.content?.find((part) => part.type === 'text')?.text)
    if (!text) throw new Error('Claude não retornou texto para esta solicitação.')
    return { text, model }
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: prompt })
  })
  const data = await responseJson(response) as { output_text?: string }
  const text = textFrom(data.output_text)
  if (!text) throw new Error('OpenAI não retornou texto para esta solicitação.')
  return { text, model }
}

// React Native não expõe response.body como stream, então lemos o corpo SSE inteiro e interpretamos depois.
// Com store:false o corpo chega completo e a resposta é pequena o bastante para isso.
async function askChatGptPlan(accessToken: string, accountId: string, model: string, prompt: string): Promise<ChatAnswer> {
  const response = await fetch(`${CHATGPT_CODEX_BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'ChatGPT-Account-ID': accountId, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      model,
      instructions: 'Você ajuda a planejar tarefas de desenvolvimento. Responda em português, de forma objetiva.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      store: false,
      stream: true
    })
  })
  const raw = await response.text()
  if (!response.ok) {
    let message = `ChatGPT respondeu HTTP ${response.status}.`
    try {
      const record = JSON.parse(raw) as { error?: { message?: string } | string; detail?: string }
      const detail = typeof record.error === 'string' ? record.error : record.error?.message ?? record.detail
      if (detail) message = detail
    } catch {
      // corpo não é JSON: mantém a mensagem genérica
    }
    throw new Error(message)
  }
  let text = ''
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    const event = JSON.parse(payload) as { type?: string; delta?: string; message?: string }
    if (event.type === 'response.output_text.delta') text += event.delta ?? ''
    if (event.type === 'error' || event.type === 'response.failed') throw new Error(event.message || 'ChatGPT recusou a solicitação.')
  }
  if (!text) throw new Error('ChatGPT não retornou texto para esta solicitação.')
  return { text, model }
}
