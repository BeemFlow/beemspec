import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, updateReleaseSchema, isValidUuid, invalidIdResponse, pickDefined } from '@/lib/validations'
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors'

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
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Release')
    }
    return serverErrorResponse('Failed to update release', error)
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_release', { p_release_id: id })

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND || error.code === DbErrorCode.RPC_NOT_FOUND) {
      return notFoundResponse('Release')
    }
    return serverErrorResponse('Failed to delete release', error)
  }
  return NextResponse.json({ success: true })
}
