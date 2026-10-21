import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { approveRun, closeIssue, listAgentIssues, listPendingRuns, listRecentAgentRuns, runIssueAgents, type AgentIssue, type AgentRun, type PendingRun } from '@/github/agents-status'
import { githubSession } from '@/storage/github-session'
import { githubTarget } from '@/storage/github-target'

// Só conta a execução do workflow do próprio agente: @claude usa "Claude Code", @codex e @deepseek usam "Agents".
function belongsTo(run: AgentRun, mention: string) {
  return mention === '@claude' ? run.name === 'Claude Code' : run.name.startsWith('Agents')
}

function statusOf(issue: AgentIssue, runs: AgentRun[], mention: string) {
  const candidates = runs.filter((item) => item.title === issue.title && belongsTo(item, mention))
  const run = candidates.find((item) => item.conclusion !== 'skipped') ?? candidates[0]
  if (!run) return { label: 'no run yet', color: '#94a3b8', url: issue.url }
  if (run.status === 'waiting') return { label: 'waiting for your approval', color: '#fbbf24', url: run.url }
  if (run.status !== 'completed') return { label: 'in progress', color: '#60a5fa', url: run.url }
  if (run.conclusion === 'success') return { label: 'completed', color: '#a7f3d0', url: run.url }
  if (run.conclusion === 'skipped') return { label: 'not run (mention did not match)', color: '#94a3b8', url: run.url }
  return { label: `ended: ${run.conclusion ?? 'no result'}`, color: '#f87171', url: run.url }
}

export default function AgentsScreen() {
  const [repository, setRepository] = useState('')
  const [issues, setIssues] = useState<AgentIssue[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [pending, setPending] = useState<PendingRun[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    const token = await githubSession.read()
    const fullName = await githubTarget.read()
    setRepository(fullName)
    if (!token) return setMessage('Connect GitHub on the home screen.')
    if (!fullName) return setMessage('Choose a repository in the chat first.')
    setBusy(true)
    setMessage('')
    try {
      const [nextIssues, nextRuns, nextPending] = await Promise.all([
        listAgentIssues(token, fullName),
        listRecentAgentRuns(token, fullName),
        listPendingRuns(token, fullName)
      ])
      setIssues(nextIssues)
      setRuns(nextRuns)
      setPending(nextPending)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not refresh.')
    } finally {
      setBusy(false)
    }
  }

  useFocusEffect(useCallback(() => { void refresh() }, []))

  async function close(issue: AgentIssue) {
    const token = await githubSession.read()
    if (!token || !repository) return
    setBusy(true)
    try {
      await closeIssue(token, repository, issue.number)
      setMessage(`Issue #${issue.number} closed.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not close the Issue.')
    } finally {
      setBusy(false)
    }
  }

  async function runAgents(issue: AgentIssue) {
    const token = await githubSession.read()
    if (!token || !repository) return
    setBusy(true)
    try {
      await runIssueAgents(token, repository, issue.number)
      setMessage(`Run requested for #${issue.number}. It appears below in a few seconds.`)
      setTimeout(() => void refresh(), 5000)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the agents.')
    } finally {
      setBusy(false)
    }
  }

  async function approve(list: PendingRun[]) {
    const token = await githubSession.read()
    if (!token || !repository) return
    setBusy(true)
    const failed: string[] = []
    for (const run of list) {
      try {
        await approveRun(token, repository, run)
      } catch (error) {
        failed.push(`#${run.runId}: ${error instanceof Error ? error.message : 'error'}`)
      }
    }
    setMessage(failed.length ? `Some runs were not approved. ${failed.join(' ')}` : `${list.length} run(s) approved.`)
    await refresh()
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <Text style={styles.title}>{repository || 'No repository'}</Text>
      <Pressable onPress={() => void refresh()} disabled={busy} style={styles.button}><Text style={styles.buttonText}>Refresh</Text></Pressable>
    </View>
    {busy ? <ActivityIndicator color="#60a5fa" /> : null}
    {message ? <Text style={styles.message}>{message}</Text> : null}

    <Text style={styles.section}>Waiting for approval ({pending.length})</Text>
    {pending.length > 1 ? <Pressable onPress={() => void approve(pending)} disabled={busy} style={styles.approveAll}><Text style={styles.buttonText}>Approve all</Text></Pressable> : null}
    {pending.length === 0 ? <Text style={styles.empty}>Nothing is waiting for your approval.</Text> : null}
    {pending.map((run) => <View key={run.runId} style={styles.card}>
      <Text style={styles.cardTitle}>{run.title}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => void approve([run])} disabled={busy} style={styles.approve}><Text style={styles.buttonText}>Approve</Text></Pressable>
        <Pressable onPress={() => void Linking.openURL(run.url)} style={styles.link}><Text style={styles.linkText}>View run</Text></Pressable>
      </View>
    </View>)}

    <Text style={styles.section}>Agent Issues ({issues.length})</Text>
    {issues.length === 0 ? <Text style={styles.empty}>No Issue with an agent mention.</Text> : null}
    {issues.map((issue) => {
      const statuses = issue.mentions.map((mention) => ({ mention, status: statusOf(issue, runs, mention) }))
      return <View key={issue.number} style={styles.card}>
        <Pressable onPress={() => router.push({ pathname: '/issue', params: { number: String(issue.number) } })}><Text style={styles.cardTitle}>#{issue.number} {issue.title}</Text></Pressable>
        <Text style={styles.meta}>{issue.mentions.join(' ')} · {issue.state === 'open' ? 'open' : 'closed'}</Text>
        {statuses.map(({ mention, status }) => <Text key={mention} style={[styles.status, { color: status.color }]}>{mention}: {status.label}</Text>)}
        <View style={styles.row}>
          <Pressable onPress={() => router.push({ pathname: '/issue', params: { number: String(issue.number) } })} style={styles.link}><Text style={styles.linkText}>Details and reply</Text></Pressable>
          <Pressable onPress={() => void Linking.openURL(statuses[0]?.status.url ?? issue.url)} style={styles.link}><Text style={styles.linkText}>Open on GitHub</Text></Pressable>
          {issue.state === 'open' ? <Pressable onPress={() => void runAgents(issue)} disabled={busy} style={styles.runAgent}><Text style={styles.buttonText}>Run agent</Text></Pressable> : null}
          {issue.state === 'open' ? <Pressable onPress={() => void close(issue)} disabled={busy} style={styles.closeIssue}><Text style={styles.buttonText}>Close issue</Text></Pressable> : null}
        </View>
      </View>
    })}
  </ScrollView>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827' },
  content: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '700', flex: 1 },
  section: { color: '#cbd5e1', fontSize: 14, fontWeight: '700', marginTop: 8 },
  message: { color: '#fbbf24', fontSize: 13, lineHeight: 18 },
  empty: { color: '#64748b', fontSize: 13 },
  card: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, gap: 6 },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  meta: { color: '#94a3b8', fontSize: 12 },
  status: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  button: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  approve: { backgroundColor: '#0f766e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  approveAll: { backgroundColor: '#0f766e', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  link: { paddingVertical: 8 },
  closeIssue: { backgroundColor: '#7f1d1d', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  runAgent: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  linkText: { color: '#93c5fd', fontSize: 13, fontWeight: '700' }
})
