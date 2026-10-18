import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function OpenAiScreen() {
  return <View style={styles.page}><Text style={styles.title}>ChatGPT / Codex</Text><Text style={styles.copy}>Escolha assinatura ou API. A assinatura é a opção principal para Codex.</Text><Link href="/codex-guide" style={styles.primary}>Usar assinatura ChatGPT / Codex</Link><Text style={styles.note}>A conexão usa o fluxo oficial Sign in with ChatGPT e um runtime Codex para executar tarefas no GitHub.</Text><Link href="/connect-openai" style={styles.secondary}>Usar OpenAI API key</Link></View>
}
const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#101827',padding:24,gap:18},title:{color:'#f8fafc',fontSize:30,fontWeight:'700'},copy:{color:'#cbd5e1',fontSize:16,lineHeight:24},primary:{backgroundColor:'#10a37f',color:'#fff',fontWeight:'700',borderRadius:10,padding:15,textAlign:'center'},secondary:{backgroundColor:'#334155',color:'#fff',fontWeight:'700',borderRadius:10,padding:15,textAlign:'center'},note:{color:'#94a3b8',lineHeight:20}})
