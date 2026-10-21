import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'

// The subset of Electron's safeStorage we use; injectable for tests.
export interface SecretCrypto {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}

export class Secrets {
  constructor(
    private readonly file: string,
    private readonly crypto: SecretCrypto
  ) {}

  async setApiKey(key: string): Promise<void> {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error('Windows encryption is not available, so the key cannot be stored safely.')
    }
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, this.crypto.encryptString(key.trim()))
  }

  async getApiKey(): Promise<string | null> {
    let data: Buffer
    try {
      data = await readFile(this.file)
    } catch {
      return null
    }
    return this.crypto.decryptString(data)
  }

  async hasApiKey(): Promise<boolean> {
    return (await this.getApiKey()) !== null
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true })
  }
}
