/**
 * ================================================================================
 * APPLY FIX CONTROLLER - PRODUCTION GRADE
 * ================================================================================
 * Features:
 * ✅ Exact text replacement (no prepend/append)
 * ✅ Double-apply detection and prevention
 * ✅ Safe index validation with bounds checking
 * ✅ Single save, single score recalc, single suggestion regeneration
 * ✅ Atomic transactions with MongoDB session
 * ✅ Measurable outcome suggestions (no placeholders)
 * ================================================================================
 */

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');
const { evaluateResume } = require('../services/evaluateResumeService');
const {
  replaceField,
  validateResumeField,
  isAlreadyApplied,
  ReplaceFieldError,
} = require('../helpers/replaceFieldHelper');
const {
  validateResumeStructure,
  validateJobDescription,
  validateApplyOperation,
  ResumeValidationError,
} = require('../helpers/resumeValidationHelper');

// ──────────────────────────────────────────────────────────────────────────────
// APPLY SINGLE SUGGESTION - PRODUCTION GRADE
// ──────────────────────────────────────────────────────────────────────────────

const applySuggestion = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ────────────────────────────────────────────────────────────────────
    // VALIDATION & AUTHORIZATION
    // ────────────────────────────────────────────────────────────────────
    const { resumeId, section, itemIndex, bulletIndex, improvedText, currentText } = req.body;

    if (!resumeId || !section || improvedText === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: resumeId, section, improvedText',
        code: 'MISSING_FIELDS',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(resumeId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid resume ID format',
        code: 'INVALID_ID_FORMAT',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // LOAD RESUME WITH AUTHORIZATION CHECK
    // ────────────────────────────────────────────────────────────────────
    const resume = await Resume.findOne({ 
      _id: resumeId, 
      userId: req.user._id 
    }).session(session);

    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Resume not found or you do not have permission',
        code: 'NOT_FOUND',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // VALIDATE RESUME STRUCTURE
    // ────────────────────────────────────────────────────────────────────
    try {
      validateResumeStructure(resume);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Resume validation failed: ${err.message}`,
        code: 'RESUME_VALIDATION_FAILED',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // VALIDATE FIELD PATH & BOUNDS
    // ────────────────────────────────────────────────────────────────────
    try {
      validateResumeField(resume, section, itemIndex, bulletIndex);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid field path: ${err.message}`,
        code: err.code || 'INVALID_FIELD_PATH',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // DOUBLE-APPLY DETECTION
    // Check if currentText has changed (already applied)
    // ────────────────────────────────────────────────────────────────────
    if (currentText) {
      const alreadyApplied = isAlreadyApplied(resume, section, itemIndex, bulletIndex, currentText);
      if (alreadyApplied) {
        await session.abortTransaction();
        session.endSession();
        console.log(`[applySuggestion] SKIP - Already applied: ${section}[${itemIndex}][${bulletIndex}]`);
        return res.status(200).json({
          success: true,
          data: {
            skipped: true,
            reason: 'This suggestion appears to have been applied already',
            message: 'No changes made',
          },
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // EXACT TEXT REPLACEMENT
    // ────────────────────────────────────────────────────────────────────
    try {
      replaceField(resume, section, itemIndex, bulletIndex, improvedText);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Failed to apply suggestion: ${err.message}`,
        code: err.code || 'APPLY_FAILED',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // SAVE RESUME (ONCE)
    // ────────────────────────────────────────────────────────────────────
    await resume.save({ session });

    // ────────────────────────────────────────────────────────────────────
    // RESOLVE JOB DESCRIPTION
    // ────────────────────────────────────────────────────────────────────
    let jdId = resume.jdId;
    if (!jdId) {
      const latestReport = await ATSReport.findOne({ resumeId: resume._id, jdId: { $ne: null } })
        .sort({ createdAt: -1 })
        .session(session);
      jdId = latestReport?.jdId;
    }

    if (!jdId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No linked Job Description. Please add a Job Description first.',
        code: 'NO_JOB_DESCRIPTION',
      });
    }

    const jd = await JobDescription.findOne({ _id: jdId }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Job description not found',
        code: 'JD_NOT_FOUND',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // VALIDATE JOB DESCRIPTION
    // ────────────────────────────────────────────────────────────────────
    try {
      validateJobDescription(jd);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Job description validation failed: ${err.message}`,
        code: 'JD_VALIDATION_FAILED',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // RECALCULATE SCORE (ONCE)
    // ────────────────────────────────────────────────────────────────────
    let scoreResult;
    try {
      scoreResult = await evaluateResume(resume, jd);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error('[applySuggestion] evaluateResume error:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to recalculate score',
        code: 'SCORE_CALC_FAILED',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // FORMAT SUGGESTIONS
    // ────────────────────────────────────────────────────────────────────
    const formattedSuggestions = (scoreResult.suggestions || []).map(s => ({
      id: s.id || `sugg-${Math.random().toString(36).substr(2, 9)}`,
      section: s.section || '',
      itemIndex: s.itemIndex ?? undefined,
      bulletIndex: s.bulletIndex ?? undefined,
      currentText: s.currentText || '',
      improvedText: s.improvedText || '',
      impact: s.impact || 'medium',
      reason: s.reason || '',
      type: s.type || 'content',
    }));

    // ────────────────────────────────────────────────────────────────────
    // SAVE ATS REPORT
    // ────────────────────────────────────────────────────────────────────
    await ATSReport.create(
      [
        {
          resumeId: resume._id,
          userId: req.user._id,
          jdId,
          totalScore: scoreResult.totalScore,
          breakdown: scoreResult.breakdown,
          suggestions: formattedSuggestions,
          missingKeywords: scoreResult.missingKeywords || [],
          overallFeedback: scoreResult.overallFeedback || {},
          generatedAt: new Date(),
        },
      ],
      { session }
    );

    // ────────────────────────────────────────────────────────────────────
    // UPDATE RESUME SCORE
    // ────────────────────────────────────────────────────────────────────
    await Resume.updateOne(
      { _id: resume._id },
      { atsScore: scoreResult.totalScore },
      { session }
    );

    // ────────────────────────────────────────────────────────────────────
    // COMMIT TRANSACTION
    // ────────────────────────────────────────────────────────────────────
    await session.commitTransaction();
    session.endSession();

    console.log(`[applySuggestion] ✅ Applied ${section} | Score: ${scoreResult.totalScore}`);

    return res.status(200).json({
      success: true,
      data: {
        appliedCount: 1,
        updatedScore: scoreResult.totalScore,
        updatedBreakdown: scoreResult.breakdown,
        updatedSuggestions: formattedSuggestions,
        missingKeywords: scoreResult.missingKeywords,
        overallFeedback: scoreResult.overallFeedback,
      },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    session.endSession();

    console.error('[applySuggestion] Unexpected error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// APPLY ALL SUGGESTIONS (BATCH) - PRODUCTION GRADE
// ──────────────────────────────────────────────────────────────────────────────

const applyAllSuggestions = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ────────────────────────────────────────────────────────────────────
    // VALIDATION & AUTHORIZATION
    // ────────────────────────────────────────────────────────────────────
    const { resumeId } = req.body;

    if (!resumeId || !mongoose.Types.ObjectId.isValid(resumeId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing resumeId',
        code: 'INVALID_RESUME_ID',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // LOAD LATEST ATS REPORT TO GET SUGGESTIONS
    // ────────────────────────────────────────────────────────────────────
    const latestReport = await ATSReport.findOne({ resumeId })
      .sort({ createdAt: -1 })
      .session(session);

    const suggestions = latestReport?.suggestions || [];

    // Early exit if no suggestions
    if (suggestions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      console.log('[applyAllSuggestions] No suggestions to apply');
      return res.status(200).json({
        success: true,
        data: {
          appliedCount: 0,
          updatedScore: latestReport?.totalScore || 0,
          updatedBreakdown: latestReport?.breakdown || {},
          updatedSuggestions: [],
          message: 'No suggestions available to apply',
        },
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // LOAD RESUME
    // ────────────────────────────────────────────────────────────────────
    const resume = await Resume.findOne({ 
      _id: resumeId, 
      userId: req.user._id 
    }).session(session);

    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Resume not found or you do not have permission',
        code: 'NOT_FOUND',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // VALIDATE RESUME STRUCTURE
    // ────────────────────────────────────────────────────────────────────
    try {
      validateResumeStructure(resume);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Resume validation failed: ${err.message}`,
        code: 'RESUME_VALIDATION_FAILED',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // APPLY ALL SUGGESTIONS IN MEMORY
    // ────────────────────────────────────────────────────────────────────
    let appliedCount = 0;
    const appliedDetails = [];

    for (const sug of suggestions) {
      const { section, itemIndex, bulletIndex, improvedText, currentText } = sug;

      // Skip invalid suggestions
      if (!section || !improvedText) {
        appliedDetails.push({ section, status: 'skipped', reason: 'Invalid suggestion' });
        continue;
      }

      // Skip if already applied (double-apply detection)
      if (currentText) {
        const alreadyApplied = isAlreadyApplied(resume, section, itemIndex, bulletIndex, currentText);
        if (alreadyApplied) {
          appliedDetails.push({ 
            section, 
            status: 'skipped', 
            reason: 'Already applied' 
          });
          continue;
        }
      }

      // Validate field path
      try {
        validateResumeField(resume, section, itemIndex, bulletIndex);
      } catch (err) {
        appliedDetails.push({ 
          section, 
          status: 'skipped', 
          reason: `Invalid field: ${err.message}` 
        });
        continue;
      }

      // Apply suggestion
      try {
        replaceField(resume, section, itemIndex, bulletIndex, improvedText);
        appliedCount++;
        appliedDetails.push({ section, status: 'applied' });
      } catch (err) {
        appliedDetails.push({ 
          section, 
          status: 'failed', 
          reason: err.message 
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // EARLY EXIT IF NOTHING WAS APPLIED
    // ────────────────────────────────────────────────────────────────────
    if (appliedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      console.log('[applyAllSuggestions] No suggestions were applicable');
      return res.status(200).json({
        success: true,
        data: {
          appliedCount: 0,
          updatedScore: latestReport?.totalScore || 0,
          updatedBreakdown: latestReport?.breakdown || {},
          updatedSuggestions: [],
          message: 'No suggestions were applicable to apply',
        },
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // SAVE RESUME (ONCE)
    // ────────────────────────────────────────────────────────────────────
    await resume.save({ session });

    // ────────────────────────────────────────────────────────────────────
    // RESOLVE JOB DESCRIPTION
    // ────────────────────────────────────────────────────────────────────
    let jdId = resume.jdId;
    if (!jdId && latestReport) {
      jdId = latestReport.jdId;
    }

    if (!jdId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No linked Job Description',
        code: 'NO_JOB_DESCRIPTION',
      });
    }

    const jd = await JobDescription.findOne({ _id: jdId }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Job description not found',
        code: 'JD_NOT_FOUND',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // RECALCULATE SCORE (ONCE)
    // ────────────────────────────────────────────────────────────────────
    let scoreResult;
    try {
      scoreResult = await evaluateResume(resume, jd);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error('[applyAllSuggestions] evaluateResume error:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to recalculate score',
        code: 'SCORE_CALC_FAILED',
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // FORMAT FRESH SUGGESTIONS
    // ────────────────────────────────────────────────────────────────────
    const freshSuggestions = (scoreResult.suggestions || []).map(s => ({
      id: s.id || `sugg-${Math.random().toString(36).substr(2, 9)}`,
      section: s.section || '',
      itemIndex: s.itemIndex ?? undefined,
      bulletIndex: s.bulletIndex ?? undefined,
      currentText: s.currentText || '',
      improvedText: s.improvedText || '',
      impact: s.impact || 'medium',
      reason: s.reason || '',
      type: s.type || 'content',
    }));

    // ────────────────────────────────────────────────────────────────────
    // SAVE NEW ATS REPORT
    // ────────────────────────────────────────────────────────────────────
    await ATSReport.create(
      [
        {
          resumeId: resume._id,
          userId: req.user._id,
          jdId,
          totalScore: scoreResult.totalScore,
          breakdown: scoreResult.breakdown,
          suggestions: freshSuggestions,
          missingKeywords: scoreResult.missingKeywords || [],
          overallFeedback: scoreResult.overallFeedback || {},
          generatedAt: new Date(),
        },
      ],
      { session }
    );

    // ────────────────────────────────────────────────────────────────────
    // UPDATE RESUME SCORE
    // ────────────────────────────────────────────────────────────────────
    await Resume.updateOne(
      { _id: resume._id },
      { atsScore: scoreResult.totalScore },
      { session }
    );

    // ────────────────────────────────────────────────────────────────────
    // COMMIT TRANSACTION
    // ────────────────────────────────────────────────────────────────────
    await session.commitTransaction();
    session.endSession();

    console.log(`[applyAllSuggestions] ✅ Applied ${appliedCount} | New Score: ${scoreResult.totalScore}`);

    return res.status(200).json({
      success: true,
      data: {
        appliedCount,
        updatedScore: scoreResult.totalScore,
        updatedBreakdown: scoreResult.breakdown,
        updatedSuggestions: freshSuggestions,
        missingKeywords: scoreResult.missingKeywords,
        overallFeedback: scoreResult.overallFeedback,
      },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    session.endSession();

    console.error('[applyAllSuggestions] Unexpected error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
};

module.exports = {
  applySuggestion,
  applyAllSuggestions,
};
