/**
 * Production-Grade ATS Scoring Service
 * PHASE 6 INTEGRATION: Now uses advanced keyword normalization and weighting
 * Fixed: Proper keyword matching, scoring, and suggestions
 */

const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSScoringEngineV2 = require('./atsScoringEngineV2');

// Stopwords to remove from keywords
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

// Generic words and location words to filter out
const GENERIC_WORDS = new Set([
  'experience', 'knowledge', 'ability', 'skills', 'working', 'work', 'job',
  'role', 'position', 'company', 'team', 'responsibility', 'requirement',
  'good', 'great', 'excellent', 'strong', 'years', 'plus', 'required',
  'preferred', 'nice', 'day', 'year', 'month', 'manager', 'leader',
  'developer', 'engineer', 'analyst', 'specialist', 'consultant', 'associate',
  // Location words (cities, countries, regions)
  'india', 'united', 'states', 'california', 'new', 'york', 'london', 'bangalore',
  'hyderabad', 'mumbai', 'delhi', 'pune', 'tokyo', 'paris', 'berlin', 'remote',
  'onsite', 'relocate', 'relocation', 'location', 'based', 'based',
  // Filler words
  'about', 'looking', 'applications', 'type', 'employment', 'understand',
  'understanding', 'seeking', 'interested', 'passionate', 'etc',
  // Articles and prepositions already in STOPWORDS, but adding common duplicates
  'etc', 'mean', 'use', 'provide', 'make', 'get', 'take', 'way', 'business',
  'create', 'build', 'develop', 'maintain', 'process', 'system', 'data', 'time'
]);

// Synonym map for better matching
const SYNONYM_MAP = {
  'js': 'javascript', 'ts': 'typescript',
  'node': 'nodejs', 'node.js': 'nodejs', 'nodej': 'nodejs',
  'py': 'python',
  'k8s': 'kubernetes', 'k8': 'kubernetes',
  'postgres': 'postgresql', 'pg': 'postgresql',
  'mongo': 'mongodb',
  'rest': 'restapi', 'restful': 'restapi', 'rest api': 'restapi', 'rest apis': 'restapi',
  'ci/cd': 'cicd', 'ci cd': 'cicd',
  'oop': 'objectoriented', 'object oriented': 'objectoriented',
  'dsa': 'datastructures', 'data structures': 'datastructures', 'ds': 'datastructures',
  'spring boot': 'springboot', 'springboot': 'springboot',
  'expressjs': 'express', 'express.js': 'express',
  'reactjs': 'react', 'react.js': 'react',
  'vuejs': 'vue', 'vue.js': 'vue',
  'angularjs': 'angular',
  'aws': 'aws', 'amazon web services': 'aws',
  'gcp': 'gcp', 'google cloud': 'gcp',
  'azure': 'azure', 'microsoft azure': 'azure',
  'mysql': 'mysql', 'sql': 'sql',
  'nosql': 'nosql',
  'git': 'git', 'github': 'github', 'gitlab': 'gitlab',
  'docker': 'docker', 'containerization': 'docker',
  'agile': 'agile', 'scrum': 'scrum',
  'jwt': 'jwt', 'json web token': 'jwt',
  'api': 'api', 'apis': 'api'
};

