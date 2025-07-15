// supabase/functions/checkin/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckinRequest {
  name: string;
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
    const { name, deviceFingerprint, userAgent, timestamp } = requestData

    // Validate required fields
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Name is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Clean and validate name
    const cleanName = name.trim()
    if (cleanName.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Please enter your complete name' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Basic name validation (letters, spaces, hyphens, apostrophes, periods)
    const nameRegex = /^[a-zA-Z\s\-'\.]+$/
    if (!nameRegex.test(cleanName)) {
      return new Response(
        JSON.stringify({ error: 'Please enter a valid name' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if already checked in today using time range query
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    
    const { data: existingCheckin, error: checkinError } = await supabaseClient
      .from('attendance')
      .select('id, check_in_time')
      .eq('student_name', cleanName)
      .gte('check_in_time', `${today}T00:00:00.000Z`)
      .lt('check_in_time', `${today}T23:59:59.999Z`)
      .single()

    if (existingCheckin) {
      const checkinTime = new Date(existingCheckin.check_in_time).toLocaleTimeString()
      return new Response(
        JSON.stringify({ 
          error: `${cleanName} already checked in today at ${checkinTime}`,
          alreadyCheckedIn: true 
        }),
        { 
          status: 409, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get client IP (for basic tracking, not for security)
    // Handle x-forwarded-for header which can contain multiple IPs
    const forwardedFor = req.headers.get('x-forwarded-for')
    const realIP = req.headers.get('x-real-ip')
    
    let clientIP = 'unknown'
    if (forwardedFor) {
      // x-forwarded-for can be "ip1,ip2,ip3" - take the first one
      clientIP = forwardedFor.split(',')[0].trim()
    } else if (realIP) {
      clientIP = realIP.trim()
    }
    
    // Validate IP format (basic check)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(clientIP)) {
      clientIP = 'unknown'
    }

    // Insert attendance record
    const { data: attendance, error: insertError } = await supabaseClient
      .from('attendance')
      .insert({
        student_id: null, // We don't require student registration
        student_name: cleanName,
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
        studentName: cleanName
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