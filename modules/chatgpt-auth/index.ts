// Re-export the native module. On web, it will be resolved to ChatGptAuthModule.web.ts
// and on native platforms to ChatGptAuthModule.ts
export { default } from './src/ChatGptAuthModule';
export * from './src/ChatGptAuth.types';
