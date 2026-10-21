import { describe, it, expect, vi } from 'vitest'
import { readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { readJson, writeJson } from '../../../src/main/keep/atomic'
import { tempDir } from '../../helpers/tmp'

describe('atomic json', () => {
  it('writeJson then readJson round-trips', async () => {
    const file = join(await tempDir(), 'a.json')
    await writeJson(file, { name: 'Elara', n: 3 })
    expect(await readJson(file, null)).toEqual({ name: 'Elara', n: 3 })
  })

  it('writeJson leaves no .tmp file behind', async () => {
    const dir = await tempDir()
    await writeJson(join(dir, 'a.json'), { a: 1 })
    expect(await readdir(dir)).toEqual(['a.json'])
  })

  it('readJson returns fallback for missing file', async () => {
    expect(await readJson(join(await tempDir(), 'nope.json'), { x: 1 })).toEqual({ x: 1 })
  })

  it('readJson returns fallback and logs for corrupt JSON', async () => {
    const file = join(await tempDir(), 'bad.json')
    await writeFile(file, '{"name": "Ela')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await readJson(file, 'fallback')).toBe('fallback')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
