import { Link, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { githubSession } from '@/storage/github-session'
import { providerCredentials } from '@/storage/provider-credentials'

export default function HomeScreen() {
  const [connected, setConnected] = useState(false)
  const [geminiConnected, setGeminiConnected] = useState(false)

  useFocusEffect(
    useCallback(() => {
      void Promise.all([githubSession.read(), providerCredentials.read('gemini')]).then(([token, gemini]) => {
        setConnected(Boolean(token))
        setGeminiConnected(Boolean(gemini))
      })
    }, [])
  )

  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>MOBILE CONTROL CENTER</Text>
      <Text style={styles.title}>GitHub Unified Agents</Text>
      <Text style={styles.copy}>
        Conecte seu GitHub para criar tarefas, acompanhar pull requests e instalar automações de agentes.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GitHub</Text>
        <Text style={styles.status}>{connected ? 'Conectado neste dispositivo' : 'Ainda não conectado'}</Text>
        <Link href="/connect-github" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>{connected ? 'Gerenciar conexão' : 'Conectar GitHub'}</Text>
          </Pressable>
        </Link>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Gemini</Text>
        <Text style={styles.status}>{geminiConnected ? 'Conectado neste dispositivo' : 'Ainda não conectado'}</Text>
        <Link href="/connect-gemini" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>{geminiConnected ? 'Gerenciar Gemini' : 'Conectar Gemini'}</Text></Pressable></Link>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Outros providers</Text>
        <Text style={styles.muted}>ChatGPT/Codex, Claude e DeepSeek entrarão neste mesmo painel. Cada provider mantém a própria autorização e nunca compartilha credenciais com o GitHub.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 18 },
  eyebrow: { color: '#60a5fa', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#f8fafc', fontSize: 32, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 18, gap: 12 },
  cardTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  status: { color: '#a7f3d0', fontSize: 15 },
  muted: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  button: { alignSelf: 'flex-start', backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: '#ffffff', fontWeight: '700' }
})
