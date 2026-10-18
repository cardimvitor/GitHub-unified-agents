import { Link, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { githubSession } from '@/storage/github-session'
import { providerCredentials } from '@/storage/provider-credentials'

export default function HomeScreen() {
  const [connected, setConnected] = useState(false)
  const [geminiConnected, setGeminiConnected] = useState(false)
  const [deepSeekConnected, setDeepSeekConnected] = useState(false)
  const [claudeConnected, setClaudeConnected] = useState(false)
  const [openAiConnected, setOpenAiConnected] = useState(false)

  useFocusEffect(
    useCallback(() => {
      void Promise.all([
        githubSession.read(),
        providerCredentials.read('gemini'),
        providerCredentials.read('deepseek'),
        providerCredentials.read('claude'),
        providerCredentials.read('openai')
      ]).then(([token, gemini, deepseek, claude, openai]) => {
        setConnected(Boolean(token))
        setGeminiConnected(Boolean(gemini))
        setDeepSeekConnected(Boolean(deepseek))
        setClaudeConnected(Boolean(claude))
        setOpenAiConnected(Boolean(openai))
      })
    }, [])
  )

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>MOBILE CONTROL CENTER</Text>
      <Text style={styles.title}>GitHub Unified Agents</Text>
      <Text style={styles.copy}>
        Conecte seu GitHub para criar tarefas, acompanhar pull requests e instalar automações de agentes.
      </Text>
      <Link href="/chat" asChild><Pressable style={styles.chatButton}><Text style={styles.buttonText}>Abrir planejamento compartilhado</Text></Pressable></Link>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GitHub</Text>
        <Text style={styles.status}>{connected ? 'Conectado neste dispositivo' : 'Ainda não conectado'}</Text>
        <Link href="/connect-github" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>{connected ? 'Gerenciar conexão' : 'Conectar GitHub'}</Text>
          </Pressable>
        </Link>
      </View>
      <Card title="DeepSeek" connected={deepSeekConnected} route="/connect-deepseek" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Claude</Text><Text style={styles.status}>{claudeConnected ? 'API conectada neste dispositivo' : 'Assinatura ou API'}</Text>
        <Link href="/claude" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>Abrir Claude</Text></Pressable></Link>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ChatGPT / Codex</Text>
        <Text style={styles.status}>{openAiConnected ? 'OpenAI API conectada neste dispositivo' : 'Assinatura requer runtime complementar'}</Text>
        <Text style={styles.muted}>Use API como alternativa direta. A assinatura ChatGPT/Codex não é uma chave de API móvel.</Text>
        <Link href="/openai" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>{openAiConnected ? 'Gerenciar OpenAI' : 'Ver opções'}</Text></Pressable></Link>
      </View>
      <View style={styles.card}><Text style={styles.cardTitle}>Gemini</Text><Text style={styles.status}>{geminiConnected ? 'Conectado neste dispositivo' : 'Ainda não conectado'}</Text><Link href="/connect-gemini" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>{geminiConnected ? 'Gerenciar Gemini' : 'Conectar Gemini'}</Text></Pressable></Link></View>
    </ScrollView>
  )
}

function Card({ title, connected, route }: { title: string; connected: boolean; route: '/connect-deepseek' | '/connect-claude' }) {
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.status}>{connected ? 'Conectado neste dispositivo' : 'Ainda não conectado'}</Text>
    <Link href={route} asChild><Pressable style={styles.button}><Text style={styles.buttonText}>{connected ? `Gerenciar ${title}` : `Conectar ${title}`}</Text></Pressable></Link>
  </View>
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#101827', padding: 24, gap: 18, flexGrow: 1 },
  eyebrow: { color: '#60a5fa', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#f8fafc', fontSize: 32, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 18, gap: 12 },
  cardTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  status: { color: '#a7f3d0', fontSize: 15 },
  muted: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  button: { alignSelf: 'flex-start', backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  chatButton: { alignItems: 'center', backgroundColor: '#7c3aed', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14 },
  buttonText: { color: '#ffffff', fontWeight: '700' }
})
