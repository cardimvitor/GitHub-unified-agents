import { registerWebModule, NativeModule } from 'expo';

import { ChatGptAuthModuleEvents } from './ChatGptAuth.types';

// ChatGptAuthModule is not available on the web platform.
class ChatGptAuthModule extends NativeModule<ChatGptAuthModuleEvents> {}

export default registerWebModule(ChatGptAuthModule, 'ChatGptAuthModule');
