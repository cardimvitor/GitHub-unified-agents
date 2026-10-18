import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { askProvider, connectedTargets, modelsFor, setModelFor, type ChatTarget } from '@/providers/chat'

type Entry = { author: string; text: string }
type Connected = { id: ChatTarget; label: string }
type ModelState = { models: string[]; selected: string | null; active: string }

export default function SharedChatScreen() {
  const [connected, setConnected] = useState<Connected[]>([])
  const [target, setTarget] = useState<ChatTarget | null>(null)
  const [modelState, setModelState] = useState<ModelState | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [modelsError, setModelsError] = useState<string>()
  const [prompt, setPrompt] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)

  useFocusEffect(useCallback(() => {
    void connectedTargets().then((list) => {
      setConnected(list)
      setTarget((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id ?? null))
    })
  }, []))

  useEffect(() => {
    setModelState(null)
    setModelsError(undefined)
    setModelsOpen(false)
    if (!target) return
    let active = true
    modelsFor(target)
      .then((state) => { if (active) setModelState(state) })
      .catch((error) => { if (active) setModelsError(error instanceof Error ? error.message : 'Não foi possível listar modelos.') })
    return () => { active = false }
  }, [target])

  const targetLabel = connected.find((item) => item.id === target)?.label ?? ''

  async function chooseModel(model: string | null) {
    if (!target) return
    await setModelFor(target, model)
    setModelState(await modelsFor(target))
    setModelsOpen(false)
  }

  async function send() {
    const question = prompt.trim()
    if (!question || busy || !target) return
    setPrompt('')
    setEntries((current) => [...current, { author: 'Você', text: question }])
    setBusy(true)
    try {
      const transcript = [...entries, { author: 'Você', text: question }]
        .map((entry) => `${entry.author}: ${entry.text}`)
        .join('\n\n')
      const answer = await askProvider(target, `Responda em português, quando apropriado. Conversa compartilhada:\n\n${transcript}`)
      setEntries((current) => [...current, { author: `${targetLabel} · ${answer.model}`, text: answer.text }])
    } catch (error) {
      setEntries((current) => [...current, { author: targetLabel || 'Erro', text: error instanceof Error ? error.message : 'Não foi possível obter resposta.' }])
    } finally {
      setBusy(false)
    }
  }

  if (connected.length === 0) {
    return <View style={styles.page}>
      <Text style={styles.empty}>Nenhum provider conectado. Conecte um na tela inicial para conversar aqui.</Text>
    </View>
  }

  return <View style={styles.page}>
    <View style={styles.providers}>
      {connected.map((item) => <Pressable key={item.id} onPress={() => setTarget(item.id)} style={[styles.chip, target === item.id && styles.chipSelected]}>
        <Text style={[styles.chipText, target === item.id && styles.chipTextSelected]}>{item.label}</Text>
      </Pressable>)}
    </View>

    <Pressable onPress={() => setModelsOpen((open) => !open)} disabled={!modelState} style={styles.modelRow}>
      <Text style={styles.modelLabel}>Modelo</Text>
      <Text numberOfLines={1} style={styles.modelValue}>
        {modelsError ? modelsError : modelState ? `${modelState.active}${modelState.selected ? '' : ' (mais recente)'}` : 'Carregando…'}
      </Text>
      <Text style={styles.modelCaret}>{modelsOpen ? '▲' : '▼'}</Text>
    </Pressable>
    {modelsOpen && modelState ? <ScrollView style={styles.modelList} nestedScrollEnabled>
      <Pressable onPress={() => void chooseModel(null)} style={styles.modelItem}>
        <Text style={[styles.modelItemText, !modelState.selected && styles.modelItemSelected]}>Automático (mais recente)</Text>
      </Pressable>
      {modelState.models.map((model) => <Pressable key={model} onPress={() => void chooseModel(model)} style={styles.modelItem}>
        <Text style={[styles.modelItemText, modelState.selected === model && styles.modelItemSelected]}>{model}</Text>
      </Pressable>)}
    </ScrollView> : null}

    <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
      {entries.length === 0 ? <Text style={styles.empty}>Descreva a tarefa para planejar. O histórico fica só nesta tela e some ao sair.</Text> : entries.map((entry, index) => <View key={`${entry.author}-${index}`} style={styles.message}>
        <Text style={styles.author}>{entry.author}</Text>
        <Text style={styles.messageText}>{entry.text}</Text>
      </View>)}
    </ScrollView>

    <View style={styles.composer}>
      <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder="Mensagem" placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => void send()} disabled={busy || !target} style={[styles.send, (busy || !target) && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Enviar</Text>}
      </Pressable>
    </View>
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 12, gap: 8 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: '#475569', paddingHorizontal: 10, paddingVertical: 5 },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  modelLabel: { color: '#94a3b8', fontSize: 12 },
  modelValue: { flex: 1, color: '#e2e8f0', fontSize: 13 },
  modelCaret: { color: '#94a3b8', fontSize: 11 },
  modelList: { maxHeight: 180, backgroundColor: '#0f172a', borderRadius: 8 },
  modelItem: { paddingHorizontal: 12, paddingVertical: 9 },
  modelItemText: { color: '#cbd5e1', fontSize: 13 },
  modelItemSelected: { color: '#60a5fa', fontWeight: '700' },
  messages: { flex: 1, backgroundColor: '#0f172a', borderRadius: 10 },
  messagesContent: { padding: 10, gap: 8 },
  empty: { color: '#94a3b8', lineHeight: 20, fontSize: 14 },
  message: { backgroundColor: '#1e293b', borderRadius: 8, padding: 10, gap: 4 },
  author: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },
  messageText: { color: '#e2e8f0', lineHeight: 20, fontSize: 14 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  send: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 44, paddingHorizontal: 16 },
  sendText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 }
})
