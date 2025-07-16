// supabase/functions/search-students/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StudentSearchRequest {
  query: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
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
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { query }: StudentSearchRequest = await req.json()
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ students: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanQuery = query.trim()

    // Search students with fuzzy matching using multiple strategies
    const { data: students, error } = await supabaseClient
      .from('students')
      .select('name')
      .eq('is_active', true)
      .or(`name.ilike.%${cleanQuery}%,name.ilike.${cleanQuery}%`)
      .order('name')
      .limit(10)

    if (error) {
      console.error('Student search error:', error)
      return new Response(
        JSON.stringify({ students: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter and sort results for better matching
    let filteredStudents = students || []
    
    // Prioritize exact matches and prefix matches
    filteredStudents.sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      const queryLower = cleanQuery.toLowerCase()
      
      // Exact match first
      if (aName === queryLower) return -1
      if (bName === queryLower) return 1
      
      // Prefix match second
      if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1
      if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1
      
      // Alphabetical order
      return aName.localeCompare(bName)
    })

    return new Response(
      JSON.stringify({ students: filteredStudents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ students: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})