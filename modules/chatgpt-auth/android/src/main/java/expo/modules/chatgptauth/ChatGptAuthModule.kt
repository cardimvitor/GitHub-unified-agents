package expo.modules.chatgptauth

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.Executors

class ChatGptAuthModule : Module() {
  private var callbackServer: ServerSocket? = null
  private val executor = Executors.newSingleThreadExecutor()
  override fun definition() = ModuleDefinition {
    Name("ChatGptAuth")

    Events("onOAuthCallback", "onOAuthError")

    AsyncFunction("startCallbackListener") {
      callbackServer?.close()
      val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
      callbackServer = server
      executor.execute { acceptCallback(server) }
      mapOf("redirectUri" to "http://127.0.0.1:${server.localPort}/auth/callback")
    }
    AsyncFunction("stopCallbackListener") {
      callbackServer?.close()
      callbackServer = null
    }
  }

  private fun acceptCallback(server: ServerSocket) {
    try {
      server.accept().use { socket ->
        val target = socket.getInputStream().bufferedReader().readLine().orEmpty().split(" ").getOrNull(1).orEmpty()
        val uri = Uri.parse("http://127.0.0.1$target")
        val code = uri.getQueryParameter("code")
        val state = uri.getQueryParameter("state")
        val clientId = uri.getQueryParameter("client_id")
        val error = uri.getQueryParameter("error")
        val body = if (error == null) "Authorization received. Return to the app." else "Authorization cancelled."
        socket.getOutputStream().bufferedWriter().use { writer -> writer.write("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.toByteArray().size}\r\nConnection: close\r\n\r\n$body"); writer.flush() }
        if (error != null || code == null || state == null || clientId == null) sendEvent("onOAuthError", mapOf("error" to (error ?: "Incomplete OAuth response"))) else sendEvent("onOAuthCallback", mapOf("code" to code, "state" to state, "clientId" to clientId))
      }
    } catch (error: Exception) { if (!server.isClosed) sendEvent("onOAuthError", mapOf("error" to (error.message ?: "OAuth callback failed"))) }
    finally { if (callbackServer == server) callbackServer = null }
  }
}
