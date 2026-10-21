import { Link, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createIssue } from '@/github/repository'
import { bodyForExecutor } from '@/github/agents-status'
import { askProvider, connectedTargets, modelsFor, setModelFor, type ChatTarget } from '@/providers/chat'
import { extractSplit, splitInstruction, splitPlan } from '@/providers/split-plan'
import { githubSession } from '@/storage/github-session'
import { githubTarget } from '@/storage/github-target'
import { loadChatHistory, newChat, saveChatHistory, titleFor, type ChatHistory } from '@/storage/chat-history'
import { RepositoryPanel } from '@/components/repository-panel'

type Entry = { author: string; text: string; plan?: boolean; created?: boolean; parts?: Record<string, string> }
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
  const [history, setHistory] = useState<ChatHistory>({ chats: [], activeId: null })
  const [showChats, setShowChats] = useState(false)
  const [setupOpen, setSetupOpen] = useState(true)
  const loadedRepo = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [planning, setPlanning] = useState(true)
  const [repository, setRepository] = useState('')
  const [executors, setExecutors] = useState<Executor[]>(['claude'])
  const [githubConnected, setGithubConnected] = useState(false)
  const insets = useSafeAreaInsets()
  const messagesRef = useRef<ScrollView>(null)
  const active = history.chats.find((chat) => chat.id === history.activeId) ?? history.chats[0]
  const entries: Entry[] = active?.entries ?? []

  // Carrega as conversas do repositório escolhido. Trocar de repositório troca também a lista de conversas.
  useEffect(() => {
    let current = true
    void loadChatHistory(repository).then((stored) => {
      if (!current) return
      const chats = stored.chats.length > 0 ? stored.chats : [newChat()]
      const activeId = chats.some((chat) => chat.id === stored.activeId) ? stored.activeId : chats[0].id
      loadedRepo.current = repository
      setHistory({ chats, activeId })
      setShowChats(false)
    })
    return () => { current = false }
  }, [repository])

  // Salva a cada mudança, só depois de carregar o repositório atual.
  useEffect(() => {
    if (loadedRepo.current === null) return
    void saveChatHistory(loadedRepo.current, history)
  }, [history])

  // Escreve numa conversa específica, mesmo que o usuário tenha trocado de conversa enquanto a resposta chegava.
  function updateChat(chatId: string, update: (entries: Entry[]) => Entry[]) {
    setHistory((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => {
        if (chat.id !== chatId) return chat
        const next = update(chat.entries)
        return { ...chat, entries: next, title: titleFor(next), updatedAt: Date.now() }
      })
    }))
  }

  function newConversation() {
    const chat = newChat()
    setHistory((prev) => ({ chats: [chat, ...prev.chats], activeId: chat.id }))
    setShowChats(false)
  }

  function switchTo(chatId: string) {
    setHistory((prev) => ({ ...prev, activeId: chatId }))
    setShowChats(false)
  }

  function deleteChat(chatId: string) {
    setHistory((prev) => {
      const rest = prev.chats.filter((chat) => chat.id !== chatId)
      if (rest.length === 0) {
        const chat = newChat()
        return { chats: [chat], activeId: chat.id }
      }
      return { chats: rest, activeId: prev.activeId === chatId ? rest[0].id : prev.activeId }
    })
  }

  function confirmDelete(chat: { id: string; title: string }) {
    Alert.alert('Delete this chat?', chat.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteChat(chat.id) }
    ])
  }

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
    if (!question || busy || !target || !active) return
    const chatId = active.id
    const agentIds = selectedExecutors.map((item) => item.id)
    setPrompt('')
    setSetupOpen(false)
    updateChat(chatId, (current) => [...current, { author: 'You', text: question }])
    setBusy(true)
    try {
      const transcript = [...entries, { author: 'You', text: question }]
        .map((entry) => `${entry.author}: ${entry.text}`)
        .join('\n\n')
      const split = planning && agentIds.length > 1 ? `\n${splitInstruction(agentIds)}` : ''
      const instruction = planning ? `${PLANNING_INSTRUCTION}${split}\n\n` : 'Answer in English, when appropriate.\n\n'
      const answer = await askProvider(target, `${instruction}Conversa compartilhada:\n\n${transcript}`)
      const served = answer.model === answer.requested ? answer.model : `${answer.model} (pedido: ${answer.requested})`
      const { plan, parts } = planning ? extractSplit(answer.text, agentIds) : { plan: answer.text, parts: undefined }
      updateChat(chatId, (current) => [...current, { author: `${targetLabel} · ${served}`, text: plan, plan: planning, parts }])
    } catch (error) {
      updateChat(chatId, (current) => [...current, { author: targetLabel || 'Error', text: error instanceof Error ? error.message : 'Could not get a response.' }])
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
    if (!active) return
    const chatId = active.id
    const plan = entries[index]
    const token = await githubSession.read()
    if (!token || !validRepo || !target) return
    const [owner, name] = repoParts
    const selected = selectedExecutors
    const lines: string[] = []
    setBusy(true)
    try {
      const ready = plan.parts && selected.every((item) => plan.parts?.[item.id])
      const parts = selected.length > 1
        ? ready ? plan.parts! : await splitPlan(plan.text, selected.map((item) => item.id), (prompt) => askProvider(target, prompt).then((answer) => answer.text))
        : { [selected[0].id]: plan.text }
      for (const item of selected) {
        const part = parts[item.id]
        const title = selected.length > 1 ? `${item.label}: ${titleFrom(part)}`.slice(0, 120) : titleFrom(part)
        const issue = await createIssue(token, owner, name, title, bodyForExecutor(part, item.mention))
        lines.push(`${item.mention}: ${issue.html_url}`)
      }
      updateChat(chatId, (current) => current.map((entry, position) => (position === index ? { ...entry, created: true } : entry)).concat({ author: 'GitHub', text: `Issues created:\n${lines.join('\n')}\nThe agents run through GitHub Actions.` }))
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Could not create the Issue.'
      updateChat(chatId, (current) => [...current, { author: 'GitHub', text: lines.length > 0 ? `${lines.join('\n')}\nThe rest were not created: ${failure}` : failure }])
    } finally {
      setBusy(false)
    }
  }

  if (connected.length === 0) {
    return <View style={styles.page}>
      <Text style={styles.empty}>No provider connected. Connect one on the home screen to chat here.</Text>
    </View>
  }

  return <View style={styles.page}>
    <View style={styles.chatBar}>
      <Pressable onPress={() => setShowChats((value) => !value)} style={styles.chatTitle}>
        <Text numberOfLines={1} style={styles.chatTitleText}>{active?.title ?? 'New chat'} ▾</Text>
      </Pressable>
      <Pressable onPress={() => setSetupOpen((value) => !value)} style={styles.chatSetup}>
        <Text style={styles.buttonText}>{setupOpen ? 'Hide setup' : 'Setup'}</Text>
      </Pressable>
      <Pressable onPress={newConversation} style={styles.chatNew}>
        <Text style={styles.buttonText}>New chat</Text>
      </Pressable>
    </View>
    {showChats ? <ScrollView style={styles.chatList} nestedScrollEnabled>
      {[...history.chats].sort((a, b) => b.updatedAt - a.updatedAt).map((chat) => <View key={chat.id} style={styles.chatRow}>
        <Pressable onPress={() => switchTo(chat.id)} style={styles.chatItem}>
          <Text numberOfLines={1} style={[styles.chatItemText, chat.id === active?.id && styles.chatItemActive]}>{chat.title}</Text>
          <Text style={styles.chatMeta}>{new Date(chat.updatedAt).toLocaleString()}</Text>
        </Pressable>
        <Pressable onPress={() => confirmDelete(chat)} style={styles.chatDelete}>
          <Text style={styles.buttonText}>Delete</Text>
        </Pressable>
      </View>)}
    </ScrollView> : null}

    {setupOpen ? <ScrollView style={styles.setup} nestedScrollEnabled>
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


    </ScrollView> : null}

    <ScrollView ref={messagesRef} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: true })}>
      {entries.length === 0 ? <Text style={styles.empty}>{planning ? 'Describe what you want to build. I will answer with a plan you can turn into an Issue for an agent to run.' : 'Free chat. Conversations are saved on this device for each repository.'}</Text> : entries.map((entry, index) => <View key={`${entry.author}-${index}`} style={styles.message}>
        <Text style={styles.author}>{entry.author}</Text>
        <Text style={styles.messageText}>{entry.text}</Text>
        {entry.plan && !entry.created && validRepo && githubConnected ? <Pressable onPress={() => void createIssuesFrom(index)} disabled={busy} style={[styles.issueButton, busy && styles.disabled]}>
          <Text style={styles.issueButtonText}>Create {selectedExecutors.length > 1 ? 'Issues' : 'Issue'} with {selectedMentions} in {repository.trim()}</Text>
        </Pressable> : null}
      </View>)}
    </ScrollView>

    <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
      <View style={[styles.composer, { paddingBottom: insets.bottom + 4 }]}>
      <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder={planning ? 'Describe the task' : 'Message'} placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => void send()} disabled={busy || !target} style={[styles.send, (busy || !target) && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
      </Pressable>
      </View>
    </KeyboardStickyView>
  </View>
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
  agentsLink: { color: '#93c5fd', fontSize: 13, fontWeight: '700', paddingVertical: 4 },
  chatBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatTitle: { flex: 1, backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chatTitleText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  chatNew: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  chatSetup: { alignItems: 'center', backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  setup: { maxHeight: 340, flexGrow: 0 },
  chatList: { maxHeight: 260, backgroundColor: '#0f172a', borderRadius: 10 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  chatItem: { flex: 1, gap: 2 },
  chatItemText: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  chatItemActive: { color: '#93c5fd' },
  chatMeta: { color: '#64748b', fontSize: 11 },
  chatDelete: { backgroundColor: '#7f1d1d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 }
})
