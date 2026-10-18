package expo.modules.chatgptauth

import android.net.Uri
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URL
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.RSAPublicKeySpec
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

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
    AsyncFunction("verifyIdentity") { idToken: String, clientId: String, nonce: String ->
      verifyIdentity(idToken, clientId, nonce)
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
        if (error != null || code == null || state == null) {
          sendEvent("onOAuthError", mapOf("error" to (error ?: "Incomplete OAuth response")))
        } else {
          val payload = mutableMapOf("code" to code, "state" to state)
          if (clientId != null) payload["clientId"] = clientId
          sendEvent("onOAuthCallback", payload)
        }
      }
    } catch (error: Exception) { if (!server.isClosed) sendEvent("onOAuthError", mapOf("error" to (error.message ?: "OAuth callback failed"))) }
    finally { if (callbackServer == server) callbackServer = null }
  }

  private fun verifyIdentity(idToken: String, clientId: String, nonce: String): Map<String, String?> {
    val parts = idToken.split('.')
    require(parts.size == 3) { "ID token inválido." }
    val header = JSONObject(String(decodeBase64Url(parts[0])))
    require(header.optString("alg") == "RS256") { "Algoritmo de ID token não suportado." }
    val kid = header.optString("kid")
    require(kid.isNotBlank()) { "ID token sem identificador de chave." }

    val key = fetchJwks().firstOrNull { it.optString("kid") == kid }
      ?: throw IllegalArgumentException("A chave de assinatura do ChatGPT não foi encontrada.")
    val modulus = BigInteger(1, decodeBase64Url(key.getString("n")))
    val exponent = BigInteger(1, decodeBase64Url(key.getString("e")))
    val publicKey = KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(modulus, exponent))
    val signature = Signature.getInstance("SHA256withRSA")
    signature.initVerify(publicKey)
    signature.update("${parts[0]}.${parts[1]}".toByteArray(Charsets.US_ASCII))
    require(signature.verify(decodeBase64Url(parts[2]))) { "A assinatura do ID token não é válida." }

    val claims = JSONObject(String(decodeBase64Url(parts[1])))
    require(claims.optString("iss") == "https://auth.openai.com") { "Emissor do ID token inválido." }
    require(audienceContains(claims.opt("aud"), clientId)) { "Público do ID token inválido." }
    require(claims.optString("nonce") == nonce) { "Nonce do ID token inválido." }
    require(claims.optLong("exp", 0) * 1000L > System.currentTimeMillis() - 60_000L) { "ID token expirado." }
    val subject = claims.optString("sub")
    require(subject.isNotBlank()) { "ID token sem identidade." }
    return mapOf("subject" to subject, "email" to claims.optString("email", null))
  }

  private fun audienceContains(audience: Any?, expected: String): Boolean = when (audience) {
    is String -> audience == expected
    is JSONArray -> (0 until audience.length()).any { audience.optString(it) == expected }
    else -> false
  }

  private fun fetchJwks(): List<JSONObject> {
    val connection = (URL("https://auth.openai.com/.well-known/jwks.json").openConnection() as HttpsURLConnection).apply {
      connectTimeout = 10_000
      readTimeout = 10_000
      requestMethod = "GET"
    }
    try {
      require(connection.responseCode == 200) { "Não foi possível obter as chaves do ChatGPT." }
      val keys = JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).getJSONArray("keys")
      return (0 until keys.length()).map { keys.getJSONObject(it) }
    } finally { connection.disconnect() }
  }

  private fun decodeBase64Url(value: String): ByteArray = Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
