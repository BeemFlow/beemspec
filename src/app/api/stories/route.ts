import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const { task_id, release_id, order } = body as { task_id: string; release_id: string | null; order: string[] }

  const { error } = await supabase.rpc('reorder_stories', {
    p_task_id: task_id,
    p_release_id: release_id,
    p_order: order,
  })

  if (error) {
    console.error('PUT /api/stories:', error)
    return NextResponse.json({ error: 'Failed to reorder stories' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('stories')
    .insert({
      task_id: body.task_id,
      release_id: body.release_id,
      title: body.title,
      requirements: body.requirements,
      acceptance_criteria: body.acceptance_criteria,
      figma_link: body.figma_link,
      edge_cases: body.edge_cases,
      technical_guidelines: body.technical_guidelines,
      status: body.status ?? 'backlog',
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/stories:', error)
    return NextResponse.json({ error: 'Failed to create story' }, { status: 500 })
  }
  return NextResponse.json(data)
}
