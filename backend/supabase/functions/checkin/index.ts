import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckinRequest {
  name: string;
  code: string;
  deviceFingerprint?: string;
  userAgent?: string;
  timestamp: string;
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

    const requestData: CheckinRequest = await req.json()
    const { name, code, deviceFingerprint, userAgent, timestamp } = requestData

    // Validate required fields
    if (!name || !code) {
      return new Response(
        JSON.stringify({ error: 'Name and code are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify student exists and code matches
    const { data: student, error: studentError } = await supabaseClient
      .from('students')
      .select('id, name, access_code, is_active')
      .eq('name', name)
      .eq('access_code', code)
      .eq('is_active', true)
      .single()

    if (studentError || !student) {
      console.error('Student validation error:', studentError)
      return new Response(
        JSON.stringify({ error: 'Invalid name or access code' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if already checked in today
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    
    const { data: existingCheckin, error: checkinError } = await supabaseClient
      .from('attendance')
      .select('id, check_in_time')
      .eq('student_name', name)
      .eq('check_in_date', today)
      .single()

    if (existingCheckin) {
      const checkinTime = new Date(existingCheckin.check_in_time).toLocaleTimeString()
      return new Response(
        JSON.stringify({ 
          error: `Already checked in today at ${checkinTime}`,
          alreadyCheckedIn: true 
        }),
        { 
          status: 409, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get client IP (for basic tracking, not for security)
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown'

    // Insert attendance record
    const { data: attendance, error: insertError } = await supabaseClient
      .from('attendance')
      .insert({
        student_id: student.id,
        student_name: name,
        ip_address: clientIP,
        user_agent: userAgent?.substring(0, 500), // Limit length
        device_fingerprint: deviceFingerprint?.substring(0, 100), // Limit length
        check_in_time: new Date(timestamp).toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert attendance error:', insertError)
      
      // Check if it's a duplicate entry error
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Already checked in today' }),
          { 
            status: 409, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to record attendance' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check-in successful',
        timestamp: attendance.check_in_time,
        studentName: name
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})