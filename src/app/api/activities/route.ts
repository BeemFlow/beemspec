import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, reorderActivitiesSchema, createActivitySchema } from '@/lib/validations'

export async function PUT(request: Request) {
  const validation = await validateRequest(request, reorderActivitiesSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_activities', {
    p_story_map_id: validation.data.story_map_id,
    p_order: validation.data.order,
  })

  if (error) {
    console.error('PUT /api/activities:', error)
    return NextResponse.json({ error: 'Failed to reorder activities' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const validation = await validateRequest(request, createActivitySchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activities')
    .insert({
      story_map_id: validation.data.story_map_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/activities:', error)
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 })
  }
  return NextResponse.json(data)
}
