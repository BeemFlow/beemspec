import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateRequest,
  updateReleaseSchema,
  isValidUuid,
  invalidIdResponse,
  pickDefined,
} from '@/lib/validations'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const validation = await validateRequest(request, updateReleaseSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('releases')
    .update(pickDefined(validation.data))
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }
    console.error('PUT /api/releases/[id]:', error)
    return NextResponse.json({ error: 'Failed to update release' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

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
