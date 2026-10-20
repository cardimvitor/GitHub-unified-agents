// Gera src/github/agent-template.ts a partir dos arquivos do setup de agentes.
// Rode `npm run gen:agent-template` sempre que um desses arquivos mudar.
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.agents/README.md',
  '.agents/tasks/.gitkeep',
  '.agents/handoffs/.gitkeep',
  '.github/scripts/agent-board.sh',
  '.github/scripts/open-agent-pr.sh',
  '.github/workflows/agents.yml',
  '.github/workflows/claude-code.yml'
]

const files = Object.fromEntries(FILES.map((path) => [path, readFileSync(path, 'utf8')]))
const body = `// Arquivo gerado por scripts/generate-agent-template.mjs. Não edite à mão.
export const AGENT_TEMPLATE: Record<string, string> = ${JSON.stringify(files, null, 2)}
`
writeFileSync('src/github/agent-template.ts', body)
console.log(`src/github/agent-template.ts: ${FILES.length} arquivos`)
