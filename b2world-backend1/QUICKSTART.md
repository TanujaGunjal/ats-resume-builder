# 🚀 QUICK START GUIDE - B2World ATS Backend

## 📥 You Have Downloaded

✅ **Complete Production Backend** with ALL features working  
✅ **28 Functional API Endpoints**  
✅ **Real ATS Scoring Algorithm**  
✅ **NLP-Powered JD Analysis**  
✅ **AI Resume Generator**  
✅ **PDF Export System**  
✅ **Admin Dashboard**  
✅ **Comprehensive Testing Suite**  

---

## ⚡ Get Running in 3 Steps

### Step 1: Extract & Install
```bash
# Extract the ZIP file
unzip b2world-backend-complete.zip
cd b2world-backend-complete

# Install dependencies (takes ~1 minute)
npm install
```

### Step 2: Configure Database
```bash
# Copy environment template
cp .env.example .env

# Edit .env file
nano .env  # or use any text editor
```

**Choose ONE option:**

**Option A - Local MongoDB** (requires MongoDB installed):
```env
MONGODB_URI=mongodb://localhost:27017/b2world_ats
```

**Option B - MongoDB Atlas** (recommended, free tier available):
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/b2world_ats
```

Get MongoDB Atlas: https://www.mongodb.com/cloud/atlas

### Step 3: Seed & Start
```bash
# Create initial data (admin, templates, keywords)
npm run seed

# Start the server
npm run dev
```

✅ **Server running at http://localhost:5000**

---

## 🧪 Test Everything Works

```bash
# Run comprehensive test suite
node test.js
```

This tests:
- ✅ User registration & login
- ✅ Resume creation & management
- ✅ Job description analysis  
- ✅ ATS scoring
- ✅ AI suggestions
- ✅ Resume generation from JD
- ✅ Admin features

---

## 🔑 Default Login Credentials

After seeding, you can login with:

```
Email: admin@b2world.com
Password: Admin@123
Role: ADMIN
```

⚠️ **Change these in production!**

---

## 📡 Test API with cURL

### 1. Register a User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123456"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456"
  }'
```

Save the token from response!

### 3. Create Resume
```bash
curl -X POST http://localhost:5000/api/resume/create \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeTitle": "My Resume",
    "personalInfo": {
      "fullName": "John Doe",
      "email": "john@example.com"
    }
  }'
```

### 4. Analyze Job Description
```bash
curl -X POST http://localhost:5000/api/jd/analyze \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "jdText": "Looking for Full Stack Developer with React, Node.js experience..."
  }'
```

### 5. Get ATS Score
```bash
curl -X POST http://localhost:5000/api/ats/score \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "RESUME_ID",
    "jdId": "JD_ID"
  }'
```

---

## 🌐 Connect Your Frontend

```javascript
// Frontend configuration
const API_BASE_URL = 'http://localhost:5000';

// Store token after login
localStorage.setItem('token', response.data.token);

// Make authenticated requests
fetch(`${API_BASE_URL}/api/resume/my-resumes`, {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## 🚢 Deploy to Production

### Option 1: Render (Free Tier Available)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`  
6. Add environment variables:
   ```
   NODE_ENV=production
   MONGODB_URI=<your_mongodb_atlas_uri>
   JWT_SECRET=<random_32_char_string>
   CORS_ORIGIN=https://your-frontend.com
   ```
7. Deploy!

### Option 2: Railway (Even Easier)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project
3. Connect GitHub repo
4. Add MongoDB plugin (auto-configured!)
5. Set JWT_SECRET and CORS_ORIGIN
6. Deploy!

---

## 📁 What's Included

```
b2world-backend-complete/
├── 📂 models/              6 database schemas
├── 📂 controllers/         5 business logic files
├── 📂 routes/              5 API route files
├── 📂 middlewares/         Auth & admin guards
├── 📂 utils/               ATS scorer, NLP, PDF gen
├── 📄 app.js              Express setup
├── 📄 server.js           Entry point
├── 📄 seed.js             Database seeder
├── 📄 test.js             Test suite
├── 📄 start.sh            Auto-setup script
└── 📄 package.json        Dependencies
```

---

## 🆘 Troubleshooting

**"Module not found" errors?**
```bash
npm install
```

**MongoDB connection failed?**
- Check if MongoDB is running: `sudo systemctl status mongod`
- Verify connection string in `.env`
- For Atlas: whitelist your IP

**Port 5000 already in use?**
```bash
# Change port in .env
PORT=3000
```

**CORS errors from frontend?**
```bash
# Update .env
CORS_ORIGIN=http://localhost:3000
```

---

## 📚 Documentation Files

- `README.md` - Complete overview
- `API_TESTING.md` - All 28 endpoints with examples
- `DEPLOYMENT.md` - Deploy to Render/Railway/Heroku/AWS (coming soon)
- `PROJECT_SUMMARY.md` - Technical architecture (coming soon)

---

## ✅ Feature Checklist

All features are **fully functional** (not mock!):

- [x] JWT Authentication with bcrypt
- [x] Resume CRUD operations
- [x] NLP Job Description Analysis
- [x] 5-Component ATS Scoring (0-100)
- [x] AI-Powered Suggestions
- [x] Auto Resume Generation from JD
- [x] PDF Export with Puppeteer
- [x] Admin Dashboard & Analytics
- [x] Security (Helmet, CORS, XSS protection)
- [x] Database Seeding
- [x] Comprehensive Testing
- [x] Production-Ready

---

## 🎉 You're Ready!

Your backend is fully functional and ready to use!

**Next Steps:**
1. ✅ Start the server (`npm run dev`)
2. ✅ Run tests (`node test.js`)
3. ✅ Connect your frontend
4. ✅ Deploy to production

**Need Help?**
- Check `README.md` for detailed docs
- Run `node test.js` to verify everything works
- Test APIs with the examples above

---

**🚀 Built for B2World | Production Ready | All Features Live**
