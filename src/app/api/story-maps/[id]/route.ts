import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateRequest,
  updateStoryMapSchema,
  isValidUuid,
  invalidIdResponse,
  pickDefined,
} from '@/lib/validations'

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

  if (mapResult.error) {
    if (mapResult.error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Story map not found' }, { status: 404 })
    }
    console.error('GET /api/story-maps/[id]:', mapResult.error)
    return NextResponse.json({ error: 'Failed to load story map' }, { status: 500 })
  }

  return NextResponse.json({
    ...mapResult.data,
    activities: activitiesResult.data ?? [],
    releases: releasesResult.data ?? [],
    personas: personasResult.data ?? [],
  })
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
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Story map not found' }, { status: 404 })
    }
    console.error('PUT /api/story-maps/[id]:', error)
    return NextResponse.json({ error: 'Failed to update story map' }, { status: 500 })
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
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Story map not found' }, { status: 404 })
    }
    console.error('DELETE /api/story-maps/[id]:', error)
    return NextResponse.json({ error: 'Failed to delete story map' }, { status: 500 })
  }
  return NextResponse.json({ success: true, deleted: data })
}
