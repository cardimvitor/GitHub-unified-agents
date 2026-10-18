import { NativeModule, requireNativeModule } from 'expo';

import { ChatGptAuthModuleEvents } from './ChatGptAuth.types';

declare class ChatGptAuthModule extends NativeModule<ChatGptAuthModuleEvents> {
  startCallbackListener(): Promise<{ redirectUri: string }>;
  stopCallbackListener(): Promise<void>;
}

export default requireNativeModule<ChatGptAuthModule>('ChatGptAuth');
