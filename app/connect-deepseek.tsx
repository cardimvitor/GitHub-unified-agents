import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateDeepSeekApiKey } from '@/providers/deepseek'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectDeepSeekScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Use uma chave criada no painel da DeepSeek. A API usa cobrança/créditos próprios.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Cole sua chave DeepSeek para continuar.')
    setBusy(true)
    try {
      await validateDeepSeekApiKey(candidate)
      await providerCredentials.save('deepseek', candidate)
      setApiKey('')
      setMessage('DeepSeek conectado. A chave foi guardada somente no cofre seguro deste dispositivo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível conectar DeepSeek.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Conectar DeepSeek</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Chave DeepSeek" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validar e conectar</Text>}</Pressable>
    <Text style={styles.note}>A chave não é enviada ao GitHub. Para uso por outras pessoas, um backend/proxy é recomendado para manter as chaves fora do aplicativo.</Text>
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
