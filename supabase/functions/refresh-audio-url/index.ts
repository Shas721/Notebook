import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authenticated user:', user.id)

    const { notebookId } = await req.json()

    if (!notebookId) {
      throw new Error('Notebook ID is required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: notebook, error: fetchError } = await supabase
      .from('notebooks')
      .select('audio_overview_url, user_id')
      .eq('id', notebookId)
      .single()

    if (fetchError) {
      console.error('Error fetching notebook:', fetchError)
      throw new Error('Failed to fetch notebook')
    }

    if (notebook.user_id !== user.id) {
      console.error('User does not own this notebook:', { userId: user.id, ownerId: notebook.user_id })
      return new Response(
        JSON.stringify({ error: 'Forbidden - you do not own this notebook' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!notebook.audio_overview_url) {
      throw new Error('No audio overview URL found')
    }

    const urlParts = notebook.audio_overview_url.split('/')
    const bucketIndex = urlParts.findIndex(part => part === 'audio')

    if (bucketIndex === -1) {
      throw new Error('Invalid audio URL format')
    }

    const filePath = urlParts.slice(bucketIndex + 1).join('/')

    console.log('Refreshing signed URL for path:', filePath)

    const { data: signedUrlData, error: signError } = await supabase.storage
      .from('audio')
      .createSignedUrl(filePath, 86400)

    if (signError) {
      console.error('Error creating signed URL:', signError)
      throw new Error('Failed to create signed URL')
    }

    const newExpiryTime = new Date()
    newExpiryTime.setHours(newExpiryTime.getHours() + 24)

    const { error: updateError } = await supabase
      .from('notebooks')
      .update({
        audio_overview_url: signedUrlData.signedUrl,
        audio_url_expires_at: newExpiryTime.toISOString()
      })
      .eq('id', notebookId)

    if (updateError) {
      console.error('Error updating notebook:', updateError)
      throw new Error('Failed to update notebook with new URL')
    }

    console.log('Successfully refreshed audio URL for notebook:', notebookId)

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: signedUrlData.signedUrl,
        expiresAt: newExpiryTime.toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in refresh-audio-url function:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to refresh audio URL'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
