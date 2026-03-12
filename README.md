🚀 ATS Resume Builder

A Full-Stack ATS Resume Builder Web Application that helps job seekers create ATS-optimized resumes, analyze Job Descriptions (JD), and improve resumes using automated scoring and suggestions.

The system simulates how real Applicant Tracking Systems (ATS) used by companies evaluate resumes.

✨ Key Features
📄 Resume Builder

Create structured resumes with sections:
Personal Information
Professional Summary
Skills
Work Experience
Projects
Education
Certifications
Achievements

All templates follow ATS-friendly formatting rules.

📊 ATS Score Calculator

The system calculates an ATS score out of 100 based on:

Factor	Weight
Keyword Match	40%
Section Completeness	20%
Formatting Rules	20%
Action Verbs	10%
Readability	10%

Example output:

ATS Score: 78/100
Missing Section: Certifications
Suggested Keywords: REST API, Microservices, Docker
📄 Job Description Analyzer

Users can paste a Job Description and the system extracts:

Role title
Required skills
Tools & frameworks
Important keywords

These keywords are used to evaluate resume compatibility.

💡 Suggestions Engine
The system provides improvement suggestions such as:
Missing JD keywords
Weak bullet points
Action verb improvements
Skill section optimization

Example:
Current:
Worked on backend APIs

Suggested:
Developed REST APIs using Node.js improving response time by 25%

Users can apply improvements instantly.

🤖 JD-Based Resume Generator
Generate a complete optimized resume automatically from a job description.

The system generates:
Professional summary
Skills section
Experience bullet points
Project descriptions

📄 Resume PDF Export
Download resumes in ATS-friendly PDF format.

Example:
B2World_Resume_John_SoftwareEngineer.pdf

🛠 Admin Dashboard
Admin users can:
View total users
Track resume generation
Monitor downloads
Manage resume templates
Manage keyword libraries
Update suggestion rules

🛠 Tech Stack
Frontend

React.js
Tailwind CSS
React Hook Form
Redux Toolkit / Context API
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

Puppeteer (PDF generation)

⚙️ Installation
1️⃣ Clone repository
git clone https://github.com/yourusername/ats-resume-builder.git
cd ats-resume-builder
2️⃣ Install dependencies
npm install
3️⃣ Setup environment variables

Create .env

MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret
PORT=5000 

4️⃣ Run backend
npm run dev

Server runs at:

http://localhost:5000
📡 Main API Endpoints
Authentication
POST /api/auth/register
POST /api/auth/login
Resume
POST /api/resume/create
GET /api/resume/my-resumes
PUT /api/resume/update/:id
DELETE /api/resume/delete/:id
JD & ATS
POST /api/jd/analyze
POST /api/ats/score
POST /api/ats/apply-suggestion
Resume Download
GET /api/resume/download/pdf/:id
🛡 Security Features

JWT authentication
Password hashing (bcrypt)
Helmet security headers
CORS protection
Rate limiting
Input validation


👩‍💻 Author
Tanuja Gunjal

Tech Stack: React • Node.js • MongoDB
