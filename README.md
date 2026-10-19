# GitHub Unified Agents

Aplicativo móvel, cloud-first, para controlar agentes de desenvolvimento pelo GitHub.

Licença: [MIT](LICENSE). O projeto é open source; contribuições seguem o
[guia de contribuição](CONTRIBUTING.md).

## Primeira versão

- Login GitHub no próprio dispositivo, usando OAuth Device Flow.
- Fallback opcional por fine-grained PAT, validado antes de ser salvo no cofre do aparelho.
- Token armazenado em `expo-secure-store`, nunca no repositório.
- Conexões Gemini, DeepSeek, Claude API e OpenAI API por chaves individuais, validadas e armazenadas no cofre do aparelho.
- Chat de planejamento local: o mesmo histórico pode ser reenviado a qualquer provider conectado para comparar respostas.
- Base para criar Issues, observar PRs e configurar GitHub Actions.
- GitHub permanece separado dos providers: nada é publicado no repositório sem uma ação explícita posterior.

## Claude Code por assinatura

O workflow `Claude Code` responde a Issues ou comentários que contenham `@claude`.
Ele usa a assinatura Claude Pro/Max por meio do secret de Actions
`CLAUDE_CODE_OAUTH_TOKEN`, nunca por uma chave da Anthropic no aplicativo.
Gere o token com `claude setup-token`, faça o login oficial da Anthropic e
adicione o valor em **Settings → Secrets and variables → Actions** do repositório.

## Agentes no GitHub Actions

O planejamento acontece no app. A execução acontece no GitHub: o app cria uma
Issue com a menção do agente escolhido, e o workflow executa e abre um PR em
rascunho. Nenhum agente faz merge.

| Agente | Menção | Workflow | Secret necessário |
| --- | --- | --- | --- |
| Claude Code | `@claude` | `claude-code.yml` | `CLAUDE_CODE_OAUTH_TOKEN` (assinatura Claude Pro/Max) |
| Codex | `@codex` | `agents.yml` | `CODEX_AUTH_JSON` (assinatura ChatGPT, **não oficial**) ou `OPENAI_API_KEY` (API key, oficial, cobrada à parte) |
| DeepSeek | `@deepseek` | `agents.yml` | `DEEPSEEK_API_KEY` (usa aider com `deepseek/deepseek-v4-pro`) |

Os agentes se coordenam por um quadro no próprio repositório, em
`.agents/tasks/` (um JSON por Issue). Antes de cada execução o workflow confere
o quadro e não repete uma Issue que já está em andamento ou com PR aberto. As
regras que todos os agentes recebem estão em `AGENTS.md` (`CLAUDE.md` importa
esse arquivo). Todo PR traz a seção **Para os outros agentes**, com o que mudou,
por quê, o que ficou fora e como testar.

### Codex com assinatura ChatGPT (não oficial)

A documentação do Codex não prevê login por assinatura em CI. O workaround é
copiar o `~/.codex/auth.json` de uma máquina onde você já fez `codex login`
e guardá-lo como secret `CODEX_AUTH_JSON`. Antes de usar, entenda os riscos:

- O arquivo tem tokens de acesso e de renovação. Quem tiver o secret usa a sua conta ChatGPT.
- Os tokens de renovação giram. Quando a sessão da sua máquina renova, a cópia no GitHub
  pode parar de funcionar. Nesse caso, gere de novo e atualize o secret.
- Não encontrei fonte oficial que permita esse uso em automação. Pode violar os termos da OpenAI.
- Quem roda CI não grava o token de volta: a renovação feita dentro do runner se perde.

Para cadastrar o secret a partir da sua máquina (sem colar o conteúdo no chat):

```sh
gh secret set CODEX_AUTH_JSON --repo dono/repositorio < ~/.codex/auth.json
```

Se preferir o caminho oficial, use `OPENAI_API_KEY`, cobrada à parte da assinatura.

Os workflows de agentes só rodam quando quem abre a Issue ou comenta é dono, membro ou colaborador do repositório. O repositório é público, então sem essa checagem qualquer pessoa poderia disparar um job com acesso aos secrets.

Os secrets dos agentes ficam no environment **agents** (Settings → Environments),
e não no repositório. Os jobs dos agentes declaram `environment: agents`, então
o GitHub só entrega os valores depois que o revisor aprovar a execução.

