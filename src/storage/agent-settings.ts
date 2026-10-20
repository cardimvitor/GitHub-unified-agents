import * as SecureStore from 'expo-secure-store'

// Se os agentes rodam sem aprovação manual. Padrão: não (exige aprovação no environment).
const KEY = 'agents-automatic'

export const agentSettings = {
  async readAutomatic() {
    try {
      return (await SecureStore.getItemAsync(KEY)) === 'true'
    } catch {
      return false
    }
  },
  saveAutomatic: (value: boolean) => SecureStore.setItemAsync(KEY, value ? 'true' : 'false')
}
