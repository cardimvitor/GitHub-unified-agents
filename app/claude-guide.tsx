import { Link } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

const steps = [
  ['1. Generate the credential', 'In an environment that runs Claude Code, run claude setup-token and finish the official login for your Claude Pro or Max account. Copy the token shown.'],
  ['2. Store it in GitHub', 'In the repository, open Settings → Secrets and variables → Actions → New repository secret. Use the name CLAUDE_CODE_OAUTH_TOKEN and paste the token. Never put it in an Issue, commit or chat.'],
  ['3. Create the task', 'On GitHub, open an Issue describing the task and include @claude in the title or text. The Claude Code workflow starts automatically.'],
  ['4. Review the result', 'Claude replies on GitHub and may create a branch or pull request. Review the diff and approve the merge only when you are satisfied.'],
  ['5. Renew when needed', 'If the workflow reports invalid authentication, generate another token through the official flow and replace the GitHub secret.']
]

export default function ClaudeGuideScreen() {
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.eyebrow}>CLAUDE PRO / MAX</Text>
    <Text style={styles.title}>Use your subscription on GitHub</Text>
    <Text style={styles.copy}>The subscription is used by Claude Code in GitHub Actions. The app does not store your Claude credential.</Text>
    {steps.map(([title, text]) => <View key={title} style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardText}>{text}</Text></View>)}
    <View style={styles.warning}><Text style={styles.warningTitle}>Important</Text><Text style={styles.cardText}>The token is a sensitive credential. This app cannot generate it: Anthropic requires login through Claude Code. Once saved as a secret, daily use can be done from GitHub and the phone.</Text></View>
    <Link href="/setup-claude-subscription" style={styles.link}>Send encrypted token to GitHub</Link>
    <Link href="/connect-claude" style={styles.link}>See Claude API connection</Link>
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
