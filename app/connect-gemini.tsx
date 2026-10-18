import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateGeminiApiKey } from '@/providers/gemini'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectGeminiScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Use uma chave Gemini criada no Google AI Studio e restrita à Gemini API.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Cole sua chave Gemini para continuar.')
    setBusy(true)
    try {
      await validateGeminiApiKey(candidate)
      await providerCredentials.save('gemini', candidate)
      setApiKey('')
      setMessage('Gemini conectado. A chave foi guardada somente no cofre seguro deste dispositivo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível conectar Gemini.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Conectar Gemini</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Chave Gemini" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validar e conectar</Text>}</Pressable>
    <Text style={styles.note}>A chave não é enviada ao GitHub. Em uma versão multiusuário de produção, use um backend/proxy para não expor chaves no cliente.</Text>
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
