import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StudentSearchRequest {
  query: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { query }: StudentSearchRequest = await req.json()

    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ students: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanQuery = query.trim().toLowerCase()

    // ✅ Simple fuzzy search using pg_trgm + ilike with one wildcard
    const { data: students, error } = await supabaseClient
      .from('students')
      .select('name')
      .ilike('name', `%${cleanQuery}%`)
      .eq('is_active', true)
      .order('name')
      .limit(10)

    if (error) {
      console.error('Student search error:', error)
      return new Response(
        JSON.stringify({ students: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prioritize exact/prefix matches before returning
    const sorted = (students ?? []).sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()

      if (aName === cleanQuery) return -1
      if (bName === cleanQuery) return 1
      if (aName.startsWith(cleanQuery) && !bName.startsWith(cleanQuery)) return -1
      if (bName.startsWith(cleanQuery) && !aName.startsWith(cleanQuery)) return 1
      return aName.localeCompare(bName)
    })

    return new Response(
      JSON.stringify({ students: sorted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error in search-students:', err)
    return new Response(
      JSON.stringify({ students: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
