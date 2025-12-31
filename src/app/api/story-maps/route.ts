import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateRequest, createStoryMapSchema } from '@/lib/validations'
import { serverErrorResponse } from '@/lib/errors'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_maps')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    return serverErrorResponse('Failed to load story maps', error)
  }
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const validation = await validateRequest(request, createStoryMapSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('story_maps')
    .insert({
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single()

  if (error) {
    return serverErrorResponse('Failed to create story map', error)
  }
  return NextResponse.json(data)
}
