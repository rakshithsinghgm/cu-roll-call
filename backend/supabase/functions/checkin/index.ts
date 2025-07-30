import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const CONFIG = {
  MAX_DAILY_CHECKINS: 2,
  COOLDOWN_MINUTES: 30,
  TIMEZONE: 'America/Chicago',
  MAX_TIME_ATTENDED: 480,
  MIN_TIME_ATTENDED: 1,
} as const;

interface CheckInRequest {
  name: string;
  classType: string;
  timeAttendedMinutes: number;
  timestamp?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

interface Student {
  id: string;
  name: string;
}

interface AttendanceRecord {
  check_in_time: string;
  check_in_date: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getChicagoClock(dateInput?: Date): { 
  iso: string; 
  dateStr: string; 
  nowUtc: Date; 
  displayTime: string;
  displayDate: string;
  displayFull: string;
} {
  const nowUtc = dateInput ? new Date(dateInput) : new Date();
  const iso = nowUtc.toISOString();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(nowUtc);

  const dateMap: Record<string, string> = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const dateStr = `${dateMap.year}-${dateMap.month}-${dateMap.day}`;

  // Create more specific formatters
  const displayTime = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(nowUtc);

  const displayDate = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(nowUtc);

  const displayFull = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(nowUtc);

  return { iso, dateStr, nowUtc, displayTime, displayDate, displayFull };
}

function withCORS(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function validateCheckInRequest(data: any): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push({ field: 'name', message: 'Name is required and must be non-empty' });
  } else if (data.name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Name must be 100 characters or less' });
  }

  if (!data.classType || typeof data.classType !== 'string' || !data.classType.trim()) {
    errors.push({ field: 'classType', message: 'Class type is required and must be non-empty' });
  } else if (data.classType.trim().length > 50) {
    errors.push({ field: 'classType', message: 'Class type must be 50 characters or less' });
  }

  if (!Number.isInteger(data.timeAttendedMinutes)) {
    errors.push({ field: 'timeAttendedMinutes', message: 'Time attended must be an integer' });
  } else if (data.timeAttendedMinutes < CONFIG.MIN_TIME_ATTENDED) {
    errors.push({ field: 'timeAttendedMinutes', message: `Must attend at least ${CONFIG.MIN_TIME_ATTENDED} minute` });
  } else if (data.timeAttendedMinutes > CONFIG.MAX_TIME_ATTENDED) {
    errors.push({ field: 'timeAttendedMinutes', message: `Cannot exceed ${CONFIG.MAX_TIME_ATTENDED} minutes` });
  }

