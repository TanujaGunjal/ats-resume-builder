/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRODUCTION-GRADE ATS CONTROLLER
 * 
 * Fully compliant with specification:
 * ✅ Requirement 5: Preserves suggestion types (no type conversion)
 * ✅ Requirement 4: Generates realistic 3-6 actionable suggestions
 * ✅ Complete ATS scoring with detailed breakdown
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');
const { calculateScore, generateSuggestions, normalizeText, extractKeywords } = require('./atsProductionEngine');

// ══════════════════════════════════════════════════════════════════════════
// CALCULATE ATS SCORE ENDPOINT
// ══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ats/score
 * Calculate ATS score for a resume against a job description
 * 
 * Returns: {score, breakdown, suggestions, missingKeywords}
 */
const calculateATSScore = async (req, res) => {
  try {
    const { resumeId, jdId } = req.body;
    
    // ────────────────────────────────────────────────────────────────
    // 1. VALIDATE INPUTS
    // ────────────────────────────────────────────────────────────────
    if (!resumeId || !jdId) {
      return res.status(400).json({
        success: false,
        error: 'resumeId and jdId are required'
      });
    }
    
    // ────────────────────────────────────────────────────────────────
    // 2. FETCH RESUME & JD
    // ────────────────────────────────────────────────────────────────
    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }
    
    const jd = await JobDescription.findById(jdId);
    if (!jd) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }
    
    // ────────────────────────────────────────────────────────────────
    // 3. EXTRACT JD KEYWORDS
    // ────────────────────────────────────────────────────────────────
    const jdKeywords = jd.extractedKeywords || [];
    if (jdKeywords.length === 0) {
      console.warn(`[calculateATSScore] No keywords extracted for JD ${jdId}`);
    }
    
    // ────────────────────────────────────────────────────────────────
    // 4. CALCULATE SCORE
    // ────────────────────────────────────────────────────────────────
    const resumeObj = resume.toObject();
    const scoreResult = calculateScore(resumeObj, jdKeywords);
    
    const { score, breakdown } = scoreResult;
    
    console.log(`[calculateATSScore] Score: ${score}, Keyword: ${breakdown.keywordMatch}, Completeness: ${breakdown.completeness}`);
    
    // ────────────────────────────────────────────────────────────────
    // 5. FIND MISSING KEYWORDS
    // ────────────────────────────────────────────────────────────────
    const resumeText = extractResumeText(resumeObj);
    const missingKeywords = jdKeywords.filter(keyword => 
      !normalizeText(resumeText).includes(normalizeText(keyword))
    );
    
    // ────────────────────────────────────────────────────────────────
    // 6. GENERATE SUGGESTIONS (Requirement 4 & 5)
    // ────────────────────────────────────────────────────────────────
    // IMPORTANT: Preserve suggestion types (do NOT convert to 'suggestion')
    const suggestions = generateSuggestions(
      resumeObj,
      breakdown,
      jdKeywords,
      missingKeywords
    );
    
    console.log(`[calculateATSScore] Generated ${suggestions.length} suggestions`);
    
    // ────────────────────────────────────────────────────────────────
    // 7. SAVE ATS REPORT
    // ────────────────────────────────────────────────────────────────
    const report = new ATSReport({
      resumeId,
      jdId,
      userId: resume.userId,
      totalScore: score,
      breakdown,
      suggestions,
      missingKeywords,
      timestamp: new Date()
    });
    
    await report.save();
    console.log(`[calculateATSScore] ✓ Saved ATSReport with score ${score}`);
    
    // ────────────────────────────────────────────────────────────────
    // 8. RETURN RESPONSE
    // ────────────────────────────────────────────────────────────────
    return res.json({
      success: true,
      data: {
        reportId: report._id,
        score,
        breakdown,
        suggestions,
        missingKeywords: missingKeywords.slice(0, 10), // Top 10
        analysis: {
          totalSections: countSections(resumeObj),
          totalBullets: countBullets(resumeObj),
          jobTitleMatch: detectJobTitleMatch(resumeObj, jd.title || '')
        }
      }
    });
    
  } catch (error) {
    console.error('[calculateATSScore] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ══════════════════════════════════════════════════════════════════════════
// SUGGEST MODE: Score without JD (Role-based)
// ══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ats/score/generic/:role
 * Score resume without JD using role-based keywords
 */
const calculateATSScoreGeneric = async (req, res) => {
  try {
    const { resumeId } = req.body;
    const { role } = req.params;
    
    if (!resumeId || !role) {
      return res.status(400).json({
        success: false,
        error: 'resumeId and role are required'
      });
    }
    
    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }
    
    // Use role-based generic keywords (software engineer, data scientist, etc.)
    const roleKeywords = getRoleKeywords(role);
    
    const resumeObj = resume.toObject();
    const scoreResult = calculateScore(resumeObj, roleKeywords);
    const { score, breakdown } = scoreResult;
    
    const resumeText = extractResumeText(resumeObj);
    const missingKeywords = roleKeywords.filter(keyword => 
      !normalizeText(resumeText).includes(normalizeText(keyword))
    );
    
    const suggestions = generateSuggestions(resumeObj, breakdown, roleKeywords, missingKeywords);
    
    return res.json({
      success: true,
      data: {
        score,
        breakdown,
        suggestions,
        role,
        missingKeywords: missingKeywords.slice(0, 5)
      }
    });
    
  } catch (error) {
    console.error('[calculateATSScoreGeneric] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

const extractResumeText = (resume) => {
  const parts = [
    resume.summary || '',
    (resume.skills || [])
      .flatMap(s => (Array.isArray(s.items) ? s.items : [s.category, s]))
      .join(' '),
    (resume.experience || [])
      .map(e => `${e.role || ''} ${e.company || ''} ${(e.bullets || []).join(' ')}`)
      .join(' '),
    (resume.projects || [])
      .map(p => `${p.name || ''} ${p.description || ''} ${(p.bullets || []).join(' ')}`)
      .join(' '),
    (resume.education || [])
      .map(e => `${e.degree || ''} ${e.field || ''} ${e.school || ''}`)
      .join(' '),
    (resume.certifications || [])
      .map(c => c.name || '')
      .join(' ')
  ];
  
  return parts.join(' ');
};

const countSections = (resume) => {
  let count = 0;
  if (resume.summary && String(resume.summary).trim().length > 0) count++;
  if (resume.skills && resume.skills.length > 0) count++;
  if (resume.experience && resume.experience.length > 0) count++;
  if (resume.projects && resume.projects.length > 0) count++;
  if (resume.education && resume.education.length > 0) count++;
  if (resume.certifications && resume.certifications.length > 0) count++;
  if (resume.achievements && resume.achievements.length > 0) count++;
  return count;
};

const countBullets = (resume) => {
  let count = 0;
  if (resume.experience && Array.isArray(resume.experience)) {
    count += resume.experience.reduce((sum, exp) => sum + (exp.bullets?.length || 0), 0);
  }
  if (resume.projects && Array.isArray(resume.projects)) {
    count += resume.projects.reduce((sum, proj) => sum + (proj.bullets?.length || 0), 0);
  }
  return count;
};

const detectJobTitleMatch = (resume, jobTitle) => {
  if (!jobTitle || !resume.experience || resume.experience.length === 0) {
    return false;
  }
  
  const titleWords = normalizeText(jobTitle).split(/\s+/);
  const resumeTitles = resume.experience.map(e => normalizeText(e.role || '')).join(' ');
  
  return titleWords.some(word => resumeTitles.includes(word));
};

/**
 * Get role-based keywords for generic scoring
 */
const getRoleKeywords = (role) => {
  const roleKeywordMap = {
    'software engineer': [
      'java', 'python', 'javascript', 'c++', 'rest api', 'microservices',
      'docker', 'kubernetes', 'sql', 'agile', 'testing', 'git', 'cicd'
    ],
    'data scientist': [
      'python', 'r', 'sql', 'machine learning', 'deep learning', 'tensorflow',
      'pandas', 'scikit-learn', 'data analysis', 'big data', 'spark', 'statistics'
    ],
    'frontend developer': [
      'react', 'angular', 'vue', 'html', 'css', 'javascript', 'responsive design',
      'webpack', 'git', 'testing', 'performance optimization', 'accessibility'
    ],
    'backend developer': [
      'nodejs', 'express', 'java', 'python', 'databases', 'sql', 'rest api',
      'microservices', 'docker', 'kubernetes', 'cicd', 'testing'
    ],
    'devops engineer': [
      'docker', 'kubernetes', 'cicd', 'jenkins', 'cloud', 'aws', 'azure',
      'terraform', 'ansible', 'monitoring', 'linux', 'scripting'
    ],
    'product manager': [
      'product strategy', 'roadmap', 'agile', 'user research', 'analytics',
      'leadership', 'stakeholder management', 'metrics', 'sql'
    ]
  };
  
  const normalized = normalizeText(role);
  const key = Object.keys(roleKeywordMap).find(k => normalized.includes(normalizeText(k)));
  
  return roleKeywordMap[key] || [
    'communication', 'teamwork', 'problem solving', 'leadership', 'project management'
  ];
};

// ══════════════════════════════════════════════════════════════════════════
// SCORE HISTORY
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ats/history/:resumeId
 * Get score history for a resume
 */
const getScoreHistory = async (req, res) => {
  try {
    const { resumeId } = req.params;
    
    const reports = await ATSReport.find({ resumeId })
      .sort({ timestamp: -1 })
      .limit(10);
    
    if (reports.length === 0) {
      return res.json({
        success: true,
        data: {
          resumeId,
          scores: [],
          message: 'No scoring history'
        }
      });
    }
    
    const scores = reports.map(report => ({
      score: report.totalScore,
      breakdown: report.breakdown,
      timestamp: report.timestamp,
      appliedCount: report.appliedCount || 0,
      suggestionsCount: (report.suggestions || []).length
    }));
    
    const improvement = reports.length > 1 
      ? reports[0].totalScore - reports[reports.length - 1].totalScore 
      : 0;
    
    return res.json({
      success: true,
      data: {
        resumeId,
        scores,
        improvement,
        latestScore: reports[0].totalScore
      }
    });
    
  } catch (error) {
    console.error('[getScoreHistory] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════

module.exports = {
  calculateATSScore,
  calculateATSScoreGeneric,
  getScoreHistory
};
