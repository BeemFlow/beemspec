import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, reorderStoriesSchema, createStorySchema } from '@/lib/validations'

export async function PUT(request: Request) {
  const validation = await validateRequest(request, reorderStoriesSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_stories', {
    p_task_id: validation.data.task_id,
    p_release_id: validation.data.release_id,
    p_order: validation.data.order,
  })

  if (error) {
    console.error('PUT /api/stories:', error)
    return NextResponse.json({ error: 'Failed to reorder stories' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const validation = await validateRequest(request, createStorySchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stories')
    .insert({
      task_id: validation.data.task_id,
      release_id: validation.data.release_id ?? null,
      title: validation.data.title,
      requirements: validation.data.requirements,
      acceptance_criteria: validation.data.acceptance_criteria,
      figma_link: validation.data.figma_link ?? null,
      edge_cases: validation.data.edge_cases ?? null,
      technical_guidelines: validation.data.technical_guidelines ?? null,
      status: validation.data.status,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/stories:', error)
    return NextResponse.json({ error: 'Failed to create story' }, { status: 500 })
  }
  return NextResponse.json(data)
}
