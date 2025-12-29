import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const { story_map_id, order } = body as { story_map_id: string; order: string[] }

  const updates = order.map((id, index) =>
    supabase.from('activities').update({ sort_order: index }).eq('id', id).eq('story_map_id', story_map_id)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    console.error('PUT /api/activities:', failed.error)
    return NextResponse.json({ error: 'Failed to reorder activities' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('activities')
    .insert({
      story_map_id: body.story_map_id,
      name: body.name,
      description: body.description,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/activities:', error)
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })
  }
  return NextResponse.json(data)
}
