# Análise exploratória — GitHub Unified Agents

Análise estática (leitura de código, workflows e scripts) feita para a Issue #7. **Nenhuma correção foi aplicada**: o documento serve de base para o backlog. Não houve testes manuais, execução do app, `npm run typecheck` nem revisão de UX em dispositivo.

## 1. Escopo e método

- **Escopo:** repositório inteiro — app Expo/React Native (`app/`, `src/`, `modules/`), workflows (`.github/workflows/`), scripts (`.github/scripts/`, `scripts/`) e documentação.
- **Lido por completo:** `src/**`, `app/chat.tsx`, workflows, `agent-board.sh`, `open-agent-pr.sh`, `bootstrap-agents.sh`, `generate-agent-template.mjs`, README, AGENTS.md.
- **Fora do escopo / não lido a fundo:** módulo nativo Kotlin (`modules/chatgpt-auth`), telas `connect-*`, `app/index.tsx`, `src/components/repository-panel.tsx`.
- **Premissas para as perguntas em aberto da Issue:** sistema = este repositório; só inspeção de código; arquivo na raiz; prioridades P1 (alta), P2 (média), P3 (baixa).

## 2. Mapa de funcionalidades

| Fluxo | Onde |
| --- | --- |
| Login GitHub (Device Flow / PAT) | `src/github/device-auth.ts`, `app/connect-github.tsx`, `src/storage/github-session.ts` |
| Conexão de providers por chave (Gemini, DeepSeek, Claude, OpenAI) | `app/connect-*.tsx`, `src/providers/*`, `src/storage/provider-credentials.ts` |
| Login por assinatura ChatGPT | `src/openai/chatgpt-subscription.ts`, `modules/chatgpt-auth` |
| Chat de planejamento → Issue com menção | `app/chat.tsx`, `src/providers/chat.ts`, `src/github/repository.ts` |
| Configurar agentes num repositório (arquivos, environment, secrets, Copilot) | `src/github/repositories.ts`, `environments.ts`, `agent-secrets.ts`, `secrets.ts`, `agent-template.ts` |
| Execução dos agentes no Actions + quadro | `.github/workflows/*.yml`, `.github/scripts/agent-board.sh`, `open-agent-pr.sh` |

## 3. Achados

### Defeitos

#### D1 — Placeholder `{mention}` literal em `agents.yml` (P1)
- **Descrição:** nos jobs `codex` e `deepseek`, a condição de `issue_comment` usa `contains(github.event.comment.body, '{mention}')` em vez de `@codex` / `@deepseek`.
- **Evidência:** `.github/workflows/agents.yml:17` e `:83`; o mesmo texto está em `src/github/agent-template.ts`, então se propaga para todo repositório configurado pelo app.
- **Impacto:** comentários com `@codex` ou `@deepseek` não disparam o job. Só o gatilho por Issue nova funciona. O `cmd_check` do quadro e o README pressupõem que o pedido por comentário funciona.
- **Recomendação:** trocar por `'@codex'` e `'@deepseek'`, rodar `npm run gen:agent-template` e reaplicar nos repositórios já configurados.

#### D2 — Quadro fica em `in-progress` se o agente falha (P1)
- **Descrição:** `start` grava `in-progress` no branch padrão; `finish` só roda se o agente e o PR tiverem sucesso. Em `codex`/`deepseek` não há passo `if: failure()` para limpar. No `claude-code.yml`, `claude-finish` roda sempre, mas não faz nada se não achar PR.
- **Evidência:** `agents.yml` (passos "Register start on board" → "Run …" → "Open draft pull request"); `agent-board.sh` `cmd_check` bloqueia `in-progress` e `pr-open`.
- **Impacto:** uma falha (secret ausente, erro de API, timeout) trava a Issue para novos eventos `issues`. Só comentário contorna, e o D1 impede isso para Codex/DeepSeek. PR fechado sem merge também deixa o status em `pr-open`.
- **Recomendação:** registrar `failed` (ou remover o arquivo) em passo `if: failure() || cancelled()`; tratar PR fechado/mesclado no quadro.

