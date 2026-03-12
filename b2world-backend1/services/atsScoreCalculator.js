/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATS SCORE CALCULATOR — REFACTORED
 * 
 * FIXES:
 * 1. Proper weighted scoring calculation
 * 2. Category value validation (0-100 clamping)
 * 3. Fixed completeness detection
 * 4. Improved suggestion generation with thresholds
 * 5. Duplicate suggestion removal
 * 6. Deterministic scoring
 * 7. Debug logging
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { ATS_WEIGHTS, SECTION_REQUIREMENTS } = require('./atsConfig');
const {
  normalizeText,
  tokenize,
  removeStopwords,
  calculateReadability
} = require('./atsTextProcessor');
const { extractJDKeywords, calculateKeywordScore } = require('./atsKeywordExtractor');
const { detectActionVerbsInResume } = require('./atsVerbDetector');
const { detectDomain } = require('./atsSuggestionGenerator');
const { generateProductionSuggestions } = require('./atsProductionSuggestionEngine');

/**
 * Calculates complete ATS score using proper weighted formula
 * 
 * SCORING FORMULA (Weighted):
 * keywordScore = keywordMatch * 0.4
 * completenessScore = completeness * 0.2
 * formattingScore = formatting * 0.2
 * actionScore = actionVerbs * 0.1
 * readabilityScore = readability * 0.1
 * finalScore = Sum(all weighted scores)
 * 
 * @param {Object} resume - Resume object
 * @param {Object} jobDescription - Job description
 * @returns {Object} - Scoring results
 */
