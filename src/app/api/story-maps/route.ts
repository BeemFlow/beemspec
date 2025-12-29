import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_maps')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('GET /api/story-maps:', error)
    return NextResponse.json({ error: 'Failed to load story maps' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('story_maps')
    .insert({ name: body.name, description: body.description })
    .select()
    .single()

  if (error) {
    console.error('POST /api/story-maps:', error)
    return NextResponse.json({ error: 'Failed to create story map' }, { status: 500 })
  }
  return NextResponse.json(data)
}