#### D3 — O quadro faz push direto no branch padrão e assume `main` (P2)
- **Descrição:** `write_board` faz `git push origin HEAD:refs/heads/$BASE` com `GITHUB_TOKEN`; `BASE="${DEFAULT_BRANCH:-main}"` e nenhum workflow define `DEFAULT_BRANCH`.
- **Evidência:** `.github/scripts/agent-board.sh` (`BASE=` e `write_board`).
- **Impacto:** (a) repositório com branch padrão diferente de `main` falha em "Register start"; (b) com proteção de branch ou ruleset exigindo PR o push é recusado, e o app ainda liga um ruleset do Copilot no branch padrão; (c) polui o histórico.
- **Recomendação:** derivar `BASE` de `github.event.repository.default_branch`; documentar a necessidade de bypass para o bot, ou mover o quadro para um branch dedicado.

#### D4 — Reexecução na mesma Issue pode falhar no `git push` (P3, não reproduzido)
- **Descrição:** `open-agent-pr.sh` usa `git checkout -B "agent/<agente>-issue-N"` e `git push -u origin` sem `--force`. Se o branch remoto já existe de uma execução anterior (ex.: pedido por comentário), o push pode ser recusado.
- **Evidência:** `.github/scripts/open-agent-pr.sh` (`git checkout -B`, `git push -u`).
- **Impacto:** o trabalho do agente é perdido no runner e o job falha.
- **Recomendação:** `--force-with-lease`, sufixo com `run_id`, ou aviso claro.

#### D5 — `askProvider` repete credencial e listagem de modelos a cada mensagem (P2)
- **Descrição:** `askProvider` chama `credentialFor` e depois `modelsFor`, que chama `credentialFor` e `listModels` de novo.
- **Evidência:** `src/providers/chat.ts` (`askProvider` → `modelsFor`). `models.ts` tem cache de 1 h, o que atenua a rede.
- **Impacto:** leituras duplicadas do cofre; no caminho `chatgpt`, `currentChatGptSession` é chamado duas vezes e pode disparar dois refreshes de um refresh token que gira, invalidando a sessão.
- **Recomendação:** `modelsFor` aceitar a credencial já resolvida; garantir um único refresh em voo.

#### D6 — Parse SSE do ChatGPT sem proteção (P3)
- **Descrição:** `JSON.parse(payload)` dentro do laço de `askChatGptPlan` sem `try/catch`.
- **Evidência:** `src/providers/chat.ts` (laço `for (const line of raw.split('\n'))`).
- **Impacto:** uma linha `data:` não-JSON (mudança no backend não oficial) derruba a resposta com `SyntaxError` sem mensagem útil.
- **Recomendação:** `try/catch` por linha, ignorando eventos desconhecidos.

#### D7 — Três clientes HTTP do GitHub com tratamento de erro diferente (P3)
- **Descrição:** `repository.ts:request`, `repositories.ts:api` e `environments.ts:call` são quase iguais. Só os dois últimos limpam a sessão no 401; `repository.ts` (usado para criar a Issue) lança apenas `GitHub respondeu com N.`.
- **Evidência:** `src/github/repository.ts:17-19`, `repositories.ts:19-26`, `environments.ts:17-20`.
- **Impacto:** token revogado ao criar Issue não limpa a sessão nem explica o motivo; 403 por falta de escopo fica opaco.
- **Recomendação:** unificar (ver M2).

#### D8 — Gatilho de build com branch de sessão fixo (P3)
- **Descrição:** `build-apk.yml` dispara em push para `ccr-9ccfd58b-9y5v3q` e cria release rascunho `v0.1.0` por essa condição.
- **Evidência:** `.github/workflows/build-apk.yml:10-12,46`.
- **Impacto:** resíduo de sessão antiga; `v0.1.0` fixo pode colidir com releases reais.
- **Recomendação:** manter só tag `v*` e `workflow_dispatch`.

