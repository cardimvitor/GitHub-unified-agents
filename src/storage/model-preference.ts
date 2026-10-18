import * as SecureStore from 'expo-secure-store'
import type { ModelTarget } from '@/providers/models'

// Modelo escolhido pelo usuário para cada conexão. Sem escolha salva, o app usa o mais recente da lista.
const keyFor = (target: ModelTarget) => `model-preference-${target}`

export const modelPreference = {
  async read(target: ModelTarget) {
    try {
      return (await SecureStore.getItemAsync(keyFor(target))) || null
    } catch {
      return null
    }
  },
  async save(target: ModelTarget, model: string | null) {
    if (model) await SecureStore.setItemAsync(keyFor(target), model)
    else await SecureStore.deleteItemAsync(keyFor(target))
  }
}
