import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateRequest,
  updateStorySchema,
  isValidUuid,
  invalidIdResponse,
  pickDefined,
} from '@/lib/validations'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const supabase = await createClient()
  const { data, error } = await supabase.from('stories').select('*').eq('id', id).single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }
    console.error('GET /api/stories/[id]:', error)
    return NextResponse.json({ error: 'Failed to load story' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const validation = await validateRequest(request, updateStorySchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const updateData = {
    ...pickDefined(validation.data),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('stories')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }
    console.error('PUT /api/stories/[id]:', error)
    return NextResponse.json({ error: 'Failed to update story' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stories')
    .delete()
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    }
    console.error('DELETE /api/stories/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete story' }, { status: 500 })
  }
  return NextResponse.json({ success: true, deleted: data })
}
