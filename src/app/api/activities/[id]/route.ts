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
    .from('activities')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('PUT /api/activities/[id]:', error)
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { error } = await supabase.from('activities').delete().eq('id', id)

  if (error) {
    console.error('DELETE /api/activities/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete activity' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
