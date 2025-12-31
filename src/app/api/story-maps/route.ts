import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, createStoryMapSchema } from '@/lib/validations'

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
  const validation = await validateRequest(request, createStoryMapSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_maps')
    .insert({
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/story-maps:', error)
    return NextResponse.json({ error: 'Failed to create story map' }, { status: 500 })
  }
  return NextResponse.json(data)
}
