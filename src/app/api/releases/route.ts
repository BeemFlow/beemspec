import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, reorderReleasesSchema, createReleaseSchema } from '@/lib/validations'
import { serverErrorResponse } from '@/lib/errors'

export async function PUT(request: Request) {
  const validation = await validateRequest(request, reorderReleasesSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_releases', {
    p_story_map_id: validation.data.story_map_id,
    p_order: validation.data.order,
  })

  if (error) {
    return serverErrorResponse('Failed to reorder releases', error)
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const validation = await validateRequest(request, createReleaseSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('releases')
    .insert({
      story_map_id: validation.data.story_map_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single()

  if (error) {
    return serverErrorResponse('Failed to create release', error)
  }
  return NextResponse.json(data)
}
