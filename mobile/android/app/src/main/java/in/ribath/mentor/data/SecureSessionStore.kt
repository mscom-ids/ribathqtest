package `in`.ribath.mentor.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("mobile_session_v1", Context.MODE_PRIVATE)
    private val alias = "ribath_mobile_refresh_v1"

    fun installationId(): String {
        preferences.getString("installation_id", null)?.let { return it }
        val value = UUID.randomUUID().toString()
        check(preferences.edit().putString("installation_id", value).commit())
        return value
    }

    fun save(session: StoredSession) {
        val encrypted = encrypt(session.refreshToken)
        check(
            preferences.edit()
                .putString("device_id", session.deviceId)
                .putString("refresh_token", encrypted)
                .commit()
        )
    }

    fun read(): StoredSession? {
        val deviceId = preferences.getString("device_id", null) ?: return null
        val encrypted = preferences.getString("refresh_token", null) ?: return null
        return runCatching { StoredSession(deviceId, decrypt(encrypted)) }.getOrNull()
    }

    fun clear() {
        preferences.edit().remove("device_id").remove("refresh_token").commit()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val combined = cipher.iv + cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String {
        val combined = Base64.decode(value, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, 12)
        val ciphertext = combined.copyOfRange(12, combined.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
    }
}