// Normalize text for comparison
const normalizeText = (text = '') => {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Tokenize text
const tokenize = (text = '') => {
  return normalizeText(text).split(' ').filter(t => t.length > 0);
};

// Stem word for fuzzy matching
const stemWord = (word = '') => {
  if (!word) return '';
  return word
    .toLowerCase()
    .replace(/(s|es|ed|ing|tion|ation)$/i, '')
    .replace(/y$/, 'i');
};

// Check if keyword matches resume text with multiple strategies
const matchKeyword = (resumeText, keyword) => {
  if (!resumeText || !keyword) return false;
  
  const normText = normalizeText(resumeText);
  const normKw = normalizeText(keyword);
  
  // Strategy 1: Direct substring match
  if (normText.includes(normKw)) return true;
  
  // Strategy 2: Multi-word phrase match
  const kwTokens = tokenize(keyword);
  if (kwTokens.length > 1) {
    const allTokensMatch = kwTokens.every(t => normText.includes(t));
    if (allTokensMatch) return true;
  }
  
  // Strategy 3: Synonym matching
  for (const [short, long] of Object.entries(SYNONYM_MAP)) {
    const expanded = normKw.replace(new RegExp(`\\b${short}\\b`, 'g'), long);
    if (normText.includes(expanded)) return true;
  }
  
  // Strategy 4: Stem match — STRICT: only exact stem equality, no startsWith
  // This prevents "java" matching "javascript"
  if (kwTokens.length === 1) {
    const stemKw = stemWord(normKw);
    // Only stem-match if stem is at least 5 chars (avoids short collisions like "go" → "g")
    if (stemKw.length >= 5) {
      const textTokens = tokenize(normText);
      if (textTokens.some(t => stemWord(t) === stemKw)) return true;
    }
  }
  
  return false;
};

// Tech acronyms that are OK to keep as single letters/short
const APPROVED_TECH_TOKENS = new Set([
  'js', 'ts', 'py', 'go', 'c', 'c++', 'c#', 'r', 'java', 'kotlin', 'swift',
  'php', 'ruby', 'rust', 'scala', 'haskell', 'clojure', 'gradle', 'maven',
  'npm', 'yarn', 'pip', 'gem', 'cargo', 'git', 'svn', 'sql', 'nosql', 'aws',
  'gcp', 'azure', 'ci', 'cd', 'jwt', 'oauth', 'api', 'rest', 'graphql', 'grpc',
  'xml', 'json', 'yaml', 'html', 'css', 'scss', 'sass', 'kubernetes', 'k8s',
  'docker', 'linux', 'windows', 'macos', 'os', 'oop', 'sdlc', 'agile', 'scrum',
  'kanban', 'vcs', 'dsa', 'ml', 'ai', 'nlp', 'cv', 'etl', 'vim', 'vscode'
]);

// Extract keywords from JD - STRICT NLP filtering
const extractJDKeywords = (jd) => {
  if (!jd) return [];
  
  // Use extractedKeywords if available
  if (jd.extractedKeywords && jd.extractedKeywords.length > 0) {
    const keywords = jd.extractedKeywords.map(k => 
      typeof k === 'string' ? k : (k.keyword || k)
    );
    
    return keywords
      .map(k => String(k).trim())
      .filter(k => {
        // Must not be empty or pure whitespace
        if (!k) return false;
        
        const normalized = normalizeText(k);
        
        // GUARD: Skip stopwords and generic words
        if (STOPWORDS.has(normalized) || GENERIC_WORDS.has(normalized)) return false;
        
        // GUARD: Skip junk - pure numbers, symbols
        if (/^\d+$/.test(normalized) || /^[^\w\s]+$/.test(normalized)) return false;
        
        // NLP FILTER: Multi-word keywords are OK if at least 2-3 chars per word
        // Single-word: must be 3+ chars OR approved tech token
        const words = normalized.split(/\s+/).filter(Boolean);
        
        if (words.length === 1) {
          const word = words[0];
          // Single word: need 3+ chars OR be approved tech token
          if (word.length < 3 && !APPROVED_TECH_TOKENS.has(word)) {
            return false;
          }
        } else if (words.length > 1) {
          // Multi-word: each word should be 2+ chars (except single-char tech tokens)
          const allWordsOK = words.every(w => 
            w.length >= 2 || APPROVED_TECH_TOKENS.has(w)
          );
          if (!allWordsOK) return false;
          
          // Max 4 words — reject overly long phrases
          if (words.length > 4) return false;
        }
        
        return true;
      })
      .filter((v, i, a) => a.indexOf(v) === i) // Deduplicate
      .slice(0, 40); // Cap at 40 keywords for performance
  }
  
  // Fallback: extract from raw JD text
  if (jd.jdText) {
    const tokens = tokenize(jd.jdText);
    return tokens
      .filter(t => {
        if (t.length < 3 && !APPROVED_TECH_TOKENS.has(t)) return false;
        if (STOPWORDS.has(t) || GENERIC_WORDS.has(t)) return false;
        if (/^\d+$/.test(t)) return false;
        return true;
      })
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 40);
  }
  
  return [];
};

