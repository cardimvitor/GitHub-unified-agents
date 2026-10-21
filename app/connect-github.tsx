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
  const [message, setMessage] = useState('Login uses GitHub\'s secure device flow.')
  const [busy, setBusy] = useState(false)
  const attempt = useRef(0)

  useEffect(() => () => { attempt.current += 1 }, [])

  async function connect() {
    const current = ++attempt.current
    setBusy(true)
    try {
      const authorization = await beginGitHubDeviceAuthorization()
      setCode(authorization.userCode)
      setMessage('Confirm the code on GitHub. The app will check the authorization automatically.')
      await Linking.openURL(authorization.verificationUri)
      const deadline = Date.now() + authorization.expiresIn * 1000
      let interval = authorization.interval * 1000
      while (current === attempt.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval))
        if (current !== attempt.current) return
        const result = await pollGitHubAccessToken(authorization.deviceCode)
        if ('token' in result) {
          await githubSession.save(result.token)
          setMessage('GitHub connected. The token is stored in the device\'s secure storage.')
          return
        }
        if (result.status === 'slow_down') interval += 5000
      }
      if (current === attempt.current) setMessage('The code expired. Try again.')
    } catch (error) {
      if (current === attempt.current) setMessage(error instanceof Error ? error.message : 'Could not connect to GitHub.')
    } finally {
      if (current === attempt.current) setBusy(false)
    }
  }

  async function connectPat() {
    const candidate = pat.trim()
    if (!candidate) {
      setMessage('Paste a fine-grained PAT to continue.')
      return
    }
    setBusy(true)
    try {
      const user = await getAuthenticatedGitHubUser(candidate)
      await githubSession.save(candidate)
      setPat('')
      setMessage(`GitHub connected as ${user.login}. The PAT is stored only in the device vault.`)
    } catch {
      setMessage('The PAT was rejected. Use a fine-grained PAT with access to the chosen repository.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Authorize GitHub</Text>
      <Text style={styles.copy}>{message}</Text>
      <View style={styles.modeRow}>
        <Pressable onPress={() => setMode('oauth')} style={[styles.mode, mode === 'oauth' && styles.modeActive]}><Text style={styles.modeText}>Login GitHub</Text></Pressable>
        <Pressable onPress={() => setMode('pat')} style={[styles.mode, mode === 'pat' && styles.modeActive]}><Text style={styles.modeText}>Use a PAT</Text></Pressable>
      </View>
      {mode === 'oauth' ? (
        <>
          {code ? <TextInput editable={false} value={code} style={styles.code} /> : null}
          <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continue with GitHub</Text>}
          </Pressable>
          <Text style={styles.note}>You only need to authorize your own account. No token is committed to this repository.</Text>
        </>
      ) : (
        <>
          <TextInput value={pat} onChangeText={setPat} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="github_pat_…" placeholderTextColor="#64748b" style={styles.input} />
          <Pressable disabled={busy} onPress={() => void connectPat()} style={[styles.button, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Validate and save PAT</Text>}
          </Pressable>
          <Text style={styles.note}>Use only a fine-grained PAT limited to the repository you want. This is a fallback; prefer GitHub login.</Text>
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
