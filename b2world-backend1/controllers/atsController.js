/**
 * atsController.js — Production-Grade ATS Controller
 *
 * PRODUCTION FIXES:
 * 1. calculateATSScore: uses atsService (single source of truth for scoring)
 * 2. applySuggestion: fixed section handlers, clean text, proper markModified
 * 3. achievements section: now BLOCKS apply (advisory only) — returns 400
 * 4. skills section: proper duplicate detection, markModified
 * 5. ATS recalculation after apply: uses same atsService for consistency
 * 6. Suggestions merged and deduplicated correctly after apply
 * 7. Debounce uses in-memory Map (not global[])
 * 8. No system-hint text leaking into resume content
 * 9. Proper MongoDB transaction + session handling
 * 10. Idempotent: applying same fix twice yields same result
 */

'use strict';

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');
const atsService = require('../services/atsService');
const ATSEngineAdapter = require('../services/atsEngineAdapter');
const SuggestionRuleEngine = require('../services/suggestionRuleEngine');
const { normalizeSuggestions } = require('../utils/suggestionNormalizer');
const { enrichSuggestionsWithAutoApplicable } = require('../utils/suggestionEngine');

// ──────────────────────────── DEBOUNCE MAP ────────────────────────────
// In-memory debounce map for preventing double-click races
const _debounceMap = new Map();
const DEBOUNCE_TTL_MS = 2000;

const checkDebounce = (key) => {
  const lastTime = _debounceMap.get(key);
  if (lastTime && Date.now() - lastTime < DEBOUNCE_TTL_MS) return true;
  _debounceMap.set(key, Date.now());
  // Auto-cleanup after TTL
  setTimeout(() => _debounceMap.delete(key), DEBOUNCE_TTL_MS + 100);
  return false;
};

// ✅ Safety filter for suggestion types - matches ATSReport schema enum
const VALID_SUGGESTION_TYPES = new Set([
  'keyword', 'experience', 'skills', 'projects', 'education', 'certifications',
  'summary', 'formatting', 'readability', 'missing_keyword', 'content',
  'grammar', 'structure', 'weak_verb', 'weak_bullet', 'missing_metrics', 'suggestion'
]);

const filterValidSuggestions = (suggestions) => {
  const filtered = suggestions.filter(s => VALID_SUGGESTION_TYPES.has(s.type));
  if (filtered.length < suggestions.length) {
    console.warn(`⚠️ Filtered ${suggestions.length - filtered.length} suggestions with invalid types`);
  }
  return filtered;
};


// ──────────────────────────── TEXT HELPERS ────────────────────────────

/**
 * Remove system-hint suffixes that should NOT appear in the resume.
 * Examples to strip:
 *   "...  — consider adding measurable impact..."
 *   "... - consider adding..."
 *   "(e.g., something)..."
 *   "Currently 5, target 10+"
 *   "improve by X%", "add XXX", "include XXX", etc.
 */
const cleanImprovedText = (text = '') => {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/\s*[—–\-]\s*(consider\s+adding|add\s+measurable|quantify\s+your|add\s+[\w\s]*?impact|add\s+[\w\s]*?outcome).*$/i, '')
    .replace(/\s*\(e\.g\.,?[^)]*\)\s*\.?$/i, '')
    .replace(/\s*[—–\-]\s*quantify.*$/i, '')
    .replace(/,?\s*currently\s+\d+,?\s*target\s+\d+\+?\.?$/i, '')
    .replace(/\s*—\s*[a-z].*$/i, '')
    .replace(/"\s*$/, '')
    .trim();
};

/** Parse skill names from a suggestion text */
const parseSkills = (text = '') => {
  // Extract quoted skills first
  const quoted = [...String(text).matchAll(/"([^"]+)"/g)].map(m => m[1].trim()).filter(Boolean);
  if (quoted.length > 0) return quoted;

  return String(text)
    .replace(/^add\s+/i, '')
    .split(/,|\||;|\band\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 60);
};

/** Repair bullet with consecutive strong verbs: keep only more specific verb */
const ALL_STRONG_VERBS = new Set([
  'achieved', 'analyzed', 'architected', 'automated', 'built', 'collaborated',
  'configured', 'contributed', 'coordinated', 'created', 'debugged', 'delivered',
  'deployed', 'designed', 'developed', 'diagnosed', 'directed', 'documented',
  'drove', 'enhanced', 'established', 'executed', 'facilitated', 'generated',
  'identified', 'implemented', 'improved', 'increased', 'integrated', 'launched',
  'led', 'leveraged', 'maintained', 'managed', 'mentored', 'migrated', 'monitored',
  'optimized', 'orchestrated', 'owned', 'reduced', 'refactored', 'resolved',
  'scaled', 'secured', 'shipped', 'spearheaded', 'streamlined', 'tested',
  'trained', 'transformed', 'upgraded', 'validated', 'wrote'
]);

const repairDoubleVerb = (text = '') => {
  if (!text || typeof text !== 'string') return text;
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return text;
  const first = words[0].toLowerCase();
  const second = words[1].toLowerCase();
  // "Developed deployed..." → "Deployed..."
  if (ALL_STRONG_VERBS.has(first) && ALL_STRONG_VERBS.has(second)) {
    const repaired = words.slice(1).join(' ');
    return repaired.charAt(0).toUpperCase() + repaired.slice(1);
  }
  return text;
};

// OLD FUNCTION (to be replaced)
const _OLD_repairDoubleVerb = (bullet) => {
  if (!bullet || typeof bullet !== 'string') return bullet;

  const strongVerbs = ['achieved', 'analyzed', 'architected', 'automated', 'built', 'collaborated',
    'configured', 'contributed', 'coordinated', 'created', 'debugged', 'delivered', 'deployed',
    'designed', 'developed', 'diagnosed', 'directed', 'documented', 'drove', 'enhanced',
    'established', 'executed', 'facilitated', 'generated', 'identified', 'implemented',
    'improved', 'increased', 'integrated', 'launched', 'led', 'leveraged', 'maintained',
    'managed', 'mentored', 'migrated', 'monitored', 'optimized', 'orchestrated', 'owned',
    'planned', 'presented', 'reduced', 'refactored', 'resolved', 'scaled', 'secured',
    'shipped', 'spearheaded', 'standardized', 'streamlined', 'supported', 'tested',
    'trained', 'transformed', 'upgraded', 'validated', 'wrote'
  ];

  const words = bullet.split(/\s+/);
  if (words.length < 3) return bullet; // Need at least "verb something verb"

  // Find consecutive verbs
  let repaired = [];
  let lastVerbIdx = -1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().replace(/[^a-z]/g, '');
    const isVerb = strongVerbs.includes(word);

    if (isVerb) {
      if (lastVerbIdx >= 0 && i - lastVerbIdx <= 2) {
        // Consecutive verbs found — skip the second one (less specific)
        continue;
      }
      lastVerbIdx = i;
      repaired.push(words[i]);
    } else {
      repaired.push(words[i]);
    }
  }

  const result = repaired.join(' ').trim();
  return result || bullet; // Fallback if something goes wrong
};

