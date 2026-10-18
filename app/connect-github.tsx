import * as Linking from 'expo-linking'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { beginGitHubDeviceAuthorization, pollGitHubAccessToken } from '@/github/device-auth'
import { githubSession } from '@/storage/github-session'

export default function ConnectGitHubScreen() {
  const [code, setCode] = useState<string>()
  const [message, setMessage] = useState('O login usa o fluxo seguro de dispositivo do GitHub.')
  const [busy, setBusy] = useState(false)

  async function connect() {
    setBusy(true)
    try {
      const authorization = await beginGitHubDeviceAuthorization()
      setCode(authorization.userCode)
      setMessage('Confirme o código no GitHub. O app verificará a autorização automaticamente.')
      await Linking.openURL(authorization.verificationUri)
      const deadline = Date.now() + authorization.expiresIn * 1000
      let interval = authorization.interval * 1000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval))
        const token = await pollGitHubAccessToken(authorization.deviceCode)
        if (token) {
          await githubSession.save(token)
          setMessage('GitHub conectado com sucesso. O token está protegido no armazenamento seguro do dispositivo.')
          return
        }
        interval = Math.max(interval, 5000)
      }
      setMessage('O código expirou. Tente novamente.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível conectar ao GitHub.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Autorizar GitHub</Text>
      <Text style={styles.copy}>{message}</Text>
      {code ? <TextInput editable={false} value={code} style={styles.code} /> : null}
      <Pressable disabled={busy} onPress={() => void connect()} style={[styles.button, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continuar com GitHub</Text>}
      </Pressable>
      <Text style={styles.note}>Você só precisa autorizar sua própria conta. Nenhum token é versionado neste repositório.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101827', padding: 24, gap: 18 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  code: { color: '#f8fafc', backgroundColor: '#1e293b', borderRadius: 12, fontSize: 28, fontWeight: '700', letterSpacing: 4, padding: 16, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, minHeight: 48, justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  note: { color: '#94a3b8', fontSize: 13, lineHeight: 20 }
})