// Build resume text for matching
const buildResumeText = (resume) => {
  const sections = [];
  
  if (resume.summary) sections.push(resume.summary);
  
  // Skills
  if (Array.isArray(resume.skills)) {
    resume.skills.forEach(s => {
      if (s.category) sections.push(s.category);
      if (Array.isArray(s.items)) {
        sections.push(...s.items);
      }
    });
  }
  
  // Experience
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(e => {
      if (e.company) sections.push(e.company);
      if (e.role) sections.push(e.role);
      if (e.jobTitle) sections.push(e.jobTitle);
      if (Array.isArray(e.bullets)) {
        sections.push(...e.bullets);
      }
    });
  }
  
  // Projects
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(p => {
      if (p.title) sections.push(p.title);
      if (p.name) sections.push(p.name);
      if (p.description) sections.push(p.description);
      if (Array.isArray(p.techStack)) {
        sections.push(...p.techStack);
      }
      if (Array.isArray(p.bullets)) {
        sections.push(...p.bullets);
      }
    });
  }
  
  // Education
  if (Array.isArray(resume.education)) {
    resume.education.forEach(e => {
      if (e.institution) sections.push(e.institution);
      if (e.degree) sections.push(e.degree);
      if (e.field) sections.push(e.field);
    });
  }
  
  return normalizeText(sections.join(' '));
};

// Calculate keyword match score (40%)
const calculateKeywordMatch = (resumeText, jdKeywords) => {
  if (!jdKeywords || jdKeywords.length === 0 || !resumeText) return 0;
  
  let matched = 0;
  let partialCredit = 0;
  
  for (const keyword of jdKeywords) {
    if (matchKeyword(resumeText, keyword)) {
      matched++;
    } else {
      // Partial credit for multi-word keywords
      const kwTokens = tokenize(keyword);
      if (kwTokens.length > 1) {
        const matchingTokens = kwTokens.filter(t => resumeText.includes(t)).length;
        const ratio = matchingTokens / kwTokens.length;
        if (ratio >= 0.7) {
          partialCredit += 0.5;
        }
      }
    }
  }
  
  const total = matched + partialCredit;
  const percentage = (total / jdKeywords.length) * 100;
  
  // Strict scaling - no artificial inflation
  return Math.round(Math.min(percentage, 100));
};

// Calculate completeness score (20%)
const calculateCompleteness = (resume) => {
  let score = 0;

  // CORE sections — must have all 5 for base score of 90
  const coreChecks = [
    { pass: resume.personalInfo?.fullName && resume.personalInfo?.email, weight: 10, name: 'personalInfo' },
    { pass: resume.summary && resume.summary.trim().length > 50, weight: 15, name: 'summary' },
    { pass: Array.isArray(resume.skills) && resume.skills.some(s => s.items?.length > 0), weight: 20, name: 'skills' },
    { pass: Array.isArray(resume.experience) && resume.experience.length > 0, weight: 30, name: 'experience' },
    { pass: Array.isArray(resume.education) && resume.education.length > 0, weight: 15, name: 'education' },
  ];
  coreChecks.forEach(c => { if (c.pass) score += c.weight; });

  // OPTIONAL sections — bonus up to 10 points
  if (Array.isArray(resume.projects) && resume.projects.length > 0) score += 6;
  if (Array.isArray(resume.certifications) && resume.certifications.length > 0) score += 4;
  if (Array.isArray(resume.achievements) && resume.achievements.some(
    a => typeof a === 'string' ? a.trim() : Object.values(a || {}).some(v => v?.trim())
  )) score += 2;

  // Experience depth bonus: more bullets with metrics = higher completeness
  if (Array.isArray(resume.experience)) {
    const totalBullets = resume.experience.reduce((sum, e) => sum + (e.bullets?.length || 0), 0);
    const bulletsWithMetrics = resume.experience.reduce((sum, e) =>
      sum + (e.bullets?.filter(b => /\d+%|\d+x|\d+K|\$\d+|improved|reduced|increased/i.test(b)).length || 0), 0);
    if (totalBullets > 0) {
      const metricRatio = bulletsWithMetrics / totalBullets;
      score += Math.round(metricRatio * 5); // up to 5 bonus points
    }
  }

  return Math.min(score, 100);
};

