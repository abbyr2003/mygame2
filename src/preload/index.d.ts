import type { SpiritKeepApi } from '../shared/api'

declare global {
  interface Window {
    keep: SpiritKeepApi
  }
}
