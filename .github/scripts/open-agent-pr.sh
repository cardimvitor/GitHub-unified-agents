#!/usr/bin/env bash
# Uso: open-agent-pr.sh <agente>
# Commita o que o agente alterou em um branch próprio e abre um PR em rascunho ligado à Issue.
set -euo pipefail

AGENT="$1"
BRANCH="agent/${AGENT}-issue-${ISSUE}"
BASE="$(git rev-parse --abbrev-ref HEAD)"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git checkout -B "$BRANCH"
if ! git diff --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  git add -A
  git commit -m "${AGENT}: issue #${ISSUE}"
fi

if git diff --quiet "origin/${BASE}" HEAD; then
  echo "O agente não alterou o repositório. Nenhum PR criado."
  exit 0
fi

git push -u origin "$BRANCH"
gh pr create --draft --base "$BASE" --head "$BRANCH" \
  --title "${AGENT}: issue #${ISSUE}" \
  --body "Gerado pelo agente ${AGENT} a partir da Issue #${ISSUE}. Revise antes de aprovar.

Closes #${ISSUE}"
