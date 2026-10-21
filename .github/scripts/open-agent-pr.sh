#!/usr/bin/env bash
# Uso: open-agent-pr.sh <agente> [arquivo_com_ultima_mensagem]
# Commita o que o agente alterou num branch próprio, abre um PR em rascunho com a explicação
# para os outros agentes e registra o PR no quadro.
set -euo pipefail

AGENT="$1"
LAST_MESSAGE="${2:-}"
BRANCH="agent/${AGENT}-issue-${ISSUE}"
BASE="$(git rev-parse --abbrev-ref HEAD)"
HANDOFF_SRC=".agents/handoffs/issue-${ISSUE}.md"
EXPLANATION="${RUNNER_TEMP:-/tmp}/explanation-${AGENT}-${ISSUE}.md"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# A explicação é obrigatória. Se o agente não escreveu, usa a última mensagem dele e a lista de arquivos.
if [ -f "$HANDOFF_SRC" ]; then
  cp "$HANDOFF_SRC" "$EXPLANATION"
  rm -f "$HANDOFF_SRC"
else
  {
    echo "O agente não escreveu o arquivo de explicação. Última mensagem dele:"
    echo
    if [ -n "$LAST_MESSAGE" ] && [ -f "$LAST_MESSAGE" ]; then cat "$LAST_MESSAGE"; else echo "(sem mensagem)"; fi
    echo
    echo "Arquivos alterados:"
    git status --porcelain | sed 's/^/- /'
  } > "$EXPLANATION"
fi

git checkout -B "$BRANCH"
if ! git diff --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  git add -A
  git commit -m "${AGENT}: issue #${ISSUE}"
fi

if git diff --quiet "origin/${BASE}" HEAD; then
  echo "O agente não alterou o repositório. Nenhum PR criado."
  exit 0
fi

# Uma nova execução na mesma Issue (ex.: botão "Run agent") encontra o branch já publicado.
# Juntamos o trabalho novo ao anterior com merge, sem reescrever o histórico nem forçar o push.
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch origin "$BRANCH"
  git merge --no-edit -X ours FETCH_HEAD
fi

git push -u origin "$BRANCH"

EXISTING_PR="$(gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url // empty')"
if [ -n "$EXISTING_PR" ]; then
  echo "PR já aberto: $EXISTING_PR"
  URL="$EXISTING_PR"
else
BODY="$(mktemp)"
{
  echo "## Para os outros agentes"
  echo
  cat "$EXPLANATION"
  echo
  echo "Closes #${ISSUE}"
  echo
  echo "---"
  echo "_Gerado pelo agente ${AGENT} a partir da Issue #${ISSUE}. Revise antes de aprovar._"
} > "$BODY"
URL="$(gh pr create --draft --base "$BASE" --head "$BRANCH" --title "${AGENT}: issue #${ISSUE}" --body-file "$BODY")"
echo "PR: $URL"
fi

bash .github/scripts/agent-board.sh finish "$AGENT" "$ISSUE" "$URL" "$EXPLANATION"
