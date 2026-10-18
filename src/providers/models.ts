// Escolhe o modelo mais recente de cada provider a partir da própria lista publicada pela API.
// Nenhum nome de modelo fica fixo no código: a lista muda quando o provider lança uma versão nova.

const CACHE_MS = 60 * 60 * 1000
const cache = new Map<string, { model: string; expires: number }>()

// Modelos que não servem para conversa de texto.
const NOT_CHAT = /(embedding|image|imagen|tts|audio|realtime|transcribe|whisper|moderation|search|computer|robotics|aqa|veo|dall|live)/i

export function numericVersion(id: string) {
  const match = id.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

// Gemini: exige generateContent. Modelos estáveis vêm antes de preview; dentro do grupo, a versão mais alta;
// depois Pro antes de Flash e sem Lite. Preview só é escolhido quando não há estável.
export function pickGeminiModel(models: Array<{ name?: string; supportedGenerationMethods?: string[] }>) {
  const candidates = models
    .filter((model) => model.name?.startsWith('models/gemini-') && model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name!.slice('models/'.length))
    .filter((id) => !NOT_CHAT.test(id))
  return candidates.sort((a, b) =>
    Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b))
      || numericVersion(b) - numericVersion(a)
      || Number(/lite/.test(a)) - Number(/lite/.test(b))
      || Number(/pro/.test(b)) - Number(/pro/.test(a))
  )[0]
}

// OpenAI API: ordena pela data de criação informada pela API.
export function pickOpenAiModel(models: Array<{ id?: string; created?: number }>) {
  return models
    .filter((model): model is { id: string; created?: number } => Boolean(model.id) && /^(gpt-|o\d)/.test(model.id!))
    .filter((model) => !NOT_CHAT.test(model.id) && !/codex/.test(model.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || numericVersion(b.id) - numericVersion(a.id))[0]?.id
}

// Anthropic: ordena pela data de criação do modelo.
export function pickAnthropicModel(models: Array<{ id?: string; created_at?: string }>) {
  return models
    .filter((model): model is { id: string; created_at?: string } => Boolean(model.id?.startsWith('claude-')))
    .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '') || 0)[0]?.id
}

// DeepSeek: a API não informa data; ordena pela versão no nome e prefere o modelo de chat.
export function pickDeepSeekModel(ids: string[]) {
  return [...ids].sort((a, b) =>
    numericVersion(b) - numericVersion(a) || Number(/chat/.test(b)) - Number(/chat/.test(a))
  )[0]
}

// ChatGPT (assinatura): modelos marcados como visíveis para a lista, versão mais alta primeiro.
export function pickChatGptPlanModel(models: Array<{ slug?: string; visibility?: string }>) {
  return models
    .filter((model): model is { slug: string; visibility?: string } => Boolean(model.slug) && (!model.visibility || model.visibility === 'list'))
    .sort((a, b) => numericVersion(b.slug) - numericVersion(a.slug))[0]?.slug
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

function cached(key: string, resolve: () => Promise<string>) {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.model)
  return resolve().then((model) => {
    cache.set(key, { model, expires: Date.now() + CACHE_MS })
    return model
  })
}

export function latestModel(provider: 'gemini' | 'deepseek' | 'claude' | 'openai', credential: string) {
  return cached(`${provider}:${credential}`, async () => {
    if (provider === 'gemini') {
      const data = await listed('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': credential }, 'Gemini não listou modelos') as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> }
      const model = pickGeminiModel(data.models ?? [])
      if (!model) throw new Error('Gemini não tem modelo de texto disponível para esta chave.')
      return model
    }
    if (provider === 'deepseek') {
      const data = await listed('https://api.deepseek.com/models', { Authorization: `Bearer ${credential}` }, 'DeepSeek não listou modelos') as { data?: Array<{ id?: string }> }
      const model = pickDeepSeekModel((data.data ?? []).map((item) => item.id ?? '').filter(Boolean))
      if (!model) throw new Error('DeepSeek não retornou modelos para esta chave.')
      return model
    }
    if (provider === 'claude') {
      const data = await listed('https://api.anthropic.com/v1/models?limit=1000', { 'anthropic-version': '2023-06-01', 'x-api-key': credential }, 'Claude não listou modelos') as { data?: Array<{ id?: string; created_at?: string }> }
      const model = pickAnthropicModel(data.data ?? [])
      if (!model) throw new Error('Claude não retornou modelos para esta chave.')
      return model
    }
    const data = await listed('https://api.openai.com/v1/models', { Authorization: `Bearer ${credential}` }, 'OpenAI não listou modelos') as { data?: Array<{ id?: string; created?: number }> }
    const model = pickOpenAiModel(data.data ?? [])
    if (!model) throw new Error('OpenAI não retornou modelos de texto para esta chave.')
    return model
  })
}

export function latestChatGptPlanModel(base: string, accessToken: string, accountId: string) {
  return cached(`chatgpt:${accountId}:${accessToken.slice(-16)}`, async () => {
    // A lista do Codex exige client_version; usamos a versão do CLI oficial que validamos.
    const data = await listed(`${base}/models?client_version=0.163.0`, { Authorization: `Bearer ${accessToken}`, 'ChatGPT-Account-ID': accountId }, 'ChatGPT não listou modelos') as { models?: Array<{ slug?: string; visibility?: string }> }
    const model = pickChatGptPlanModel(data.models ?? [])
    if (!model) throw new Error('Nenhum modelo ChatGPT disponível para esta assinatura.')
    return model
  })
}
