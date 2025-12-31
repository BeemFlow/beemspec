import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, createPersonaSchema } from '@/lib/validations'

export async function POST(request: Request) {
  const validation = await validateRequest(request, createPersonaSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('personas')
    .insert({
      story_map_id: validation.data.story_map_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
      goals: validation.data.goals ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/personas:', error)
    return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 })
  }
  return NextResponse.json(data)
}
