import * as SecureStore from 'expo-secure-store'

export type ProviderId = 'gemini' | 'deepseek' | 'claude' | 'openai'

const keys: Record<ProviderId, string> = {
  gemini: 'provider-gemini-api-key',
  deepseek: 'provider-deepseek-api-key',
  claude: 'provider-claude-api-key',
  openai: 'provider-openai-api-key'
}

export const providerCredentials = {
  read: (provider: ProviderId) => SecureStore.getItemAsync(keys[provider]),
  save: (provider: ProviderId, value: string) => SecureStore.setItemAsync(keys[provider], value),
  clear: (provider: ProviderId) => SecureStore.deleteItemAsync(keys[provider])
}
