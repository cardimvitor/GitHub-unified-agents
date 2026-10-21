import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateOpenAiApiKey } from '@/providers/openai'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectOpenAiScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Use an OpenAI key for direct model calls. This option uses API billing, not the ChatGPT subscription.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Paste your OpenAI key to continue.')
    setBusy(true)
    try {
      await validateOpenAiApiKey(candidate)
      await providerCredentials.save('openai', candidate)
      setApiKey('')
      setMessage('OpenAI API connected. The key is stored only in this device\'s secure vault.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect the OpenAI API.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>ChatGPT / Codex</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="OpenAI key (optional)" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validate OpenAI API</Text>}</Pressable>
    <Text style={styles.note}>Subscription login for ChatGPT/Codex requires the official Sign in with ChatGPT flow and a companion Codex runtime; this pure mobile version has no built-in subscription login.</Text>
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
