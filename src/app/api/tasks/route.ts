import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, reorderTasksSchema, createTaskSchema } from '@/lib/validations'

export async function PUT(request: Request) {
  const validation = await validateRequest(request, reorderTasksSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_tasks', {
    p_activity_id: validation.data.activity_id,
    p_order: validation.data.order,
  })

  if (error) {
    console.error('PUT /api/tasks:', error)
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const validation = await validateRequest(request, createTaskSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      activity_id: validation.data.activity_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/tasks:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
  return NextResponse.json(data)
}