- **Repositório público:** o app coloca você como revisor obrigatório. Nenhuma
  execução roda, nem recebe os secrets, sem a sua aprovação.
- **Repositório privado (Free, Pro ou Team):** a exigência de revisor não é aceita
  pelo GitHub. O environment é criado sem aprovação, e o app avisa isso. Nesse
  caso, a proteção fica só no controle de acesso ao repositório.

Para Codex e DeepSeek, as chaves precisam estar no environment para o workflow
rodar. O app não as recebe do GitHub nem as envia ao GitHub.

## ChatGPT / Codex por assinatura

O botão **Usar assinatura ChatGPT** usa o código de dispositivo oficial da
OpenAI, o mesmo fluxo do Codex CLI (`auth.openai.com/codex/device`). O app
abre o navegador, você confirma o código e o app detecta a autorização. Não há
senha no app e nenhum servidor local é aberto no aparelho. O app:

- usa o client público do Codex CLI (`app_EMoamEEZ73f0CkXaXp7hrann`);
- verifica no módulo nativo a assinatura RSA, emissor, audiência e validade do
  ID token contra as chaves públicas da OpenAI, e lê o `chatgpt_account_id`;
- guarda tokens e metadados no cofre do aparelho e renova o token rotativo
  antes de expirar;
- revoga o refresh token em `auth.openai.com/oauth/revoke` ao desconectar.

No chat compartilhado, escolher **ChatGPT / OpenAI** usa primeiro a sessão
ChatGPT conectada, com as requisições enviadas a `chatgpt.com/backend-api/codex`;
se ela não existir, usa a API key OpenAI opcional.

## Modelos

Nenhum nome de modelo fica fixo no código. Para cada provider, o app lista os
modelos disponíveis na própria API e usa o mais recente de texto (Gemini por
versão e estabilidade, OpenAI e Claude pela data de criação, DeepSeek pela
versão no nome e ChatGPT pela versão do slug). A lista é guardada por uma hora.
O nome do modelo usado aparece em cada resposta do chat.

GitHub não é necessário para conversar. GitHub é usado separadamente quando o
usuário decidir abrir Issue, branch, commit ou pull request. Já uma automação
Codex que edite o repositório exige um runtime Codex autorizado no ambiente que
executará a tarefa; ela não recebe a senha nem a sessão do ChatGPT pelo GitHub.

## Por que não copiar o Orca inteiro?

Orca é um IDE Electron com pareamento entre desktop e telefone. Este projeto usa apenas a direção mobile do Orca — Expo, TypeScript, Expo Router e armazenamento seguro — e começa sem dependência de desktop: GitHub Actions executa o trabalho na cloud.

## Rodar

1. Instale e inicie:

   ```sh
   npm install
   npm run start
   ```

Em produção, o Client ID público do OAuth é injetado pelo GitHub Actions Secret
`EXPO_PUBLIC_GITHUB_CLIENT_ID`; ele não é versionado. Cada pessoa só precisa
autorizar a sua própria conta GitHub pelo fluxo de dispositivo.

## Segurança

- Use OAuth/App do GitHub com acesso somente ao repositório escolhido.
- Prefira OAuth; se usar PAT, crie um fine-grained PAT limitado ao repositório e revogue-o ao deixar de usá-lo.
- As chaves Gemini, DeepSeek, Anthropic e OpenAI guardadas no app não são enviadas ao GitHub. Para os agentes Codex e DeepSeek, a chave precisa ser cadastrada manualmente como secret do repositório, porque o workflow roda no GitHub. Para distribuição multiusuário em produção, use um proxy/backend por usuário em vez de uma chave compartilhada no aplicativo.
- Tokens de Claude/Codex/DeepSeek nunca entram em Issues, commits ou logs.
- Assinaturas Claude Pro/Max e ChatGPT/Codex não são chaves de API. Claude Code e Codex por assinatura exigem os fluxos oficiais e um runtime complementar; o app não disfarça uma chave de API como assinatura.
- Para Actions, o app deve criptografar cada secret com a chave pública do repositório antes de enviá-lo à API do GitHub.
- Fluxos que alterem código devem abrir PRs; a aprovação e merge permanecem humanos.
