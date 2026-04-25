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
    const body = await req.json()
    console.log('Audio generation callback received:', body)

    const { notebook_id, audio_url, status, error } = body

    if (!notebook_id) {
      return new Response(
        JSON.stringify({ error: 'Notebook ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (status === 'success' && audio_url) {
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24)

      const { error: updateError } = await supabase
        .from('notebooks')
        .update({
          audio_overview_url: audio_url,
          audio_url_expires_at: expiresAt.toISOString(),
          audio_overview_generation_status: 'completed'
        })
        .eq('id', notebook_id)

      if (updateError) {
        console.error('Error updating notebook with audio URL:', updateError)
        throw updateError
      }

      console.log('Audio overview completed successfully for notebook:', notebook_id)
    } else {
      const { error: updateError } = await supabase
        .from('notebooks')
        .update({
          audio_overview_generation_status: 'failed'
        })
        .eq('id', notebook_id)

      if (updateError) {
        console.error('Error updating notebook status to failed:', updateError)
        throw updateError
      }

      console.log('Audio generation failed for notebook:', notebook_id, 'Error:', error)
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in audio-generation-callback:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process callback'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
