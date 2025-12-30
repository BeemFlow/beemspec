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

  const { error } = await supabase.rpc('delete_release', { p_release_id: id })

  if (error) {
    if (error.code === 'P0002') {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }
    console.error('DELETE /api/releases/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete release' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
