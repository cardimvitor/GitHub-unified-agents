import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function ClaudeScreen() {
  return <View style={styles.page}><Text style={styles.title}>Claude</Text><Text style={styles.copy}>Choose how you want to use Claude in Unified Agents.</Text><Link href="/claude-guide" style={styles.primary}>Use Claude Pro / Max subscription</Link><Text style={styles.note}>Recommended for GitHub tasks: the official token is sent encrypted to the repository secret.</Text><Link href="/connect-claude" style={styles.secondary}>Use an Anthropic API key</Link></View>
}
const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#101827',padding:24,gap:18},title:{color:'#f8fafc',fontSize:30,fontWeight:'700'},copy:{color:'#cbd5e1',fontSize:16,lineHeight:24},primary:{backgroundColor:'#7c3aed',color:'#fff',fontWeight:'700',borderRadius:10,padding:15,textAlign:'center'},secondary:{backgroundColor:'#334155',color:'#fff',fontWeight:'700',borderRadius:10,padding:15,textAlign:'center'},note:{color:'#94a3b8',lineHeight:20}})
