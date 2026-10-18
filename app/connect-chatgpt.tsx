import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import ChatGptAuth, { type OAuthCallback } from '../modules/chatgpt-auth'
import { beginChatGptLogin, disconnectChatGpt, finishChatGptLogin, type PendingChatGptLogin } from '@/openai/chatgpt-subscription'
import { chatGptSession } from '@/storage/chatgpt-session'

export default function ConnectChatGpt() {
  const [pending, setPending] = useState<PendingChatGptLogin | null>(null)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState('Conecte sua assinatura ChatGPT Plus ou Pro. O GitHub não participa deste login.')
  useEffect(() => {
    void chatGptSession.read().then((session) => {
      if (session) { setConnected(true); setMessage('ChatGPT conectado por assinatura neste dispositivo.') }
    })
    const callback = ChatGptAuth.addListener('onOAuthCallback', (value: OAuthCallback) => { if (pending) void complete(value) })
    const error = ChatGptAuth.addListener('onOAuthError', ({ error: reason }) => { setBusy(false); setMessage(reason) })
    return () => { callback.remove(); error.remove(); void ChatGptAuth.stopCallbackListener() }
  }, [pending])
  async function connect() { setBusy(true); try { const request = await beginChatGptLogin(); setPending(request.pending); await WebBrowser.openBrowserAsync(request.url) } catch (error) { setBusy(false); setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o login.') } }
  async function complete(value: OAuthCallback) { if (!pending) return; try { await finishChatGptLogin(value, pending); setConnected(true); setMessage('ChatGPT conectado por assinatura neste dispositivo.'); setPending(null) } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir o login.') } finally { setBusy(false) } }
  async function disconnect() { setBusy(true); try { const revoked = await disconnectChatGpt(); setConnected(false); setMessage(revoked ? 'Sessão ChatGPT revogada e removida deste dispositivo.' : 'Sessão local removida. A revogação remota não pôde ser confirmada.') } catch { setConnected(false); setMessage('Sessão local removida. A revogação remota não pôde ser confirmada.') } finally { setBusy(false) } }
  return <View style={styles.page}><Text style={styles.title}>Usar assinatura ChatGPT</Text><Text style={styles.copy}>{message}</Text><Pressable disabled={busy} onPress={() => void connect()} style={[styles.button,busy&&styles.disabled]}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>{connected ? 'Reconectar ChatGPT' : 'Continuar com ChatGPT'}</Text>}</Pressable>{connected&&<Pressable disabled={busy} onPress={() => void disconnect()} style={[styles.disconnect,busy&&styles.disabled]}><Text style={styles.buttonText}>Desconectar neste dispositivo</Text></Pressable>}<Text style={styles.note}>O app abre o navegador do sistema, usa PKCE e armazena a sessão no cofre do aparelho. GitHub será usado apenas para Issues, branches e PRs.</Text></View>
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#101827',padding:24,gap:18},title:{color:'#f8fafc',fontSize:28,fontWeight:'700'},copy:{color:'#cbd5e1',fontSize:16,lineHeight:24},button:{alignItems:'center',backgroundColor:'#10a37f',borderRadius:10,minHeight:48,justifyContent:'center',padding:12},disconnect:{alignItems:'center',backgroundColor:'#b91c1c',borderRadius:10,minHeight:48,justifyContent:'center',padding:12},disabled:{opacity:.65},buttonText:{color:'#fff',fontWeight:'700'},note:{color:'#94a3b8',lineHeight:20}})