### Segurança

#### S1 — Agentes com secrets e sem aprovação em repositório privado ou modo automático (P1)
- **Descrição:** em repositório privado (Free/Pro/Team) ou no modo "automático", o environment `agents` não exige revisor. O texto da Issue/comentário vai para o prompt e os agentes executam comandos (`codex exec -s workspace-write`, `aider --yes-always`). A checagem de `author_association` aceita OWNER, MEMBER e COLLABORATOR.
- **Evidência:** `src/github/environments.ts` (`ensureAgentsEnvironment`); `agents.yml` (`TASK`, `--yes-always`).
- **Impacto:** prompt injection (em Issue, comentário ou conteúdo citado nelas) pode levar o agente a expor `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` ou `CODEX_AUTH_JSON`, que estão no ambiente do passo que roda o agente. Um colaborador com permissão baixa já basta.
- **Recomendação:** reduzir a exposição dos secrets ao processo do agente; restringir a `OWNER` no modo automático; deixar o risco explícito no app.

#### S2 — Envio do login ChatGPT (com refresh token) como secret (P2)
- **Descrição:** sem API key, o app envia a sessão ChatGPT completa como `CODEX_AUTH_JSON`.
- **Evidência:** `src/github/agent-secrets.ts` (`buildCodexAuthJson`, `pushAgentSecrets`). O README já avisa do uso não oficial.
- **Impacto:** tokens giram, então a cópia no GitHub e a do aparelho podem se invalidar; possível violação de termos.
- **Recomendação:** pedir confirmação explícita no app; preferir API key.

#### S3 — Escopo OAuth amplo (P2)
- **Descrição:** o Device Flow pede `repo workflow`.
- **Evidência:** `src/github/device-auth.ts:35`.
- **Impacto:** quem obtiver o aparelho/token tem escrita em todos os repositórios do usuário. O token não tem validade nem revalidação no app (só trata 401 quando uma chamada falha).
- **Recomendação:** priorizar fine-grained PAT ou GitHub App restritos ao repositório alvo.

#### S4 — Actions por tag móvel e permissão extra (P3)
- **Descrição:** `anthropics/claude-code-action@v1`, `softprops/action-gh-release@v2`, `actions/*@v4`; `claude-code.yml` declara `id-token: write`.
- **Evidência:** `.github/workflows/claude-code.yml`, `build-apk.yml`.
- **Impacto:** risco de cadeia de suprimentos. O `id-token` pode ser necessário para a ação (não verificado); vale confirmar.
- **Recomendação:** fixar por SHA; reduzir permissões se possível. (Codex CLI e aider já estão com versão fixa.)

#### S5 — Dependência de API não documentada do ChatGPT (P3)
- **Descrição:** uso de `chatgpt.com/backend-api/codex` e do `client_id` do Codex CLI.
- **Evidência:** `src/providers/chat.ts` (`CHATGPT_CODEX_BASE`), `src/openai/chatgpt-subscription.ts:3-12`.
- **Impacto:** pode quebrar sem aviso ou violar termos.
- **Recomendação:** manter isolado e sinalizado na UI como não oficial.

### Melhorias

#### M1 — Sem testes e sem CI de verificação (P1)
- **Evidência:** `package.json` não tem script `test`; nenhum workflow roda `npm run typecheck`, embora o AGENTS.md exija.
- **Impacto:** regressões em lógica pura (`rankGeminiModels`, `rankOpenAiModels`, `numericVersion`, `sealSecretValue`, `missingSecrets`, `buildCodexAuthJson`) e nos scripts de quadro passam sem aviso.
- **Recomendação:** workflow em `pull_request` com `npm ci && npm run typecheck`; testes unitários para as funções puras; testes em shell para `agent-board.sh`.

