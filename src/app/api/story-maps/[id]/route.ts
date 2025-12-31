import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, updateStoryMapSchema, isValidUuid, invalidIdResponse, pickDefined } from '@/lib/validations'
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors'
import type { StoryMapFull } from '@/types'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const supabase = await createClient()

  const [mapResult, activitiesResult, releasesResult, personasResult] = await Promise.all([
    supabase.from('story_maps').select('*').eq('id', id).single(),
    supabase
      .from('activities')
      .select(`*, tasks(*, stories(*))`)
      .eq('story_map_id', id)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'tasks' })
      .order('sort_order', { referencedTable: 'tasks.stories' }),
    supabase.from('releases').select('*').eq('story_map_id', id).order('sort_order'),
    supabase.from('personas').select('*').eq('story_map_id', id).order('sort_order'),
  ])

  // Check main map first
  if (mapResult.error) {
    if (mapResult.error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story map')
    }
    return serverErrorResponse('Failed to load story map', mapResult.error)
  }

  // Check related data
  if (activitiesResult.error) {
    return serverErrorResponse('Failed to load activities', activitiesResult.error)
  }
  if (releasesResult.error) {
    return serverErrorResponse('Failed to load releases', releasesResult.error)
  }
  if (personasResult.error) {
    return serverErrorResponse('Failed to load personas', personasResult.error)
  }

  const fullMap: StoryMapFull = {
    ...mapResult.data,
    activities: activitiesResult.data,
    releases: releasesResult.data,
    personas: personasResult.data,
  }

  return NextResponse.json(fullMap)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const validation = await validateRequest(request, updateStoryMapSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const updateData = {
    ...pickDefined(validation.data),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('story_maps')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story map')
    }
    return serverErrorResponse('Failed to update story map', error)
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUuid(id)) return invalidIdResponse()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_maps')
    .delete()
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story map')
    }
    return serverErrorResponse('Failed to delete story map', error)
  }
  return NextResponse.json({ success: true, deleted: data })
}