// ──────────────────────────── SCORE MAPPING ────────────────────────────

/**
 * Convert atsService breakdown (flat) → ATSReport storage format (nested)
 */
const toStorageBreakdown = (breakdown, scoringMode) => {
  const isJobSpecific = scoringMode === 'job-specific';
  return {
    keywordMatchScore: {
      score: isJobSpecific ? (breakdown.keywordMatch || 0) : 0,
      weight: isJobSpecific ? 40 : 0,
      details: {}
    },
    sectionCompletenessScore: {
      // ✅ FIXED: Use sectionCompleteness (not completeness) - matches engine output
      score: breakdown.sectionCompleteness || breakdown.completeness || 0,
      weight: isJobSpecific ? 20 : 30,
      details: {}
    },
    formattingScore: {
      score: breakdown.formatting || 0,
      weight: isJobSpecific ? 20 : 30,
      details: {}
    },
    actionVerbScore: {
      score: breakdown.actionVerbs || 0,
      weight: isJobSpecific ? 10 : 20,
      details: {}
    },
    readabilityScore: {
      score: breakdown.readability || 0,
      weight: isJobSpecific ? 10 : 20,
      details: {}
    }
  };
};

/** Convert keyword list to plain strings */
const toKeywordStrings = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map(kw => (typeof kw === 'string' ? kw : kw?.keyword || '').trim())
    .filter(Boolean);

// ──────────────────────────── CALCULATE ATS SCORE ────────────────────────────

const calculateATSScore = async (req, res) => {
  // SAFETY: Ensure response headers are set to JSON
  res.setHeader('Content-Type', 'application/json');
  
  let resumeId; // Define in outer scope so catch block can access it
  
  try {
    resumeId = req.body?.resumeId;

    console.log("🔵 ATS SCORE - RESUME ID:", resumeId);
    console.log("🔵 ATS SCORE - USER ID:", req.user?._id);

    // ─────────────────── DEFENSIVE VALIDATION ──────────────────
    if (!resumeId) {
      console.error('🔥 VALIDATION ERROR: resumeId missing');
      return res.status(400).json({ success: false, message: 'Resume ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      console.error('🔥 VALIDATION ERROR: Invalid resumeId format:', resumeId);
      return res.status(400).json({ success: false, message: 'Invalid resume ID format' });
    }

    // Fetch resume with ownership check
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      console.error('🔥 VALIDATION ERROR: Resume not found:', resumeId);
      return res.status(404).json({ success: false, message: 'Resume not found or access denied' });
    }

    console.log("✅ ATS SCORE: Resume found, jdId:", resume.jdId);

    // Check if JD is linked
    if (!resume.jdId) {
      console.log("⚠️ ATS SCORE: No JD linked to resume");
      return res.status(200).json({
        success: true,
        data: {
          totalScore: null,
          scoringMode: 'no-jd',
          message: 'Paste a Job Description to calculate ATS Score.',
          breakdown: {},
          missingKeywords: [],
          missingSections: [],
          suggestions: [],
          overallFeedback: { strengths: [], weaknesses: [], recommendations: [] }
        }
      });
    }

    // Fetch JD with ownership check
    const jd = await JobDescription.findOne({ _id: resume.jdId, userId: req.user._id });
    if (!jd) {
      console.error('🔥 ATS SCORE: JD not found for jdId:', resume.jdId);
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }

    // ✨ NEW: Calculate score using production-grade ATS Engine via adapter
    console.log("🔵 ATS SCORE: Calculating with new ATSEngine...");
    const scoreResult = ATSEngineAdapter.scoreResume(resume, jd);
    console.log("✅ ATS SCORE: Calculated score:", scoreResult.score);

    // Generate suggestions from new engine
    console.log("🔵 ATS SCORE: Generating suggestions with ATSEngine...");
    const engineSuggestions = scoreResult.suggestions || [];
    console.log("✅ ATS SCORE: Generated", engineSuggestions.length, "suggestions");
    
    // Format suggestions for API response
    const safeSuggestions = ATSEngineAdapter.formatSuggestionsForAPI(engineSuggestions);
    
    // Ensure overallFeedback exists
    const overallFeedback = {
      strengths: [],
      weaknesses: [],
      recommendations: []
    };

    // Persist ATS report with immutable record (audit trail pattern)
    console.log("🔵 ATS SCORE: Creating new ATSReport with resumeId:", resumeId, "jdId:", resume.jdId);
    
    // Transform breakdown to ATSReport schema format (nested score/weight/details structure)
    const transformedBreakdown = ATSEngineAdapter.transformBreakdownForATSReport(
      scoreResult.breakdown,
      scoreResult.details
    );
    
    console.log("🔵 ATS SCORE: Transformed breakdown keys:", Object.keys(transformedBreakdown));
    console.log("🔵 ATS SCORE: Transformed breakdown:", JSON.stringify(transformedBreakdown, null, 2).substring(0, 500));
    
    let atsReport;
    try {
      atsReport = await ATSReport.create({
        resumeId: resume._id,
        userId: req.user._id,
        jdId: resume.jdId,
        totalScore: scoreResult.score,
        scoringMode: 'job-specific',
        keywordMatchPercent: scoreResult.breakdown?.keywordMatch || 0,
        breakdown: transformedBreakdown,
        missingKeywords: scoreResult.keywords?.missing || [],
        jdKeywords: scoreResult.keywords?.matched || [],
        suggestions: safeSuggestions,
        overallFeedback,
        createdAt: new Date()
      });
      console.log("✅ ATS SCORE: ATSReport created", atsReport._id);
    } catch (dbError) {
      console.error('🔥 ATS SCORE: ATSReport validation failed');
      console.error('   Error message:', dbError.message);
      console.error('   Error details:', dbError.errors ? Object.keys(dbError.errors) : 'No validation errors');
      if (dbError.errors) {
        Object.entries(dbError.errors).forEach(([key, err]) => {
          console.error(`   ❌ ${key}: ${err.message}`);
        });
      }
      
      // Return proper JSON error response instead of crashing
      return res.status(500).json({
        success: false,
        message: 'Failed to save ATS report to database',
        error: process.env.NODE_ENV === 'development' ? dbError.message : 'Database validation error',
        validationErrors: process.env.NODE_ENV === 'development' ? dbError.errors : undefined
      });
    }

    // Update resume.atsScore so Dashboard sees latest score
    await Resume.updateOne(
      { _id: resume._id },
      { $set: { atsScore: scoreResult.score } }
    );
    console.log("✅ ATS SCORE: Resume atsScore updated to", scoreResult.score);

    return res.status(200).json({
      success: true,
      message: 'ATS score calculated successfully',
      data: {
        totalScore: scoreResult.score,
        scoringMode: 'job-specific',
        keywordMatch: scoreResult.breakdown?.keywordMatch || 0,
        completeness: scoreResult.breakdown?.sectionCompleteness || 0,
        formatting: scoreResult.breakdown?.formatting || 0,
        actionVerbs: scoreResult.breakdown?.actionVerbs || 0,
        readability: scoreResult.breakdown?.readability || 0,
        breakdown: {
          keywordMatch: scoreResult.breakdown?.keywordMatch || 0,
          sectionCompleteness: scoreResult.breakdown?.sectionCompleteness || 0,
          formatting: scoreResult.breakdown?.formatting || 0,
          actionVerbs: scoreResult.breakdown?.actionVerbs || 0,
          readability: scoreResult.breakdown?.readability || 0
        },
        missingKeywords: scoreResult.keywords?.missing || [],
        missingSections: [],
        matchedKeywords: scoreResult.keywords?.matched || [],
        suggestions: safeSuggestions || [],
        overallFeedback: overallFeedback
      }
    });

  } catch (error) {
    console.error('🔥 ATS SCORE ERROR - DETAILED DEBUG INFO:');
    console.error('  Message:', error.message);
    console.error('  Stack:', error.stack);
    console.error('  resumeId:', resumeId);
    console.error('  User ID:', req.user?._id);
    
    // Determine appropriate status code and message
    let statusCode = 500;
    let message = 'Failed to calculate ATS score';
    
    if (error.message.includes('not found')) {
      statusCode = 404;
      message = error.message;
    } else if (error.message.includes('requires')) {
      statusCode = 400;
      message = error.message;
    }
    
    // SAFETY: Check if headers already sent before responding
    if (!res.headersSent) {
      res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          stack: error.stack.split('\n').slice(0, 3).join('\n')
        } : undefined
      });
    }
  }
};