function calculateATSScore(resume, jobDescription) {
  if (!resume || typeof resume !== 'object' || !jobDescription) {
    console.error('❌ Invalid resume or job description provided');
    return createEmptyScoreResult();
  }

  try {
    // Step 1: Extract keywords from JD
    let jdKeywords = jobDescription.extractedKeywords || [];
    if (!jdKeywords.length && jobDescription.description) {
      jdKeywords = extractJDKeywords(jobDescription.description);
    }

    // Step 2: Build resume text
    const resumeText = buildSearchableResumeText(resume);
    
    // DEBUG: Validate resume text
    console.log('🔵 atsScoreCalculator - Resume text validation:');
    console.log(`   Text length: ${resumeText?.length || 0}`);
    console.log(`   Text trimmed length: ${resumeText?.trim().length || 0}`);
    if (resumeText?.length > 0) {
      console.log(`   Text preview: "${resumeText.substring(0, 100)}..."`);
    }
    
    if (!resumeText || resumeText.trim().length === 0) {
      console.error('❌ CRITICAL: Resume text is empty after buildSearchableResumeText!');
      console.error('   Resume object keys:', Object.keys(resume));
      console.error('   Resume.summary:', resume.summary ? `"${resume.summary.substring(0, 50)}..."` : 'MISSING');
      console.error('   Resume.experience length:', resume.experience?.length || 0);
      if (resume.experience?.length > 0) {
        console.error('   First experience:', JSON.stringify(resume.experience[0]).substring(0, 200));
      }
      console.error('   Resume.skills length:', resume.skills?.length || 0);
      return createEmptyScoreResult();
    }

    // Step 3: Calculate all component scores (0-100)
    const keywordScore = calculateKeywordMatch(resumeText, jdKeywords);
    const completenessScore = calculateCompleteness(resume);
    const formattingScore = calculateFormatting(resume);
    const actionVerbScore = calculateActionVerbComponent(resume);
    const readabilityScore = calculateReadabilityComponent(resumeText);

    // Step 4: VALIDATE all scores are in range 0-100
    const validatedBreakdown = validateScores({
      keywordMatch: keywordScore.score,
      sectionCompleteness: completenessScore.score,
      formatting: formattingScore.score,
      actionVerbs: actionVerbScore.score,
      readability: readabilityScore.score
    });

    // Step 5: CALCULATE FINAL SCORE using proper weighted formula
    const finalScore = calculateFinalScore(validatedBreakdown);

    // Step 6: Generate suggestions using production engine (3-6 actionable suggestions)
    const suggestions = generateProductionSuggestions(
      resume,
      validatedBreakdown,
      keywordScore.missing,
      jdKeywords,
      resumeText
    );

    // Step 7: Debug logging
    console.log('─'.repeat(70));
    console.log('🔵 ATS SCORE CALCULATION');
    console.log('─'.repeat(70));
    console.log('📊 Score Breakdown (Raw values 0-100):');
    console.log(`   Keyword Match:     ${keywordScore.score.toFixed(1)} (weight: 40%)`);
    console.log(`   Completeness:      ${completenessScore.score.toFixed(1)} (weight: 20%)`);
    console.log(`   Formatting:        ${formattingScore.score.toFixed(1)} (weight: 20%)`);
    console.log(`   Action Verbs:      ${actionVerbScore.score.toFixed(1)} (weight: 10%)`);
    console.log(`   Readability:       ${readabilityScore.score.toFixed(1)} (weight: 10%)`);
    console.log('─'.repeat(70));
    console.log('✅ Weighted Calculation:');
    console.log(`   ${keywordScore.score.toFixed(1)} × 0.4 = ${(validatedBreakdown.keywordMatch * 0.4).toFixed(2)}`);
    console.log(`   ${completenessScore.score.toFixed(1)} × 0.2 = ${(validatedBreakdown.sectionCompleteness * 0.2).toFixed(2)}`);
    console.log(`   ${formattingScore.score.toFixed(1)} × 0.2 = ${(validatedBreakdown.formatting * 0.2).toFixed(2)}`);
    console.log(`   ${actionVerbScore.score.toFixed(1)} × 0.1 = ${(validatedBreakdown.actionVerbs * 0.1).toFixed(2)}`);
    console.log(`   ${readabilityScore.score.toFixed(1)} × 0.1 = ${(validatedBreakdown.readability * 0.1).toFixed(2)}`);
    console.log('─'.repeat(70));
    console.log(`🎯 FINAL ATS SCORE: ${finalScore}`);
    console.log('─'.repeat(70));

    // Return result
    return {
      score: finalScore,
      breakdown: validatedBreakdown,
      keywords: {
        matched: keywordScore.matched,
        missing: keywordScore.missing,
        matchPercentage: keywordScore.matchPercentage,
        total: jdKeywords.length
      },
      suggestions,
      domain: detectDomain(resume),
      details: {
        keywordAnalysis: keywordScore.details,
        completenessAnalysis: completenessScore.details,
        formattingAnalysis: formattingScore.details,
        actionVerbAnalysis: actionVerbScore.details,
        readabilityAnalysis: readabilityScore.details
      }
    };
  } catch (error) {
    console.error('❌ Error calculating ATS score:', error.message);
    return createEmptyScoreResult();
  }
}

/**
 * Validates all scores are within 0-100 range
 * Clamps out-of-range values
 * 
 * @private
 * @param {Object} scores - Score object
 * @returns {Object} - Validated scores
 */
function validateScores(scores) {
  const validated = {};
  
  Object.entries(scores).forEach(([key, value]) => {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      console.warn(`⚠️ Invalid score for ${key}: ${value}, defaulting to 0`);
      validated[key] = 0;
    } else {
      // Clamp to 0-100
      validated[key] = Math.max(0, Math.min(100, numValue));
    }
  });
  
  return validated;
}

/**
 * Calculates final ATS score using weighted formula
 * 
 * Formula:
 * score = (keyword * 0.4) + (sectionCompleteness * 0.2) + (formatting * 0.2) + (actionVerbs * 0.1) + (readability * 0.1)
 * 
 * @private
 * @param {Object} breakdown - Validated breakdown {keywordMatch, sectionCompleteness, formatting, actionVerbs, readability}
 * @returns {number} - Final score rounded to nearest integer (0-100)
 */
