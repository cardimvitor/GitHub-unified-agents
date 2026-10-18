export type OAuthCallback = { code: string; state: string; clientId?: string };
export type VerifiedIdentity = { subject: string; email?: string | null };
export type ChatGptAuthModuleEvents = { onOAuthCallback: (params: OAuthCallback) => void; onOAuthError: (params: { error: string }) => void };
