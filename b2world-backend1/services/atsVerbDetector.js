/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATS ACTION VERB DETECTOR
 * 
 * Detects and scores action verbs in resume text
 * Action verbs indicate accomplishments and impact
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { ACTION_VERBS } = require('./atsConfig');
const { normalizeText, tokenize } = require('./atsTextProcessor');

/**
 * Detects action verbs in text
 * Scans entire text (not just first word) for strong action verbs
 * 
 * @param {string} text - Text to scan for action verbs
 * @returns {Object} - Detection results
 * 
 * @example
 * detectActionVerbsInText('Developed REST APIs and optimized database queries')
 * // Returns: {
 * //   verbs: ['developed', 'optimized'],
 * //   count: 2,
 * //   percentage: 50  // 2 verbs per 4 tokens
 * // }
 */
function detectActionVerbsInText(text) {
  if (!text || typeof text !== 'string') {
    return {
      verbs: [],
      count: 0,
      percentage: 0
    };
  }
  
  const normalized = normalizeText(text);
  const tokens = tokenize(normalized);
  
  if (tokens.length === 0) {
    return {
      verbs: [],
      count: 0,
      percentage: 0
    };
  }
  
  // Find all action verbs in tokens
  const foundVerbs = [];
  const foundIndices = new Set();
  
  tokens.forEach((token, index) => {
    // Remove trailing punctuation
    const cleanToken = token.replace(/[.,;:!?]$/, '');
    
    if (ACTION_VERBS.has(cleanToken)) {
      foundVerbs.push(cleanToken);
      foundIndices.add(index);
    }
  });
  
  // Remove duplicates while preserving order
  const uniqueVerbs = [...new Set(foundVerbs)];
  
  return {
    verbs: uniqueVerbs,
    count: foundVerbs.length,
    percentage: tokens.length > 0 ? Math.round((foundIndices.size / tokens.length) * 100) : 0
  };
}

/**
 * Detects action verbs in a resume object
 * Scans experience and projects sections
 * 
 * @param {Object} resume - Resume object with structure { experience: [...], projects: [...], summary: ... }
 * @returns {Object} - Comprehensive action verb analysis
 * 
 * @example
 * detectActionVerbsInResume({
 *   experience: [{
 *     bullets: ['Developed REST APIs', 'Optimized queries', 'Did testing']
 *   }],
 *   projects: [{
 *     description: 'Built machine learning model'
 *   }],
 *   summary: 'I am a developer'
 * })
 * // Returns: {
 * //   totalActionVerbs: 4,
 * //   totalBullets: 3,
 * //   percentageWithActionVerbs: 67,
 * //   bulletsWithVerbs: 2,
 * //   bulletsBySection: { experience: 2, projects: 1 },
 * //   detectedVerbs: ['developed', 'optimized', 'built'],
 * //   score: 6 // out of 10
 * // }
 */
function detectActionVerbsInResume(resume) {
  if (!resume || typeof resume !== 'object') {
    return {
      totalActionVerbs: 0,
      totalBullets: 0,
      percentageWithActionVerbs: 0,
      bulletsWithVerbs: 0,
      bulletsBySection: {},
      detectedVerbs: [],
      score: 0
    };
  }
  
  const results = {
    totalActionVerbs: 0,
    totalBullets: 0,
    bulletsWithVerbs: 0,
    bulletsBySection: {},
    allDetectedVerbs: new Set(),
    bulletDetails: []
  };
  
  // Scan experience section
  if (resume.experience && Array.isArray(resume.experience)) {
    results.bulletsBySection.experience = 0;
    
    resume.experience.forEach(job => {
      if (job.bullets && Array.isArray(job.bullets)) {
        job.bullets.forEach(bullet => {
          results.totalBullets++;
          
          const detection = detectActionVerbsInText(bullet);
          results.totalActionVerbs += detection.count;
          
          if (detection.count > 0) {
            results.bulletsWithVerbs++;
            results.bulletsBySection.experience++;
            detection.verbs.forEach(v => results.allDetectedVerbs.add(v));
          }
          
          results.bulletDetails.push({
            section: 'experience',
            text: bullet,
            verbCount: detection.count,
            verbs: detection.verbs
          });
        });
      }
    });
  }
  
  // Scan projects section
  if (resume.projects && Array.isArray(resume.projects)) {
    results.bulletsBySection.projects = 0;
    
    resume.projects.forEach(project => {
      if (project.description) {
        results.totalBullets++;
        
        const detection = detectActionVerbsInText(project.description);
        results.totalActionVerbs += detection.count;
        
        if (detection.count > 0) {
          results.bulletsWithVerbs++;
          results.bulletsBySection.projects++;
          detection.verbs.forEach(v => results.allDetectedVerbs.add(v));
        }
        
        results.bulletDetails.push({
          section: 'projects',
          text: project.description,
          verbCount: detection.count,
          verbs: detection.verbs
        });
      }
    });
  }
  
  // Scan summary
  if (resume.summary && typeof resume.summary === 'string') {
    const summaryDetection = detectActionVerbsInText(resume.summary);
    summaryDetection.verbs.forEach(v => results.allDetectedVerbs.add(v));
  }
  
  // Calculate percentages and scores
  const percentageWithActionVerbs = results.totalBullets > 0
    ? Math.round((results.bulletsWithVerbs / results.totalBullets) * 100)
    : 0;
  
  const detectedVerbs = Array.from(results.allDetectedVerbs).sort();
  
  return {
    totalActionVerbs: results.totalActionVerbs,
    totalBullets: results.totalBullets,
    percentageWithActionVerbs,
    bulletsWithVerbs: results.bulletsWithVerbs,
    bulletsBySection: results.bulletsBySection,
    detectedVerbs,
    score: calculateActionVerbScore(percentageWithActionVerbs),
    details: results.bulletDetails
  };
}

