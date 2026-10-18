import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { validateClaudeApiKey } from '@/providers/claude'
import { providerCredentials } from '@/storage/provider-credentials'

export default function ConnectClaudeScreen() {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Conecte a Anthropic API com uma chave da Console. Claude Pro/Max não fornece uma chave de API para apps móveis.')

  async function connect() {
    const candidate = apiKey.trim()
    if (!candidate) return setMessage('Cole sua chave da Anthropic para continuar.')
    setBusy(true)
    try {
      await validateClaudeApiKey(candidate)
      await providerCredentials.save('claude', candidate)
      setApiKey('')
      setMessage('Claude API conectado. A chave foi guardada somente no cofre seguro deste dispositivo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível conectar Claude API.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Conectar Claude API</Text>
    <Text style={styles.copy}>{message}</Text>
    <TextInput value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Chave Anthropic" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Validar e conectar</Text>}</Pressable>
    <Text style={styles.note}>Para usar uma assinatura Claude Code, será necessário um runner separado autorizado pela sua conta; o APK não simula esse login.</Text>
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