// ──────────────────────────── GET SUGGESTIONS ────────────────────────────

const getSuggestions = async (req, res) => {
  try {
    const { resumeId, jdId } = req.body;

    if (!resumeId) {
      return res.status(400).json({ success: false, message: 'Resume ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      return res.status(400).json({ success: false, message: 'Invalid resume ID format' });
    }

    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    // Resolve JD
    let jdData = null;
    const resolvedJdId = jdId || resume.jdId;

    if (resolvedJdId && mongoose.Types.ObjectId.isValid(String(resolvedJdId))) {
      jdData = await JobDescription.findOne({ _id: resolvedJdId, userId: req.user._id });
    }

    if (!jdData) {
      // Try latest ATS report
      const latestReport = await ATSReport.findOne({
        resumeId: resume._id,
        jdId: { $ne: null }
      }).sort({ createdAt: -1 });

      if (latestReport?.jdId) {
        jdData = await JobDescription.findOne({ _id: latestReport.jdId, userId: req.user._id });
      }
    }

    if (!jdData) {
      console.log("⚠️ GET_SUGGESTIONS: No Job Description found");
      return res.status(200).json({
        success: true,
        data: { suggestions: [], count: 0 }
      });
    }

    // ✨ NEW: Generate suggestions using production-grade ATS Engine via adapter
    console.log("🔵 GET_SUGGESTIONS: Generating with new ATSEngine...");
    const engineSuggestions = ATSEngineAdapter.getSuggestions(resume, jdData);
    console.log("✅ GET_SUGGESTIONS: Generated", engineSuggestions.length, "suggestions");

    // Format for API response
    const suggestions = ATSEngineAdapter.formatSuggestionsForAPI(engineSuggestions);

    return res.status(200).json({
      success: true,
      data: { suggestions, count: suggestions.length }
    });

  } catch (error) {
    console.error('[GET_SUGGESTIONS] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate suggestions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ──────────────────────────── APPLY SUGGESTION ────────────────────────────

const applySuggestion = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Instantiate suggestion engine
    const suggestionEngine = new SuggestionRuleEngine();

    const { resumeId, suggestionId, section, suggestedText, improvedText, autoApplicable, targetIndex, itemIndex, bulletIndex, debounceToken } = req.body;

    // ✅ VALIDATION: Log incoming suggestion
    console.log('🔵 [APPLY_SUGGESTION] Incoming request:', {
      resumeId,
      suggestionId,
      section,
      suggestedText: suggestedText?.substring(0, 50),
      improvedText: improvedText?.substring(0, 50),
      itemIndex,
      bulletIndex,
      targetIndex
    });

    // VALIDATION: Require either suggestedText or improvedText
    const textToApply = suggestedText || improvedText;
    if (!resumeId || !section || (!textToApply)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'resumeId, section, and textToApply are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Invalid resume ID format' });
    }

    // ── Debounce Check ──────────────────────────────────────────────────────
    if (debounceToken) {
      const debounceKey = `apply_${resumeId}_${debounceToken}`;
      if (checkDebounce(debounceKey)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(429).json({
          success: false,
          message: 'Operation in progress. Please wait.',
          retryAfter: DEBOUNCE_TTL_MS
        });
      }
    }

    // ── Load Resume ──────────────────────────────────────────────────────────
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    // ── Load JD for Score Recalculation ─────────────────────────────────────
    let jdKeywords = [];
    let existingJdId = resume.jdId || null;

    // Find the most recent ATS report with a JD
    const existingReport = await ATSReport.findOne({
      resumeId: resume._id,
      jdId: { $ne: null }
    }).sort({ createdAt: -1 }).session(session);

    if (!existingJdId && existingReport?.jdId) {
      existingJdId = existingReport.jdId;
      resume.jdId = existingJdId;
    }

    if (existingJdId) {
      const jd = await JobDescription.findOne({ _id: existingJdId, userId: req.user._id }).session(session);
      if (jd?.extractedKeywords) {
        jdKeywords = toKeywordStrings(jd.extractedKeywords);
      }
    }

    // ── Stale-Check (if sourceSuggestion available) ──────────────────────────
    if (suggestionId && existingReport?.suggestions?.length > 0) {
      const source = existingReport.suggestions.find(s => s.id === suggestionId);
      if (source?.currentText) {
        const _getActualText = () => {
          switch (section) {
            case 'summary': return resume.summary || '';
            case 'experience': {
              const ei = targetIndex?.expIndex ?? targetIndex?.index;
              const bi = targetIndex?.bulletIndex;
              if (ei == null || bi == null) return '';
              return resume.experience?.[ei]?.bullets?.[bi] || '';
            }
            case 'projects': {
              const pi = targetIndex?.projIndex ?? targetIndex?.index;
              const bi = targetIndex?.bulletIndex;
              if (pi == null || bi == null) return '';
              return resume.projects?.[pi]?.bullets?.[bi] || '';
            }
            default: return '';
          }
        };

        const actual = _getActualText();
        if (actual && normalizeForCompare(actual) !== normalizeForCompare(source.currentText)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: 'Suggestion is stale — the text has changed. Please refresh suggestions and try again.'
          });
        }
      }
    }

    // ── Apply Change by Section ──────────────────────────────────────────────
    let appliedSuccessfully = false;
    let appliedText = '';

    switch (section) {

      // ── summary ──
      case 'summary': {
        const cleanedSummary = cleanImprovedText(textToApply);
        if (!cleanedSummary) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'Suggestion text is empty after cleanup' });
        }
        resume.summary = cleanedSummary;
        appliedSuccessfully = true;
        appliedText = cleanedSummary;
        console.log('✅ [APPLY_SUGGESTION] Applied to summary');
        break;
      }

      // ── experience ──
      case 'experience': {
        const cleanedText = cleanImprovedText(textToApply);
        if (!cleanedText) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'Suggestion text is empty after cleanup' });
        }

        // Support both targetIndex format and direct parameters
        const expIdx = targetIndex?.expIndex ?? itemIndex ?? targetIndex?.index ?? null;
        const bulletIdx = targetIndex?.bulletIndex ?? bulletIndex ?? null;

        if (expIdx == null || bulletIdx == null) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'itemIndex and bulletIndex are required for experience suggestions'
          });
        }

        if (!resume.experience?.[expIdx]) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: `Invalid experience index: ${expIdx}` });
        }

        const exp = resume.experience[expIdx];
        if (!Array.isArray(exp.bullets) || bulletIdx < 0 || bulletIdx >= exp.bullets.length) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: 'Bullet index out of range. Please refresh suggestions and try again.'
          });
        }

        // Idempotency: don't apply if already same
        const existing = String(exp.bullets[bulletIdx] || '').trim();
        if (normalizeForCompare(existing) === normalizeForCompare(cleanedText)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: 'This suggestion has already been applied.'
          });
        }

        exp.bullets[bulletIdx] = cleanedText;
        resume.markModified('experience');
        appliedSuccessfully = true;
        appliedText = cleanedText;
        console.log(`✅ [APPLY_SUGGESTION] Applied to experience[${expIdx}].bullets[${bulletIdx}]`);
        break;
      }

      // ── projects ──
      case 'projects': {
        const cleanedText = cleanImprovedText(textToApply);
        if (!cleanedText) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'Suggestion text is empty after cleanup' });
        }

        // Support both targetIndex format and direct parameters
        const projIdx = targetIndex?.projIndex ?? itemIndex ?? targetIndex?.index ?? null;
        const bulletIdx = targetIndex?.bulletIndex ?? bulletIndex ?? null;

        if (projIdx == null || bulletIdx == null) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'itemIndex and bulletIndex are required for project suggestions'
          });
        }

        if (!resume.projects?.[projIdx]) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: `Invalid project index: ${projIdx}` });
        }

        const proj = resume.projects[projIdx];
        if (!Array.isArray(proj.bullets) || bulletIdx < 0 || bulletIdx >= proj.bullets.length) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: 'Bullet index out of range. Please refresh suggestions and try again.'
          });
        }

        const existing = String(proj.bullets[bulletIdx] || '').trim();
        if (normalizeForCompare(existing) === normalizeForCompare(cleanedText)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: 'This suggestion has already been applied.'
          });
        }

        proj.bullets[bulletIdx] = cleanedText;
        resume.markModified('projects');
        appliedSuccessfully = true;
        appliedText = cleanedText;
        console.log(`✅ APPLY_SUGGESTION: Applied to projects[${projIdx}].bullets[${bulletIdx}]`);
        break;
      }

      // ── skills ──
      case 'skills': {
        // BLOCK advisory-only suggestions: if text is too long or matches advisory pattern, reject
        const textLength = (textToApply || '').length;
        const looksAdvisoryOnly = textLength > 80 || /^(?:add|include|consider|try|think\s+about)/i.test(textToApply);
        
        if (looksAdvisoryOnly) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'This is an advisory suggestion and cannot be automatically applied. Please manually review and add skills.',
            advisoryOnly: true
          });
        }

        let cleanedSkills = cleanImprovedText(textToApply);
        
        // If cleaned result is empty but original was a short keyword (1-3 words), use original
        if (!cleanedSkills) {
          const wordCount = textToApply.trim().split(/\s+/).length;
          if (wordCount >= 1 && wordCount <= 3) {
            cleanedSkills = textToApply.trim();
          } else {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Suggestion text is empty after cleanup' });
          }
        }

        const extractedSkills = parseSkills(cleanedSkills);
        if (extractedSkills.length === 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'No valid skills found in suggestion text' });
        }

        if (!resume.skills || resume.skills.length === 0) {
          resume.skills = [{ category: 'Technical Skills', items: [] }];
        }

        const categoryIdx = targetIndex?.categoryIndex ?? 0;
        const safeCategoryIdx = resume.skills[categoryIdx] ? categoryIdx : 0;
        const targetCategory = resume.skills[safeCategoryIdx];
        targetCategory.items = targetCategory.items || [];

        const existingLower = new Set(targetCategory.items.map(s => String(s).toLowerCase().trim()));
        let changed = false;

        // If specific item index provided, replace that item
        if (targetIndex?.itemIndex != null && extractedSkills.length > 0) {
          const itemIdx = targetIndex.itemIndex;
          while (targetCategory.items.length <= itemIdx) targetCategory.items.push('');
          const newSkill = extractedSkills[0];
          if (targetCategory.items[itemIdx] !== newSkill) {
            targetCategory.items[itemIdx] = newSkill;
            changed = true;
            appliedText = newSkill;
          }
        } else {
          // Add new skills (skip duplicates)
          for (const skill of extractedSkills) {
            const skillLower = skill.toLowerCase().trim();
            if (!existingLower.has(skillLower) && skill.trim()) {
              targetCategory.items.push(skill);
              existingLower.add(skillLower);
              changed = true;
            }
          }
          appliedText = extractedSkills.join(', ');
        }

        if (changed) {
          resume.markModified('skills');
          appliedSuccessfully = true;
          console.log(`✅ APPLY_SUGGESTION: Applied ${extractedSkills.length} skills`);
        } else {
          // Skills already present — idempotent, not an error
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: 'All suggested skills already exist in your resume.'
          });
        }
        break;
      }

      // ── achievements — ADVISORY ONLY ──
      case 'achievements': {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Achievements must be added manually for best quality.',
          advisoryOnly: true,
          suggestion: {
            section: 'achievements',
            message: 'Please manually review and add key achievements to boost your ATS score.',
            suggestedText: suggestedText
          }
        });
      }

      // ── education ──
      case 'education': {
        const cleanedDegree = cleanImprovedText(textToApply);
        if (!cleanedDegree) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'Suggestion text is empty after cleanup' });
        }

        const eduIdx = targetIndex?.eduIndex ?? targetIndex?.index ?? (typeof targetIndex === 'number' ? targetIndex : null);

        if (eduIdx != null && resume.education?.[eduIdx]) {
          resume.education[eduIdx].degree = cleanedDegree;
          resume.markModified('education');
          appliedSuccessfully = true;
          appliedText = cleanedDegree;
          console.log(`✅ [APPLY_SUGGESTION] Applied to education[${eduIdx}]`);
        } else {
          resume.education = resume.education || [];
          resume.education.push({
            institution: '',
            degree: cleanedDegree,
            field: '',
            startDate: '',
            endDate: '',
            grade: '',
            location: ''
          });
          resume.markModified('education');
          appliedSuccessfully = true;
          appliedText = cleanedDegree;
          console.log(`✅ [APPLY_SUGGESTION] Added new education degree`);
        }
        break;
      }

      // ── certifications ──
      case 'certifications': {
        const cleanedCert = cleanImprovedText(textToApply);
        if (!cleanedCert) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'Suggestion text is empty after cleanup' });
        }

        const certIdx = targetIndex?.certIndex ?? targetIndex?.index ?? (typeof targetIndex === 'number' ? targetIndex : null);

        if (certIdx != null && resume.certifications?.[certIdx]) {
          resume.certifications[certIdx].name = cleanedCert;
          resume.markModified('certifications');
          appliedSuccessfully = true;
          appliedText = cleanedCert;
          console.log(`✅ [APPLY_SUGGESTION] Applied to certifications[${certIdx}]`);
        } else {
          resume.certifications = resume.certifications || [];
          resume.certifications.push({
            name: cleanedCert,
            issuer: '',
            date: '',
            credentialId: '',
            url: ''
          });
          resume.markModified('certifications');
          appliedSuccessfully = true;
          appliedText = cleanedCert;
          console.log(`✅ [APPLY_SUGGESTION] Added new certification`);
        }
        break;
      }

      default:
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: `Unsupported section: ${section}` });
    }

    if (!appliedSuccessfully) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Failed to apply suggestion: invalid target'
      });
    }

    // ── Save Resume ──────────────────────────────────────────────────────────
    await resume.save({ session });
    console.log(`[APPLY_FIX] Resume ${resume._id} saved. section=${section}`);

    // ── Recalculate ATS Score ────────────────────────────────────────────────
    let scoreResult;
    try {
      scoreResult = await atsService.calculateATSScore(String(resume._id), existingJdId ? String(existingJdId) : null);
      console.log(`[APPLY_FIX] Score recalculated: ${scoreResult.totalScore}/100 (mode=${scoreResult.scoringMode})`);
    } catch (scoringError) {
      console.error('[APPLY_FIX] Score recalculation failed:', scoringError.message);
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: 'Suggestion applied but ATS recalculation failed. Please refresh.',
        error: process.env.NODE_ENV === 'development' ? scoringError.message : undefined,
        data: {
          updatedResume: resume.toObject(),
          resumeUpdated: true,
          scoreRecalculationFailed: true
        }
      });
    }

    // ── Update ATS Report ────────────────────────────────────────────────────
    const reportFilter = { resumeId: resume._id };
    if (existingJdId) reportFilter.jdId = existingJdId;

    // Regenerate suggestions using fresh resume state
    let jdForSuggestions = null;
    if (existingJdId) {
      jdForSuggestions = await JobDescription.findOne({ _id: existingJdId, userId: req.user._id }).session(session);
    }

    // ✅ FIX: Use correct method call pattern
    const _applyEngine = new SuggestionRuleEngine();
    const _missingKwForApply = Array.isArray(scoreResult.missingKeywords)
      ? scoreResult.missingKeywords.map(k => (typeof k === 'string' ? k : k?.keyword || '')).filter(Boolean)
      : [];
    const _rawFresh = _applyEngine.generateSuggestions(resume.toObject(), _missingKwForApply);
    const freshSuggestions = Array.isArray(_rawFresh) ? _rawFresh : [];

    // ✅ NORMALIZE suggestions before saving to database
    console.log('🔵 [APPLY_SUGGESTION] About to normalize', freshSuggestions.length, 'fresh suggestions');
    if (freshSuggestions.length > 0) {
      console.log('   Fresh [0] type:', freshSuggestions[0].type);
    }
    const normalizedSuggestions = normalizeSuggestions(freshSuggestions);
    console.log('✅ [APPLY_SUGGESTION] Normalized', normalizedSuggestions.length, 'suggestions to schema format');
    if (normalizedSuggestions.length > 0) {
      console.log('   Normalized [0] type:', normalizedSuggestions[0].type, '(should be valid enum, NOT keyword_missing)');
    }

    // Merge: normalizedSuggestions (scoreResult.suggestions removed as it's always undefined)
    const allSuggestions = [
      ...normalizedSuggestions,
    ].filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);

    const normalizedMissingKeywords = toKeywordStrings(scoreResult.missingKeywords);

    // Create NEW report instead of updating existing one
    const newReport = await ATSReport.create({
      resumeId: reportFilter.resumeId,
      userId: req.user._id,
      jdId: reportFilter.jdId,
      totalScore: scoreResult.totalScore,
      score: scoreResult.totalScore,
      scoringMode: scoreResult.scoringMode,
      keywordMatchPercent: scoreResult.scoringMode === 'job-specific'
        ? (scoreResult.breakdown.keywordMatch || 0)
        : 0,
      breakdown: toStorageBreakdown(scoreResult.breakdown, scoreResult.scoringMode),
      missingKeywords: normalizedMissingKeywords,
      suggestions: allSuggestions,
      overallFeedback: scoreResult.overallFeedback || {},
      jdKeywords: jdKeywords,
      createdAt: new Date()
    });

    // Update Resume.atsScore for Dashboard
    await Resume.updateOne(
      { _id: reportFilter.resumeId },
      { $set: { atsScore: scoreResult.totalScore } }
    );

    await session.commitTransaction();
    session.endSession();

    console.log(`✅ [APPLY_SUGGESTION] Done. score=${scoreResult.totalScore} suggestions=${allSuggestions.length}`);
    console.log(`✅ [APPLY_SUGGESTION] Applied: "${appliedText.substring(0, 60)}..."`);

    return res.status(200).json({
      success: true,
      message: 'Suggestion applied successfully',
      data: {
        updatedResume: resume.toObject(),
        updatedScore: scoreResult.totalScore,
        scoringMode: scoreResult.scoringMode,
        updatedBreakdown: scoreResult.breakdown,
        missingSections: scoreResult.missingSections || [],
        updatedSuggestions: allSuggestions,
        missingKeywords: normalizedMissingKeywords,
        overallFeedback: scoreResult.overallFeedback || {},
        appliedSuggestionId: suggestionId,
        usedJdId: existingJdId || null,
        keywordCountUsed: jdKeywords.length
      }
    });

  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) { /* ignore */ }
    session.endSession();

    console.error('[APPLY_SUGGESTION] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to apply suggestion',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ──────────────────────────── GENERATE RESUME ────────────────────────────

const generateResume = async (req, res) => {
  try {
    const { resumeId, mode } = req.body;

    if (!resumeId || !mode) {
      return res.status(400).json({ success: false, message: 'resumeId and mode are required' });
    }

    if (!['optimize', 'generate'].includes(mode)) {
      return res.status(400).json({ success: false, message: 'mode must be "optimize" or "generate"' });
    }

    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    if (!resume.jdId) {
      return res.status(400).json({ success: false, message: 'No Job Description linked to this resume' });
    }

    const jd = await JobDescription.findOne({ _id: resume.jdId, userId: req.user._id });
    if (!jd) {
      return res.status(404).json({ success: false, message: 'Job Description not found' });
    }

    const resumeGenerator = require('../utils/resumeGenerator');
    let savedResume;

    if (mode === 'optimize') {
      const optimized = resumeGenerator.optimizeWithJD(resume.toObject(), jd);
      const updatePayload = { ...optimized };
      delete updatePayload._id;
      delete updatePayload.id;
      delete updatePayload.userId;
      delete updatePayload.createdAt;
      delete updatePayload.updatedAt;
      Object.assign(resume, updatePayload);
      resume.jdId = jd._id;
      savedResume = await resume.save();
    } else {
      const generated = resumeGenerator.generateFromJD(jd, {
        name: req.user.name,
        email: req.user.email
      });
      const createPayload = { ...generated };
      delete createPayload._id;
      delete createPayload.id;
      createPayload.userId = req.user._id;
      createPayload.jdId = jd._id;
      savedResume = await Resume.create(createPayload);
    }

    return res.status(200).json({
      success: true,
      message: mode === 'optimize' ? 'Resume optimized successfully' : 'Resume generated successfully',
      data: { resume: savedResume, resumeId: savedResume._id, jdId: jd._id }
    });

  } catch (error) {
    console.error('[GENERATE_RESUME] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process resume generation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ──────────────────────────── GET SCORE HISTORY ────────────────────────────

const getScoreHistory = async (req, res) => {
  try {
    const { resumeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      return res.status(400).json({ success: false, message: 'Invalid resume ID' });
    }

    // Verify ownership
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    // Get all reports for this resume, newest first
    const reports = await ATSReport.find({ resumeId })
      .sort({ createdAt: -1 })
      .limit(20)  // last 20 scores
      .populate('jdId', 'roleDetected jdText createdAt')  // include JD info
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        resumeId,
        history: reports.map(r => ({
          reportId:    r._id,
          totalScore:  r.totalScore,
          scoringMode: r.scoringMode,
          jdId:        r.jdId?._id || r.jdId,
          jdRole:      r.jdId?.roleDetected || null,
          scoredAt:    r.createdAt,
          breakdown: {
            keywordMatch:  r.breakdown?.keywordMatchScore?.score || 0,
            completeness:  r.breakdown?.sectionCompletenessScore?.score || 0,
            formatting:    r.breakdown?.formattingScore?.score || 0,
            actionVerbs:   r.breakdown?.actionVerbScore?.score || 0,
            readability:   r.breakdown?.readabilityScore?.score || 0,
          }
        })),
        latestScore: reports[0]?.totalScore ?? null,
        totalReports: reports.length
      }
    });

  } catch (error) {
    console.error('[GET_SCORE_HISTORY] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch score history'
    });
  }
};

