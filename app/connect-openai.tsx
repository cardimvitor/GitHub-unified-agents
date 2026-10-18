import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateOpenAiApiKey } from '@/providers/openai'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectOpenAiScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Use uma chave OpenAI para chamadas diretas de modelo. Esta opção usa faturamento da API, não a assinatura ChatGPT.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Cole sua chave OpenAI para continuar.')
    setBusy(true)
    try {
      await validateOpenAiApiKey(candidate)
      await providerCredentials.save('openai', candidate)
      setApiKey('')
      setMessage('OpenAI API conectada. A chave foi guardada somente no cofre seguro deste dispositivo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível conectar OpenAI API.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>ChatGPT / Codex</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Chave OpenAI (opcional)" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validar OpenAI API</Text>}</Pressable>
    <Text style={styles.note}>O login por assinatura ChatGPT/Codex exige o fluxo oficial de Sign in with ChatGPT e um runtime Codex complementar; não há login de assinatura embutido nesta versão móvel pura.</Text>
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 18 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  input: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 16, padding: 14 },
  button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontWeight: '700' },
  note: { color: '#94a3b8', fontSize: 13, lineHeight: 20 }
})
