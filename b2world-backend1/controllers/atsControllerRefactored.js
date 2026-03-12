/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATS CONTROLLER - REFACTORED
 * 
 * Integrates:
 * - Completeness Detector (fixes zero returns)
 * - Keyword Matcher V2 (synonyms)
 * - Refined Suggestion Generator (3-6 natural suggestions)
 * - Apply Fix Service (proper score recalculation)
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');

// Import refactored services
const CompletenessDetector = require('./atsCompletenessDetector');
const KeywordMatcherV2 = require('./atsKeywordMatcherV2');
const { generateRefinedSuggestions } = require('./atsRefinedSuggestionGenerator');
const { applySingleSuggestionAndRecalculate, applyAllSuggestionsAndRecalculate } = require('./atsApplyFixService');

/**
 * Build searchable resume text from resume object
 * @private
 */
function buildSearchableResumeText(resume) {
  if (!resume || typeof resume !== 'object') return '';

  const parts = [];

  // Summary
  if (resume.summary) parts.push(resume.summary);

  // Skills
  if (Array.isArray(resume.skills)) {
    resume.skills.forEach(skill => {
      if (typeof skill === 'string') {
        parts.push(skill);
      } else if (skill && typeof skill === 'object') {
        if (skill.category) parts.push(skill.category);
        if (Array.isArray(skill.items)) {
          parts.push(...skill.items.map(i => String(i)));
        }
      }
    });
  }

  // Experience
  if (Array.isArray(resume.experience)) {
    resume.experience.forEach(exp => {
      if (exp.title) parts.push(exp.title);
      if (exp.company) parts.push(exp.company);
      if (exp.description) parts.push(exp.description);
      if (Array.isArray(exp.bullets)) {
        parts.push(...exp.bullets.map(b => String(b)));
      }
    });
  }

  // Projects
  if (Array.isArray(resume.projects)) {
    resume.projects.forEach(proj => {
      if (proj.name) parts.push(proj.name);
      if (proj.title) parts.push(proj.title);
      if (proj.description) parts.push(proj.description);
      if (Array.isArray(proj.bullets)) {
        parts.push(...proj.bullets.map(b => String(b)));
      }
    });
  }

  // Education
  if (Array.isArray(resume.education)) {
    resume.education.forEach(edu => {
      if (edu.school) parts.push(edu.school);
      if (edu.degree) parts.push(edu.degree);
      if (edu.description) parts.push(edu.description);
    });
  }

  return parts.filter(Boolean).join(' ');
}

/**
 * Calculate comprehensive ATS score using refactored components
 */
