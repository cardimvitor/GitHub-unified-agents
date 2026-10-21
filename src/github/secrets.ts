import * as Crypto from 'expo-crypto'
import nacl from 'tweetnacl'
import blake from 'blakejs/blake2b'

// No React Native o tweetnacl não encontra um gerador de números aleatórios e falha com "no PRNG".
// Usamos o gerador nativo do expo-crypto.
nacl.setPRNG((output: Uint8Array, length: number) => { output.set(Crypto.getRandomBytes(length)) })

const encoder = new TextEncoder()

function fromBase64(value: string) {
  const binary = globalThis.atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64(value: Uint8Array) {
  let binary = ''
  value.forEach((byte) => { binary += String.fromCharCode(byte) })
  return globalThis.btoa(binary)
}

function seal(message: Uint8Array, publicKey: Uint8Array) {
  const ephemeral = nacl.box.keyPair()
  const state = blake.blake2bInit(nacl.box.nonceLength, null)
  blake.blake2bUpdate(state, ephemeral.publicKey)
  blake.blake2bUpdate(state, publicKey)
  const nonce = blake.blake2bFinal(state)
  const encrypted = nacl.box(message, nonce, publicKey, ephemeral.secretKey)
  ephemeral.secretKey.fill(0)
  const result = new Uint8Array(ephemeral.publicKey.length + encrypted.length)
  result.set(ephemeral.publicKey)
  result.set(encrypted, ephemeral.publicKey.length)
  return result
}

// Cifra o valor com a chave pública do repositório ou do environment (libsodium sealed box).
export function sealSecretValue(value: string, publicKeyBase64: string) {
  return toBase64(seal(encoder.encode(value), fromBase64(publicKeyBase64)))
}

// Grava um secret num environment. O valor nunca é lido de volta.
export async function setEnvironmentSecret(token: string, repositoryId: number, environment: string, name: string, value: string) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  const keyResponse = await fetch(`https://api.github.com/repositories/${repositoryId}/environments/${environment}/secrets/public-key`, { headers })
  if (!keyResponse.ok) throw new Error(`Could not access the key for environment ${environment} (${keyResponse.status}).`)
  const key = await keyResponse.json() as { key_id: string; key: string }
  const response = await fetch(`https://api.github.com/repositories/${repositoryId}/environments/${environment}/secrets/${name}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: sealSecretValue(value, key.key), key_id: key.key_id })
  })
  if (!response.ok) throw new Error(`GitHub did not accept the secret in environment ${environment} (${response.status}).`)
}

export async function setRepositorySecret(token: string, owner: string, repo: string, name: string, value: string) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  const keyResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`, { headers })
  if (!keyResponse.ok) throw new Error(`Could not access GitHub's secrets key (${keyResponse.status}).`)
  const key = await keyResponse.json() as { key_id: string; key: string }
  const encrypted = toBase64(seal(encoder.encode(value), fromBase64(key.key)))
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/secrets/${name}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ encrypted_value: encrypted, key_id: key.key_id })
  })
  if (!response.ok) throw new Error(`GitHub did not accept the secret (${response.status}). Check your access to the repository.`)
}
