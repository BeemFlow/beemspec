import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const body = await request.json()

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('releases')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('PUT /api/releases/[id]:', error)
    return NextResponse.json({ error: 'Failed to update release' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Verify release exists first
  const { data: release, error: fetchError } = await supabase
    .from('releases')
    .select('id')
    .eq('id', id)
    .single()

  if (fetchError || !release) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 })
  }

  // Delete all stories in this release first
  // Note: Not atomic - if release delete fails, stories are already gone
  // @TODO: For true atomicity, use a Supabase RPC DB function with BEGIN/COMMIT
  const { error: storiesError } = await supabase
    .from('stories')
    .delete()
    .eq('release_id', id)

  if (storiesError) {
    console.error('DELETE /api/releases/[id] stories:', storiesError)
    return NextResponse.json({ error: 'Failed to delete release stories' }, { status: 500 })
  }

  // Then delete the release
  const { error } = await supabase.from('releases').delete().eq('id', id)

  if (error) {
    console.error('DELETE /api/releases/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete release' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
