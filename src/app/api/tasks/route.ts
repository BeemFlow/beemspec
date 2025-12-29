import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const { activity_id, order } = body as { activity_id: string; order: string[] }

  const updates = order.map((id, index) =>
    supabase.from('tasks').update({ sort_order: index }).eq('id', id).eq('activity_id', activity_id)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    console.error('PUT /api/tasks:', failed.error)
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      activity_id: body.activity_id,
      name: body.name,
      description: body.description,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/tasks:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
  return NextResponse.json(data)
}
