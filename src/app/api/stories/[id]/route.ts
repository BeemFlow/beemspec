import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.from('stories').select('*').eq('id', id).single()

  if (error) {
    console.error('GET /api/stories/[id]:', error)
    return NextResponse.json({ error: 'Failed to load story' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('stories')
    .update({
      task_id: body.task_id,
      release_id: body.release_id,
      title: body.title,
      requirements: body.requirements,
      acceptance_criteria: body.acceptance_criteria,
      figma_link: body.figma_link,
      edge_cases: body.edge_cases,
      technical_guidelines: body.technical_guidelines,
      status: body.status,
      sort_order: body.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('PUT /api/stories/[id]:', error)
    return NextResponse.json({ error: 'Failed to update story' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { error } = await supabase.from('stories').delete().eq('id', id)

  if (error) {
    console.error('DELETE /api/stories/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete story' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
