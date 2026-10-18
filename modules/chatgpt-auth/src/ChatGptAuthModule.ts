import { NativeModule, requireNativeModule } from 'expo';

import { ChatGptAuthModuleEvents, VerifiedIdentity } from './ChatGptAuth.types';

declare class ChatGptAuthModule extends NativeModule<ChatGptAuthModuleEvents> {
  startCallbackListener(): Promise<{ redirectUri: string }>;
  stopCallbackListener(): Promise<void>;
  verifyIdentity(idToken: string, clientId: string, nonce: string): Promise<VerifiedIdentity>;
}

export default requireNativeModule<ChatGptAuthModule>('ChatGptAuth');
