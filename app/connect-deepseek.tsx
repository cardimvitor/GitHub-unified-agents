import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateDeepSeekApiKey } from '@/providers/deepseek'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectDeepSeekScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Use a key created in the DeepSeek dashboard. The API uses its own billing/credits.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Paste your DeepSeek key to continue.')
    setBusy(true)
    try {
      await validateDeepSeekApiKey(candidate)
      await providerCredentials.save('deepseek', candidate)
      setApiKey('')
      setMessage('DeepSeek connected. The key is stored only in this device\'s secure vault.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect DeepSeek.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Connect DeepSeek</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="DeepSeek key" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validate and connect</Text>}</Pressable>
    <Text style={styles.note}>The key is not sent to GitHub. For use by other people, a backend/proxy is recommended to keep keys out of the app.</Text>
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