async function calculateATSScore(req, res) {
  try {
    const { resumeId } = req.body;

    if (!resumeId) {
      return res.status(400).json({
        success: false,
        message: 'Resume ID is required'
      });
    }

    // Fetch resume
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Check if JD is linked
    if (!resume.jdId) {
      return res.status(200).json({
        success: true,
        data: {
          totalScore: null,
          scoringMode: 'no-jd',
          message: 'Paste a Job Description to calculate ATS Score.',
          breakdown: {},
          missingKeywords: [],
          suggestions: []
        }
      });
    }

    // Fetch JD
    const jd = await JobDescription.findOne({ _id: resume.jdId, userId: req.user._id });
    if (!jd) {
      return res.status(404).json({
        success: false,
        message: 'Job description not found'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // REFACTORED SCORING FORMULA
    // ─────────────────────────────────────────────────────────────

    const resumeText = buildSearchableResumeText(resume);

    // 1. COMPLETENESS (20% weight) — FIX ZERO RETURN
    const completenessResult = CompletenessDetector.calculateCompleteness(resume);
    const completenessScore = completenessResult.score;

    console.log(`✓ Completeness: ${completenessScore} (sections: ${completenessResult.presentCount}/${completenessResult.totalSections})`);

    // 2. KEYWORD MATCHING (40% weight) — WITH SYNONYMS
    let jdKeywords = jd.extractedKeywords || [];
    if (!jdKeywords.length && jd.description) {
      jdKeywords = KeywordMatcherV2.extractJDKeywords(jd.description);
    }

    const keywordScore = KeywordMatcherV2.calculateKeywordScore(resumeText, jdKeywords);

    console.log(`✓ Keyword Match: ${keywordScore.score} (matched: ${keywordScore.matched.length}/${jdKeywords.length})`);

    // 3. FORMATTING (20% weight) — structure & bullets
    const formattingScore = calculateFormattingScore(resume);
    console.log(`✓ Formatting: ${formattingScore}`);

    // 4. ACTION VERBS (10% weight)
    const actionVerbScore = calculateActionVerbScore(resume);
    console.log(`✓ Action Verbs: ${actionVerbScore}`);

    // 5. READABILITY (10% weight)
    const readabilityScore = calculateReadabilityScore(resumeText);
    console.log(`✓ Readability: ${readabilityScore}`);

    // ─────────────────────────────────────────────────────────────
    // WEIGHTED FINAL SCORE
    // ─────────────────────────────────────────────────────────────
    const breakdown = {
      keywordMatch: keywordScore.score,
      sectionCompleteness: completenessScore,
      formatting: formattingScore,
      actionVerbs: actionVerbScore,
      readability: readabilityScore
    };

    const finalScore = Math.round(
      (keywordScore.score * 0.4) +
      (completenessScore * 0.2) +
      (formattingScore * 0.2) +
      (actionVerbScore * 0.1) +
      (readabilityScore * 0.1)
    );

    console.log(`\n🎯 FINAL ATS SCORE: ${finalScore}\n`);

    // ─────────────────────────────────────────────────────────────
    // GENERATE 3-6 SUGGESTIONS
    // ─────────────────────────────────────────────────────────────
    const suggestions = generateRefinedSuggestions(
      resume,
      breakdown,
      keywordScore.missing,
      jdKeywords,
      resumeText
    );

    console.log(`✓ Generated ${suggestions.length} suggestions`);

    // ─────────────────────────────────────────────────────────────
    // SAVE ATS REPORT
    // ─────────────────────────────────────────────────────────────
    const atsReport = new ATSReport({
      resumeId: resume._id,
      userId: req.user._id,
      jdId: jd._id,
      totalScore: finalScore,
      breakdown,
      scoringMode: 'job-specific',
      keywords: {
        matched: keywordScore.matched,
        missing: keywordScore.missing,
        total: jdKeywords.length
      },
      suggestions,
      createdAt: new Date()
    });

    await atsReport.save();

    // ─────────────────────────────────────────────────────────────
    // RESPONSE
    // ─────────────────────────────────────────────────────────────
    return res.json({
      success: true,
      data: {
        totalScore: finalScore,
        scoringMode: 'job-specific',
        breakdown,
        missingKeywords: keywordScore.missing,
        missingSections: completenessResult.missing,
        suggestions,
        completenessDetails: completenessResult
      }
    });

  } catch (error) {
    console.error('[calculateATSScore] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate ATS score',
      error: error.message
    });
  }
}

// ─────────────────────────────────────────────────────────────
// SCORING COMPONENT HELPERS
// ─────────────────────────────────────────────────────────────

function calculateFormattingScore(resume) {
  let score = 0;

  // Has main sections
  if (resume.experience && resume.projects && resume.education) {
    score += 20;
  }

  // Experience has bullets
  if (resume.experience && resume.experience.every(exp => exp.bullets && exp.bullets.length > 0)) {
    score += 30;
  }

  // Has dates
  if (resume.experience && resume.experience.some(exp => exp.startDate || exp.endDate)) {
    score += 20;
  }

  // No excessive all-caps
  const allText = buildSearchableResumeText(resume);
  if ((allText.match(/[A-Z]{2,}/g) || []).length < 20) {
    score += 20;
  }

  // Reasonable bullet count
  const totalBullets = (resume.experience || []).reduce((sum, exp) => sum + (exp.bullets ? exp.bullets.length : 0), 0);
  if (totalBullets > 5 && totalBullets < 50) {
    score += 10;
  }

  return Math.min(100, score);
}

function calculateActionVerbScore(resume) {
  const STRONG_VERBS = ['developed', 'built', 'designed', 'led', 'optimized', 'implemented', 'deployed',
    'created', 'managed', 'coordinated', 'facilitated', 'achieved', 'improved', 'enhanced', 'resolved'];

  let strengthCount = 0;
  let totalBullets = 0;

  if (resume.experience) {
    resume.experience.forEach(exp => {
      if (exp.bullets) {
        exp.bullets.forEach(bullet => {
          totalBullets++;
          const firstWord = bullet.split(/\s+/)[0].toLowerCase().replace(/[^\w]/g, '');
          if (STRONG_VERBS.includes(firstWord)) {
            strengthCount++;
          }
        });
      }
    });
  }

  if (totalBullets === 0) return 0;
  return Math.round((strengthCount / totalBullets) * 100);
}

function calculateReadabilityScore(text) {
  if (!text) return 0;

  // Average word length (3-7 is ideal)
  const words = text.split(/\s+/);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  let readabilityScore = Math.abs(5 - avgWordLength) < 2 ? 40 : 30;

  // Sentence length (not too long)
  const sentences = text.match(/[.!?]+/g) || [];
  const avgSentenceLength = words.length / sentences.length;
  if (avgSentenceLength < 25) {
    readabilityScore += 30;
  } else if (avgSentenceLength < 40) {
    readabilityScore += 20;
  }

  // Varied punctuation
  if (text.match(/[,;:—]/g)) {
    readabilityScore += 30;
  }

  return Math.min(100, readabilityScore);
}

// ─────────────────────────────────────────────────────────────
// APPLY SUGGESTION ENDPOINTS
// ─────────────────────────────────────────────────────────────

const applySuggestion = applySingleSuggestionAndRecalculate;
const applyAllSuggestions = applyAllSuggestionsAndRecalculate;

module.exports = {
  calculateATSScore,
  applySuggestion,
  applyAllSuggestions
};
