// Trading sessions calculator (UTC based)

export interface SessionState {
  name: string
  city: string
  openUtc: number
  closeUtc: number
  active: boolean
  progress: number // 0..1
  nextOpen: string // ISO
}

const SESSIONS = [
  { name: 'Sydney', city: 'Sydney', openUtc: 21, closeUtc: 6 },
  { name: 'Tokyo', city: 'Tokyo', openUtc: 0, closeUtc: 9 },
  { name: 'London', city: 'London', openUtc: 7, closeUtc: 16 },
  { name: 'New York', city: 'New York', openUtc: 12, closeUtc: 21 },
]

export function getSessions(now: Date = new Date()): SessionState[] {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60
  return SESSIONS.map((s) => {
    let active: boolean
    let progress = 0
    if (s.openUtc < s.closeUtc) {
      active = h >= s.openUtc && h < s.closeUtc
      if (active) progress = (h - s.openUtc) / (s.closeUtc - s.openUtc)
    } else {
      active = h >= s.openUtc || h < s.closeUtc
      if (active) {
        progress = h >= s.openUtc ? (h - s.openUtc) / (24 - s.openUtc + s.closeUtc) : (24 - s.openUtc + h) / (24 - s.openUtc + s.closeUtc)
      }
    }
    // next open
    let nextOpen: Date
    if (active) {
      nextOpen = new Date(now)
      nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
      nextOpen.setUTCHours(s.openUtc, 0, 0, 0)
    } else {
      nextOpen = new Date(now)
      if (h > s.openUtc) nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
      nextOpen.setUTCHours(s.openUtc, 0, 0, 0)
    }
    return { ...s, active, progress: Number(progress.toFixed(3)), nextOpen: nextOpen.toISOString() }
  })
}

export function getOverlap(now: Date = new Date()): SessionState {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60
  // London 7-16, NY 12-21 → overlap 12-16
  const open = 12
  const close = 16
  const active = h >= open && h < close
  const progress = active ? (h - open) / (close - open) : 0
  const nextOpen = new Date(now)
  if (h >= open) nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
  nextOpen.setUTCHours(open, 0, 0, 0)
  return { name: 'Overlap', city: 'London-NY', openUtc: open, closeUtc: close, active, progress: Number(progress.toFixed(3)), nextOpen: nextOpen.toISOString() }
}

export function isScalpingWindow(now: Date = new Date()): boolean {
  // London + Overlap = 7-16 UTC
  const h = now.getUTCHours()
  return h >= 7 && h < 16
}
