import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

// === Utility to get current timestamp and date in America/Chicago ===
function getChicagoTime(): { iso: string; date: string } {
  const now = new Date()

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]))

  const chicagoDateTime = new Date(`${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`)
  const iso = chicagoDateTime.toISOString()
  const date = `${map.year}-${map.month}-${map.day}`

  return { iso, date }
}

// === CORS Handler ===
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

    // Get today's date in Chicago timezone
    const { iso: chicagoISO, date: chicagoDate } = getChicagoTime()

    // 2. Fetch today's check-ins
    const { data: checkinsToday, error: checkinError } = await supabase
      .from('attendance')
      .select('check_in_time')
      .eq('student_id', student.id)
      .eq('check_in_date', chicagoDate)
      .order('check_in_time', { ascending: false })

    if (checkinError) {
      return withCORSHeaders({ error: 'Failed to validate previous check-ins.' }, 500)
    }

    // 3. Enforce daily limit
    if (checkinsToday.length >= 2) {
      return withCORSHeaders({ error: 'You have already checked in twice today.' }, 400)
    }

    // 4. Enforce 30-minute interval (optional, you can implement here if needed)

    // 5. Insert check-in using Chicago time
    const { error: insertError } = await supabase.from('attendance').insert({
      student_id: student.id,
      student_name: student.name,
      class_type: classType,
      time_attended_minutes: timeAttendedMinutes,
      check_in_time: timestamp || chicagoISO,
      check_in_date: chicagoDate,
    })

    if (insertError) {
      console.error('Insert error:', insertError)
      return withCORSHeaders({ error: 'Failed to check in. Please try again.' }, 500)
    }

    return withCORSHeaders({
      success: true,
      message: 'Successfully checked in!',
      checkinTime: chicagoISO,
    }, 200)

  } catch (err) {
    console.error('Unexpected error:', err)
    return withCORSHeaders({ error: 'Unexpected server error' }, 500)
  }
})
