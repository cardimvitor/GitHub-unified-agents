// Divide um plano entre vários agentes. O modelo do chat devolve um JSON com uma parte por agente.

export function splitPrompt(plan: string, agents: string[]) {
  return [
    'Split the plan below between the listed agents, without dropping any step.',
    `Agents: ${agents.join(', ')}.`,
    'Each agent gets only the steps for its part, keeping the file names and areas from the original plan.',
    'Include the overall goal in one sentence in each part. Every agent must get at least one step.',
    `Reply only with valid JSON, with no text outside it, using exactly these keys: ${agents.map((agent) => `"${agent}"`).join(', ')}.`,
    'Plan:',
    plan
  ].join('\n')
}

export function parseSplit(raw: string, agents: string[]): Record<string, string> {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('The split did not come back as JSON. Try creating the Issues again.')
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error('The split came back with invalid JSON. Try creating the Issues again.')
  }
  const parts: Record<string, string> = {}
  for (const agent of agents) {
    const value = data[agent]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`The split gave no steps for ${agent}. Try creating the Issues again.`)
    parts[agent] = value.trim()
  }
  return parts
}

export async function splitPlan(plan: string, agents: string[], ask: (prompt: string) => Promise<string>) {
  const raw = await ask(splitPrompt(plan, agents))
  return parseSplit(raw, agents)
}

export const SPLIT_MARKER = 'Split:'

// Instrução que vai junto do pedido de planejamento quando há mais de um agente: o próprio plano já sai dividido.
export function splitInstruction(agents: string[]) {
  return [
    `After the plan, add a line "${SPLIT_MARKER}" and then one JSON object with exactly these keys: ${agents.map((agent) => `"${agent}"`).join(', ')}.`,
    'Each value is a string with only the steps for that agent, keeping the file names and areas from the plan. Include the overall goal in one sentence in each value. Every agent must get at least one step.'
  ].join('\n')
}

// Separa o plano da divisão. Se a divisão não vier válida, devolve só o plano e o app pede a divisão de novo.
export function extractSplit(answer: string, agents: string[]): { plan: string; parts?: Record<string, string> } {
  const index = answer.lastIndexOf(SPLIT_MARKER)
  if (index < 0) return { plan: answer.trim() }
  const plan = answer.slice(0, index).trim()
  try {
    return { plan, parts: parseSplit(answer.slice(index + SPLIT_MARKER.length), agents) }
  } catch {
    return { plan: answer.trim() }
  }
}
