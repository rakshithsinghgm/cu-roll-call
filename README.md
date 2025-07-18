# 🥋 CU Roll Call - Jiu Jitsu Attendance Tracker
A modern, simple, and robust attendance tracking system designed specifically for martial arts gyms. Students scan a QR code, enter their details, and check in instantly with real-time validation and duplicate prevention.

https://cu-roll-call.vercel.app/

# ✨ Features

## 🎯 Core Functionality

- Single QR Code System - One QR code for all students
- Student Name Autocomplete - Smart suggestions as you type
- Class Type Tracking - Gi or No-Gi selection
Time Attended Logging - Track 1-180 minutes with validation
- Duplicate Prevention - Max 2 check-ins per day, 30-minute gap enforced
- Real-time Validation - Instant feedback and error handling

## 🔒 Privacy & Security

- Database-Driven Validation - Only registered students can check in
- Clean Data Storage - Minimal, essential information only

## 📊 Analytics & Reporting

- Enhanced Statistics - Track gi vs no-gi participation patterns
- Time Analysis - Understand class duration trends
Automated Reports - Weekly email summaries via GitHub Actions
- Export Capabilities - CSV and HTML report formats

## 🎨 User Experience

- Modern Design - Orange and navy blue theme
- Mobile Optimized - Responsive design for all devices
- Fast Performance - Sub-2 second check-ins
- Intuitive Interface - Clear instructions and feedback

## 🏗️ Architecture

QR Code       ───▶ Frontend (Vercel) ───▶ Supabase (Database + Functions)     

## Technology Stack

- Frontend: HTML5, CSS3, JavaScript (ES6+)
- Backend: Supabase Edge Functions (Deno/TypeScript)
- Database: PostgreSQL with Row Level Security
- Hosting: Vercel (Frontend), Supabase (Backend)
- Reports: Node.js with GitHub Actions
- QR Generation: Python with qrcode library

## 🚀 Quick Start
### Prerequisites

- GitHub account
- Vercel account (free)
- Supabase account (free)
- Python 3.7+ (for QR code generation)
- Node.js 16+ (for local development)

```text
1. Database Setup
Create Supabase Project
Go to supabase.com
Create new project
Note your Project URL and API keys


Apply Database Schema
sql-- Copy the complete schema from database_schema.sql
-- Run in Supabase SQL Editor

Add Your Students
sqlINSERT INTO students (name, email, belt_rank) VALUES
('John Smith', 'john@email.com', 'White Belt'),
('Mark Garcia', 'mark@email.com', 'Blue Belt');
```

```text
2. Backend Deployment
bash# Install Supabase CLI
npm install -g supabase

# Initialize and link project
mkdir cu-roll-call-backend
cd cu-roll-call-backend
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Create and deploy function
supabase functions new checkin
# Copy function code to supabase/functions/checkin/index.ts
supabase functions deploy checkin
```

```text
3. Web App Deployment
bash# Create frontend repository
git clone https://github.com/rakshithsinghgm/cu-roll-call
cd cu-roll-call

# Frontend Config
# Create index.html with frontend code
# Update Supabase configuration:
# const SUPABASE_URL = 'https://your-project.supabase.co';
# const SUPABASE_ANON_KEY = 'your-anon-key';


# Frontend code - roll-call/frontend/index.html

# Import to Vercel and deploy (push to main branch)
git add .
git commit -m "commit message"
git push origin master
```

```text
4. Generate QR Code
# To Do
```

## 📱 Usage
### For Students

Scan QR Code posted at gym entrance
Enter Name - Use autocomplete suggestions
Select Class Type - Choose Gi or No-Gi
Enter Time Attended - Specify minutes (1-180)
Submit - Get instant confirmation

### For Instructors

Monitor Check-ins - View real-time attendance
Add Students - Insert new students via Supabase dashboard
Review Reports - Receive weekly email summaries
Manage Data - Access full attendance history

## 🔧 Configuration

### 🔍 API Documentation
Check-in Endpoint
```json
POST /functions/v1/checkin
Request Body:
json{
  "name": "John Smith",
  "classType": "gi",
  "timeAttendedMinutes": 90,
  "timestamp": "2025-01-15T18:30:00.000Z"
}
```

#### Success Response (200):
```json
json{
  "success": true,
  "message": "Check-in successful! (1/2 today)",
  "timestamp": "2025-01-15T18:30:00.000Z",
  "studentName": "John Smith",
  "classType": "gi",
  "checkinCount": 1
}
```
#### Error Responses:

404 - Student not found in database
409 - Duplicate check-in or max limit reached
400 - Validation error

### Student Search Endpoint
```json
POST /functions/v1/checkin
Request Body:
json{
  "query": "john"
}
Response:
json{
  "students": [
    {"name": "John Smith"},
    {"name": "Johnny Wilson"}
  ]
}
```

## 🧪 Testing
### Manual Testing

- Test valid check-in - Complete flow with registered student
- Test invalid student - Try unregistered name
- Test duplicate prevention - Check in twice quickly
- Test max limit - Try 3rd check-in same day
- Test validation - Invalid time ranges, missing fields


## 🚨 Troubleshooting
Common Issues
- "Student not found in database"
Solution: Add student to students table in Supabase

- "Server error" on check-in - Check Supabase function logs. Verify database connectivity. Confirm API keys are correct

- Autocomplete not working -Verify students table has data. Check browser console for errors. Confirm function deployment

- QR code doesn't work - Verify URL in QR code is correct. Test URL manually in browser. Check for typos in generated code

## Debug Commands
```text 
Check function status - supabase functions list
View function logs: - supabase functions logs <function name>
```

## Monitoring

- Monitor via Supabase Dashboard
- Check Vercel Analytics
- Track error rates in function logs


## 🤝 Contributing
Development Setup
```text 
# Clone repositories
git clone https://github.com/rakshithsinghgm/cu-roll-call

# Set up development environment
cd cu-roll-call/backend
supabase start
supabase functions serve checkin

cd ../cu-roll-call/frontend
# Open index.html in browser or use local server
python -m http.server 8000
```

## 📞 Support
For support, contact: rakshithsinghgm@gmail.com

## 🔗 Useful Resources

Supabase Documentation
Vercel Documentation
PostgreSQL Documentation

# To DO
- Github actions and Supabase cron jobs for automating report generation and transfer. 
- QR code generation testing.  

----

## Built with ❤️ for the martial arts community