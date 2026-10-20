import * as SecureStore from 'expo-secure-store'

// Repositório onde o plano vira Issue (dono/repositorio). Não é segredo, então fica só no cofre por consistência.
const KEY = 'github-target-repository'

export const githubTarget = {
  async read() {
    try {
      return (await SecureStore.getItemAsync(KEY)) || ''
    } catch {
      return ''
    }
  },
  save: (repository: string) => (repository ? SecureStore.setItemAsync(KEY, repository) : SecureStore.deleteItemAsync(KEY))
}
