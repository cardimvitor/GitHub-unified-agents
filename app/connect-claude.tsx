import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateClaudeApiKey } from '@/providers/claude'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectClaudeScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Connect the Anthropic API with a Console key. Claude Pro/Max does not provide an API key for mobile apps.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Paste your Anthropic key to continue.')
    setBusy(true)
    try {
      await validateClaudeApiKey(candidate)
      await providerCredentials.save('claude', candidate)
      setApiKey('')
      setMessage('Claude API connected. The key is stored only in this device\'s secure vault.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect the Claude API.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Connect Claude API</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Anthropic key" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validate and connect</Text>}</Pressable>
    <Text style={styles.note}>To use a Claude Code subscription, you need a separate runner authorized by your account; the APK does not simulate this login.</Text>
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
