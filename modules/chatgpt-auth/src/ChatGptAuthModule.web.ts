import { registerWebModule, NativeModule } from 'expo';

// ChatGptAuthModule is not available on the web platform.
class ChatGptAuthModule extends NativeModule {}

export default registerWebModule(ChatGptAuthModule, 'ChatGptAuthModule');
