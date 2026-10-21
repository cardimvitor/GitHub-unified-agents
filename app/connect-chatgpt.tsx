import * as Linking from 'expo-linking'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { beginChatGptDeviceLogin, disconnectChatGpt, pollChatGptDeviceLogin, type ChatGptDeviceLogin } from '@/openai/chatgpt-subscription'
import { chatGptSession } from '@/storage/chatgpt-session'

export default function ConnectChatGpt() {
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [login, setLogin] = useState<ChatGptDeviceLogin | null>(null)
  const [message, setMessage] = useState('Connect your ChatGPT Plus or Pro subscription. GitHub is not part of this login.')
  const attempt = useRef(0)

  useEffect(() => {
    void chatGptSession.read().then((session) => {
      if (session) {
        setConnected(true)
        setMessage('ChatGPT subscription connected on this device.')
      }
    })
    return () => { attempt.current += 1 }
  }, [])

  async function connect() {
    const current = ++attempt.current
    setBusy(true)
    setLogin(null)
    try {
      const request = await beginChatGptDeviceLogin()
      setLogin(request)
      setMessage('Open the link, sign in to your ChatGPT account and confirm the code below. The app detects the confirmation automatically.')
      await Linking.openURL(request.verificationUrl)
      while (current === attempt.current && Date.now() < request.expiresAt) {
        await new Promise((resolve) => setTimeout(resolve, request.intervalMs))
        if (current !== attempt.current) return
        const session = await pollChatGptDeviceLogin(request)
        if (session) {
          setConnected(true)
          setLogin(null)
          setMessage('ChatGPT subscription connected on this device.')
          return
        }
      }
      if (current === attempt.current) setMessage('The code expired. Try again.')
    } catch (error) {
      if (current === attempt.current) setMessage(error instanceof Error ? error.message : 'Could not finish the login.')
    } finally {
      if (current === attempt.current) setBusy(false)
    }
  }

  function cancel() {
    attempt.current += 1
    setLogin(null)
    setBusy(false)
    setMessage('Login cancelled.')
  }

  async function disconnect() {
    attempt.current += 1
    setBusy(true)
    try {
      const revoked = await disconnectChatGpt()
      setConnected(false)
      setMessage(revoked ? 'ChatGPT session revoked and removed from this device.' : 'Local session removed. Remote revocation could not be confirmed.')
    } catch {
      setConnected(false)
      setMessage('Local session removed. Remote revocation could not be confirmed.')
    } finally {
      setBusy(false)
    }
  }

  return <View style={styles.page}>
    <Text style={styles.title}>Use ChatGPT subscription</Text>
    <Text style={styles.copy}>{message}</Text>
    {login ? <TextInput editable={false} value={login.userCode} style={styles.code} /> : null}
    {login ? <Pressable onPress={cancel} style={styles.cancel}><Text style={styles.buttonText}>Cancel</Text></Pressable> : null}
    {!login ? <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}</Text>}
    </Pressable> : null}
    {connected && !login ? <Pressable disabled={busy} onPress={() => void disconnect()} style={[styles.disconnect, busy && styles.disabled]}><Text style={styles.buttonText}>Disconnect on this device</Text></Pressable> : null}
    <Text style={styles.note}>The login uses OpenAI's official device code: the app never receives your password and does not open a local server. The session stays in the device vault.</Text>
  </View>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 18 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  code: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 12, fontSize: 28, fontWeight: '700', letterSpacing: 4, padding: 16, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: '#10a37f', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  cancel: { alignItems: 'center', backgroundColor: '#475569', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disconnect: { alignItems: 'center', backgroundColor: '#b91c1c', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontWeight: '700' },
  note: { color: '#94a3b8', lineHeight: 20 }
})
