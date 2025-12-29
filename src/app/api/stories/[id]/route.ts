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

  // Only include fields that were actually provided
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.task_id !== undefined) updateData.task_id = body.task_id
  if (body.release_id !== undefined) updateData.release_id = body.release_id
  if (body.title !== undefined) updateData.title = body.title
  if (body.requirements !== undefined) updateData.requirements = body.requirements
  if (body.acceptance_criteria !== undefined) updateData.acceptance_criteria = body.acceptance_criteria
  if (body.figma_link !== undefined) updateData.figma_link = body.figma_link
  if (body.edge_cases !== undefined) updateData.edge_cases = body.edge_cases
  if (body.technical_guidelines !== undefined) updateData.technical_guidelines = body.technical_guidelines
  if (body.status !== undefined) updateData.status = body.status
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('stories')
    .update(updateData)
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
