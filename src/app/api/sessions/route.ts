import { NextResponse } from 'next/server'
import { getSessions, getOverlap, isScalpingWindow, type SessionState } from '@/lib/sessions'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sessions: SessionState[] = getSessions()
    const overlap: SessionState = getOverlap()
    const scalpingWindow = isScalpingWindow()
    return NextResponse.json({ sessions, overlap, scalpingWindow })
  } catch (e) {
    return apiCatch(e, 'sessions', 'GET')
  }
}
