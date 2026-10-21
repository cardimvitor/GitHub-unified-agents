import { Link } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { githubTarget } from '@/storage/github-target'
import { githubSession } from '@/storage/github-session'
import { allowActionsPullRequests, configureAgents, createRepository, enableCopilotReview, listRepositories, type RepositoryInfo } from '@/github/repositories'
import { missingSecrets, pushAgentSecrets, type SecretReport } from '@/github/agent-secrets'
import { ensureAgentsEnvironment, environmentSecretNames, repositoryInfo } from '@/github/environments'
import { agentSettings } from '@/storage/agent-settings'

type Props = {
  repository: string
  githubConnected: boolean
  onChange: (repository: string) => void
}

type Mode = 'closed' | 'list' | 'create'

export function RepositoryPanel({ repository, githubConnected, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('closed')
  const [repos, setRepos] = useState<RepositoryInfo[]>([])
  const [newName, setNewName] = useState('')
  const [newPrivate, setNewPrivate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>()
  const [missing, setMissing] = useState<string[]>([])
  const [reports, setReports] = useState<SecretReport[]>([])
  const [automatic, setAutomatic] = useState(false)

  useEffect(() => { void agentSettings.readAutomatic().then(setAutomatic) }, [])

  async function toggleAutomatic() {
    const next = !automatic
    await agentSettings.saveAutomatic(next)
    setAutomatic(next)
  }

  async function token() {
    const value = await githubSession.read()
    if (!value) throw new Error('Connect GitHub on the home screen before choosing a repository.')
    return value
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(true)
    setStatus(label)
    try {
      await action()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not finish.')
    } finally {
      setBusy(false)
    }
  }

  async function checkSecrets(fullName: string) {
    const authToken = await token()
    const repo = await repositoryInfo(authToken, fullName)
    const names = await environmentSecretNames(authToken, repo.id)
    setMissing(missingSecrets(names))
  }

  async function select(fullName: string) {
    await githubTarget.save(fullName)
    onChange(fullName)
    setMode('closed')
    setStatus(`Repository ${fullName} selected.`)
    await run('Checking secrets…', () => checkSecrets(fullName))
  }

  async function openList() {
    if (mode === 'list') return setMode('closed')
    setMode('list')
    await run('Loading repositories…', async () => setRepos(await listRepositories(await token())))
  }

  async function create() {
    const name = newName.trim()
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return setStatus('Use only letters, numbers, dots, dashes or underscores in the name.')
    await run('Creating repository…', async () => {
      const created = await createRepository(await token(), name, newPrivate)
      setNewName('')
      await select(created.fullName)
      await configure(created.fullName)
    })
  }

  async function configure(fullName: string) {
    await run('Setting up agents…', async () => {
      const authToken = await token()
      await configureAgents(authToken, fullName, (path) => setStatus(`Writing ${path}…`))
      const environment = await ensureAgentsEnvironment(authToken, fullName, automatic)
      setStatus('Sending credentials to the environment…')
      setReports(await pushAgentSecrets(authToken, environment.repositoryId))
      const copilot = await enableCopilotReview(authToken, fullName)
      const pulls = await allowActionsPullRequests(authToken, fullName)
      await checkSecrets(fullName)
      setStatus(`Agents set up. ${environment.message} ${copilot.message} ${pulls.message}`)
    })
  }

  return <View style={styles.box}>
    <View style={styles.row}>
      <Text numberOfLines={1} style={styles.current}>{repository || 'No repository chosen'}</Text>
      <Pressable onPress={() => void openList()} disabled={!githubConnected || busy} style={styles.button}>
        <Text style={styles.buttonText}>{mode === 'list' ? 'Close' : 'Choose'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'create' ? 'closed' : 'create')} disabled={!githubConnected || busy} style={styles.button}>
        <Text style={styles.buttonText}>Create</Text>
      </Pressable>
    </View>

    {mode === 'list' ? <ScrollView style={styles.list} nestedScrollEnabled>
      {repos.map((item) => <Pressable key={item.fullName} onPress={() => void select(item.fullName)} style={styles.item}>
        <Text style={styles.itemText}>{item.fullName}{item.private ? ' · private' : ''}</Text>
      </Pressable>)}
    </ScrollView> : null}

    {mode === 'create' ? <View style={styles.createRow}>
      <TextInput value={newName} onChangeText={setNewName} autoCapitalize="none" autoCorrect={false} placeholder="repository-name" placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => setNewPrivate((value) => !value)} style={styles.button}>
        <Text style={styles.buttonText}>{newPrivate ? 'Private' : 'Public'}</Text>
      </Pressable>
      <Pressable onPress={() => void create()} disabled={busy || !newName.trim()} style={styles.button}>
        <Text style={styles.buttonText}>Create and set up</Text>
      </Pressable>
    </View> : null}

    {repository && !busy && mode === 'closed' ? <Pressable onPress={() => void configure(repository)} style={styles.setup}>
      <Text style={styles.buttonText}>Setup</Text>
    </Pressable> : null}
    {repository && !busy && mode === 'closed' ? <Pressable onPress={() => void toggleAutomatic()} style={[styles.toggle, automatic && styles.toggleOn]}>
      <Text style={styles.buttonText}>{automatic ? 'Automatic: no approval' : 'Require approval before running'}</Text>
    </Pressable> : null}
    {repository && !busy && mode === 'closed' ? <Text style={styles.status}>Setup writes the agent files, creates the environment, sends the credentials the app has, and tries to turn on Copilot review.</Text> : null}

    {busy ? <ActivityIndicator color="#60a5fa" /> : null}
    {status ? <Text style={styles.status}>{status}</Text> : null}
    {reports.map((report) => <Text key={report.name} style={report.ok ? styles.ok : styles.missing}>{report.ok ? '✓' : '✗'} {report.name}: {report.detail}</Text>)}
    {repository && missing.length > 0 ? <Text style={styles.missing}>Still missing in the agents environment: {missing.join(', ')}. The app sends what it already has; add the rest in Settings → Environments → agents.</Text> : null}
    {repository && missing.includes('CLAUDE_CODE_OAUTH_TOKEN') ? <Link href="/setup-claude-subscription" style={styles.link}>Save the Claude token on this device</Link> : null}
  </View>
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#1e293b', borderRadius: 8, padding: 8, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  current: { flex: 1, color: '#e2e8f0', fontSize: 13 },
  button: { borderRadius: 8, backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 6 },
  buttonText: { color: '#f8fafc', fontSize: 12, fontWeight: '700' },
  setup: { alignItems: 'center', backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 8 },
  toggle: { alignItems: 'center', backgroundColor: '#334155', borderRadius: 8, paddingVertical: 8 },
  toggleOn: { backgroundColor: '#0f766e' },
  list: { maxHeight: 180, backgroundColor: '#0f172a', borderRadius: 8 },
  item: { paddingHorizontal: 10, paddingVertical: 9 },
  itemText: { color: '#cbd5e1', fontSize: 13 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, color: '#f8fafc', backgroundColor: '#0f172a', borderRadius: 8, fontSize: 13, paddingHorizontal: 8, paddingVertical: 6 },
  status: { color: '#94a3b8', fontSize: 12 },
  missing: { color: '#fbbf24', fontSize: 12, lineHeight: 17 },
  ok: { color: '#a7f3d0', fontSize: 12, lineHeight: 17 },
  link: { color: '#93c5fd', fontSize: 13, fontWeight: '700', paddingVertical: 4 }
})
