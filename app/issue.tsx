import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { getIssueDetail, listIssueComments, postIssueComment, type IssueComment, type IssueDetail } from '@/github/agents-status'
import { githubSession } from '@/storage/github-session'
import { githubTarget } from '@/storage/github-target'

// Abre uma Issue do quadro: texto, comentários e resposta. Respostas com menção disparam o agente de novo.
export default function IssueScreen() {
  const { number } = useLocalSearchParams<{ number: string }>()
  const issueNumber = Number(number)
  const [repository, setRepository] = useState('')
  const [issue, setIssue] = useState<IssueDetail>()
  const [comments, setComments] = useState<IssueComment[]>([])
  const [reply, setReply] = useState('')
  const [mentionAgent, setMentionAgent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    const token = await githubSession.read()
    const fullName = await githubTarget.read()
    setRepository(fullName)
    if (!token) return setMessage('Connect GitHub on the home screen.')
    if (!fullName) return setMessage('Choose a repository in the chat first.')
    setBusy(true)
    try {
      const [detail, list] = await Promise.all([
        getIssueDetail(token, fullName, issueNumber),
        listIssueComments(token, fullName, issueNumber)
      ])
      setIssue(detail)
      setComments(list)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load the Issue.')
    } finally {
      setBusy(false)
    }
  }

  useFocusEffect(useCallback(() => { void refresh() }, [issueNumber]))

  // A resposta leva a menção do agente da Issue, para o workflow rodar de novo.
  const agentMention = issue?.mentions[0]
  const outgoing = mentionAgent && agentMention && !reply.includes(agentMention) ? `${agentMention} ${reply.trim()}` : reply.trim()

  async function send() {
    const token = await githubSession.read()
    if (!token || !repository || !reply.trim()) return
    setBusy(true)
    try {
      await postIssueComment(token, repository, issueNumber, outgoing)
      setReply('')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the reply.')
    } finally {
      setBusy(false)
    }
  }

  if (!issue) {
    return <View style={styles.page}>
      {busy ? <ActivityIndicator color="#60a5fa" /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  }

  return <View style={styles.page}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>#{issue.number} {issue.title}</Text>
      <Text style={styles.meta}>{issue.state === 'open' ? 'open' : 'closed'}{issue.mentions.length ? ` · ${issue.mentions.join(' ')}` : ''}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.card}>
        <Text selectable style={styles.body}>{issue.body || 'No description.'}</Text>
      </View>

      <Text style={styles.section}>Comments ({comments.length})</Text>
      {comments.length === 0 ? <Text style={styles.empty}>No comments yet.</Text> : null}
      {comments.map((comment) => <View key={comment.id} style={styles.card}>
        <Text style={styles.author}>{comment.author} · {new Date(comment.createdAt).toLocaleString()}</Text>
        <Text selectable style={styles.body}>{comment.body}</Text>
      </View>)}

      <Pressable onPress={() => void Linking.openURL(issue.url)} style={styles.link}><Text style={styles.linkText}>Open on GitHub</Text></Pressable>
    </ScrollView>

    <View style={styles.composer}>
      {agentMention ? <Pressable onPress={() => setMentionAgent((value) => !value)} style={[styles.toggle, mentionAgent && styles.toggleOn]}>
        <Text style={styles.buttonText}>{mentionAgent ? `Sends to ${agentMention}` : `Send without ${agentMention}`}</Text>
      </Pressable> : null}
      <TextInput value={reply} onChangeText={setReply} multiline placeholder="Write a reply" placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => void send()} disabled={busy || !reply.trim()} style={[styles.send, (busy || !reply.trim()) && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reply</Text>}
      </Pressable>
    </View>
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  meta: { color: '#94a3b8', fontSize: 12 },
  message: { color: '#fbbf24', fontSize: 13, lineHeight: 18 },
  section: { color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginTop: 8 },
  empty: { color: '#64748b', fontSize: 13 },
  card: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, gap: 6 },
  author: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },
  body: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  link: { paddingVertical: 8 },
  linkText: { color: '#93c5fd', fontSize: 13, fontWeight: '700' },
  composer: { gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#334155' },
  toggle: { alignSelf: 'flex-start', backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  toggleOn: { backgroundColor: '#0f766e' },
  input: { minHeight: 60, maxHeight: 140, color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  send: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 }
})
