🚀 B2World ATS Resume Builder

A Full-Stack ATS Resume Builder Web Application that helps job seekers create ATS-optimized resumes, analyze job descriptions, and improve their resume using automated suggestions and scoring algorithms.

This project simulates how real Applicant Tracking Systems (ATS) used by companies evaluate resumes.

📌 Project Overview

Modern companies use ATS software to filter resumes before recruiters see them.
This system helps users:

Create ATS-friendly resumes

Analyze a Job Description (JD)

Calculate an ATS compatibility score

Get smart suggestions for improvement

Generate optimized resumes automatically

Export resumes as professional PDFs

The platform also includes an Admin Dashboard to manage templates, keywords, and analytics.

🧠 Core Features
1️⃣ Resume Builder

Users can create structured resumes with sections:

Personal Information

Professional Summary

Skills

Work Experience

Projects

Education

Certifications

Achievements

Languages

All templates follow ATS-safe formatting rules.

2️⃣ ATS Score Engine

The system calculates a score out of 100 based on multiple factors.

Factor	Weight
Keyword Match	40%
Section Completeness	20%
Formatting Rules	20%
Action Verbs	10%
Readability	10%

Example Output:

ATS Score: 78/100
Missing Sections: Certifications
Suggested Keywords: REST API, Microservices, Docker
3️⃣ Job Description Analyzer

Users can paste a Job Description, and the system extracts:

Job role

Required skills

Important keywords

Tools and frameworks

Responsibilities

The extracted keywords are used for ATS scoring and resume optimization.

4️⃣ AI Suggestions Engine

The system suggests improvements such as:

Missing JD keywords

Weak bullet points

Better action verbs

Grammar improvements

Skill section enhancements

Example:

Current:
Worked on backend APIs

Suggested:
Developed REST APIs using Node.js improving response time by 25%

Users can apply suggestions with one click.

5️⃣ JD-Based Resume Generator

Users can generate a complete resume automatically using a job description.

The system creates:

Professional summary

Optimized skills section

Experience bullet points

Project descriptions

6️⃣ Resume PDF Export

Users can download resumes in ATS-friendly PDF format.

Example filename:

B2World_Resume_John_SoftwareEngineer.pdf
7️⃣ Admin Dashboard

Admin users can:

View total users

Track resumes created

Monitor downloads

Manage resume templates

Update keyword libraries

Manage suggestion rules

🛠️ Tech Stack
Frontend

React.js

Tailwind CSS

React Hook Form

Context API / Redux Toolkit

Material UI / Shadcn UI

Backend

Node.js

Express.js

JWT Authentication

REST APIs

Database

MongoDB Atlas

Mongoose ODM

Resume Generation

Puppeteer (PDF rendering)

Deployment

Frontend: Vercel

Backend: Render / Railway

Database: MongoDB Atlas

🗄️ Database Design

Main Collections:

Users
Resumes
JobDescriptions
ATSReports
Templates

Each resume stores:

resume content

extracted JD keywords

ATS score

suggestions history

📡 Key API Endpoints
Authentication
POST /api/auth/register
POST /api/auth/login
Resume Management
POST /api/resume/create
GET /api/resume/my-resumes
PUT /api/resume/update/:id
DELETE /api/resume/delete/:id
JD + ATS Analysis
POST /api/jd/analyze
POST /api/ats/score
POST /api/ats/suggestions
POST /api/ats/apply-suggestion
Resume Download
GET /api/resume/download/pdf/:id
Admin APIs
GET /api/admin/users
GET /api/admin/stats
POST /api/admin/template/create
PUT /api/admin/template/update
⚙️ Installation & Setup
1️⃣ Clone Repository
git clone https://github.com/your-username/b2world-ats-resume-builder.git
cd b2world-ats-resume-builder
2️⃣ Install Dependencies
npm install
3️⃣ Setup Environment Variables

Create .env file using .env.example

MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret_key
PORT=5000
4️⃣ Seed Database
npm run seed
5️⃣ Start Server
npm run dev

Server will run at:

http://localhost:5000
🧪 Testing

Run automated feature tests:

node test.js

This verifies:

authentication

resume creation

ATS scoring

JD analysis

suggestions engine

PDF generation

🛡️ Security Features

JWT Authentication

bcrypt password hashing

Helmet security headers

CORS protection

Rate limiting

Input validation

📊 System Architecture
Frontend (React)
       ↓
REST API (Node + Express)
       ↓
Business Logic (ATS Engine)
       ↓
MongoDB Database
       ↓
PDF Generator (Puppeteer)
📦 Deployment
Backend

Deploy on:

Render

Railway

Frontend

Deploy on:

Vercel

🎯 Future Improvements

AI resume rewriting

Cover letter generator

LinkedIn profile analyzer

Multi-language resume support

ATS score visualization dashboard

👩‍💻 Author

Tanuja Gunjal

Full Stack Developer
Specializing in React, Node.js, MongoDB
