import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createIssue } from '@/github/repository'
import { askProvider, connectedTargets, modelsFor, setModelFor, type ChatTarget } from '@/providers/chat'
import { githubSession } from '@/storage/github-session'
import { githubTarget } from '@/storage/github-target'

type Entry = { author: string; text: string; plan?: boolean; created?: boolean }
type Connected = { id: ChatTarget; label: string }
type ModelState = { models: string[]; selected: string | null; active: string }

// Instrução do modo planejamento: produz um plano revisável, sem executar nada.
const PLANNING_INSTRUCTION = [
  'Modo planejamento: não escreva código nem execute nada.',
  'Responda em português com:',
  '1) Objetivo em uma frase;',
  '2) Passos numerados, cada um com o arquivo ou área afetada;',
  '3) Riscos e perguntas em aberto.',
  'Termine com a linha "Pronto para executar." quando o plano estiver completo.'
].join('\n')

function titleFrom(plan: string) {
  const line = plan.split('\n').map((item) => item.replace(/[#*`]/g, '').trim()).find(Boolean) ?? 'Tarefa do planejamento'
  return line.slice(0, 120)
}

export default function SharedChatScreen() {
  const [connected, setConnected] = useState<Connected[]>([])
  const [target, setTarget] = useState<ChatTarget | null>(null)
  const [modelState, setModelState] = useState<ModelState | null>(null)
  const [modelsError, setModelsError] = useState<string>()
  const [prompt, setPrompt] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [planning, setPlanning] = useState(true)
  const [repository, setRepository] = useState('')
  const [githubConnected, setGithubConnected] = useState(false)
  const insets = useSafeAreaInsets()
  const messagesRef = useRef<ScrollView>(null)

  useFocusEffect(useCallback(() => {
    void connectedTargets().then((list) => {
      setConnected(list)
      setTarget((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id ?? null))
    })
    void githubTarget.read().then(setRepository)
    void githubSession.read().then((token) => setGithubConnected(Boolean(token)))
  }, []))

  useEffect(() => {
    setModelState(null)
    setModelsError(undefined)
    if (!target) return
    let active = true
    modelsFor(target)
      .then((state) => { if (active) setModelState(state) })
      .catch((error) => { if (active) setModelsError(error instanceof Error ? error.message : 'Não foi possível listar modelos.') })
    return () => { active = false }
  }, [target])

  const targetLabel = connected.find((item) => item.id === target)?.label ?? ''
  const repoParts = repository.trim().split('/')
  const validRepo = repoParts.length === 2 && repoParts.every(Boolean)

  async function chooseModel(model: string | null) {
    if (!target) return
    await setModelFor(target, model)
    setModelState(await modelsFor(target))
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
      const instruction = planning ? `${PLANNING_INSTRUCTION}\n\n` : 'Responda em português, quando apropriado.\n\n'
      const answer = await askProvider(target, `${instruction}Conversa compartilhada:\n\n${transcript}`)
      const served = answer.model === answer.requested ? answer.model : `${answer.model} (pedido: ${answer.requested})`
      setEntries((current) => [...current, { author: `${targetLabel} · ${served}`, text: answer.text, plan: planning }])
    } catch (error) {
      setEntries((current) => [...current, { author: targetLabel || 'Erro', text: error instanceof Error ? error.message : 'Não foi possível obter resposta.' }])
    } finally {
      setBusy(false)
    }
  }

  async function createIssueFrom(index: number) {
    const plan = entries[index]
    const token = await githubSession.read()
    if (!token || !validRepo) return
    const [owner, name] = repoParts
    setBusy(true)
    try {
      const issue = await createIssue(token, owner, name, titleFrom(plan.text), `${plan.text}\n\n---\n@claude execute o plano acima neste repositório e abra um pull request.`)
      setEntries((current) => current.map((entry, position) => (position === index ? { ...entry, created: true } : entry)).concat({ author: 'GitHub', text: `Issue criada: ${issue.html_url}\nO workflow Claude Code começa a executar o plano.` }))
    } catch (error) {
      setEntries((current) => [...current, { author: 'GitHub', text: error instanceof Error ? error.message : 'Não foi possível criar a Issue.' }])
    } finally {
      setBusy(false)
    }
  }

  if (connected.length === 0) {
    return <View style={styles.page}>
      <Text style={styles.empty}>Nenhum provider conectado. Conecte um na tela inicial para conversar aqui.</Text>
    </View>
  }

  return <KeyboardAvoidingView style={styles.page} behavior="padding">
    <View style={styles.providers}>
      {connected.map((item) => <Pressable key={item.id} onPress={() => setTarget(item.id)} style={[styles.chip, target === item.id && styles.chipSelected]}>
        <Text style={[styles.chipText, target === item.id && styles.chipTextSelected]}>{item.label}</Text>
      </Pressable>)}
      <Pressable onPress={() => setPlanning((current) => !current)} style={[styles.chip, planning && styles.chipSelected]}>
        <Text style={[styles.chipText, planning && styles.chipTextSelected]}>Planejamento {planning ? 'ligado' : 'desligado'}</Text>
      </Pressable>
    </View>

    {planning ? <View style={styles.repoRow}>
      <TextInput value={repository} onChangeText={(value) => { setRepository(value); void githubTarget.save(value.trim()) }} autoCapitalize="none" autoCorrect={false} placeholder="dono/repositorio" placeholderTextColor="#64748b" style={styles.repoInput} />
      <Text style={styles.repoHint}>{!githubConnected ? 'GitHub não conectado' : validRepo ? 'Issue com @claude' : 'Informe dono/repositorio'}</Text>
    </View> : null}

    <Text style={styles.modelHint}>{modelsError ?? (modelState ? 'Modelos disponíveis. Toque para usar na próxima mensagem.' : 'Carregando modelos…')}</Text>
    {modelState ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelScroll} contentContainerStyle={styles.modelRow}>
      <Pressable onPress={() => void chooseModel(null)} style={[styles.modelChip, !modelState.selected && styles.chipSelected]}>
        <Text style={[styles.chipText, !modelState.selected && styles.chipTextSelected]}>Automático</Text>
      </Pressable>
      {modelState.models.map((model) => <Pressable key={model} onPress={() => void chooseModel(model)} style={[styles.modelChip, modelState.selected === model && styles.chipSelected]}>
        <Text style={[styles.chipText, modelState.selected === model && styles.chipTextSelected]}>{model}</Text>
      </Pressable>)}
    </ScrollView> : null}

    <ScrollView ref={messagesRef} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: true })}>
      {entries.length === 0 ? <Text style={styles.empty}>{planning ? 'Descreva o que quer construir. Eu respondo com um plano que você pode transformar em Issue para o Claude Code executar.' : 'Conversa livre. O histórico fica só nesta tela e some ao sair.'}</Text> : entries.map((entry, index) => <View key={`${entry.author}-${index}`} style={styles.message}>
        <Text style={styles.author}>{entry.author}</Text>
        <Text style={styles.messageText}>{entry.text}</Text>
        {entry.plan && !entry.created && validRepo && githubConnected ? <Pressable onPress={() => void createIssueFrom(index)} disabled={busy} style={[styles.issueButton, busy && styles.disabled]}>
          <Text style={styles.issueButtonText}>Criar Issue com @claude em {repository.trim()}</Text>
        </Pressable> : null}
      </View>)}
    </ScrollView>

    <View style={[styles.composer, { paddingBottom: insets.bottom + 4 }]}>
      <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder={planning ? 'Descreva a tarefa' : 'Mensagem'} placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => void send()} disabled={busy || !target} style={[styles.send, (busy || !target) && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Enviar</Text>}
      </Pressable>
    </View>
  </KeyboardAvoidingView>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 12, gap: 8 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: '#475569', paddingHorizontal: 10, paddingVertical: 5 },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  repoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  repoInput: { flex: 1, color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 8, fontSize: 13, paddingHorizontal: 10, paddingVertical: 6 },
  repoHint: { color: '#94a3b8', fontSize: 11 },
  modelHint: { color: '#94a3b8', fontSize: 12 },
  modelScroll: { flexGrow: 0 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelChip: { borderRadius: 14, borderWidth: 1, borderColor: '#475569', paddingHorizontal: 10, paddingVertical: 5 },
  messages: { flex: 1, backgroundColor: '#0f172a', borderRadius: 10 },
  messagesContent: { padding: 10, gap: 8 },
  empty: { color: '#94a3b8', lineHeight: 20, fontSize: 14 },
  message: { backgroundColor: '#1e293b', borderRadius: 8, padding: 10, gap: 4 },
  author: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },
  messageText: { color: '#e2e8f0', lineHeight: 20, fontSize: 14 },
  issueButton: { alignItems: 'center', backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 8, marginTop: 6 },
  issueButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  send: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 44, paddingHorizontal: 16 },
  sendText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 }
})
