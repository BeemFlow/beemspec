import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('releases')
    .insert({
      story_map_id: body.story_map_id,
      name: body.name,
      description: body.description,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/releases:', error)
    return NextResponse.json({ error: 'Failed to create release' }, { status: 500 })
  }
  return NextResponse.json(data)
}
