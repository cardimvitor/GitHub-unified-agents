import * as SecureStore from 'expo-secure-store'

const KEY = 'github-access-token'

export const githubSession = {
  read: () => SecureStore.getItemAsync(KEY),
  save: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY)
}
