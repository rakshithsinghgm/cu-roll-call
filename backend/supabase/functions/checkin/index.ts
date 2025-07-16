// supabase/functions/checkin/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckinRequest {
  name: string;
  classType: 'gi' | 'no-gi';
  timeAttendedMinutes: number;
  timestamp: string;
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

    const requestData = await req.json()
    
    // Check if this is a student search request
    if (requestData.query !== undefined) {
      // Handle student search
      const { query }: StudentSearchRequest = requestData
      
      if (!query || query.trim().length < 2) {
        return new Response(
          JSON.stringify({ students: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Search students with fuzzy matching
      const { data: students, error } = await supabaseClient
        .from('students')
        .select('name')
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,name.ilike.${query}%`)
        .order('name')
        .limit(10)

      if (error) {
        console.error('Student search error:', error)
        return new Response(
          JSON.stringify({ students: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ students: students || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle check-in request
    const { name, classType, timeAttendedMinutes, timestamp } = requestData as CheckinRequest

      // Validate required fields
      if (!name || !name.trim()) {
        return new Response(
          JSON.stringify({ error: 'Name is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!classType || !['gi', 'no-gi'].includes(classType)) {
        return new Response(
          JSON.stringify({ error: 'Valid class type is required (gi or no-gi)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!timeAttendedMinutes || timeAttendedMinutes < 1 || timeAttendedMinutes > 180) {
        return new Response(
          JSON.stringify({ error: 'Time attended must be between 1 and 180 minutes' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const cleanName = name.trim()

      // Verify student exists in database (exact match required)
      const { data: student, error: studentError } = await supabaseClient
        .from('students')
        .select('id, name')
        .eq('name', cleanName)
        .eq('is_active', true)
        .single()

      if (studentError || !student) {
        return new Response(
          JSON.stringify({ 
            error: 'Student not found in database. Please contact your instructor to add you to the system.',
            studentNotFound: true 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check existing check-ins for today
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
      
      const { data: existingCheckins, error: checkinError } = await supabaseClient
        .from('attendance')
        .select('id, check_in_time, class_type')
        .eq('student_name', cleanName)
        .gte('check_in_time', `${today}T00:00:00.000Z`)
        .lt('check_in_time', `${today}T23:59:59.999Z`)
        .order('check_in_time', { ascending: false })

      if (checkinError) {
        console.error('Check-in query error:', checkinError)
        return new Response(
          JSON.stringify({ error: 'Failed to check existing attendance' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if already reached maximum (2 check-ins per day)
      if (existingCheckins && existingCheckins.length >= 2) {
        const checkinTimes = existingCheckins.map(c => 
          new Date(c.check_in_time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Chicago' // Change this to your gym's timezone
          })
        )
        
        return new Response(
          JSON.stringify({ 
            error: `Maximum 2 check-ins per day reached. Today's check-ins: ${checkinTimes.join(', ')}`,
            maxCheckinsReached: true 
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check 30-minute minimum gap between check-ins
      if (existingCheckins && existingCheckins.length > 0) {
        const lastCheckinTime = new Date(existingCheckins[0].check_in_time)
        const currentTime = new Date(timestamp)
        const timeDifferenceMinutes = (currentTime.getTime() - lastCheckinTime.getTime()) / (1000 * 60)

        if (timeDifferenceMinutes < 30) {
          const waitTime = Math.ceil(30 - timeDifferenceMinutes)
          const lastCheckinTimeStr = lastCheckinTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Chicago' // Change this to your gym's timezone
          })
          
          return new Response(
            JSON.stringify({ 
              error: `Please wait ${waitTime} more minutes between check-ins. Last check-in: ${lastCheckinTimeStr}`,
              waitTimeMinutes: waitTime 
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Insert attendance record
      const { data: attendance, error: insertError } = await supabaseClient
        .from('attendance')
        .insert({
          student_id: student.id,
          student_name: cleanName,
          class_type: classType,
          time_attended_minutes: timeAttendedMinutes,
          check_in_time: new Date(timestamp).toISOString()
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert attendance error:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to record attendance' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Success response
      const checkinCount = (existingCheckins?.length || 0) + 1
      const checkinTimeStr = new Date(attendance.check_in_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago' // Change this to your gym's timezone
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: `Check-in successful! (${checkinCount}/2 today)`,
          timestamp: attendance.check_in_time,
          studentName: cleanName,
          classType: classType,
          timeAttended: timeAttendedMinutes,
          checkinCount: checkinCount,
          checkinTime: checkinTimeStr
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})