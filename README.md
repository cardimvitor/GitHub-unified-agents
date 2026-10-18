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

## ChatGPT / Codex por assinatura

O botão **Usar assinatura ChatGPT / Codex** abre o navegador do sistema e usa o
fluxo oficial **Sign in with ChatGPT**. Ele não pede API key e não recebe a
senha do usuário. No Android, o app:

- cria um callback local em `127.0.0.1`, PKCE, `state` e `nonce` novos;
- mantém um identificador de host por instalação e registra/reutiliza o client
  emitido pelo OpenAI;
- verifica no módulo nativo a assinatura RSA, emissor, audiência, expiração e
  `nonce` do ID token contra as chaves públicas do OpenAI;
- só ativa o chat quando o usuário conceder o escopo
  `chatgpt.tokens.use.direct`;
- guarda tokens e metadados no cofre do aparelho e renova o token rotativo
  antes de expirar.

No chat compartilhado, escolher **OpenAI API** usa primeiro a sessão ChatGPT
conectada; se ela não existir, usa a API key OpenAI opcional. A assinatura dá
acesso somente a requisições elegíveis de `Responses API`: não dá acesso às
conversas existentes do ChatGPT, nem à API key do usuário.

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
- As chaves Gemini, DeepSeek, Anthropic e OpenAI não são enviadas ao GitHub. Para distribuição multiusuário em produção, use um proxy/backend por usuário em vez de uma chave compartilhada no aplicativo.
- Tokens de Claude/Codex/DeepSeek nunca entram em Issues, commits ou logs.
- Assinaturas Claude Pro/Max e ChatGPT/Codex não são chaves de API. Claude Code e Codex por assinatura exigem os fluxos oficiais e um runtime complementar; o app não disfarça uma chave de API como assinatura.
- Para Actions, o app deve criptografar cada secret com a chave pública do repositório antes de enviá-lo à API do GitHub.
- Fluxos que alterem código devem abrir PRs; a aprovação e merge permanecem humanos.