/**
 * Calculates action verb score (0-10)
 * Based on percentage of bullets with action verbs
 * 
 * Scoring:
 * - < 25%: 0 points
 * - 25-50%: 2-4 points
 * - 50-75%: 5-7 points
 * - 75-90%: 8-9 points
 * - 90-100%: 10 points
 * 
 * @param {number} percentageWithActionVerbs - Percentage of bullets with action verbs
 * @returns {number} - Score 0-10
 * 
 * @example
 * calculateActionVerbScore(100)  // Returns: 10
 * calculateActionVerbScore(67)   // Returns: ~7
 * calculateActionVerbScore(50)   // Returns: ~5
 * calculateActionVerbScore(0)    // Returns: 0
 */
function calculateActionVerbScore(percentageWithActionVerbs) {
  if (percentageWithActionVerbs >= 90) return 10;
  if (percentageWithActionVerbs >= 75) return 8 + (percentageWithActionVerbs - 75) / 15;
  if (percentageWithActionVerbs >= 50) return 5 + (percentageWithActionVerbs - 50) / 25;
  if (percentageWithActionVerbs >= 25) return 2 + (percentageWithActionVerbs - 25) / 25;
  return 0;
}

/**
 * Analyzes action verb strength and diversity
 * Different action verbs carry different weight
 * 
 * @param {string[]} verbs - Array of action verbs
 * @returns {Object} - Verb analysis
 * 
 * @example
 * analyzeVerbStrength(['developed', 'built', 'helped', 'managed'])
 * // Returns: {
 * //   totalVerbs: 4,
 * //   uniqueVerbs: 4,
 * //   strengthScore: 8,  // 0-10 scale
 * //   verbCategories: { ... },
 * //   diversity: 100  // percent unique
 * // }
 */
function analyzeVerbStrength(verbs) {
  if (!verbs || verbs.length === 0) {
    return {
      totalVerbs: 0,
      uniqueVerbs: 0,
      strengthScore: 0,
      verbCategories: {},
      diversity: 0
    };
  }
  
  const uniqueVerbs = new Set(verbs);
  const uniqueCount = uniqueVerbs.size;
  const totalCount = verbs.length;
  
  // Categorize verbs by strength
  const strongVerbs = [
    'developed', 'architected', 'engineered', 'optimized', 'led',
    'transformed', 'revolutionized', 'orchestrated', 'spearheaded'
  ];
  
  const mediumVerbs = [
    'implemented', 'built', 'created', 'designed', 'improved',
    'enhanced', 'automated', 'integrated', 'launched', 'delivered'
  ];
  
  const weakVerbs = [
    'worked', 'managed', 'helped', 'assisted', 'supported',
    'participated', 'contributed', 'involved'
  ];
  
  let strongCount = 0;
  let mediumCount = 0;
  let weakCount = 0;
  
  verbs.forEach(verb => {
    if (strongVerbs.includes(verb)) strongCount++;
    else if (mediumVerbs.includes(verb)) mediumCount++;
    else if (weakVerbs.includes(verb)) weakCount++;
  });
  
  // Calculate strength score
  const strengthScore = Math.round(
    ((strongCount * 3) + (mediumCount * 2) + (weakCount * 1)) / (totalCount || 1)
  );
  
  const diversity = Math.round((uniqueCount / totalCount) * 100);
  
  return {
    totalVerbs: totalCount,
    uniqueVerbs: uniqueCount,
    strengthScore: Math.min(10, strengthScore),
    verbCategories: {
      strong: strongCount,
      medium: mediumCount,
      weak: weakCount
    },
    diversity
  };
}

/**
 * Suggests stronger action verbs to replace weak ones
 * 
 * @param {string} weakVerb - Weak action verb
 * @returns {string[]} - Suggestions for stronger verbs
 * 
 * @example
 * suggestStrongerVerb('helped')
 * // Returns: ['facilitated', 'enabled', 'supported', 'collaborated', ...]
 */
function suggestStrongerVerb(weakVerb) {
  const weakToStrong = {
    'helped': ['facilitated', 'enabled', 'supported', 'collaborated'],
    'worked': ['developed', 'engineered', 'built', 'created'],
    'managed': ['led', 'orchestrated', 'directed', 'coordinated'],
    'did': ['implemented', 'executed', 'delivered', 'completed'],
    'responsible': ['owned', 'spearheaded', 'drove', 'led'],
    'assisted': ['collaborated', 'partnered', 'supported'],
    'participated': ['contributed', 'engaged', 'involved'],
    'made': ['created', 'built', 'developed', 'engineered']
  };
  
  const normalized = normalizeText(weakVerb);
  return weakToStrong[normalized] || [];
}

module.exports = {
  detectActionVerbsInText,
  detectActionVerbsInResume,
  calculateActionVerbScore,
  analyzeVerbStrength,
  suggestStrongerVerb
};
