import { Link, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createIssue } from '@/github/repository'
import { bodyForExecutor } from '@/github/agents-status'
import { askProvider, connectedTargets, modelsFor, setModelFor, type ChatTarget } from '@/providers/chat'
import { splitPlan } from '@/providers/split-plan'
import { githubSession } from '@/storage/github-session'
import { githubTarget } from '@/storage/github-target'
import { RepositoryPanel } from '@/components/repository-panel'

type Entry = { author: string; text: string; plan?: boolean; created?: boolean }
type Connected = { id: ChatTarget; label: string }
type Executor = 'claude' | 'codex' | 'deepseek'
type ModelState = { models: string[]; selected: string | null; active: string }

// Instrução do modo planejamento: produz um plano revisável, sem executar nada.
const PLANNING_INSTRUCTION = [
  'Planning mode: do not write code or run anything.',
  'Answer in English with:',
  '1) Goal in one sentence;',
  '2) Numbered steps, each with the affected file or area;',
  '3) Risks and open questions.',
  'End with the line "Ready to run." when the plan is complete.'
].join('\n')

// Agentes que executam o plano no GitHub Actions. Cada um tem um workflow que reage à menção.
const EXECUTORS: Array<{ id: Executor; label: string; mention: string }> = [
  { id: 'claude', label: 'Claude', mention: '@claude' },
  { id: 'codex', label: 'Codex', mention: '@codex' },
  { id: 'deepseek', label: 'DeepSeek', mention: '@deepseek' }
]

