import { Link } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

const steps = [
  ['1. Gerar a credencial', 'Em um ambiente que execute Claude Code, rode claude setup-token e conclua o login oficial da sua conta Claude Pro ou Max. Copie o token exibido.'],
  ['2. Guardar no GitHub', 'No repositório, abra Settings → Secrets and variables → Actions → New repository secret. Use o nome CLAUDE_CODE_OAUTH_TOKEN e cole o token. Nunca o coloque em Issue, commit ou chat.'],
  ['3. Criar a tarefa', 'No GitHub, abra uma Issue descrevendo a tarefa e inclua @claude no título ou texto. O workflow Claude Code será iniciado automaticamente.'],
  ['4. Revisar o resultado', 'Claude responde no GitHub e pode criar uma branch ou pull request. Revise o diff e aprove o merge somente quando estiver satisfeito.'],
  ['5. Renovar quando necessário', 'Se o workflow acusar autenticação inválida, gere outro token pelo fluxo oficial e substitua o GitHub Secret.']
]

export default function ClaudeGuideScreen() {
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>CLAUDE PRO / MAX</Text>
    <Text style={styles.title}>Usar assinatura no GitHub</Text>
    <Text style={styles.copy}>A assinatura é usada pelo Claude Code no GitHub Actions. O aplicativo não guarda sua credencial Claude.</Text>
    {steps.map(([title, text]) => <View key={title} style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text></View>)}
    <View style={styles.warning}><Text style={styles.warningTitle}>Importante</Text><Text style={styles.cardText}>O token é uma credencial sensível. Este app não consegue gerá-lo: a Anthropic exige o login pelo Claude Code. Depois de salvo como Secret, todo o uso diário pode ser feito pelo GitHub e pelo celular.</Text></View>
    <Link href="/connect-claude" style={styles.link}>Ver conexão Claude API</Link>
  </ScrollView>
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#101827', padding: 24, gap: 16, flexGrow: 1 },
  eyebrow: { color: '#a78bfa', fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  title: { color: '#f8fafc', fontSize: 29, fontWeight: '700' },
  copy: { color: '#cbd5e1', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, gap: 8 },
  cardTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  cardText: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  warning: { backgroundColor: '#3f2c16', borderRadius: 14, padding: 16, gap: 8 },
  warningTitle: { color: '#fbbf24', fontWeight: '700', fontSize: 17 },
  link: { color: '#93c5fd', fontSize: 16, fontWeight: '700', paddingVertical: 8 }
})
