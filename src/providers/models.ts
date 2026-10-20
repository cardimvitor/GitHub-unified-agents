// Lista os modelos de texto de cada provider a partir da própria API, do mais recente para o mais antigo.
// Nenhum nome de modelo fica fixo no código: a lista muda quando o provider lança uma versão nova.

export type ModelTarget = 'deepseek' | 'claude' | 'openai' | 'chatgpt'

const CACHE_MS = 60 * 60 * 1000
const cache = new Map<string, { models: string[]; expires: number }>()

// Modelos que não servem para conversa de texto.
const NOT_CHAT = /(embedding|image|imagen|tts|audio|realtime|transcribe|whisper|moderation|search|computer|robotics|aqa|veo|dall|live)/i

export function numericVersion(id: string) {
  const match = id.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

// OpenAI API: ordena pela data de criação informada pela API.
export function rankOpenAiModels(models: Array<{ id?: string; created?: number }>) {
  return models
    .filter((model): model is { id: string; created?: number } => Boolean(model.id) && /^(gpt-|o\d)/.test(model.id!))
    .filter((model) => !NOT_CHAT.test(model.id) && !/codex/.test(model.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || numericVersion(b.id) - numericVersion(a.id))
    .map((model) => model.id)
}

// Anthropic: ordena pela data de criação do modelo.
export function rankAnthropicModels(models: Array<{ id?: string; created_at?: string }>) {
  return models
    .filter((model): model is { id: string; created_at?: string } => Boolean(model.id?.startsWith('claude-')))
    .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '') || 0)
    .map((model) => model.id)
}

// DeepSeek: a API não informa data; ordena pela versão no nome e prefere o modelo de chat.
export function rankDeepSeekModels(ids: string[]) {
  return [...ids].sort((a, b) =>
    numericVersion(b) - numericVersion(a) || Number(/chat/.test(b)) - Number(/chat/.test(a))
  )
}

// ChatGPT (assinatura): modelos visíveis na lista, versão mais alta primeiro.
export function rankChatGptPlanModels(models: Array<{ slug?: string; visibility?: string }>) {
  return models
    .filter((model): model is { slug: string; visibility?: string } => Boolean(model.slug) && (!model.visibility || model.visibility === 'list'))
    .sort((a, b) => numericVersion(b.slug) - numericVersion(a.slug))
    .map((model) => model.slug)
}

async function listed(url: string, headers: Record<string, string>, label: string): Promise<unknown> {
  const response = await fetch(url, { headers })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = data as { error?: { message?: string } | string; message?: string }
    const detail = typeof record.error === 'string' ? record.error : record.error?.message ?? record.message
    throw new Error(detail ? `${label}: ${detail}` : `${label} (HTTP ${response.status}).`)
  }
  return data
}

async function fetchModels(target: ModelTarget, credential: string, accountId?: string): Promise<string[]> {
  if (target === 'deepseek') {
    const data = await listed('https://api.deepseek.com/models', { Authorization: `Bearer ${credential}` }, 'DeepSeek não listou modelos') as { data?: Array<{ id?: string }> }
    return rankDeepSeekModels((data.data ?? []).map((item) => item.id ?? '').filter(Boolean))
  }
  if (target === 'claude') {
    const data = await listed('https://api.anthropic.com/v1/models?limit=1000', { 'anthropic-version': '2023-06-01', 'x-api-key': credential }, 'Claude não listou modelos') as { data?: Array<{ id?: string; created_at?: string }> }
    return rankAnthropicModels(data.data ?? [])
  }
  if (target === 'chatgpt') {
    // A lista do Codex exige client_version; usamos a versão do CLI oficial que validamos.
    const data = await listed('https://chatgpt.com/backend-api/codex/models?client_version=0.163.0', { Authorization: `Bearer ${credential}`, 'ChatGPT-Account-ID': accountId ?? '' }, 'ChatGPT não listou modelos') as { models?: Array<{ slug?: string; visibility?: string }> }
    return rankChatGptPlanModels(data.models ?? [])
  }
  const data = await listed('https://api.openai.com/v1/models', { Authorization: `Bearer ${credential}` }, 'OpenAI não listou modelos') as { data?: Array<{ id?: string; created?: number }> }
  return rankOpenAiModels(data.data ?? [])
}

// Lista ordenada do mais recente para o mais antigo, com cache de uma hora por credencial.
export function listModels(target: ModelTarget, credential: string, accountId?: string) {
  const key = `${target}:${accountId ?? ''}:${credential.slice(-24)}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.models)
  return fetchModels(target, credential, accountId).then((models) => {
    if (models.length === 0) throw new Error('Nenhum modelo de texto disponível para esta conexão.')
    cache.set(key, { models, expires: Date.now() + CACHE_MS })
    return models
  })
}
