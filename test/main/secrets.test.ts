import { describe, it, expect } from 'vitest'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { Secrets } from '../../src/main/secrets'
import { tempDir } from '../helpers/tmp'

const fakeCrypto = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s: string) => Buffer.from(s.split('').reverse().join(''), 'utf8'),
  decryptString: (b: Buffer) => b.toString('utf8').split('').reverse().join('')
})

describe('Secrets', () => {
  it('stores and returns key via crypto', async () => {
    const file = join(await tempDir(), 'secrets.bin')
    const s = new Secrets(file, fakeCrypto())
    await s.setApiKey('sk-ant-secret')
    expect(await s.getApiKey()).toBe('sk-ant-secret')
    expect(await s.hasApiKey()).toBe(true)
    expect((await readFile(file)).toString('utf8')).not.toContain('sk-ant-secret')
  })

  it('getApiKey returns null when no file', async () => {
    const s = new Secrets(join(await tempDir(), 'secrets.bin'), fakeCrypto())
    expect(await s.getApiKey()).toBeNull()
    expect(await s.hasApiKey()).toBe(false)
  })

  it('setApiKey trims whitespace', async () => {
    const s = new Secrets(join(await tempDir(), 'secrets.bin'), fakeCrypto())
    await s.setApiKey('  sk-ant-x \n')
    expect(await s.getApiKey()).toBe('sk-ant-x')
  })

  it('setApiKey throws when encryption unavailable', async () => {
    const s = new Secrets(join(await tempDir(), 'secrets.bin'), fakeCrypto(false))
    await expect(s.setApiKey('k')).rejects.toThrow()
  })

  it('clear removes the key', async () => {
    const s = new Secrets(join(await tempDir(), 'secrets.bin'), fakeCrypto())
    await s.setApiKey('k')
    await s.clear()
    expect(await s.getApiKey()).toBeNull()
  })
})
