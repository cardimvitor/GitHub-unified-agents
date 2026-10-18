import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { askProvider, type ChatProvider } from '@/providers/chat'

type Entry = { author: string; text: string }

const providers: Array<{ id: ChatProvider; label: string }> = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'claude', label: 'Claude API' },
  { id: 'openai', label: 'ChatGPT / OpenAI' }
]

export default function SharedChatScreen() {
  const [provider, setProvider] = useState<ChatProvider>('gemini')
  const [prompt, setPrompt] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const providerName = useMemo(() => providers.find((item) => item.id === provider)?.label ?? provider, [provider])

  async function send() {
    const question = prompt.trim()
    if (!question || busy) return
    setPrompt('')
    setEntries((current) => [...current, { author: 'Você', text: question }])
    setBusy(true)
    try {
      const transcript = [...entries, { author: 'Você', text: question }]
        .map((entry) => `${entry.author}: ${entry.text}`)
        .join('\n\n')
      const answer = await askProvider(provider, `Responda em português, quando apropriado. Conversa compartilhada:\n\n${transcript}`)
      setEntries((current) => [...current, { author: providerName, text: answer }])
    } catch (error) {
      setEntries((current) => [...current, { author: providerName, text: error instanceof Error ? error.message : 'Não foi possível obter resposta.' }])
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Planejamento compartilhado</Text>
    <Text style={styles.copy}>O histórico fica neste aparelho. Alterne o provider para pedir uma segunda opinião sobre o mesmo contexto.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providers}>
      {providers.map((item) => <Pressable key={item.id} onPress={() => setProvider(item.id)} style={[styles.pill, provider === item.id && styles.pillSelected]}><Text style={styles.pillText}>{item.label}</Text></Pressable>)}
    </ScrollView>
    <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
      {entries.length === 0 ? <Text style={styles.empty}>Conecte um provider e descreva a tarefa. O app não envia as mensagens para o GitHub automaticamente.</Text> : entries.map((entry, index) => <View key={`${entry.author}-${index}`} style={styles.message}><Text style={styles.author}>{entry.author}</Text><Text style={styles.messageText}>{entry.text}</Text></View>)}
    </ScrollView>
    <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder="Descreva o que deseja planejar" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable onPress={() => void send()} disabled={busy} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar para {providerName}</Text>}</Pressable>
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 20, gap: 14 },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: '700' },
  copy: { color: '#cbd5e1', lineHeight: 21 },
  providers: { gap: 8 },
  pill: { borderRadius: 20, borderWidth: 1, borderColor: '#475569', paddingHorizontal: 12, paddingVertical: 8 },
  pillSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  pillText: { color: '#f8fafc', fontWeight: '600' },
  messages: { flex: 1, backgroundColor: '#0f172a', borderRadius: 12 },
  messagesContent: { padding: 12, gap: 10 },
  empty: { color: '#94a3b8', lineHeight: 21 },
  message: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, gap: 5 },
  author: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
  messageText: { color: '#e2e8f0', lineHeight: 21 },
  input: { minHeight: 72, maxHeight: 140, color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 16, padding: 12, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontWeight: '700' }
})
