import { NextResponse } from 'next/server'

// Transcription is now handled directly in /api/meetings/transcribe/upload
export async function POST() {
  return NextResponse.json({ error: 'Gone — use /api/meetings/transcribe/upload' }, { status: 410 })
}
