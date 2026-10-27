import { Link, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { githubSession } from '@/storage/github-session'
import { providerCredentials } from '@/storage/provider-credentials'
import { chatGptSession } from '@/storage/chatgpt-session'

export default function HomeScreen() {
  const [connected, setConnected] = useState(false)
  const [deepSeekConnected, setDeepSeekConnected] = useState(false)
  const [claudeConnected, setClaudeConnected] = useState(false)
  const [openAiConnected, setOpenAiConnected] = useState(false)
  const [chatGptConnected, setChatGptConnected] = useState(false)

  useFocusEffect(
    useCallback(() => {
      void Promise.all([
        githubSession.read(),
        providerCredentials.read('deepseek'),
        providerCredentials.read('claude'),
        providerCredentials.read('openai'),
        chatGptSession.read()
      ]).then(([token, deepseek, claude, openai, chatgpt]) => {
        setConnected(Boolean(token))
        setDeepSeekConnected(Boolean(deepseek))
        setClaudeConnected(Boolean(claude))
        setOpenAiConnected(Boolean(openai))
        setChatGptConnected(Boolean(chatgpt))
      })
    }, [])
  )

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>MOBILE CONTROL CENTER</Text>
      <Text style={styles.title}>GitHub Unified Agents</Text>
      <Text style={styles.copy}>
        Connect your AI providers and chat with them in shared planning. Issue and pull request integration is still under construction.
      </Text>
      <Link href="/chat" asChild><Pressable style={styles.chatButton}><Text style={styles.buttonText}>Open shared planning</Text></Pressable></Link>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GitHub</Text>
        <Text style={styles.status}>{connected ? 'Connected on this device' : 'Not connected yet'}</Text>
        <Link href="/connect-github" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>{connected ? 'Manage connection' : 'Connect GitHub'}</Text>
          </Pressable>
        </Link>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Approver account</Text>
        <Text style={styles.muted}>Approves agent pull requests. Use a separate GitHub account.</Text>
        <Link href="/connect-approver" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>Set up approver</Text></Pressable></Link>
      </View>
      <Card title="DeepSeek" connected={deepSeekConnected} route="/connect-deepseek" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Claude</Text><Text style={styles.status}>{claudeConnected ? 'API connected on this device' : 'Subscription or API'}</Text>
        <Link href="/claude" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>Open Claude</Text></Pressable></Link>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ChatGPT / Codex</Text>
        <Text style={styles.status}>{chatGptConnected ? 'ChatGPT subscription connected on this device' : openAiConnected ? 'OpenAI API connected on this device' : 'Not connected yet'}</Text>
        <Text style={styles.muted}>The subscription is used in chat; an API key is an alternative. Repository automation stays separate on GitHub.</Text>
        <Link href="/openai" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>{chatGptConnected || openAiConnected ? 'Manage ChatGPT / OpenAI' : 'See options'}</Text></Pressable></Link>
      </View>
    </ScrollView>
  )
}

function Card({ title, connected, route }: { title: string; connected: boolean; route: '/connect-deepseek' | '/connect-claude' }) {
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.status}>{connected ? 'Connected on this device' : 'Not connected yet'}</Text>
    <Link href={route} asChild><Pressable style={styles.button}><Text style={styles.buttonText}>{connected ? `Manage ${title}` : `Connect ${title}`}</Text></Pressable></Link>
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
