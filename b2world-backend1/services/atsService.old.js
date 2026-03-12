/**
 * Production-Grade ATS Scoring Service - REFACTORED
 * Implements strict requirements for keyword matching, completeness, action verbs, readability
 * 
 * Scoring Breakdown:
 * - Keyword Matching: 40% (normalized matching with stemming/lemmatization)
 * - Section Completeness: 20% (weighted by importance)
 * - Action Verb Score: 10% (strong verbs vs weak verbs)
 * - Readability: 10% (bullet quality, length, clarity)
 * - Formatting: 20% (ATS-friendly structure)
 */

const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

// Stopwords - common English words
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where',
  'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also'
]);

// Generic/filler words to filter
const GENERIC_WORDS = new Set([
  'experience', 'knowledge', 'ability', 'skills', 'working', 'work', 'job',
  'role', 'position', 'company', 'team', 'responsibility', 'requirement',
  'good', 'great', 'excellent', 'strong', 'years', 'plus', 'required',
  'preferred', 'nice', 'day', 'year', 'month', 'manager', 'leader',
  'developer', 'engineer', 'analyst', 'specialist', 'consultant', 'associate',
  'india', 'united', 'states', 'california', 'new', 'york', 'london', 'bangalore',
  'hyderabad', 'mumbai', 'delhi', 'pune', 'tokyo', 'paris', 'berlin', 'remote',
  'onsite', 'relocate', 'relocation', 'location', 'based',
  'about', 'looking', 'applications', 'type', 'employment', 'understand',
  'understanding', 'seeking', 'interested', 'passionate', 'etc'
]);

// STRONG action verbs for resume bullets
const STRONG_VERBS = new Set([
  'achieved', 'analyzed', 'architected', 'automated', 'built', 'collaborated',
  'configured', 'contributed', 'coordinated', 'created', 'debugged', 'delivered',
  'deployed', 'designed', 'developed', 'diagnosed', 'directed', 'documented',
  'drove', 'enhanced', 'established', 'executed', 'facilitated', 'generated',
  'identified', 'implemented', 'improved', 'increased', 'integrated', 'launched',
  'led', 'leveraged', 'maintained', 'managed', 'mentored', 'migrated', 'monitored',
  'optimized', 'orchestrated', 'owned', 'planned', 'presented', 'reduced',
  'refactored', 'resolved', 'scaled', 'secured', 'shipped', 'spearheaded',
  'standardized', 'streamlined', 'supported', 'tested', 'trained', 'transformed',
  'upgraded', 'validated', 'wrote', 'accelerated', 'consolidated', 'expanded'
]);

// WEAK action verbs (penalize these)
const WEAK_VERBS = new Set([
  'worked', 'helped', 'assisted', 'responsible', 'involved', 'handled',
  'made', 'did', 'was', 'were', 'tried', 'attempted', 'attempted'
]);

// VAGUE phrases that weaken bullets
const VAGUE_PHRASES = [
  /^good.*experience/i,
  /^strong.*ability/i,
  /^responsible\s+for/i,
  /^involved\s+in/i,
  /^worked\s+with/i,
  /^helped\s+with/i,
  /^was\s+part\s+of/i,
  /contributed\s+to/i,
  /participated\s+in/i,
  /assisted\s+with/i,
  /etc\./i,
  /and\s+more/i,
  /things\s+like/i,
  /sort\s+of/i,
  /kind\s+of/i
];

// Synonym map for matching variants
const SYNONYM_MAP = {
  'js': ['javascript'], 'javascript': ['js'],
  'ts': ['typescript'], 'typescript': ['ts'],
  'node': ['nodejs', 'node.js'], 'nodejs': ['node', 'node.js'],
  'py': ['python'], 'python': ['py'],
  'k8s': ['kubernetes'], 'kubernetes': ['k8s'],
  'postgres': ['postgresql', 'pg'], 'postgresql': ['postgres', 'pg'],
  'mongo': ['mongodb'], 'mongodb': ['mongo'],
  'rest': ['restapi', 'restful'], 'restapi': ['rest', 'restful'],
  'ci/cd': ['cicd', 'ci cd'], 'cicd': ['ci/cd', 'ci cd'],
  'spring boot': ['springboot'], 'springboot': ['spring boot'],
  'express.js': ['expressjs', 'express'], 'expressjs': ['express', 'express.js'],
  'react.js': ['reactjs', 'react'], 'reactjs': ['react', 'react.js'],
  'oop': ['object oriented'], 'object oriented': ['oop'],
  'dsa': ['data structures'], 'data structures': ['dsa'],
  'aws': ['amazon web services'], 'azure': ['microsoft azure'],
  'docker': ['containerization'], 'git': ['version control'],
};