  if (data.timestamp) {
    const ts = new Date(data.timestamp);
    if (isNaN(ts.getTime())) {
      errors.push({ field: 'timestamp', message: 'Invalid timestamp format' });
    } else {
      const now = new Date();
      const oneHourAhead = new Date(now.getTime() + 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (ts > oneHourAhead) {
        errors.push({ field: 'timestamp', message: 'Timestamp cannot be more than 1 hour in the future' });
      }
      if (ts < oneDayAgo) {
        errors.push({ field: 'timestamp', message: 'Timestamp cannot be more than 24 hours in the past' });
      }
    }
  }
  return errors;
}

function logError(context: string, error: unknown) {
  console.error(`[${new Date().toISOString()}] ${context}:`, error);
}

async function findStudent(name: string): Promise<Student | null> {
  const { data: students, error } = await supabase.from('students').select('id, name').ilike('name', name.trim());
  if (error) {
    logError('findStudent', error);
    throw new Error('DB error while finding student');
  }
  return students?.[0] || null;
}

async function getTodayCheckIns(studentId: string, today: string): Promise<AttendanceRecord[]> {
  const { data: records, error } = await supabase
    .from('attendance')
    .select('check_in_time, check_in_date')
    .eq('student_id', studentId)
    .eq('check_in_date', today)
    .order('check_in_time', { ascending: false });
  if (error) {
    logError('getTodayCheckIns', error);
    throw new Error('DB error while fetching today\'s checkin');
  }
  return records || [];
}

async function getLastCheckIn(studentId: string): Promise<AttendanceRecord | null> {
  const { data: records, error } = await supabase
    .from('attendance')
    .select('check_in_time, check_in_date')
    .eq('student_id', studentId)
    .order('check_in_time', { ascending: false })
    .limit(1);
  if (error) {
    logError('getLastCheckIn', error);
    throw new Error('DB error while fetching last check‑in');
  }
  return records?.[0] || null;
}

async function insertCheckIn(
  studentId: string,
  studentName: string,
  classType: string,
  timeAttended: number,
  checkInTime: string,
  checkInDate: string
): Promise<void> {
  const { error } = await supabase.from('attendance').insert({
    student_id: studentId,
    student_name: studentName,
    class_type: classType.trim(),
    time_attended_minutes: timeAttended,
    check_in_time: checkInTime,
    check_in_date: checkInDate,
  });
  if (error) {
    logError('insertCheckIn', error);
    throw new Error('DB error while inserting check‑in');
  }
}

function checkDailyLimit(records: AttendanceRecord[], today: string): boolean {
  return records.filter(r => r.check_in_date === today).length >= CONFIG.MAX_DAILY_CHECKINS;
}

function checkCooldown(
  lastRecord: AttendanceRecord | null,
  today: string,
  nowUtc: Date
): number {
  if (!lastRecord) return 0;
  const { dateStr: lastDateStr } = getChicagoClock(new Date(lastRecord.check_in_time));
  if (lastDateStr !== today) return 0;
  const lastTime = new Date(lastRecord.check_in_time);
  const diffMin = (nowUtc.getTime() - lastTime.getTime()) / 60000;
  const remaining = CONFIG.COOLDOWN_MINUTES - diffMin;
  return remaining > 0 ? remaining : 0;
}

console.log(`📍 Timezone: ${CONFIG.TIMEZONE}`);
console.log(`⏰ Cooldown: ${CONFIG.COOLDOWN_MINUTES} minutes`);
console.log(`📊 Daily limit: ${CONFIG.MAX_DAILY_CHECKINS} check‑ins`);

serve(async (req) => {
  if (req.method === 'OPTIONS') return withCORS({ ok: true });
  if (req.method !== 'POST') return withCORS({ error: 'Method not allowed' }, 405);

  let requestData: CheckInRequest;
  try {
    requestData = await req.json();
  } catch {
    return withCORS({ error: 'Invalid JSON in request body' }, 400);
  }

  const validationErrors = validateCheckInRequest(requestData);
  if (validationErrors.length) {
    return withCORS({ error: 'Validation failed', details: validationErrors }, 400);
  }

  const { name, classType, timeAttendedMinutes, timestamp } = requestData;

  let student: Student | null;
  try {
    student = await findStudent(name);
  } catch {
    return withCORS({ error: 'Server error finding student' }, 500);
  }
  if (!student) {
    return withCORS({ error: 'Student not found', message: 'Check your name spelling.' }, 404);
  }

  let clock;
  try {
    clock = timestamp ? getChicagoClock(new Date(timestamp)) : getChicagoClock();
  } catch {
    return withCORS({ error: 'Invalid timestamp provided' }, 400);
  }
  const { iso: checkInTime, dateStr: checkInDate, nowUtc, displayTime, displayDate, displayFull } = clock;

  let todayChecks: AttendanceRecord[];
  try {
    todayChecks = await getTodayCheckIns(student.id, checkInDate);
  } catch {
    return withCORS({ error: 'Error fetching today\'s checks' }, 500);
  }
  if (checkDailyLimit(todayChecks, checkInDate)) {
    return withCORS({ 
      error: 'Daily limit reached', 
      message: `You have already checked in ${CONFIG.MAX_DAILY_CHECKINS} times today. Please try again tomorrow.`,
      limit: CONFIG.MAX_DAILY_CHECKINS 
    }, 429);
  }

  let lastRecord: AttendanceRecord | null;
  try {
    lastRecord = await getLastCheckIn(student.id);
  } catch {
    return withCORS({ error: 'Error fetching last check‑in' }, 500);
  }
  const cooldownRemaining = checkCooldown(lastRecord, checkInDate, nowUtc);
  if (cooldownRemaining > 0) {
    const nextTime = new Date(nowUtc.getTime() + cooldownRemaining * 60 * 1000);
    const nextTimeFormatted = getChicagoClock(nextTime).displayTime;
    return withCORS({ 
      error: 'Cooldown active. Please wait 30 minutes before checking in again.', 
      message: `Please wait ${Math.ceil(cooldownRemaining)} more minutes. Next check-in available at ${nextTimeFormatted}.`,
      retryAfterMinutes: Math.ceil(cooldownRemaining) 
    }, 429);
  }

  try {
    await insertCheckIn(
      student.id,
      student.name,
      classType,
      timeAttendedMinutes,
      checkInTime,
      checkInDate
    );
  } catch {
    return withCORS({ error: 'Error inserting check‑in' }, 500);
  }

  return withCORS({
    success: true,
    message: `Successfully checked in!`,
    studentName: student.name,
    classType: classType.trim(),
    timeAttendedMinutes,
    // Frontend expects these exact field names
    checkinTime: checkInTime,  // Note: frontend uses 'checkinTime' not 'checkInTime'
    checkInDate,
    // Additional formatted data for display
    displayTime,
    displayDate,
    displayFull,
    // Summary info  
    dailyUsed: todayChecks.length + 1,
    dailyLimit: CONFIG.MAX_DAILY_CHECKINS,
    // Provide the complete formatted summary too
    displaySummary: `${student.name} checked in for ${classType.trim()} at ${displayTime} on ${displayDate}`
  });
});
