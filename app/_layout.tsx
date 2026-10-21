import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SystemUI from 'expo-system-ui'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { useEffect } from 'react'

export default function RootLayout() {
  useEffect(() => { void SystemUI.setBackgroundColorAsync('#101827') }, [])
  return (
    <KeyboardProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#101827' }, headerTintColor: '#f8fafc' }}>
        <Stack.Screen name="index" options={{ title: 'Unified Agents' }} />
        <Stack.Screen name="connect-github" options={{ title: 'Conectar GitHub' }} />
        <Stack.Screen name="connect-deepseek" options={{ title: 'Conectar DeepSeek' }} />
        <Stack.Screen name="connect-claude" options={{ title: 'Conectar Claude API' }} />
        <Stack.Screen name="claude" options={{ title: 'Claude' }} />
        <Stack.Screen name="claude-guide" options={{ title: 'Claude por assinatura' }} />
        <Stack.Screen name="setup-claude-subscription" options={{ title: 'Set up Claude on GitHub' }} />
        <Stack.Screen name="connect-openai" options={{ title: 'ChatGPT / Codex' }} />
        <Stack.Screen name="openai" options={{ title: 'ChatGPT / Codex' }} />
        <Stack.Screen name="connect-chatgpt" options={{ title: 'Conectar ChatGPT' }} />
        <Stack.Screen name="codex-guide" options={{ title: 'Codex por assinatura' }} />
        <Stack.Screen name="chat" options={{ title: 'Planejamento compartilhado' }} />
        <Stack.Screen name="agents" options={{ title: 'Issues and agents' }} />
      </Stack>
    </KeyboardProvider>
  )
}