// ═════════════════════════════════════════════════════════════════════════════
// TEXT PROCESSING UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalize text: lowercase, remove punctuation, collapse whitespace
 */
const normalizeText = (text = '') => {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Tokenize text into words
 */
const tokenize = (text = '') => {
  return normalizeText(text).split(' ').filter(t => t.length > 0);
};

/**
 * Stemming: reduce words to root form
 * Implements common suffix removal: -ing, -ed, -tion, -ation, -s, -es
 */
const stemWord = (word = '') => {
  if (!word || word.length < 3) return word;
  
  let stem = word.toLowerCase();
  
  // Remove plurals first
  if (stem.endsWith('ies')) stem = stem.slice(0, -3) + 'i';
  else if (stem.endsWith('es')) stem = stem.slice(0, -2);
  else if (stem.endsWith('s') && !stem.endsWith('ss')) stem = stem.slice(0, -1);
  
  // Remove common suffixes
  if (stem.endsWith('ing')) stem = stem.slice(0, -3);
  if (stem.endsWith('ed')) stem = stem.slice(0, -2);
  if (stem.endsWith('tion')) stem = stem.slice(0, -4) + 't';
  if (stem.endsWith('ation')) stem = stem.slice(0, -5) + 't';
  
  return stem;
};

/**
 * Check if text contains vague phrases
 */
const containsVaguePhrase = (text) => {
  return VAGUE_PHRASES.some(pattern => pattern.test(text));
};

/**
 * Count words in text
 */
const countWords = (text) => {
  return tokenize(text).length;
};

// ═════════════════════════════════════════════════════════════════════════════
// KEYWORD MATCHING (40%)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extract keywords from Job Description
 * Filters out: stopwords, generic words, numbers, short tokens without approval
 */
const extractJDKeywords = (jd) => {
  if (!jd) return [];
  
  let rawKeywords = [];
  
  // Use preextracted keywords if available
  if (jd.extractedKeywords && Array.isArray(jd.extractedKeywords)) {
    rawKeywords = jd.extractedKeywords.map(k => 
      typeof k === 'string' ? k : (k.keyword || String(k))
    );
  } else if (jd.jdText) {
    // Fallback: tokenize raw JD text
    rawKeywords = tokenize(jd.jdText);
  }
  
  // Filter and normalize
  const filtered = rawKeywords
    .map(k => normalizeText(String(k).trim()))
    .filter(k => k.length > 0)
    .filter(k => !STOPWORDS.has(k) && !GENERIC_WORDS.has(k))
    .filter(k => !/^\d+$/.test(k)) // No pure numbers
    .filter(k => k.length >= 3) // Must be 3+ chars
    .filter((v, i, a) => a.indexOf(v) === i) // Deduplicate
    .slice(0, 40); // Cap at 40
  
  return filtered;
};

/**
 * Match keyword against resume text
 * Strategy: Direct match, substring, tokens, stems, synonyms
 */
const matchKeyword = (resumeText, keyword) => {
  if (!resumeText || !keyword) return false;
  
  const normText = normalizeText(resumeText);
  const normKw = normalizeText(keyword);
  
  // 1. Direct match
  if (normText.includes(normKw)) return true;
  
  // 2. Multi-word phrase: all tokens must be present
  const kwTokens = tokenize(normKw);
  if (kwTokens.length > 1) {
    if (kwTokens.every(t => normText.includes(t))) return true;
  }
  
  // 3. Synonym matching
  const synonyms = SYNONYM_MAP[normKw] || [];
  for (const syn of [normKw, ...synonyms]) {
    if (normText.includes(syn)) return true;
  }
  
  // 4. Stem matching (for single-word keywords)
  if (kwTokens.length === 1) {
    const stemKw = stemWord(normKw);
    if (stemKw.length >= 4) { // Only stem if meaningful
      const textTokens = tokenize(normText);
      if (textTokens.some(t => stemWord(t) === stemKw)) return true;
    }
  }
  
  return false;
};

/**
 * Calculate keyword match score (40%)
 * matchedKeywords: keywords found in resume
 * missingKeywords: keywords NOT found in resume
 * keywordMatchPercent: (matched / total) * 100
 */
const calculateKeywordMatch = (resume, jdKeywords) => {
  if (!jdKeywords || jdKeywords.length === 0) {
    return { matchedKeywords: [], missingKeywords: [], keywordMatchPercent: 0 };
  }
  
  // Build full resume text
  const resumeText = buildResumeText(resume);
  
  const matched = [];
  const missing = [];
  
  for (const keyword of jdKeywords) {
    if (matchKeyword(resumeText, keyword)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }
  
  const percentage = (matched.length / jdKeywords.length) * 100;
  
  return {
    matchedKeywords: matched,
    missingKeywords: missing,
    keywordMatchPercent: Math.round(percentage)
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// SECTION COMPLETENESS (20%)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Calculate completeness score (20%)
 * 
 * CORE sections (weighted):
 * - Summary: 5 points
 * - Skills: 5 points
 * - Experience: 5 points
 * - Projects: 5 points
 * 
 * OPTIONAL sections:
 * - Certifications: 2 points
 * - Achievements: 2 points
 */
const calculateCompleteness = (resume) => {
  let score = 0;
  const weights = {
    summary: 5,
    skills: 5,
    experience: 5,
    projects: 5,
    certifications: 2,
    achievements: 2
  };
  
  // Personal info + email (required)
  if (resume.personalInfo?.fullName && resume.personalInfo?.email) {
    score += 2; // Base 2 points
  }
  
  // Summary: 50+ chars
  if (resume.summary && resume.summary.trim().length >= 50) {
    score += weights.summary;
  }
  
  // Skills: at least 1 skill group with items
  if (Array.isArray(resume.skills) && resume.skills.some(s => s.items?.length > 0)) {
    score += weights.skills;
  }
  
  // Experience: at least 1 job
  if (Array.isArray(resume.experience) && resume.experience.length > 0) {
    score += weights.experience;
  }
  
  // Projects: at least 1 project
  if (Array.isArray(resume.projects) && resume.projects.length > 0) {
    score += weights.projects;
  }
  
  // Certifications: bonus
  if (Array.isArray(resume.certifications) && resume.certifications.length > 0) {
    score += weights.certifications;
  }
  
  // Achievements: bonus
  if (Array.isArray(resume.achievements) && resume.achievements.length > 0) {
    score += weights.achievements;
  }
  
  // Normalize to 0-100
  const maxScore = Object.values(weights).reduce((a, b) => a + b, 0) + 2;
  return Math.round((score / maxScore) * 100);
};

// ═════════════════════════════════════════════════════════════════════════════
// ACTION VERB SCORE (10%)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Calculate action verb score (10%)
 * 
 * Scoring:
 * - Strong verb at start: +1 point
 * - Weak verb at start: -1 point
 * - Double-verb artifact: -1 point
 * - Vague phrase: -0.5 points
 */
const calculateActionVerbs = (resume) => {
  const bullets = [];
  
  // Collect all bullets
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(e => {
      if (Array.isArray(e.bullets)) bullets.push(...e.bullets.filter(Boolean));
    });
  }
  
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(p => {
      if (Array.isArray(p.bullets)) bullets.push(...p.bullets.filter(Boolean));
    });
  }
  
  if (bullets.length === 0) return 50; // Default if no bullets
  
  let score = 0;
  let penalties = 0;
  
  for (const bullet of bullets) {
    const words = tokenize(bullet);
    if (words.length === 0) continue;
    
    const firstWord = words[0];
    const secondWord = words[1] || '';
    
    // Check for strong verb
    if (STRONG_VERBS.has(firstWord)) {
      score += 1;
      
      // Check for double-verb artifact
      if (STRONG_VERBS.has(secondWord) || WEAK_VERBS.has(secondWord)) {
        penalties += 1;
      }
    } else if (WEAK_VERBS.has(firstWord)) {
      penalties += 1;
    }
    
    // Check for vague phrases
    if (containsVaguePhrase(bullet)) {
      penalties += 0.5;
    }
  }
  
  // Calculate percentage
  const maxScore = bullets.length;
  const finalScore = Math.max(0, score - penalties);
  const percentage = (finalScore / maxScore) * 100;
  
  return Math.min(100, Math.round(percentage));
};

// ═════════════════════════════════════════════════════════════════════════════
// READABILITY SCORE (10%)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Calculate readability score (10%)
 * 
 * Penalties:
 * - Bullet < 5 words: -5 points per bullet
 * - Bullet > 30 words: -3 points per bullet
 * - Repeated words (> 3x): -2 points per unique repeated word
 * - Vague phrases: -2 points per instance
 */
const calculateReadability = (resume) => {
  const bullets = [];
  
  // Collect bullets
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(e => {
      if (Array.isArray(e.bullets)) bullets.push(...e.bullets.filter(Boolean));
    });
  }
  
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(p => {
      if (Array.isArray(p.bullets)) bullets.push(...p.bullets.filter(Boolean));
    });
  }
  
  if (bullets.length === 0) return 50; // Default
  
  let score = 100;
  
  // Penalty: bullets too short (< 5 words)
  const shortBullets = bullets.filter(b => countWords(b) < 5).length;
  score -= shortBullets * 5;
  
  // Penalty: bullets too long (> 30 words)
  const longBullets = bullets.filter(b => countWords(b) > 30).length;
  score -= longBullets * 3;
  
  // Penalty: repeated words
  const allText = bullets.join(' ');
  const wordFreq = {};
  tokenize(allText).forEach(w => {
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  });
  const repeatedWords = Object.values(wordFreq).filter(n => n > 3).length;
  score -= repeatedWords * 2;
  
  // Penalty: vague phrases
  const vagueCount = bullets.filter(b => containsVaguePhrase(b)).length;
  score -= vagueCount * 2;
  
  return Math.max(0, Math.min(100, score));
};

