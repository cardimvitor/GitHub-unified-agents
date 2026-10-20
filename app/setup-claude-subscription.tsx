import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { AGENTS_ENVIRONMENT, ensureAgentsEnvironment } from '@/github/environments'
import { setEnvironmentSecret } from '@/github/secrets'
import { agentCredentials } from '@/storage/agent-credentials'
import { agentSettings } from '@/storage/agent-settings'
import { githubSession } from '@/storage/github-session'
import { githubTarget } from '@/storage/github-target'

export default function SetupClaudeSubscription() {
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Cole o token gerado por claude setup-token. Ele fica guardado no cofre deste aparelho e o app o envia, cifrado, ao environment de cada repositório que você configurar.')

  useEffect(() => {
    void githubTarget.read().then(setRepository)
    void agentCredentials.readClaude().then((value) => setSaved(Boolean(value)))
  }, [])

  async function save() {
    if (!token.trim()) return setMessage('Cole o token Claude Code para continuar.')
    await agentCredentials.saveClaude(token.trim())
    setSaved(true)
    setMessage('Token guardado no aparelho. Ele será enviado automaticamente ao configurar agentes em um repositório.')
  }

  async function sendNow() {
    const [owner, repo] = repository.trim().split('/')
    if (!owner || !repo || repository.trim().split('/').length !== 2) return setMessage('Informe o repositório no formato dono/repositorio.')
    const value = token.trim() || (await agentCredentials.readClaude())
    if (!value) return setMessage('Cole o token Claude Code para continuar.')
    const github = await githubSession.read()
    if (!github) return setMessage('Conecte o GitHub antes de configurar Claude.')
    setBusy(true)
    try {
      await agentCredentials.saveClaude(value)
      setSaved(true)
      const env = await ensureAgentsEnvironment(github, `${owner}/${repo}`, await agentSettings.readAutomatic())
      await setEnvironmentSecret(github, env.repositoryId, AGENTS_ENVIRONMENT, 'CLAUDE_CODE_OAUTH_TOKEN', value)
      setToken('')
      setMessage(`Secret salvo no environment ${AGENTS_ENVIRONMENT} de ${repository.trim()}. ${env.message}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível configurar o Secret.')
    } finally {
      setBusy(false)
    }
  }

  async function forget() {
    await agentCredentials.clearClaude()
    setSaved(false)
    setMessage('Token removido deste aparelho. Os repositórios já configurados continuam com a cópia deles.')
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Configurar Claude por assinatura</Text>
    <Text style={styles.copy}>{message}</Text>
    <Text style={styles.status}>{saved ? 'Token guardado neste aparelho.' : 'Nenhum token guardado.'}</Text>
    <TextInput value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry placeholder="Token Claude Code" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void save()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>Guardar no aparelho</Text></Pressable>
    <TextInput value={repository} onChangeText={setRepository} autoCapitalize="none" placeholder="dono/repositorio" placeholderTextColor="#64748b" style={styles.input} />
    <Pressable disabled={busy} onPress={() => void sendNow()} style={[styles.button, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar a este repositório agora</Text>}
    </Pressable>
    {saved ? <Pressable onPress={() => void forget()} style={styles.secondary}><Text style={styles.buttonText}>Esquecer token neste aparelho</Text></Pressable> : null}
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 14 },
  title: { color: '#f8fafc', fontSize: 27, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  status: { color: '#a7f3d0', fontSize: 13 },
  input: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 16, padding: 14 },
  button: { alignItems: 'center', backgroundColor: '#7c3aed', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  secondary: { alignItems: 'center', backgroundColor: '#475569', borderRadius: 10, minHeight: 44, justifyContent: 'center', padding: 10 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontWeight: '700' }
})
