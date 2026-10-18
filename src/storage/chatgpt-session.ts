import * as SecureStore from 'expo-secure-store'

const KEY = 'chatgpt-plan-session'

export type ChatGptPlanSession = {
  accessToken: string
  refreshToken?: string
  idToken: string
  clientId: string
  subject: string
  email?: string | null
  scopes: string[]
  expiresAt?: number
}

export const chatGptSession = {
  async read() {
    const value = await SecureStore.getItemAsync(KEY)
    return value ? JSON.parse(value) as ChatGptPlanSession : null
  },
  save: (session: ChatGptPlanSession) => SecureStore.setItemAsync(KEY, JSON.stringify(session)),
  clear: () => SecureStore.deleteItemAsync(KEY)
}
