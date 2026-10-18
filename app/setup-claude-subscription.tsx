import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { setRepositorySecret } from '@/github/secrets'
import { githubSession } from '@/storage/github-session'

export default function SetupClaudeSubscription() {
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Cole o token gerado por claude setup-token. Ele será enviado cifrado ao GitHub e não será salvo no aparelho.')
  async function send() {
    const [owner, repo] = repository.trim().split('/')
    if (!owner || !repo || repository.trim().split('/').length !== 2) return setMessage('Informe o repositório no formato dono/repositorio.')
    if (!token.trim()) return setMessage('Cole o token Claude Code para continuar.')
    const github = await githubSession.read()
    if (!github) return setMessage('Conecte o GitHub antes de configurar Claude.')
    setBusy(true)
    try { await setRepositorySecret(github, owner, repo, 'CLAUDE_CODE_OAUTH_TOKEN', token.trim()); setToken(''); setMessage('Secret configurado com segurança. Use @claude em uma Issue para iniciar o workflow.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível configurar o Secret.') } finally { setBusy(false) }
  }
  return <View style={styles.page}><Text style={styles.title}>Configurar Claude por assinatura</Text><Text style={styles.copy}>{message}</Text><TextInput value={repository} onChangeText={setRepository} autoCapitalize="none" placeholder="dono/repositorio" placeholderTextColor="#64748b" style={styles.input}/><TextInput value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry placeholder="Token Claude Code" placeholderTextColor="#64748b" style={styles.input}/><Pressable disabled={busy} onPress={() => void send()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Criptografar e enviar ao GitHub</Text>}</Pressable></View>
}
const styles = StyleSheet.create({ page:{flex:1,backgroundColor:'#101827',padding:24,gap:18},title:{color:'#f8fafc',fontSize:27,fontWeight:'700'},copy:{color:'#cbd5e1',fontSize:16,lineHeight:24},input:{color:'#f8fafc',backgroundColor:'#1e293b',borderRadius:10,fontSize:16,padding:14},button:{alignItems:'center',backgroundColor:'#7c3aed',borderRadius:10,minHeight:48,justifyContent:'center',padding:12},disabled:{opacity:.65},buttonText:{color:'#fff',fontWeight:'700'} })
