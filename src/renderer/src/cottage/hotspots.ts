export type RoomId = 'letters' | 'messages' | 'source' | 'library' | 'contacts' | 'settings'

export interface Hotspot {
  room: RoomId
  label: string
  // Percentages of the cottage image.
  left: number
  top: number
  width: number
  height: number
}

export interface Fit {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export const IMAGE_WIDTH = 1627
export const IMAGE_HEIGHT = 967

export const HOTSPOTS: Hotspot[] = [
  { room: 'letters', label: 'The Writing Desk', left: 73.4, top: 45.5, width: 11.7, height: 12.5 },
  { room: 'messages', label: 'The Scrying Mirror', left: 24.9, top: 26.4, width: 4.9, height: 12.9 },
  { room: 'source', label: 'The Crystal Ball', left: 79.9, top: 39.8, width: 3.1, height: 5.7 },
  { room: 'library', label: 'The Akashic Shelf', left: 13.2, top: 21.7, width: 11.1, height: 36.2 },
  { room: 'contacts', label: 'The Keeper', left: 12.0, top: 60.5, width: 9.2, height: 8.3 },
  { room: 'settings', label: 'The Hearth', left: 1.8, top: 45.5, width: 8.9, height: 20.7 }
]

/** Scale the image to fit inside the view without stretching, centered. */
export function fitImage(viewW: number, viewH: number, imgW: number, imgH: number): Fit {
  const scale = Math.min(viewW / imgW, viewH / imgH)
  const width = imgW * scale
  const height = imgH * scale
  return { width, height, offsetX: (viewW - width) / 2, offsetY: (viewH - height) / 2 }
}

export function hotspotRect(h: Hotspot, fit: Fit): Rect {
  return {
    left: fit.offsetX + (h.left / 100) * fit.width,
    top: fit.offsetY + (h.top / 100) * fit.height,
    width: (h.width / 100) * fit.width,
    height: (h.height / 100) * fit.height
  }
}
