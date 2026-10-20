import { Link } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { githubTarget } from '@/storage/github-target'
import { githubSession } from '@/storage/github-session'
import { configureAgents, createRepository, enableCopilotReview, listRepositories, type RepositoryInfo } from '@/github/repositories'
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
    if (!value) throw new Error('Conecte o GitHub na tela inicial antes de escolher um repositório.')
    return value
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(true)
    setStatus(label)
    try {
      await action()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível concluir.')
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
    setStatus(`Repositório ${fullName} selecionado.`)
    await run('Verificando secrets…', () => checkSecrets(fullName))
  }

  async function openList() {
    if (mode === 'list') return setMode('closed')
    setMode('list')
    await run('Carregando repositórios…', async () => setRepos(await listRepositories(await token())))
  }

  async function create() {
    const name = newName.trim()
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return setStatus('Use só letras, números, ponto, traço ou sublinhado no nome.')
    await run('Criando repositório…', async () => {
      const created = await createRepository(await token(), name, newPrivate)
      setNewName('')
      await select(created.fullName)
      await configure(created.fullName)
    })
  }

  async function configure(fullName: string) {
    await run('Configurando agentes…', async () => {
      const authToken = await token()
      await configureAgents(authToken, fullName, (path) => setStatus(`Gravando ${path}…`))
      const environment = await ensureAgentsEnvironment(authToken, fullName, automatic)
      setStatus('Enviando credenciais ao environment…')
      setReports(await pushAgentSecrets(authToken, environment.repositoryId))
      const copilot = await enableCopilotReview(authToken, fullName)
      await checkSecrets(fullName)
      setStatus(`Agentes configurados. ${environment.message} ${copilot.message}`)
    })
  }

  return <View style={styles.box}>
    <View style={styles.row}>
      <Text numberOfLines={1} style={styles.current}>{repository || 'Nenhum repositório escolhido'}</Text>
      <Pressable onPress={() => void openList()} disabled={!githubConnected || busy} style={styles.button}>
        <Text style={styles.buttonText}>{mode === 'list' ? 'Fechar' : 'Escolher'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'create' ? 'closed' : 'create')} disabled={!githubConnected || busy} style={styles.button}>
        <Text style={styles.buttonText}>Criar</Text>
      </Pressable>
    </View>

    {mode === 'list' ? <ScrollView style={styles.list} nestedScrollEnabled>
      {repos.map((item) => <Pressable key={item.fullName} onPress={() => void select(item.fullName)} style={styles.item}>
        <Text style={styles.itemText}>{item.fullName}{item.private ? ' · privado' : ''}</Text>
      </Pressable>)}
    </ScrollView> : null}

    {mode === 'create' ? <View style={styles.createRow}>
      <TextInput value={newName} onChangeText={setNewName} autoCapitalize="none" autoCorrect={false} placeholder="nome-do-repositorio" placeholderTextColor="#64748b" style={styles.input} />
      <Pressable onPress={() => setNewPrivate((value) => !value)} style={styles.button}>
        <Text style={styles.buttonText}>{newPrivate ? 'Privado' : 'Público'}</Text>
      </Pressable>
      <Pressable onPress={() => void create()} disabled={busy || !newName.trim()} style={styles.button}>
        <Text style={styles.buttonText}>Criar e configurar</Text>
      </Pressable>
    </View> : null}

    {repository && !busy && mode === 'closed' ? <Pressable onPress={() => void configure(repository)} style={styles.setup}>
      <Text style={styles.buttonText}>Setup</Text>
    </Pressable> : null}
    {repository && !busy && mode === 'closed' ? <Pressable onPress={() => void toggleAutomatic()} style={[styles.toggle, automatic && styles.toggleOn]}>
      <Text style={styles.buttonText}>{automatic ? 'Automático: sem aprovação' : 'Exigir aprovação antes de rodar'}</Text>
    </Pressable> : null}
    {repository && !busy && mode === 'closed' ? <Text style={styles.status}>Setup grava os arquivos dos agentes, cria o environment, envia as credenciais que o app tem e tenta ligar a revisão do Copilot.</Text> : null}

    {busy ? <ActivityIndicator color="#60a5fa" /> : null}
    {status ? <Text style={styles.status}>{status}</Text> : null}
    {reports.map((report) => <Text key={report.name} style={report.ok ? styles.ok : styles.missing}>{report.ok ? '✓' : '✗'} {report.name}: {report.detail}</Text>)}
    {repository && missing.length > 0 ? <Text style={styles.missing}>Ainda falta no environment agents: {missing.join(', ')}. O app envia sozinho o que ele já tem; o resto você cadastra em Settings → Environments → agents.</Text> : null}
    {repository && missing.includes('CLAUDE_CODE_OAUTH_TOKEN') ? <Link href="/setup-claude-subscription" style={styles.link}>Guardar o token do Claude neste aparelho</Link> : null}
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