function titleFrom(plan: string) {
  const line = plan.split('\n').map((item) => item.replace(/[#*`]/g, '').trim()).find(Boolean) ?? 'Planning task'
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
  const [executors, setExecutors] = useState<Executor[]>(['claude'])
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
      .catch((error) => { if (active) setModelsError(error instanceof Error ? error.message : 'Could not list models.') })
    return () => { active = false }
  }, [target])

  const targetLabel = connected.find((item) => item.id === target)?.label ?? ''
  const repoParts = repository.trim().split('/')
  const validRepo = repoParts.length === 2 && repoParts.every(Boolean)
  const selectedExecutors = EXECUTORS.filter((item) => executors.includes(item.id))
  const selectedMentions = selectedExecutors.map((item) => item.mention).join(' e ')

  async function chooseModel(model: string | null) {
    if (!target) return
    await setModelFor(target, model)
    setModelState(await modelsFor(target))
  }

  async function send() {
    const question = prompt.trim()
    if (!question || busy || !target) return
    setPrompt('')
    setEntries((current) => [...current, { author: 'You', text: question }])
    setBusy(true)
    try {
      const transcript = [...entries, { author: 'You', text: question }]
        .map((entry) => `${entry.author}: ${entry.text}`)
        .join('\n\n')
      const instruction = planning ? `${PLANNING_INSTRUCTION}\n\n` : 'Answer in English, when appropriate.\n\n'
      const answer = await askProvider(target, `${instruction}Conversa compartilhada:\n\n${transcript}`)
      const served = answer.model === answer.requested ? answer.model : `${answer.model} (pedido: ${answer.requested})`
      setEntries((current) => [...current, { author: `${targetLabel} · ${served}`, text: answer.text, plan: planning }])
    } catch (error) {
      setEntries((current) => [...current, { author: targetLabel || 'Error', text: error instanceof Error ? error.message : 'Could not get a response.' }])
    } finally {
      setBusy(false)
    }
  }

  // Ao menos um agente fica sempre selecionado.
  function toggleExecutor(id: Executor) {
    setExecutors((current) => {
      const next = EXECUTORS.map((item) => item.id).filter((item) => (item === id ? !current.includes(item) : current.includes(item)))
      return next.length > 0 ? next : current
    })
  }

  // Um agente: a Issue recebe o plano inteiro. Vários: o modelo do chat divide o plano e cada agente recebe a sua parte.
  async function createIssuesFrom(index: number) {
    const plan = entries[index]
    const token = await githubSession.read()
    if (!token || !validRepo || !target) return
    const [owner, name] = repoParts
    const selected = selectedExecutors
    const lines: string[] = []
    setBusy(true)
    try {
      const parts = selected.length > 1
        ? await splitPlan(plan.text, selected.map((item) => item.id), (prompt) => askProvider(target, prompt).then((answer) => answer.text))
        : { [selected[0].id]: plan.text }
      for (const item of selected) {
        const part = parts[item.id]
        const title = selected.length > 1 ? `${item.label}: ${titleFrom(part)}`.slice(0, 120) : titleFrom(part)
        const issue = await createIssue(token, owner, name, title, bodyForExecutor(part, item.mention))
        lines.push(`${item.mention}: ${issue.html_url}`)
      }
      setEntries((current) => current.map((entry, position) => (position === index ? { ...entry, created: true } : entry)).concat({ author: 'GitHub', text: `Issues created:\n${lines.join('\n')}\nThe agents run through GitHub Actions.` }))
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Could not create the Issue.'
      setEntries((current) => [...current, { author: 'GitHub', text: lines.length > 0 ? `${lines.join('\n')}\nThe rest were not created: ${failure}` : failure }])
    } finally {
      setBusy(false)
    }
  }

  if (connected.length === 0) {
    return <View style={styles.page}>
      <Text style={styles.empty}>No provider connected. Connect one on the home screen to chat here.</Text>
    </View>
  }

  return <KeyboardAvoidingView style={styles.page} behavior="padding">
    <View style={styles.providers}>
      {connected.map((item) => <Pressable key={item.id} onPress={() => setTarget(item.id)} style={[styles.chip, target === item.id && styles.chipSelected]}>
        <Text style={[styles.chipText, target === item.id && styles.chipTextSelected]}>{item.label}</Text>
      </Pressable>)}
      <Pressable onPress={() => setPlanning((current) => !current)} style={[styles.chip, planning && styles.chipSelected]}>
        <Text style={[styles.chipText, planning && styles.chipTextSelected]}>Planning {planning ? 'on' : 'off'}</Text>
      </Pressable>
    </View>

    {planning ? <View style={styles.providers}>
      {EXECUTORS.map((item) => <Pressable key={item.id} onPress={() => toggleExecutor(item.id)} style={[styles.chip, executors.includes(item.id) && styles.chipSelected]}>
        <Text style={[styles.chipText, executors.includes(item.id) && styles.chipTextSelected]}>Run with {item.label}</Text>
      </Pressable>)}
    </View> : null}

    <Link href="/agents" style={styles.agentsLink}>Issues and agents</Link>
    {planning ? <RepositoryPanel repository={repository} githubConnected={githubConnected} onChange={setRepository} /> : null}

    <Text style={styles.modelHint}>{modelsError ?? (modelState ? 'Models available. Tap one to use it for the next message.' : 'Loading models…')}</Text>
    {modelState ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelScroll} contentContainerStyle={styles.modelRow}>
      <Pressable onPress={() => void chooseModel(null)} style={[styles.modelChip, !modelState.selected && styles.chipSelected]}>
        <Text style={[styles.chipText, !modelState.selected && styles.chipTextSelected]}>Automatic</Text>
      </Pressable>
      {modelState.models.map((model) => <Pressable key={model} onPress={() => void chooseModel(model)} style={[styles.modelChip, modelState.selected === model && styles.chipSelected]}>
        <Text style={[styles.chipText, modelState.selected === model && styles.chipTextSelected]}>{model}</Text>
      </Pressable>)}
    </ScrollView> : null}

    <ScrollView ref={messagesRef} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: true })}>
      {entries.length === 0 ? <Text style={styles.empty}>{planning ? 'Describe what you want to build. I will answer with a plan you can turn into an Issue for an agent to run.' : 'Free chat. The history stays on this screen and disappears when you leave.'}</Text> : entries.map((entry, index) => <View key={`${entry.author}-${index}`} style={styles.message}>
        <Text style={styles.author}>{entry.author}</Text>
        <Text style={styles.messageText}>{entry.text}</Text>
        {entry.plan && !entry.created && validRepo && githubConnected ? <Pressable onPress={() => void createIssuesFrom(index)} disabled={busy} style={[styles.issueButton, busy && styles.disabled]}>
          <Text style={styles.issueButtonText}>Create {selectedExecutors.length > 1 ? 'Issues' : 'Issue'} with {selectedMentions} in {repository.trim()}</Text>
        </Pressable> : null}
      </View>)}
    </ScrollView>

    <View style={[styles.composer, { paddingBottom: insets.bottom + 4 }]}>
      <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder={planning ? 'Describe the task' : 'Message'} placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => void send()} disabled={busy || !target} style={[styles.send, (busy || !target) && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
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
  disabled: { opacity: 0.6 },
  agentsLink: { color: '#93c5fd', fontSize: 13, fontWeight: '700', paddingVertical: 4 }
})