// ═════════════════════════════════════════════════════════════════════════════
// FORMATTING SCORE (20%)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Calculate formatting score (20%)
 * Checks for ATS-friendly structure
 */
const calculateFormatting = (resume) => {
  const text = buildResumeText(resume);
  let score = 100;
  
  // Penalty: special characters/markdown
  if (/[*_~`#]{3,}/.test(text)) score -= 25;
  if (/\|.+\|/.test(text)) score -= 30;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(text)) score -= 20; // Emojis
  
  // Penalty: missing education
  if (!resume.education || resume.education.length === 0) score -= 5;
  
  return Math.max(0, score);
};

// ═════════════════════════════════════════════════════════════════════════════
// HELPER: BUILD RESUME TEXT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build full resume text for matching
 */
const buildResumeText = (resume) => {
  const sections = [];
  
  if (resume.summary) sections.push(resume.summary);
  
  if (Array.isArray(resume.skills)) {
    resume.skills.forEach(s => {
      if (s.category) sections.push(s.category);
      if (Array.isArray(s.items)) sections.push(...s.items);
    });
  }
  
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(e => {
      if (e.company) sections.push(e.company);
      if (e.role) sections.push(e.role);
      if (e.jobTitle) sections.push(e.jobTitle);
      if (Array.isArray(e.bullets)) sections.push(...e.bullets);
    });
  }
  
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(p => {
      if (p.title) sections.push(p.title);
      if (p.name) sections.push(p.name);
      if (p.description) sections.push(p.description);
      if (Array.isArray(p.techStack)) sections.push(...p.techStack);
      if (Array.isArray(p.bullets)) sections.push(...p.bullets);
    });
  }
  
  if (Array.isArray(resume.education)) {
    resume.education.forEach(e => {
      if (e.institution) sections.push(e.institution);
      if (e.degree) sections.push(e.degree);
      if (e.field) sections.push(e.field);
    });
  }
  
  return normalizeText(sections.join(' '));
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: CALCULATE ATS SCORE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Main ATS scoring function
 * 
 * Returns:
 * {
 *   totalScore: number (0-100) or null if no JD,
 *   breakdown: {
 *     keywordMatch: 0-100,
 *     completeness: 0-100,
 *     actionVerbs: 0-100,
 *     readability: 0-100,
 *     formatting: 0-100
 *   },
 *   matchedKeywords: string[],
 *   missingKeywords: string[],
 *   keywordMatchPercent: number,
 *   overallFeedback: { strengths, weaknesses, recommendations }
 * }
 */
const calculateATSScore = async (resumeId, jdId) => {
  // Validate
  if (!resumeId) throw new Error('calculateATSScore requires resumeId');
  
  const resume = await Resume.findById(resumeId).lean();
  if (!resume) throw new Error(`Resume ${resumeId} not found`);
  
  let jdKeywords = [];
  let actualJdId = jdId || resume.jdId;
  
  if (actualJdId) {
    try {
      const jd = await JobDescription.findById(actualJdId).lean();
      if (jd) {
        jdKeywords = extractJDKeywords(jd);
      }
    } catch (err) {
      console.warn('⚠️ Failed to extract JD keywords:', err.message);
    }
  }
  
  // Calculate scores
  const keywordData = calculateKeywordMatch(resume, jdKeywords);
  const completeness = calculateCompleteness(resume);
  const actionVerbs = calculateActionVerbs(resume);
  const readability = calculateReadability(resume);
  const formatting = calculateFormatting(resume);
  
  // Calculate total score (weighted)
  let totalScore = null;
  if (jdKeywords.length > 0) {
    totalScore = Math.round(
      keywordData.keywordMatchPercent * 0.40 +
      completeness * 0.20 +
      actionVerbs * 0.10 +
      readability * 0.10 +
      formatting * 0.20
    );
  }
  
  const breakdown = {
    keywordMatch: keywordData.keywordMatchPercent,
    completeness,
    actionVerbs,
    readability,
    formatting
  };
  
  // Generate feedback
  const overallFeedback = generateOverallFeedback(
    totalScore, 
    breakdown, 
    keywordData.missingKeywords
  );
  
  return {
    totalScore,
    scoringMode: totalScore !== null ? 'job-specific' : 'no-jd',
    breakdown,
    matchedKeywords: keywordData.matchedKeywords,
    missingKeywords: keywordData.missingKeywords,
    keywordMatchPercent: keywordData.keywordMatchPercent,
    overallFeedback,
    jdKeywordCount: jdKeywords.length
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// FEEDBACK GENERATION
// ═════════════════════════════════════════════════════════════════════════════

const generateOverallFeedback = (totalScore, breakdown, missingKeywords) => {
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];
  
  if (!breakdown) {
    return { strengths: [], weaknesses: [], recommendations: [] };
  }
  
  // STRENGTHS
  if (breakdown.keywordMatch >= 75) {
    strengths.push('Strong keyword match with the job description');
  }
  if (breakdown.formatting >= 90) {
    strengths.push('Clean and ATS-friendly formatting');
  }
  if (breakdown.completeness >= 85) {
    strengths.push('Resume is comprehensive and well-structured');
  }
  if (breakdown.actionVerbs >= 80) {
    strengths.push('Excellent use of strong action verbs throughout');
  }
  if (breakdown.readability >= 80) {
    strengths.push('Highly readable and compelling bullet points');
  }
  
  // WEAKNESSES & RECOMMENDATIONS
  if (breakdown.keywordMatch < 60) {
    weaknesses.push(`Keyword match is ${breakdown.keywordMatch}% - missing key skills`);
    recommendations.push(
      `Incorporate missing keywords: ${missingKeywords.slice(0, 3).join(', ')}`
    );
  }
  
  if (breakdown.completeness < 75) {
    weaknesses.push('Resume could be more comprehensive');
    recommendations.push('Add or expand key sections: Summary, Experience, Projects');
  }
  
  if (breakdown.actionVerbs < 75) {
    weaknesses.push('Some bullet points could use stronger action verbs');
    recommendations.push(
      'Replace weak verbs with: Architected, Optimized, Deployed, Engineered, etc.'
    );
  }
  
  if (breakdown.readability < 75) {
    weaknesses.push('Some bullet points could be more concise or specific');
    recommendations.push('Make bullets 10-20 words, focus on quantified impact');
  }
  
  if (breakdown.formatting < 85) {
    weaknesses.push('Formatting could be more ATS-optimized');
    recommendations.push('Use simple formatting: no tables, images, or special characters');
  }
  
  // Defaults
  if (strengths.length === 0) {
    strengths.push('Resume has good fundamentals');
  }
  if (weaknesses.length === 0) {
    weaknesses.push('Minor areas for optimization remain');
  }
  if (recommendations.length === 0) {
    recommendations.push('Review against job description and add quantified achievements');
  }
  
  return { strengths, weaknesses, recommendations };
};

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  calculateATSScore,
  calculateKeywordMatch,
  calculateCompleteness,
  calculateActionVerbs,
  calculateReadability,
  calculateFormatting,
  extractJDKeywords,
  matchKeyword,
  buildResumeText,
  tokenize,
  normalizeText,
  stemWord,
  STRONG_VERBS,
  WEAK_VERBS
};
