import { join } from 'path'

export const keepRoot = (documentsDir: string): string => join(documentsDir, 'Spirit Keep')

export const keepPaths = (root: string) => ({
  state: join(root, 'keep.json'),
  secrets: join(root, 'secrets.bin'),
  companions: join(root, 'companions'),
  companionDir: (id: string) => join(root, 'companions', id),
  profile: (id: string) => join(root, 'companions', id, 'profile.json'),
  memory: (id: string) => join(root, 'companions', id, 'memory.json'),
  letters: join(root, 'letters'),
  letter: (id: string) => join(root, 'letters', `${id}.json`),
  messages: join(root, 'messages'),
  thread: (companionId: string) => join(root, 'messages', `${companionId}.json`),
  source: join(root, 'source'),
  conversation: (id: string) => join(root, 'source', `${id}.json`),
  library: join(root, 'library'),
  reading: (id: string) => join(root, 'library', `${id}.json`),
  akashicMemory: join(root, 'akashic-memory.json'),
  pending: join(root, 'pending.json')
})

export type KeepPaths = ReturnType<typeof keepPaths>
