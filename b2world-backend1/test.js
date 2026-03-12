#!/usr/bin/env node

/**
 * B2World ATS Backend - Comprehensive Test Script
 * Tests all API endpoints and features
 */

require('dotenv').config();
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

let authToken = '';
let userId = '';
let resumeId = '';
let jdId = '';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  test: (msg) => console.log(`${colors.cyan}→${colors.reset} ${msg}`)
};

async function apiCall(endpoint, method = 'GET', data = null, useAuth = false) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (useAuth && authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Request failed');
    }
    
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testHealthCheck() {
  log.test('Testing health check...');
  const result = await apiCall('/health');
  
  if (result.success) {
    log.success('Server is running');
    return true;
  } else {
    log.error(`Health check failed: ${result.error}`);
    return false;
  }
}

async function testRegister() {
  log.test('Testing user registration...');
  const testUser = {
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'Test123456!'
  };

  const result = await apiCall('/api/auth/register', 'POST', testUser);
  
  if (result.success && result.data.data) {
    authToken = result.data.data.token;
    userId = result.data.data.user._id;
    log.success(`User registered: ${testUser.email}`);
    log.info(`Token: ${authToken.substring(0, 20)}...`);
    return true;
  } else {
    log.error(`Registration failed: ${result.error}`);
    return false;
  }
}

async function testLogin() {
  log.test('Testing login with admin credentials...');
  const credentials = {
    email: process.env.ADMIN_EMAIL || 'admin@b2world.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123'
  };

  const result = await apiCall('/api/auth/login', 'POST', credentials);
  
  if (result.success && result.data.data) {
    authToken = result.data.data.token;
    log.success('Login successful');
    return true;
  } else {
    log.error(`Login failed: ${result.error}`);
    return false;
  }
}

async function testCreateResume() {
  log.test('Testing resume creation...');
  const resumeData = {
    resumeTitle: 'Software Engineer Resume - Test',
    personalInfo: {
      fullName: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1-234-567-8900',
      location: 'San Francisco, CA',
      linkedin: 'linkedin.com/in/johndoe',
      github: 'github.com/johndoe'
    },
    summary: 'Experienced Full Stack Developer with 5+ years of expertise in building scalable web applications using React, Node.js, and MongoDB. Proven track record of delivering high-quality solutions and leading development teams.',
    skills: [
      {
        category: 'Programming Languages',
        items: ['JavaScript', 'Python', 'TypeScript', 'Java']
      },
      {
        category: 'Frameworks & Libraries',
        items: ['React', 'Node.js', 'Express', 'Django']
      },
      {
        category: 'Tools & Technologies',
        items: ['Git', 'Docker', 'AWS', 'MongoDB']
      }
    ],
    experience: [
      {
        company: 'Tech Corp',
        role: 'Senior Full Stack Developer',
        location: 'San Francisco, CA',
        startDate: 'Jan 2020',
        endDate: 'Present',
        current: true,
        bullets: [
          'Developed and maintained 15+ microservices using Node.js and Express, improving system scalability by 40%',
          'Led a team of 5 developers in building a real-time analytics dashboard using React and WebSockets',
          'Implemented CI/CD pipelines reducing deployment time by 60%',
          'Optimized database queries reducing response time by 35%'
        ]
      },
      {
        company: 'StartupXYZ',
        role: 'Full Stack Developer',
        location: 'New York, NY',
        startDate: 'Jun 2018',
        endDate: 'Dec 2019',
        current: false,
        bullets: [
          'Built RESTful APIs serving 100k+ daily active users',
          'Developed responsive web applications using React and Material-UI',
          'Collaborated with cross-functional teams to deliver features on time'
        ]
      }
    ],
    projects: [
      {
        title: 'E-Commerce Platform',
        techStack: ['React', 'Node.js', 'MongoDB', 'Stripe'],
        bullets: [
          'Built full-stack e-commerce platform with payment integration',
          'Implemented real-time inventory management system',
          'Achieved 99.9% uptime with load balancing'
        ]
      }
    ],
    education: [
      {
        institution: 'University of California',
        degree: 'Bachelor of Science',
        field: 'Computer Science',
        startDate: '2014',
        endDate: '2018',
        grade: '3.8 GPA'
      }
    ],
    certifications: [
      {
        name: 'AWS Certified Solutions Architect',
        issuer: 'Amazon Web Services',
        date: '2022',
        credentialId: 'AWS-12345'
      }
    ],
    templateId: 'classic'
  };

  const result = await apiCall('/api/resume/create', 'POST', resumeData, true);
  
  if (result.success && result.data.data) {
    resumeId = result.data.data.resume._id;
    log.success(`Resume created with ID: ${resumeId}`);
    return true;
  } else {
    log.error(`Resume creation failed: ${result.error}`);
    return false;
  }
}

