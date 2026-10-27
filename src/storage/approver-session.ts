import * as SecureStore from 'expo-secure-store'

// Conta GitHub que aprova os PRs dos agentes. Separada da conta principal do app, guardada só no cofre do aparelho.
const TOKEN_KEY = 'approver-access-token'
const LOGIN_KEY = 'approver-login'

export const approverSession = {
  read: () => SecureStore.getItemAsync(TOKEN_KEY),
  readLogin: () => SecureStore.getItemAsync(LOGIN_KEY),
  save: async (token: string, login: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
    await SecureStore.setItemAsync(LOGIN_KEY, login)
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    await SecureStore.deleteItemAsync(LOGIN_KEY)
  }
}