function calculateFinalScore(breakdown) {
  const weighted =
    breakdown.keywordMatch * 0.4 +
    breakdown.sectionCompleteness * 0.2 +
    breakdown.formatting * 0.2 +
    breakdown.actionVerbs * 0.1 +
    breakdown.readability * 0.1;

  // Round to nearest integer
  return Math.round(weighted);
}

/**
 * Calculates completeness score based on section presence
 * 
 * @private
 * @param {Object} resume - Resume object
 * @returns {number} - Completeness score (0-100)
 */
function calculateCompleteness(resume) {
  const sections = {
    summary: resume.summary && resume.summary.trim().length > 10,
    skills: resume.skills && Array.isArray(resume.skills) && resume.skills.length > 0,
    experience: resume.experience && Array.isArray(resume.experience) && resume.experience.length > 0,
    projects: resume.projects && Array.isArray(resume.projects) && resume.projects.length > 0,
    education: resume.education && Array.isArray(resume.education) && resume.education.length > 0,
    certifications: resume.certifications && Array.isArray(resume.certifications) && resume.certifications.length > 0,
    achievements: resume.achievements && Array.isArray(resume.achievements) && resume.achievements.length > 0
  };

  const presentSections = Object.values(sections).filter(Boolean).length;
  const totalSections = Object.keys(sections).length;

  // Scoring rules:
  // 7/7 present = 100
  // 6/7 present = 90
  // 5/7 present = 80
  // 4/7 present = 60
  // 3 or fewer present = 40
  let score = 0;
  if (presentSections === 7) {
    score = 100;
  } else if (presentSections === 6) {
    score = 90;
  } else if (presentSections === 5) {
    score = 80;
  } else if (presentSections === 4) {
    score = 60;
  } else if (presentSections >= 3) {
    score = 40;
  } else {
    score = 0;
  }

  return {
    score,
    details: {
      presentSections,
      totalSections,
      sections
    }
  };
}

/**
 * Generates improved suggestions based on score thresholds
 * Ensures at least 1-3 suggestions when scores are below thresholds
 * Deduplicates suggestions
 * 
 * @private
 * @param {Object} resume - Resume object
 * @param {Object} breakdown - Score breakdown
 * @param {string[]} missingKeywords - Missing keywords from JD
 * @param {string[]} jdKeywords - All JD keywords
 * @param {string} resumeText - Resume text
 * @returns {Array} - Deduplicated suggestions
 */
function generateImprovedSuggestions(resume, breakdown, missingKeywords, jdKeywords, resumeText) {
  // FALLBACK: Use production suggestion engine
  // Should not be called directly; use generateProductionSuggestions instead
  return generateProductionSuggestions(resume, breakdown, missingKeywords, jdKeywords, resumeText);
}

/**
 * Calculates keyword match score (40% weight)
 * 
 * @private
 * @param {string} resumeText - Resume text
 * @param {string[]} jdKeywords - Keywords from job description
 * @returns {Object} - Keyword score and matching details
 */

function calculateKeywordMatch(resumeText, jdKeywords) {
  if (!jdKeywords || jdKeywords.length === 0) {
    return {
      score: 0,
      matched: [],
      missing: [],
      matchPercentage: 0,
      details: {}
    };
  }
  
  const keywordResult = calculateKeywordScore(resumeText, jdKeywords);
  
  return {
    score: keywordResult.score,
    matched: keywordResult.matched,
    missing: keywordResult.missing,
    matchPercentage: keywordResult.matchPercentage,
    details: keywordResult.details
  };
}

/**
 * Calculates section completeness score (20% weight)
 * Evaluates presence and quality of each resume section
 * 
 * @private
 * @param {Object} resume - Resume object
 * @returns {Object} - Completeness score and breakdown
 */
function calculateSectionCompleteness(resume) {
  // Use the new calculateCompleteness function
  return calculateCompleteness(resume);
}