#### M2 — Cliente único para a API do GitHub (P2)
- Ver D7. Um módulo com tratamento de 401, mensagens, paginação e rate limit.

#### M3 — `listRepositories` sem paginação (P2)
- **Evidência:** `src/github/repositories.ts` usa `per_page=100` e não segue `Link`.
- **Impacto:** quem tem mais de 100 repositórios não vê todos.
- **Recomendação:** paginar ou buscar.

#### M4 — Histórico reenviado inteiro e `max_tokens` fixo (P2)
- **Evidência:** `app/chat.tsx` (`send`) concatena toda a conversa em uma única mensagem; Claude usa `max_tokens: 1200` em `src/providers/chat.ts`.
- **Impacto:** custo e latência crescem a cada mensagem; planos longos podem ser cortados sem aviso.
- **Recomendação:** enviar em turnos, truncar/resumir, avisar quando a resposta for cortada.

#### M5 — `agent-template.ts` sem verificação de sincronia (P2)
- **Evidência:** `scripts/generate-agent-template.mjs` e `bootstrap-agents.sh` mantêm cada um uma lista própria de arquivos; nada confere se `agent-template.ts` está atualizado.
- **Impacto:** divergência silenciosa (o D1 existe em dois lugares).
- **Recomendação:** passo de CI que roda o gerador e falha com `git diff --exit-code`; fonte única para a lista de arquivos.

#### M6 — Conversa só em memória (P3)
- **Evidência:** `entries` em `useState`; a própria tela diz que o histórico some ao sair.
- **Recomendação:** persistir localmente, se o produto quiser retomar planos.

#### M7 — Acessibilidade e UX (P3, não testado em dispositivo)
- `app/chat.tsx` usa `Pressable` sem `accessibilityRole`/`accessibilityLabel`; textos fixos em português; erros só como mensagem na conversa.
- **Recomendação:** adicionar roles/labels e ação de repetir.

#### M8 — Documentação e verificação da regra do Copilot (P3)
- O README e `.agents/README.md` não explicam a recuperação de falhas do quadro (D2) nem a necessidade de bypass (D3).
- `enableCopilotReview` admite no comentário que os nomes da regra não foram conferidos contra a API.

## 4. Priorização

| ID | Item | Prioridade | Esforço | Dependências |
| --- | --- | --- | --- | --- |
| D1 | `{mention}` literal | P1 | Baixo | regenerar template |
| D2 | Quadro preso em `in-progress` | P1 | Médio | — |
| S1 | Secrets expostos ao agente | P1 | Médio-alto | decisão de produto |
| M1 | Testes + CI de typecheck | P1 | Médio | — |
| D3 | Push direto no branch padrão / `main` fixo | P2 | Médio | D2 |
| D5 | Chamadas duplicadas ao provider | P2 | Baixo | — |
| S2 | Envio do `CODEX_AUTH_JSON` | P2 | Baixo | — |
| S3 | Escopo OAuth amplo | P2 | Médio | — |
| D7/M2 | Cliente GitHub único | P2 | Médio | — |
| M3 | Paginação de repositórios | P2 | Baixo | M2 |
| M4 | Histórico e `max_tokens` | P2 | Médio | — |
| M5 | Sincronia do template | P2 | Baixo | — |
| D4, D6, D8, S4, S5, M6, M7, M8 | demais | P3 | Baixo | — |

## 5. Próximos passos sugeridos

1. Abrir uma Issue por item P1, nesta ordem: D1 (correção pequena), M1, D2, S1.
2. Agrupar D2 + D3 (ambos mexem em `agent-board.sh`) e D5 + D6 + M4 (todos em `src/providers/chat.ts` / `app/chat.tsx`) para evitar conflito entre agentes.
3. Validar manualmente em dispositivo o que esta análise não cobriu: login, configuração de agentes em repositório público e privado, UX do chat.
4. Antes de cada correção, conferir `.agents/tasks/` para não duplicar trabalho.
