import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#101827' }, headerTintColor: '#f8fafc' }}>
        <Stack.Screen name="index" options={{ title: 'Unified Agents' }} />
        <Stack.Screen name="connect-github" options={{ title: 'Conectar GitHub' }} />
        <Stack.Screen name="connect-gemini" options={{ title: 'Conectar Gemini' }} />
      </Stack>
    </>
  )
}
