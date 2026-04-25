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
    const payload = await req.json()
    console.log('Document processing callback received:', payload);

    const { source_id, content, summary, display_name, title, status, error } = payload

    if (!source_id) {
      return new Response(
        JSON.stringify({ error: 'source_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const updateData: any = {
      processing_status: status || 'completed',
      updated_at: new Date().toISOString()
    }

    if (content) {
      updateData.content = content
    }

    if (summary) {
      updateData.summary = summary
    }

    if (title) {
      updateData.title = title
    } else if (display_name) {
      updateData.title = display_name
    }

    if (error) {
      updateData.processing_status = 'failed'
      console.error('Document processing failed:', error)
    }

    console.log('Updating source with data:', updateData);

    const { data, error: updateError } = await supabaseClient
      .from('sources')
      .update(updateData)
      .eq('id', source_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating source:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update source', details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Source updated successfully:', data);

    return new Response(
      JSON.stringify({ success: true, message: 'Source updated successfully', data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-document-callback function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
