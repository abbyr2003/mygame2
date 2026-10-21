import { readFile, rename, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return fallback
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.warn(`Spirit Keep: skipping unreadable file ${file}`, err)
    return fallback
  }
}

// Write to a temp file first, then rename, so a crash never leaves half a file.
export async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, file)
}
