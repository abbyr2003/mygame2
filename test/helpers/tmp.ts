import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export const tempDir = (): Promise<string> => mkdtemp(join(tmpdir(), 'spirit-keep-'))
