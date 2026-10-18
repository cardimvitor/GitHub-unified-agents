# GitHub Unified Agents

Aplicativo móvel, cloud-first, para controlar agentes de desenvolvimento pelo GitHub.

## Primeira versão

- Login GitHub no próprio dispositivo, usando OAuth Device Flow.
- Token armazenado em `expo-secure-store`, nunca no repositório.
- Base para criar Issues, observar PRs e configurar GitHub Actions.
- Integrações previstas: Claude Code via OAuth da assinatura, Codex via Sign in with ChatGPT e DeepSeek como secret do GitHub.

## Por que não copiar o Orca inteiro?

Orca é um IDE Electron com pareamento entre desktop e telefone. Este projeto usa apenas a direção mobile do Orca — Expo, TypeScript, Expo Router e armazenamento seguro — e começa sem dependência de desktop: GitHub Actions executa o trabalho na cloud.

## Rodar

1. Crie um GitHub OAuth App e copie apenas o Client ID público para `.env`:

   ```sh
   cp .env.example .env
   ```

2. Instale e inicie:

   ```sh
   npm install
   npm run start
   ```

## Segurança

- Use OAuth/App do GitHub com acesso somente ao repositório escolhido.
- Tokens de Claude/Codex/DeepSeek nunca entram em Issues, commits ou logs.
- Para Actions, o app deve criptografar cada secret com a chave pública do repositório antes de enviá-lo à API do GitHub.
- Fluxos que alterem código devem abrir PRs; a aprovação e merge permanecem humanos.