async function testAnalyzeJD() {
  log.test('Testing job description analysis...');
  const jdData = {
    jdText: `
      We are looking for a Senior Full Stack Developer to join our team.
      
      Requirements:
      - 5+ years of experience in software development
      - Strong expertise in React, Node.js, and MongoDB
      - Experience with AWS cloud services
      - Proficiency in TypeScript and modern JavaScript
      - Experience with Docker and Kubernetes
      - Strong understanding of REST APIs and microservices architecture
      - Experience with CI/CD pipelines
      - Excellent problem-solving and communication skills
      
      Responsibilities:
      - Design and develop scalable web applications
      - Lead technical discussions and code reviews
      - Mentor junior developers
      - Collaborate with product and design teams
      - Implement best practices and coding standards
      
      Nice to have:
      - Experience with GraphQL
      - Knowledge of Python or Java
      - AWS certifications
    `,
    resumeId: resumeId
  };

  const result = await apiCall('/api/jd/analyze', 'POST', jdData, true);
  
  if (result.success && result.data.data) {
    jdId = result.data.data.jd._id;
    log.success(`JD analyzed. Role detected: ${result.data.data.jd.roleDetected}`);
    log.info(`Keywords found: ${result.data.data.jd.extractedKeywords.length}`);
    return true;
  } else {
    log.error(`JD analysis failed: ${result.error}`);
    return false;
  }
}

async function testATSScore() {
  log.test('Testing ATS score calculation...');
  const scoreData = {
    resumeId: resumeId,
    jdId: jdId
  };

  const result = await apiCall('/api/ats/score', 'POST', scoreData, true);
  
  if (result.success && result.data.data) {
    const score = result.data.data.report.totalScore;
    log.success(`ATS Score: ${score}/100`);
    log.info(`Keyword Match: ${result.data.data.report.breakdown.keywordMatchScore.score}%`);
    log.info(`Missing Keywords: ${result.data.data.report.missingKeywords.length}`);
    return true;
  } else {
    log.error(`ATS scoring failed: ${result.error}`);
    return false;
  }
}

async function testGetSuggestions() {
  log.test('Testing suggestion generation...');
  const suggestionData = {
    resumeId: resumeId,
    jdId: jdId
  };

  const result = await apiCall('/api/ats/suggestions', 'POST', suggestionData, true);
  
  if (result.success && result.data.data) {
    log.success(`Generated ${result.data.data.count} suggestions`);
    return true;
  } else {
    log.error(`Suggestion generation failed: ${result.error}`);
    return false;
  }
}

async function testGenerateResume() {
  log.test('Testing resume generation from JD...');
  const genData = {
    jdId: jdId,
    optimizeExisting: false
  };

  const result = await apiCall('/api/jd/generate-resume', 'POST', genData, true);
  
  if (result.success && result.data.data) {
    log.success('Resume generated from JD successfully');
    return true;
  } else {
    log.error(`Resume generation failed: ${result.error}`);
    return false;
  }
}

async function testGetAllResumes() {
  log.test('Testing fetch all resumes...');
  const result = await apiCall('/api/resume/my-resumes', 'GET', null, true);
  
  if (result.success && result.data.data) {
    log.success(`Found ${result.data.data.count} resume(s)`);
    return true;
  } else {
    log.error(`Fetch resumes failed: ${result.error}`);
    return false;
  }
}

async function testAdminStats() {
  log.test('Testing admin statistics...');
  const result = await apiCall('/api/admin/stats', 'GET', null, true);
  
  if (result.success && result.data.data) {
    const stats = result.data.data.stats;
    log.success('Admin stats retrieved');
    log.info(`Total Users: ${stats.totalUsers}`);
    log.info(`Total Resumes: ${stats.totalResumes}`);
    log.info(`Total Downloads: ${stats.totalDownloads}`);
    return true;
  } else {
    log.error(`Admin stats failed: ${result.error}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  B2World ATS Backend - Comprehensive Test Suite');
  console.log('='.repeat(60) + '\n');

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'User Registration', fn: testRegister },
    { name: 'User Login', fn: testLogin },
    { name: 'Create Resume', fn: testCreateResume },
    { name: 'Analyze Job Description', fn: testAnalyzeJD },
    { name: 'Calculate ATS Score', fn: testATSScore },
    { name: 'Generate Suggestions', fn: testGetSuggestions },
    { name: 'Generate Resume from JD', fn: testGenerateResume },
    { name: 'Get All Resumes', fn: testGetAllResumes },
    { name: 'Admin Statistics', fn: testAdminStats }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📋 ${test.name}`);
    console.log('─'.repeat(60));
    
    const result = await test.fn();
    
    if (result) {
      passed++;
    } else {
      failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Test Results');
  console.log('='.repeat(60));
  console.log(`${colors.green}✓ Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
  console.log(`Total: ${passed + failed}`);
  console.log('='.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log.error(`Test suite error: ${error.message}`);
  process.exit(1);
});
