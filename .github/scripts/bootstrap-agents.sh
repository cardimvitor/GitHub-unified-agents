#!/usr/bin/env bash
# Aplica o setup de agentes em UM repositório. Pode rodar de novo sem estragar nada.
# Uso: bootstrap-agents.sh <caminho-do-clone-do-repositorio-alvo>
set -euo pipefail

TARGET="${1:?uso: bootstrap-agents.sh <caminho-do-clone>}"
SOURCE="$(cd "$(dirname "$0")/../.." && pwd)"

FILES=(
  AGENTS.md
  CLAUDE.md
  .agents/README.md
  .agents/tasks/.gitkeep
  .agents/handoffs/.gitkeep
  .github/scripts/agent-board.sh
  .github/scripts/open-agent-pr.sh
  .github/workflows/agents.yml
  .github/workflows/claude-code.yml
)

for file in "${FILES[@]}"; do
  mkdir -p "$TARGET/$(dirname "$file")"
  cp "$SOURCE/$file" "$TARGET/$file"
done
chmod +x "$TARGET/.github/scripts/agent-board.sh" "$TARGET/.github/scripts/open-agent-pr.sh"

echo "Arquivos copiados para $TARGET:"
printf '  %s\n' "${FILES[@]}"
cat <<'NEXT'

Falta configurar neste repositório (cada um é próprio dele):
  1. Secrets no environment agents (Settings → Environments → agents), não no repositório:
     - CLAUDE_CODE_OAUTH_TOKEN  (agente Claude)
     - OPENAI_API_KEY ou CODEX_AUTH_JSON (agente Codex; o segundo é assinatura não oficial, ver README)
     - DEEPSEEK_API_KEY         (agente DeepSeek)
  2. Revisão automática do Copilot ligada para este repositório.
  3. Permissão de escrita do GitHub Actions liberada, para o quadro e os PRs.
  4. Commit e push dos arquivos acima no branch padrão.
NEXT
