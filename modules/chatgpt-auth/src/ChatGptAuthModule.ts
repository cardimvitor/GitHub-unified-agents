import { NativeModule, requireNativeModule } from 'expo';

import { VerifiedIdentity } from './ChatGptAuth.types';

declare class ChatGptAuthModule extends NativeModule {
  verifyIdentity(idToken: string, clientId: string, nonce: string | null): Promise<VerifiedIdentity>;
}

export default requireNativeModule<ChatGptAuthModule>('ChatGptAuth');
