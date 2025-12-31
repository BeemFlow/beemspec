import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, updateActivitySchema, isValidUuid, invalidIdResponse, pickDefined } from '@/lib/validations'
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors'

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
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Activity')
    }
    return serverErrorResponse('Failed to update activity', error)
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
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Activity')
    }
    return serverErrorResponse('Failed to delete activity', error)
  }
  return NextResponse.json({ success: true, deleted: data })
}