/**
 * Calculates formatting score (20% weight)
 * Evaluates resume structure, organization, and professional presentation
 * 
 * @private
 * @param {Object} resume - Resume object
 * @returns {Object} - Formatting score
 */
function calculateFormatting(resume) {
  let score = 0;
  const details = {};
  
  // Has consistent structure
  if (resume.experience && resume.projects && resume.education) {
    score += 20;
    details.structure = 20;
  }
  
  // Experience entries have bullets
  if (resume.experience) {
    const allHaveBullets = resume.experience.every(exp => {
      return exp.bullets && Array.isArray(exp.bullets) && exp.bullets.length > 0;
    });
    
    if (allHaveBullets && resume.experience.length > 0) {
      score += 25;
      details.experienceBullets = 25;
    } else {
      details.experienceBullets = 0;
    }
  }
  
  // Consistent date formatting
  const datePattern = /\d{4}|\d{1,2}\/\d{1,2}|\w+\s+\d{4}/;
  const experienceDates = resume.experience ? resume.experience.filter(exp => exp.startDate || exp.endDate) : [];
  if (experienceDates.length > 0) {
    score += 15;
    details.dates = 15;
  }
  
  // No obviously poor formatting indicators
  const allText = buildSearchableResumeText(resume);
  const hasManyAbbreviations = (allText.match(/[A-Z]{2,}/g) || []).length > 20;
  if (!hasManyAbbreviations) {
    score += 20;
    details.abbreviations = 20;
  }
  
  // Reasonable bullet length (not too short, not too long)
  if (resume.experience) {
    const bullets = resume.experience.reduce((acc, exp) => [...acc, ...(exp.bullets || [])], []);
    const reasonableLengths = bullets.filter(bullet => bullet.length > 20 && bullet.length < 200);
    const percentageReasonable = bullets.length > 0 ? reasonableLengths.length / bullets.length : 0;
    
    if (percentageReasonable > 0.8) {
      score += 20;
      details.bulletLength = 20;
    }
  }
  
  return {
    score: Math.min(100, score),
    details
  };
}

/**
 * Calculates action verb component score (10% weight)
 * 
 * @private
 * @param {Object} resume - Resume object
 * @returns {Object} - Action verb score
 */
function calculateActionVerbComponent(resume) {
  const analysis = detectActionVerbsInResume(resume);
  
  return {
    score: analysis.score * 10, // Score is already 0-10
    details: {
      totalActionVerbs: analysis.totalActionVerbs,
      totalBullets: analysis.totalBullets,
      percentageWithActionVerbs: analysis.percentageWithActionVerbs,
      detectedVerbs: analysis.detectedVerbs,
      bulletsBySection: analysis.bulletsBySection
    }
  };
}

/**
 * Calculates readability component score (10% weight)
 * Returns score on 0-100 scale
 * 
 * @private
 * @param {string} resumeText - Resume text
 * @returns {Object} - Readability score (0-100)
 */
function calculateReadabilityComponent(resumeText) {
  const readability = calculateReadability(resumeText);
  
  // Convert to 0-100 scale
  // Optimal is 10-20 words per sentence
  let score = 50; // Base score
  
  if (readability.avgWordsPerSentence >= 10 && readability.avgWordsPerSentence <= 20) {
    score = 100; // Perfect range
  } else if (readability.avgWordsPerSentence < 10) {
    // Too short - penalty
    const deficit = 10 - readability.avgWordsPerSentence;
    score = Math.max(30, 100 - (deficit * 5));
  } else {
    // Too long - penalty
    const excess = readability.avgWordsPerSentence - 20;
    score = Math.max(30, 100 - (excess * 2));
  }
  
  return {
    score: Math.round(score),
    details: readability
  };
}

/**
 * Builds searchable resume text from all sections
 * Concatenates all resume content for keyword matching
 * 
 * @private
 * @param {Object} resume - Resume object
 * @returns {string} - Concatenated resume text
 */
