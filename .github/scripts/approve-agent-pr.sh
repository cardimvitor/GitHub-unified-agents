#!/usr/bin/env bash
# Uso: approve-agent-pr.sh (variáveis: GH_TOKEN da conta de aprovação, REPO=dono/repositorio)
# Para cada PR aberto de agente (branch agent/*): aprova e liga o merge automático só quando
# o Copilot já revisou o head atual, não há revisão pedindo mudanças, nem comentário aberto,
# nem check pendente ou vermelho. Qualquer dúvida deixa o PR para revisão humana.
set -euo pipefail

OWNER="${REPO%%/*}"
NAME="${REPO##*/}"
APPROVER="$(gh api user --jq .login)"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

note() {
  echo "$1"
  echo "- $1" >> "$SUMMARY"
}

PRS="$(gh pr list --repo "$REPO" --state open --json number,headRefName,headRefOid,author \
  --jq '.[] | select(.headRefName | startswith("agent/")) | @base64')"

if [ -z "$PRS" ]; then
  note "Nenhum PR de agente aberto."
  exit 0
fi

for row in $PRS; do
  pr="$(echo "$row" | base64 -d)"
  number="$(echo "$pr" | jq -r .number)"
  sha="$(echo "$pr" | jq -r .headRefOid)"
  author="$(echo "$pr" | jq -r .author.login)"

  if [ "$author" = "$APPROVER" ]; then
    note "PR #$number: a conta de aprovação é a autora; deixado para revisão humana."
    continue
  fi

  reviews="$(gh api --paginate "repos/$REPO/pulls/$number/reviews" --jq "[.[] | select(.commit_id == \"$sha\")]")"
  copilot="$(echo "$reviews" | jq '[.[] | select(.user.login | test("copilot"; "i"))] | length')"
  if [ "$copilot" -eq 0 ]; then
    note "PR #$number: o Copilot ainda não revisou este commit."
    continue
  fi

  if [ "$(echo "$reviews" | jq '[.[] | select(.state == "CHANGES_REQUESTED")] | length')" -gt 0 ]; then
    note "PR #$number: há pedido de mudanças; deixado para revisão humana."
    continue
  fi

  open_threads="$(gh api graphql -f owner="$OWNER" -f name="$NAME" -F number="$number" \
    -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}' \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')"
  if [ "$open_threads" -gt 0 ]; then
    note "PR #$number: $open_threads comentário(s) aberto(s); deixado para revisão humana."
    continue
  fi

  checks="$(gh api "repos/$REPO/commits/$sha/check-runs" --jq '.check_runs')"
  pending="$(echo "$checks" | jq '[.[] | select(.status != "completed")] | length')"
  red="$(echo "$checks" | jq '[.[] | select(.status == "completed" and ((.conclusion == "success" or .conclusion == "skipped" or .conclusion == "neutral") | not))] | length')"
  if [ "$pending" -gt 0 ] || [ "$red" -gt 0 ]; then
    note "PR #$number: checks pendentes ($pending) ou com falha ($red); deixado para revisão humana."
    continue
  fi

  already="$(echo "$reviews" | jq --arg me "$APPROVER" '[.[] | select(.state == "APPROVED" and .user.login == $me)] | length')"
  if [ "$already" -eq 0 ]; then
    gh pr review "$number" --repo "$REPO" --approve \
      --body "Aprovado pelo fluxo de agentes: Copilot revisou sem pendências e os checks passaram."
  fi
  gh pr merge "$number" --repo "$REPO" --auto --merge
  note "PR #$number: aprovado e merge automático ligado."
done