// Calculate formatting score (20%)
const calculateFormatting = (resume) => {
  const resumeText = buildResumeText(resume);
  
  let penalty = 0;
  
  // Check for problematic patterns
  if (/[*_~`#=]{3,}/.test(resumeText)) penalty += 25;
  if (/\|.+\|/.test(resumeText)) penalty += 30;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(resumeText)) penalty += 20;
  if (/^\s*[-*•]\s*$/gm.test(resumeText)) penalty += 10;
  
  return Math.max(0, 100 - penalty);
};

// Calculate action verbs score (10%)
const calculateActionVerbs = (resume) => {
  const strongVerbs = new Set([
    'achieved', 'analyzed', 'architected', 'automated', 'built', 'collaborated',
    'configured', 'contributed', 'coordinated', 'created', 'debugged', 'delivered',
    'deployed', 'designed', 'developed', 'diagnosed', 'directed', 'documented',
    'drove', 'enhanced', 'established', 'executed', 'facilitated', 'generated',
    'identified', 'implemented', 'improved', 'increased', 'integrated', 'launched',
    'led', 'leveraged', 'maintained', 'managed', 'mentored', 'migrated', 'monitored',
    'optimized', 'orchestrated', 'owned', 'reduced', 'refactored', 'resolved',
    'scaled', 'secured', 'shipped', 'spearheaded', 'standardized', 'streamlined',
    'tested', 'trained', 'transformed', 'upgraded', 'validated', 'wrote',
    'accelerated', 'consolidated', 'expanded', 'planned', 'presented'
  ]);

  const weakVerbs = new Set([
    'worked', 'helped', 'assisted', 'responsible', 'supported', 'involved',
    'handled', 'made', 'did', 'was', 'were', 'tried', 'attempted'
  ]);

  const allBullets = [];
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(e => {
      if (Array.isArray(e.bullets)) allBullets.push(...e.bullets.filter(Boolean));
    });
  }
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(p => {
      if (Array.isArray(p.bullets)) allBullets.push(...p.bullets.filter(Boolean));
    });
  }

  if (allBullets.length === 0) return 30;

  let strongCount = 0;
  let weakCount = 0;
  let doubleVerbCount = 0;

  for (const bullet of allBullets) {
    const words = tokenize(bullet).slice(0, 4);
    const firstWord = words[0] || '';
    const secondWord = words[1] || '';

    if (strongVerbs.has(firstWord)) {
      // Check for double-verb artifact: "Implemented resolved...", "Developed deployed..."
      if (strongVerbs.has(secondWord) || weakVerbs.has(secondWord)) {
        doubleVerbCount++;
      }
      strongCount++;
    } else if (weakVerbs.has(firstWord)) {
      weakCount++;
    }
  }

  const total = allBullets.length;
  const baseScore = (strongCount / total) * 100;
  const weakPenalty = (weakCount / total) * 20;
  const doubleVerbPenalty = (doubleVerbCount / total) * 15;

  return Math.max(0, Math.min(100, Math.round(baseScore - weakPenalty - doubleVerbPenalty)));
  

};

// Calculate readability score (10%)
const calculateReadability = (resume) => {
  const allBullets = [];
  
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(e => {
      if (Array.isArray(e.bullets)) {
        allBullets.push(...e.bullets);
      }
    });
  }
  
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(p => {
      if (Array.isArray(p.bullets)) {
        allBullets.push(...p.bullets);
      }
    });
  }
  
  if (allBullets.length === 0) return 50;
  
  // Check for very long bullets
  const longBullets = allBullets.filter(b => tokenize(b).length > 35).length;
  const longPenalty = Math.min(30, longBullets * 8);
  
  // Check for repeated words
  const allText = allBullets.join(' ');
  const words = tokenize(allText);
  const wordFreq = words.reduce((acc, w) => {
    acc[w] = (acc[w] || 0) + 1;
    return acc;
  }, {});
  const repeatedWords = Object.values(wordFreq).filter(n => n > 3).length;
  const repeatPenalty = Math.min(20, repeatedWords * 5);
  
  return Math.max(0, Math.min(100, 100 - longPenalty - repeatPenalty));
};

/**
 * Main ATS Score Calculation
 * Production-Ready with Complete Scoring and Feedback
 */
const calculateATSScore = async (resumeId, jdId) => {
  // ─────────────────── DEFENSIVE VALIDATION ──────────────────
  if (!resumeId) {
    throw new Error('calculateATSScore requires resumeId');
  }

  const resume = await Resume.findById(resumeId).lean();
  if (!resume) {
    throw new Error(`Resume ${resumeId} not found in database`);
  }
  
  // ─────────────────── JD HANDLING ──────────────────
  let jdKeywords = [];
  let actualJdId = jdId || resume.jdId;
  
  if (actualJdId) {
    try {
      const jd = await JobDescription.findById(actualJdId).lean();
      if (jd && jd.extractedKeywords && Array.isArray(jd.extractedKeywords) && jd.extractedKeywords.length > 0) {
        jdKeywords = extractJDKeywords(jd);
      }
    } catch (err) {
      console.warn('⚠️  Failed to extract JD keywords:', err.message);
      jdKeywords = [];
    }
  }
  
  const resumeText = buildResumeText(resume);
  
  // Calculate all scores
  const keywordMatch = jdKeywords.length > 0 ? calculateKeywordMatch(resumeText, jdKeywords) : 0;
  const completeness = calculateCompleteness(resume);
  const formatting = calculateFormatting(resume);
  const actionVerbs = calculateActionVerbs(resume);
  const readability = calculateReadability(resume);
  
  // Calculate weighted total score
  let totalScore;
  let breakdown;
  
  if (jdKeywords.length > 0) {
    const weightedSum = 
      keywordMatch * 0.40 +
      completeness * 0.20 +
      formatting * 0.20 +
      actionVerbs * 0.10 +
      readability * 0.10;
    totalScore = Math.round(weightedSum);
    
    breakdown = {
      keywordMatch,
      completeness,
      formatting,
      actionVerbs,
      readability
    };
  } else {
    totalScore = null;
    breakdown = {
      keywordMatch: 0,
      completeness,
      formatting,
      actionVerbs,
      readability
    };
  }
  
  // Find matched and missing keywords
  const matchedKeywords = jdKeywords.length > 0 ? jdKeywords.filter(k => matchKeyword(resumeText, k)) : [];
  const missingKeywords = jdKeywords.length > 0 ? jdKeywords.filter(k => !matchedKeywords.includes(k)) : [];
  const missingSections = getMissingSections(resume);
  
  // Generate overall feedback
  const overallFeedback = generateOverallFeedback(totalScore, breakdown, missingKeywords, missingSections, actionVerbs);
  
  return {
    totalScore,
    scoringMode: totalScore !== null ? 'job-specific' : 'no-jd',
    breakdown,
    matchedKeywords,
    missingKeywords,
    missingSections,
    overallFeedback,
    jdKeywordCount: jdKeywords.length,
    matchedKeywordCount: matchedKeywords.length
  };
};

// Generate overall feedback based on scores
const generateOverallFeedback = (totalScore, breakdown, missingKeywords, missingSections, actionVerbScore) => {
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];
  
  // Strengths
  if (!breakdown) {
    return { strengths: [], weaknesses: [], recommendations: [] };
  }
  
  if (breakdown.keywordMatch >= 70) {
    strengths.push('Strong keyword match with the job description');
  }
  if (breakdown.formatting >= 80) {
    strengths.push('Clean and ATS-friendly formatting');
  }
  if (breakdown.completeness >= 80) {
    strengths.push('Resume is comprehensive and well-structured');
  }
  if (breakdown.actionVerbs >= 75) {
    strengths.push('Excellent use of action verbs throughout');
  }
  if (breakdown.readability >= 75) {
    strengths.push('Highly readable and scannable content');
  }
  
  // If excellent overall, add a generic strength
  if (totalScore !== null && totalScore >= 80) {
    strengths.push('Overall well-optimized for ATS systems');
  }
  
  // Weaknesses
  if (breakdown.keywordMatch < 50) {
    weaknesses.push(`Only ${breakdown.keywordMatch}% keyword match - missing key skills from job description`);
    recommendations.push(`Add missing keywords: ${missingKeywords.slice(0, 3).join(', ')}`);
  } else if (breakdown.keywordMatch < 70) {
    weaknesses.push(`Keyword match is ${breakdown.keywordMatch}% - could match the job better`);
    recommendations.push(`Incorporate more keywords: ${missingKeywords.slice(0, 3).join(', ')}`);
  }
  
  if (breakdown.completeness < 70) {
    weaknesses.push('Resume is missing key sections or details');
    if (missingSections && missingSections.length > 0) {
      recommendations.push(`Add or expand: ${missingSections.slice(0, 3).join(', ')}`);
    }
  }
  
  if (breakdown.formatting < 70) {
    weaknesses.push('Formatting may not be ATS-friendly');
    recommendations.push('Ensure simple formatting: remove tables, images, and special characters');
  }
  
  if (breakdown.actionVerbs < 70) {
    weaknesses.push('Could use stronger action verbs in bullet points');
    recommendations.push('Start bullets with strong verbs: Developed, Implemented, Optimized, Analyzed, etc.');
  }
  
  if (breakdown.readability < 70) {
    weaknesses.push('Some bullet points may be too long or unclear');
    recommendations.push('Make bullet points concise (under 30 words), focus on impact');
  }
  
  // Default messages if empty
  if (strengths.length === 0 && totalScore !== null && totalScore >= 50) {
    strengths.push('Resume has solid fundamentals');
  }
  
  if (weaknesses.length === 0 && totalScore !== null && totalScore >= 70) {
    weaknesses.push('Minor areas for optimization');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Review job description and quantify achievements with metrics');
  }
  
  return { strengths, weaknesses, recommendations };
};

// Get missing sections for feedback
const getMissingSections = (resume) => {
  const missing = [];
  
  if (!resume.summary || resume.summary.length < 30) missing.push('summary');
  if (!resume.skills || resume.skills.length === 0) missing.push('skills');
  if (!resume.experience || resume.experience.length === 0) missing.push('experience');
  if (!resume.projects || resume.projects.length === 0) missing.push('projects');
  if (!resume.education || resume.education.length === 0) missing.push('education');
  
  return missing;
};

module.exports = {
  calculateATSScore,
  generateOverallFeedback,
  extractJDKeywords,
  buildResumeText,
  calculateKeywordMatch,
  calculateCompleteness,
  calculateFormatting,
  calculateActionVerbs,
  calculateReadability,
  matchKeyword,
  getMissingSections
};