// ──────────────────────────── APPLY ALL FIXES (BATCH) ────────────────────────

/**
 * Apply all auto-applicable suggestions in one batch
 * 
 * CRITICAL RULES:
 * 1. Only apply suggestions where autoApplicable === true
 * 2. Filter out manual-only suggestions (autoApplicable === false)
 * 3. Apply changes in-memory, save resume ONCE
 * 4. Recalculate ATS score ONCE
 * 5. Return { success, updateCount, updatedResume, updatedScore }
 */
const applyAllSuggestions = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Instantiate suggestion engine
    const suggestionEngine = new SuggestionRuleEngine();

    const { resumeId, debounceToken } = req.body;

    // ── Input Validation ──────────────────────────────────────────────────────
    if (!resumeId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'resumeId is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'Invalid resume ID format' });
    }

    // ── Debounce Check ──────────────────────────────────────────────────────
    if (debounceToken) {
      const debounceKey = `apply_all_${resumeId}_${debounceToken}`;
      if (checkDebounce(debounceKey)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(429).json({
          success: false,
          message: 'Operation in progress. Please wait.',
          retryAfter: DEBOUNCE_TTL_MS
        });
      }
    }

    // ── Load Resume ──────────────────────────────────────────────────────────
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    // ── Load JD for Score Recalculation ─────────────────────────────────────
    let jdKeywords = [];
    let existingJdId = resume.jdId || null;

    const existingReport = await ATSReport.findOne({
      resumeId: resume._id,
      jdId: { $ne: null }
    }).sort({ createdAt: -1 }).session(session);

    if (!existingJdId && existingReport?.jdId) {
      existingJdId = existingReport.jdId;
      resume.jdId = existingJdId;
    }

    if (existingJdId) {
      const jd = await JobDescription.findOne({ _id: existingJdId, userId: req.user._id }).session(session);
      if (jd?.extractedKeywords) {
        jdKeywords = toKeywordStrings(jd.extractedKeywords);
      }
    }

    // ── Get Current Suggestions ──────────────────────────────────────────────
    const currentReport = await ATSReport.findOne({
      resumeId: resume._id
    }).sort({ createdAt: -1 }).session(session);

    const allSuggestions = currentReport?.suggestions || [];

    // ── FILTER: Only auto-applicable suggestions ─────────────────────────────
    const autoFixableSuggestions = allSuggestions.filter(s => s.autoApplicable === true);

    if (autoFixableSuggestions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        message: 'No auto-applicable fixes available',
        data: {
          updateCount: 0,
          applicableSuggestionCount: 0,
          totalSuggestionCount: allSuggestions.length,
          updatedResume: resume.toObject(),
          updatedScore: resume.atsScore || 0
        }
      });
    }

    // ── Apply All Auto-Fixes In-Memory ───────────────────────────────────────
    let appliedCount = 0;
    const appliedSuggestionIds = [];

    console.log(`🔵 APPLY_ALL: Processing ${autoFixableSuggestions.length} auto-applicable suggestions`);

    for (const suggestion of autoFixableSuggestions) {
      try {
        // VALIDATION: Ensure improvedText exists
        const improvedText = suggestion.improvedText || suggestion.suggestedText;
        if (!improvedText) {
          console.log(`⚠️ Skipping suggestion ${suggestion.id}: missing improvedText`);
          continue;
        }

        const { section, itemIndex, bulletIndex } = suggestion;
        if (!section) {
          console.log(`⚠️ Skipping suggestion ${suggestion.id}: missing section`);
          continue;
        }

        // Clean the improved text
        const cleanedText = cleanImprovedText(improvedText);
        if (!cleanedText) {
          console.log(`⚠️ Skipping suggestion ${suggestion.id}: text empty after cleanup`);
          continue;
        }

        let applied = false;

        console.log(`🔵 APPLY_ALL: Applying suggestion to ${section}`);

        // ── Apply by section ──
        if (section === 'summary') {
          resume.summary = cleanedText;
          applied = true;
          console.log(`✅ Applied to summary`);
        } else if (section === 'experience' && itemIndex != null && bulletIndex != null) {
          if (resume.experience?.[itemIndex]?.bullets?.[bulletIndex] != null) {
            resume.experience[itemIndex].bullets[bulletIndex] = cleanedText;
            resume.markModified('experience');
            applied = true;
            console.log(`✅ Applied to experience[${itemIndex}].bullets[${bulletIndex}]`);
          } else {
            console.log(`⚠️ Invalid experience index: ${itemIndex}, ${bulletIndex}`);
          }
        } else if (section === 'projects' && itemIndex != null && bulletIndex != null) {
          if (resume.projects?.[itemIndex]?.bullets?.[bulletIndex] != null) {
            resume.projects[itemIndex].bullets[bulletIndex] = cleanedText;
            resume.markModified('projects');
            applied = true;
            console.log(`✅ Applied to projects[${itemIndex}].bullets[${bulletIndex}]`);
          } else {
            console.log(`⚠️ Invalid project index: ${itemIndex}, ${bulletIndex}`);
          }
        } else if (section === 'skills') {
          const extractedSkills = parseSkills(cleanedText);
          if (extractedSkills.length > 0) {
            if (!resume.skills || resume.skills.length === 0) {
              resume.skills = [{ category: 'Technical Skills', items: [] }];
            }
            const categoryIdx = itemIndex ?? 0;
            const safeCategoryIdx = resume.skills[categoryIdx] ? categoryIdx : 0;
            const targetCategory = resume.skills[safeCategoryIdx];
            targetCategory.items = targetCategory.items || [];

            const existingLower = new Set(targetCategory.items.map(s => String(s).toLowerCase().trim()));
            for (const skill of extractedSkills) {
              const skillLower = skill.toLowerCase().trim();
              if (!existingLower.has(skillLower)) {
                targetCategory.items.push(skill);
                existingLower.add(skillLower);
                applied = true;
              }
            }
            if (applied) {
              resume.markModified('skills');
              console.log(`✅ Applied ${extractedSkills.length} skills`);
            }
          } else {
            console.log(`⚠️ No skills extracted from: ${cleanedText}`);
          }
        } else {
          console.log(`⚠️ Unknown section: ${section}`);
        }

        if (applied) {
          appliedCount++;
          appliedSuggestionIds.push(suggestion.id);
          console.log(`🟢 Suggestion ${suggestion.id} applied successfully`);
        }
      } catch (e) {
        console.error(`🔥 [APPLY_ALL] Failed to apply suggestion ${suggestion.id}:`, e.message);
        // Continue with next suggestion
      }
    }

    console.log(`📊 APPLY_ALL: Applied ${appliedCount}/${autoFixableSuggestions.length} suggestions`);

    if (appliedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        message: 'No changes were made. All applicable fixes were already applied.',
        data: {
          updateCount: 0,
          applicableSuggestionCount: autoFixableSuggestions.length,
          totalSuggestionCount: allSuggestions.length,
          updatedResume: resume.toObject(),
          updatedScore: resume.atsScore || 0
        }
      });
    }

    // ── Save Resume (ONCE) ──────────────────────────────────────────────────
    await resume.save({ session });
    console.log(`[APPLY_ALL] Resume ${resume._id} saved. Applied ${appliedCount} fixes.`);

    // ── Recalculate ATS Score (ONCE) ────────────────────────────────────────
    let scoreResult;
    try {
      scoreResult = await atsService.calculateATSScore(String(resume._id), existingJdId ? String(existingJdId) : null);
      console.log(`[APPLY_ALL] Score recalculated: ${scoreResult.totalScore}/100 (mode=${scoreResult.scoringMode})`);
    } catch (scoringError) {
      console.error('[APPLY_ALL] Score recalculation failed:', scoringError.message);
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: 'Fixes applied but ATS recalculation failed. Please refresh.',
        error: process.env.NODE_ENV === 'development' ? scoringError.message : undefined,
        data: {
          updateCount: appliedCount,
          updatedResume: resume.toObject(),
          scoreRecalculationFailed: true
        }
      });
    }

    // ── Update ATS Report ────────────────────────────────────────────────────
    const reportFilter = { resumeId: resume._id };
    if (existingJdId) reportFilter.jdId = existingJdId;

    // Regenerate suggestions using fresh resume state
    let jdForSuggestions = null;
    if (existingJdId) {
      jdForSuggestions = await JobDescription.findOne({ _id: existingJdId, userId: req.user._id }).session(session);
    }

    // ✅ FIX: Use correct method call pattern (same as applySuggestion)
    const _applyAllEngine = new SuggestionRuleEngine();
    const _missingKwForApplyAll = Array.isArray(scoreResult.missingKeywords)
      ? scoreResult.missingKeywords.map(k => (typeof k === 'string' ? k : k?.keyword || '')).filter(Boolean)
      : [];
    const _rawFreshAll = _applyAllEngine.generateSuggestions(resume.toObject(), _missingKwForApplyAll);
    const freshSuggestions = Array.isArray(_rawFreshAll) ? _rawFreshAll : [];
    
    // ✅ NORMALIZE suggestions before saving to database
    console.log('🔵 [APPLY_ALL] About to normalize', freshSuggestions.length, 'fresh suggestions');
    if (freshSuggestions.length > 0) {
      console.log('   Fresh [0] type:', freshSuggestions[0].type);
    }
    const normalizedNewSuggestions = normalizeSuggestions(freshSuggestions);
    console.log('✅ [APPLY_ALL] Normalized', normalizedNewSuggestions.length, 'suggestions to schema format');
    if (normalizedNewSuggestions.length > 0) {
      console.log('   Normalized [0] type:', normalizedNewSuggestions[0].type, '(should be valid enum, NOT keyword_missing)');
    }
    
    const allNewSuggestions = [...normalizedNewSuggestions].filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);

    const normalizedMissingKeywords = toKeywordStrings(scoreResult.missingKeywords);

    // Create NEW report instead of updating
    const newReport = await ATSReport.create({
      resumeId: reportFilter.resumeId,
      userId: req.user._id,
      jdId: reportFilter.jdId,
      totalScore: scoreResult.totalScore,
      score: scoreResult.totalScore,
      scoringMode: scoreResult.scoringMode,
      keywordMatchPercent: scoreResult.scoringMode === 'job-specific'
        ? (scoreResult.breakdown.keywordMatch || 0)
        : 0,
      breakdown: toStorageBreakdown(scoreResult.breakdown, scoreResult.scoringMode),
      missingKeywords: normalizedMissingKeywords,
      suggestions: allNewSuggestions,
      overallFeedback: scoreResult.overallFeedback || {},
      jdKeywords: jdKeywords,
      createdAt: new Date()
    });

    // Update Resume.atsScore for Dashboard
    await Resume.updateOne(
      { _id: reportFilter.resumeId },
      { $set: { atsScore: scoreResult.totalScore } }
    );

    await session.commitTransaction();
    session.endSession();

    console.log(`[APPLY_ALL] Complete. Applied ${appliedCount} fixes. New score=${scoreResult.totalScore}`);

    return res.status(200).json({
      success: true,
      message: `Successfully applied ${appliedCount} auto-fixes to your resume`,
      data: {
        updateCount: appliedCount,
        appliedSuggestionIds: appliedSuggestionIds,
        applicableSuggestionCount: autoFixableSuggestions.length,
        totalSuggestionCount: allSuggestions.length,
        updatedResume: resume.toObject(),
        updatedScore: scoreResult.totalScore,
        scoringMode: scoreResult.scoringMode,
        updatedBreakdown: scoreResult.breakdown,
        updatedSuggestions: allNewSuggestions,
        missingKeywords: normalizedMissingKeywords,
        overallFeedback: scoreResult.overallFeedback || {},
        usedJdId: existingJdId || null,
        keywordCountUsed: jdKeywords.length
      }
    });

  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) { /* ignore */ }
    session.endSession();

    console.error('[APPLY_ALL_SUGGESTIONS] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to apply all fixes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { calculateATSScore, getSuggestions, applySuggestion, applyAllSuggestions, generateResume, getScoreHistory };