// Divide um plano entre vários agentes. O modelo do chat devolve um JSON com uma parte por agente.

export function splitPrompt(plan: string, agents: string[]) {
  return [
    'Divida o plano abaixo entre os agentes indicados, sem perder nenhum passo.',
    `Agentes: ${agents.join(', ')}.`,
    'Cada agente recebe só os passos da sua parte, mantendo os nomes de arquivos e áreas do plano original.',
    'Inclua em cada parte o objetivo geral em uma frase. Todo agente precisa receber pelo menos um passo.',
    `Responda somente com JSON válido, sem texto fora dele, com exatamente estas chaves: ${agents.map((agent) => `"${agent}"`).join(', ')}.`,
    'Plano:',
    plan
  ].join('\n')
}

export function parseSplit(raw: string, agents: string[]): Record<string, string> {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('A divisão não veio em JSON. Tente criar as Issues de novo.')
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error('A divisão veio com JSON inválido. Tente criar as Issues de novo.')
  }
  const parts: Record<string, string> = {}
  for (const agent of agents) {
    const value = data[agent]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`A divisão não trouxe passos para ${agent}. Tente criar as Issues de novo.`)
    parts[agent] = value.trim()
  }
  return parts
}

export async function splitPlan(plan: string, agents: string[], ask: (prompt: string) => Promise<string>) {
  const raw = await ask(splitPrompt(plan, agents))
  return parseSplit(raw, agents)
}
