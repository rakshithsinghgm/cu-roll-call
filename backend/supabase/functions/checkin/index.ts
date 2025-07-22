import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

// Add CORS headers to response
function withCORSHeaders(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

serve(async (req) => {
  // ✅ Handle preflight request
  if (req.method === 'OPTIONS') {
    return withCORSHeaders({ ok: true })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { name, classType, timeAttendedMinutes, timestamp } = await req.json()

    if (!name || !classType || !timeAttendedMinutes) {
      return withCORSHeaders({ error: 'Missing required fields.' }, 400)
    }

    // 1. Find the student by name (case-insensitive)
    const { data: students, error: studentError } = await supabase
      .from('students')
      .select('id, name')
      .ilike('name', name)

    if (studentError || !students || students.length === 0) {
      return withCORSHeaders({ studentNotFound: true }, 404)
    }

    const student = students.find(s => s.name.toLowerCase() === name.toLowerCase())
    if (!student) {
      return withCORSHeaders({ error: 'Student not found in system.' }, 404)
    }

    const today = new Date().toISOString().split('T')[0]

    // 2. Fetch today's check-ins
    const { data: checkinsToday, error: checkinError } = await supabase
      .from('attendance')
      .select('check_in_time')
      .eq('student_id', student.id)
      .eq('check_in_date', today)
      .order('check_in_time', { ascending: false })

    if (checkinError) {
      return withCORSHeaders({ error: 'Failed to validate previous check-ins.' }, 500)
    }

    // 3. Enforce daily limit
    if (checkinsToday.length >= 2) {
      return withCORSHeaders({ error: 'You have already checked in twice today.' }, 400)
    }

    // 4. Enforce 30-minute interval
    if (checkinsToday.length > 0) {
      const lastCheckin = new Date(checkinsToday[0].check_in_time)
      const now = new Date(timestamp || new Date().toISOString())
      const minutesDiff = (now.getTime() - lastCheckin.getTime()) / (1000 * 60)

      if (minutesDiff < 30) {
        return withCORSHeaders({ error: 'You must wait 30 minutes between check-ins.' }, 400)
      }
    }

    // 5. Insert check-in
    const { error: insertError } = await supabase.from('attendance').insert({
      student_id: student.id,
      student_name: student.name,
      class_type: classType,
      time_attended_minutes: timeAttendedMinutes,
      check_in_time: timestamp || new Date().toISOString()
    })

    if (insertError) {
      console.error('Insert error:', insertError)
      return withCORSHeaders({ error: 'Failed to check in. Please try again.' }, 500)
    }

    return withCORSHeaders({
      success: true,
      message: 'Successfully checked in!',
      checkinTime: new Date().toLocaleTimeString()
    }, 200)
  } catch (err) {
    console.error('Unexpected error:', err)
    return withCORSHeaders({ error: 'Unexpected server error' }, 500)
  }
})
