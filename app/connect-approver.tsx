import * as Linking from 'expo-linking'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { beginGitHubDeviceAuthorization, pollGitHubAccessToken } from '@/github/device-auth'
import { getAuthenticatedGitHubUser } from '@/github/repository'
import { approverSession } from '@/storage/approver-session'

// Conta que aprova os PRs dos agentes. Entra pelo mesmo login de dispositivo do GitHub, em uma conta separada.
export default function ConnectApproverScreen() {
  const [login, setLogin] = useState<string>()
  const [code, setCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Sign in with the GitHub account that will approve agent pull requests. It is stored only on this device.')
  const attempt = useRef(0)

  useEffect(() => {
    void approverSession.readLogin().then((value) => value && setLogin(value))
    return () => { attempt.current += 1 }
  }, [])

  async function connect() {
    const current = ++attempt.current
    setBusy(true)
    try {
      const authorization = await beginGitHubDeviceAuthorization()
      setCode(authorization.userCode)
      setMessage('Confirm the code on GitHub with the approver account. The app checks the authorization automatically.')
      await Linking.openURL(authorization.verificationUri)
      const deadline = Date.now() + authorization.expiresIn * 1000
      let interval = authorization.interval * 1000
      while (current === attempt.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval))
        if (current !== attempt.current) return
        const result = await pollGitHubAccessToken(authorization.deviceCode)
        if ('token' in result) {
          const user = await getAuthenticatedGitHubUser(result.token)
          await approverSession.save(result.token, user.login)
          setLogin(user.login)
          setCode(undefined)
          setMessage(`Approver connected: ${user.login}. Setup sends this token to the agents environment of each repository.`)
          return
        }
        if (result.status === 'slow_down') interval += 5000
      }
      if (current === attempt.current) setMessage('The code expired. Try again.')
    } catch (error) {
      if (current === attempt.current) setMessage(error instanceof Error ? error.message : 'Could not connect the approver account.')
    } finally {
      if (current === attempt.current) setBusy(false)
    }
  }

  async function disconnect() {
    attempt.current += 1
    await approverSession.clear()
    setLogin(undefined)
    setCode(undefined)
    setBusy(false)
    setMessage('Approver removed from this device. Repositories already set up keep their copy until Setup runs again.')
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Approver account</Text>
    <Text style={styles.copy}>{message}</Text>
    {login ? <Text style={styles.status}>Connected as {login}</Text> : <Text style={styles.status}>Not connected</Text>}
    {code ? <Text style={styles.code}>{code}</Text> : null}
    {busy ? <ActivityIndicator color="#60a5fa" /> : null}
    <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>
      <Text style={styles.buttonText}>{login ? 'Connect a different approver' : 'Sign in as approver'}</Text>
    </Pressable>
    {login ? <Pressable onPress={() => void disconnect()} style={styles.remove}><Text style={styles.buttonText}>Remove approver from this device</Text></Pressable> : null}
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 16 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  status: { color: '#a7f3d0', fontSize: 15, fontWeight: '600' },
  code: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 12, fontSize: 28, fontWeight: '700', letterSpacing: 4, padding: 16, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  remove: { alignItems: 'center', backgroundColor: '#b91c1c', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontWeight: '700' }
})
