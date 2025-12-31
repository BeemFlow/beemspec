import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateRequest,
  updateActivitySchema,
  isValidUuid,
  invalidIdResponse,
  pickDefined,
} from '@/lib/validations'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const validation = await validateRequest(request, updateActivitySchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activities')
    .update(pickDefined(validation.data))
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
    }
    console.error('PUT /api/activities/[id]:', error)
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activities')
    .delete()
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
    }
    console.error('DELETE /api/activities/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete activity' }, { status: 500 })
  }
  return NextResponse.json({ success: true, deleted: data })
}
