import * as SecureStore from 'expo-secure-store'

// Token do Claude Code (gerado por `claude setup-token`). Fica só no cofre do aparelho e é enviado
// ao environment de cada repositório configurado pelo app.
const CLAUDE_KEY = 'agent-claude-oauth-token'

export const agentCredentials = {
  readClaude: () => SecureStore.getItemAsync(CLAUDE_KEY),
  saveClaude: (token: string) => SecureStore.setItemAsync(CLAUDE_KEY, token),
  clearClaude: () => SecureStore.deleteItemAsync(CLAUDE_KEY)
}
