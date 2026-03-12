

# 🚀 ATS Resume Builder

A **Full-Stack ATS Resume Builder Web Application** that helps job seekers create **ATS-optimized resumes**, analyze **Job Descriptions (JD)**, and improve resumes using **automated scoring and suggestions**.

The platform simulates how **real Applicant Tracking Systems (ATS)** used by companies filter and evaluate resumes.

---

# ✨ Features

### 🔍 Resume Builder

Create structured resumes with ATS-friendly sections:

* 👤 Personal Information
* 📝 Professional Summary
* 🧠 Skills
* 💼 Work Experience
* 📂 Projects
* 🎓 Education
* 📜 Certifications
* 🏆 Achievements

All templates follow **ATS-safe formatting rules**.

---

### 📊 ATS Score Engine

The system calculates an **ATS score out of 100** based on:

| Factor               | Weight |
| -------------------- | ------ |
| Keyword Match        | 40%    |
| Section Completeness | 20%    |
| Formatting           | 20%    |
| Action Verbs         | 10%    |
| Readability          | 10%    |

Example Output:

```
ATS Score: 78/100
Missing Section: Certifications
Suggested Keywords: REST API, Microservices, Docker
```

---

### 📄 Job Description Analyzer

Users can paste a **Job Description**, and the system extracts:

* Required Skills
* Tools & Frameworks
* Responsibilities
* Key ATS Keywords

These keywords are used to **evaluate resume compatibility**.

---

### 💡 Suggestions Engine

Provides automated improvement suggestions:

* Missing JD keywords
* Weak bullet points
* Action verb improvements
* Skill section optimization

Example:

```
Current:
Worked on backend APIs

Suggested:
Developed REST APIs using Node.js improving response time by 25%
```

Users can **apply suggestions instantly**.

---

### 🤖 JD-Based Resume Generator

Generate an **optimized resume automatically from a Job Description**.

The system generates:

* Professional Summary
* Skills Section
* Experience Bullet Points
* Project Descriptions

---

### 📄 Resume PDF Export

Download resumes in **ATS-friendly PDF format**.

Example filename:

```
B2World_Resume_John_SoftwareEngineer.pdf
```

---

### 🛠 Admin Dashboard

Admin users can:

* 👥 View total users
* 📊 Track resumes created
* 📥 Monitor downloads
* 🧩 Manage resume templates
* 🗂 Manage keywords library
* ⚙ Manage suggestion rules

---

# 🛠 Tech Stack

### Frontend

* ⚛ React.js
* 🎨 Tailwind CSS
* 🧾 React Hook Form
* 🔄 Redux Toolkit / Context API
* 🧩 Material UI / Shadcn UI

### Backend

* 🟢 Node.js
* 🚀 Express.js
* 🔐 JWT Authentication
* 🔗 REST APIs

### Database

* 🍃 MongoDB Atlas
* Mongoose ODM

### Resume Generation

* 📄 Puppeteer (PDF rendering)

### Deployment

* Frontend → **Vercel**
* Backend → **Render / Railway**
* Database → **MongoDB Atlas**

---

# 🔑 Environment Setup

Create a `.env` file in backend:

```
MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret_key
PORT=5000
```

---

# ⚙️ Installation

### Clone repository

```
git clone https://github.com/yourusername/ats-resume-builder.git
cd ats-resume-builder
```

### Install dependencies

```
npm install
```

### Run backend server

```
npm run dev
```

Server runs at:

```
http://localhost:5000
```

---

# 📡 API Endpoints

### Authentication

```
POST /api/auth/register
POST /api/auth/login
```

### Resume Management

```
POST /api/resume/create
GET /api/resume/my-resumes
PUT /api/resume/update/:id
DELETE /api/resume/delete/:id
```

### ATS & JD Analysis

```
POST /api/jd/analyze
POST /api/ats/score
POST /api/ats/apply-suggestion
```

### Resume Download

```
GET /api/resume/download/pdf/:id
```

---

# 🧪 Testing

Run automated feature tests:

```
node test.js
```

This verifies:

* Authentication
* Resume creation
* ATS scoring
* JD analysis
* Suggestions engine
* PDF generation

---

# 🛡 Security

* 🔐 JWT authentication
* 🔑 bcrypt password hashing
* 🛡 Helmet security headers
* 🌐 CORS protection
* ⏱ Rate limiting
* ✔ Input validation

---

# 📊 System Architecture

```
Frontend (React)
        ↓
REST API (Node + Express)
        ↓
ATS Engine (Scoring + Suggestions)
        ↓
MongoDB Database
        ↓
PDF Generator (Puppeteer)
```

---

# 👩‍💻 Author

**Tanuja Gunjal**

Tech Stack: **React • Node.js • MongoDB**


