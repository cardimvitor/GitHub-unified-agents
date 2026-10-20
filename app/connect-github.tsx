import * as Linking from 'expo-linking'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { beginGitHubDeviceAuthorization, pollGitHubAccessToken } from '@/github/device-auth'
import { getAuthenticatedGitHubUser } from '@/github/repository'
import { githubSession } from '@/storage/github-session'

export default function ConnectGitHubScreen() {
  const [code, setCode] = useState<string>()
  const [mode, setMode] = useState<'oauth' | 'pat'>('oauth')
  const [pat, setPat] = useState('')
  const [message, setMessage] = useState('O login usa o fluxo seguro de dispositivo do GitHub.')
  const [busy, setBusy] = useState(false)
  const attempt = useRef(0)

  useEffect(() => () => { attempt.current += 1 }, [])

  async function connect() {
    const current = ++attempt.current
    setBusy(true)
    try {
      const authorization = await beginGitHubDeviceAuthorization()
      setCode(authorization.userCode)
      setMessage('Confirme o código no GitHub. O app verificará a autorização automaticamente.')
      await Linking.openURL(authorization.verificationUri)
      const deadline = Date.now() + authorization.expiresIn * 1000
      let interval = authorization.interval * 1000
      while (current === attempt.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval))
        if (current !== attempt.current) return
        const result = await pollGitHubAccessToken(authorization.deviceCode)
        if ('token' in result) {
          await githubSession.save(result.token)
          setMessage('GitHub conectado com sucesso. O token está protegido no armazenamento seguro do dispositivo.')
          return
        }
        if (result.status === 'slow_down') interval += 5000
      }
      if (current === attempt.current) setMessage('O código expirou. Tente novamente.')
    } catch (error) {
      if (current === attempt.current) setMessage(error instanceof Error ? error.message : 'Não foi possível conectar ao GitHub.')
    } finally {
      if (current === attempt.current) setBusy(false)
    }
  }

  async function connectPat() {
    const candidate = pat.trim()
    if (!candidate) {
      setMessage('Cole um fine-grained PAT para continuar.')
      return
    }
    if (!candidate.startsWith('github_pat_')) {
      setMessage('Use um fine-grained PAT. Ele deve começar com github_pat_.')
      return
    }
    setBusy(true)
    try {
      const user = await getAuthenticatedGitHubUser(candidate)
      await githubSession.save(candidate)
      setPat('')
      setMessage(`GitHub conectado como ${user.login}. O PAT foi guardado somente no cofre do dispositivo.`)
    } catch {
      setMessage('O PAT foi recusado. Verifique se o token é fine-grained, com permissões adequadas e expiração curta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Autorizar GitHub</Text>
      <Text style={styles.copy}>{message}</Text>
      <View style={styles.modeRow}>
        <Pressable onPress={() => setMode('oauth')} style={[styles.mode, mode === 'oauth' && styles.modeActive]}><Text style={styles.modeText}>Login GitHub</Text></Pressable>
        <Pressable onPress={() => setMode('pat')} style={[styles.mode, mode === 'pat' && styles.modeActive]}><Text style={styles.modeText}>Usar PAT</Text></Pressable>
      </View>
      {mode === 'oauth' ? (
        <>
          {code ? <TextInput editable={false} value={code} style={styles.code} /> : null}
          <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continuar com GitHub</Text>}
          </Pressable>
          <Text style={styles.note}>Você só precisa autorizar sua própria conta. Nenhum token é versionado neste repositório.</Text>
        </>
      ) : (
        <>
          <TextInput value={pat} onChangeText={setPat} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="github_pat_…" placeholderTextColor="#64748b" style={styles.input} />
          <Pressable disabled={busy} onPress={() => void connectPat()} style={[styles.button, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Validar e guardar PAT</Text>}
          </Pressable>
          <Text style={styles.note}>Use apenas fine-grained PAT, que começa com github_pat_, limitado ao repositório desejado. Este é um fallback; prefira Login GitHub.</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 18 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  code: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 12, fontSize: 28, fontWeight: '700', letterSpacing: 4, padding: 16, textAlign: 'center' },
  input: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 10, fontSize: 16, padding: 14 },
  modeRow: { flexDirection: 'row', gap: 10 },
  mode: { borderColor: '#475569', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  modeActive: { backgroundColor: '#1d4ed8', borderColor: '#60a5fa' },
  modeText: { color: '#f8fafc', fontWeight: '600' },
  button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  note: { color: '#94a3b8', fontSize: 13, lineHeight: 20 }
})
