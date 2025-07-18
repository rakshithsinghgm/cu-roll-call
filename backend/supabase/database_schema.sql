-- Create enum for class types
CREATE TYPE class_type_enum AS ENUM ('gi', 'no-gi');

-- Create students table (now essential for the system)
CREATE TABLE IF NOT EXISTS students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255),
    phone VARCHAR(20),
    belt_rank VARCHAR(20),
    membership_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create attendance table (updated with new fields, removed privacy tracking)
CREATE TABLE IF NOT EXISTS attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name VARCHAR(100) NOT NULL,
    class_type class_type_enum NOT NULL,
    time_attended_minutes INTEGER NOT NULL CHECK (time_attended_minutes >= 1 AND time_attended_minutes <= 180),
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    check_in_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable trigram extension for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(check_in_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_name ON attendance(student_name);
CREATE INDEX IF NOT EXISTS idx_attendance_class_type ON attendance(class_type);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_students_name_search ON students USING gin(name gin_trgm_ops);

-- Function to set check_in_date from check_in_time
CREATE OR REPLACE FUNCTION set_check_in_date()
RETURNS TRIGGER AS '
BEGIN
    NEW.check_in_date = DATE(NEW.check_in_time);
    RETURN NEW;
END;
' language 'plpgsql';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS '
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
' language 'plpgsql';

-- Trigger to auto-set check_in_date
CREATE TRIGGER set_attendance_date 
    BEFORE INSERT OR UPDATE ON attendance 
    FOR EACH ROW 
    EXECUTE FUNCTION set_check_in_date();

-- Trigger to auto-update updated_at
CREATE TRIGGER update_students_updated_at 
    BEFORE UPDATE ON students 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample students (essential now - instructors should add real students)
INSERT INTO students (name, email, belt_rank) 
SELECT 'Alisha Khan', 'alisha@example.com', 'Blue Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Alisha Khan');

INSERT INTO students (name, email, belt_rank) 
SELECT 'Mike Johnson', 'mike@example.com', 'White Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Mike Johnson');

INSERT INTO students (name, email, belt_rank) 
SELECT 'Sarah Chen', 'sarah@example.com', 'Purple Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Sarah Chen');

INSERT INTO students (name, email, belt_rank) 
SELECT 'David Rodriguez', 'david@example.com', 'White Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'David Rodriguez');

INSERT INTO students (name, email, belt_rank) 
SELECT 'Emily Wilson', 'emily@example.com', 'Blue Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Emily Wilson');

INSERT INTO students (name, email, belt_rank) 
SELECT 'Carlos Santos', 'carlos@example.com', 'Brown Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Carlos Santos');

INSERT INTO students (name, email, belt_rank) 
SELECT 'Jennifer Lee', 'jennifer@example.com', 'White Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Jennifer Lee');

INSERT INTO students (name, email, belt_rank) 
SELECT 'Michael Torres', 'michael@example.com', 'Blue Belt'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE name = 'Michael Torres');

-- Enable Row Level Security (RLS)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Policies for students table (read-only for anon users)
CREATE POLICY "Anyone can read students" ON students
    FOR SELECT USING (is_active = true);

-- Policies for attendance table
CREATE POLICY "Anyone can insert attendance" ON attendance
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read attendance" ON attendance
    FOR SELECT USING (true);