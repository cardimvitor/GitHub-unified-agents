import AsyncStorage from '@react-native-async-storage/async-storage'

// Conversas do planejamento, guardadas por repositório. Ficam no aparelho e não são enviadas ao GitHub.
export type StoredEntry = { author: string; text: string; plan?: boolean; created?: boolean; parts?: Record<string, string> }
export type StoredChat = { id: string; title: string; updatedAt: number; entries: StoredEntry[] }
export type ChatHistory = { chats: StoredChat[]; activeId: string | null }

const NEW_CHAT_TITLE = 'New chat'
const keyFor = (repository: string) => `chat-history:${repository || 'no-repository'}`

export function newChat(): StoredChat {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: NEW_CHAT_TITLE, updatedAt: Date.now(), entries: [] }
}

// Título: primeira mensagem do usuário, cortada. Enquanto não há mensagem, continua "New chat".
export function titleFor(entries: StoredEntry[]) {
  const first = entries.find((entry) => entry.author === 'You')
  if (!first) return NEW_CHAT_TITLE
  const line = first.text.split('\n').find(Boolean)?.trim() ?? NEW_CHAT_TITLE
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

export async function loadChatHistory(repository: string): Promise<ChatHistory> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(repository))
    if (!raw) return { chats: [], activeId: null }
    const parsed = JSON.parse(raw) as ChatHistory
    return { chats: Array.isArray(parsed.chats) ? parsed.chats : [], activeId: parsed.activeId ?? null }
  } catch {
    return { chats: [], activeId: null }
  }
}

export async function saveChatHistory(repository: string, history: ChatHistory) {
  try {
    await AsyncStorage.setItem(keyFor(repository), JSON.stringify(history))
  } catch {
    // Sem armazenamento disponível a conversa continua só nesta tela.
  }
}