function buildSearchableResumeText(resume) {
  if (!resume || typeof resume !== 'object') {
    console.error('❌ buildSearchableResumeText: Resume is not an object', typeof resume);
    return '';
  }
  
  const parts = [];
  
  // DEBUG: Track what we're adding
  const debug = [];
  
  if (resume.summary) {
    parts.push(resume.summary);
    debug.push(`summary: ${resume.summary.length}`);
  }
  if (resume.jobTitle) {
    parts.push(resume.jobTitle);
    debug.push(`jobTitle: ${resume.jobTitle.length}`);
  }
  
  if (resume.experience && Array.isArray(resume.experience)) {
    debug.push(`experience: ${resume.experience.length} entries`);
    resume.experience.forEach((job, idx) => {
      if (job.role) parts.push(job.role);
      if (job.company) parts.push(job.company);
      if (job.bullets && Array.isArray(job.bullets)) {
        const bulletsText = job.bullets.join(' ');
        parts.push(bulletsText);
        debug.push(`  [${idx}] ${job.bullets.length} bullets (${bulletsText.length} chars)`);
      }
    });
  }
  
  if (resume.projects && Array.isArray(resume.projects)) {
    debug.push(`projects: ${resume.projects.length} entries`);
    resume.projects.forEach((project, idx) => {
      if (project.name) parts.push(project.name);
      if (project.description) parts.push(project.description);

      // Include project tech stack for keyword matching
      const techs = Array.isArray(project.technologies) ? project.technologies
        : Array.isArray(project.techStack) ? project.techStack
        : [];
      if (techs.length > 0) parts.push(techs.join(' '));

      // Include project bullets for keyword matching
      if (project.bullets && Array.isArray(project.bullets)) {
        parts.push(project.bullets.join(' '));
      }

      debug.push(`  [${idx}] name: ${project.name?.length || 0}, techs: ${techs.length}, bullets: ${project.bullets?.length || 0}`);
    });
  }
  
  if (resume.education && Array.isArray(resume.education)) {
    debug.push(`education: ${resume.education.length} entries`);
    resume.education.forEach((edu, idx) => {
      if (edu.degree) parts.push(edu.degree);
      if (edu.school) parts.push(edu.school);
      if (edu.field) parts.push(edu.field);
      debug.push(`  [${idx}] ${edu.degree || 'N/A'} from ${edu.school || 'N/A'}`);
    });
  }
  
  if (resume.skills && Array.isArray(resume.skills)) {
    const allSkills = [];
    resume.skills.forEach(skill => {
      if (typeof skill === 'string') {
        allSkills.push(skill);
      } else if (skill && skill.items && Array.isArray(skill.items)) {
        allSkills.push(...skill.items);
      }
    });
    if (allSkills.length > 0) {
      parts.push(allSkills.join(' '));
      debug.push(`skills: ${allSkills.length} items (${allSkills.join(' ').length} chars)`);
    }
  }
  
  // DEBUG: Log what we collected
  if (debug.length > 0) {
    console.log('🔵 buildSearchableResumeText - Content collected:');
    debug.forEach(d => console.log(`   ${d}`));
  }
  
  const finalText = parts.filter(p => p).join(' ');
  console.log(`🔵 buildSearchableResumeText - Final text length: ${finalText.length} chars`);
  
  return finalText;
}

/**
 * Creates empty score result when input is invalid
 * 
 * @private
 * @returns {Object} - Empty score result
 */
function createEmptyScoreResult() {
  return {
    score: 0,
    breakdown: {
      keywordMatch: 0,
      sectionCompleteness: 0,
      formatting: 0,
      actionVerbs: 0,
      readability: 0
    },
    keywords: {
      matched: [],
      missing: [],
      matchPercentage: 0,
      total: 0
    },
    suggestions: [],
    domain: 'default',
    details: {}
  };
}

module.exports = {
  calculateATSScore,
  calculateKeywordMatch,
  calculateSectionCompleteness,
  calculateCompleteness,
  calculateFormatting,
  validateScores,
  calculateFinalScore,
  buildSearchableResumeText
};
