/**
 * ================================================================================
 * APPLY FIX CONTROLLER - STRICT FLOW IMPLEMENTATION
 * ================================================================================
 * Implements exact flow: fetch → validate → replace → save → RE-FETCH → recalc → regenerate
 * NOTE: RE-FETCH is CRITICAL to avoid stale data
 * ================================================================================
 */

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');
const { replaceField } = require('../helpers/replaceFieldSafeHelper');
const { evaluateResume } = require('../services/evaluateResumeFixed');

// ──────────────────────────────────────────────────────────────────────────────
// APPLY SINGLE SUGGESTION
// ──────────────────────────────────────────────────────────────────────────────

const applySuggestion = async (req, res) => {
  const operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`\n[${'='*60}]`);
  console.log(`[applySuggestion] START [${operationId}]`);
  console.log(`[${'='*60}]\n`);

  try {
    const { resumeId, suggestion } = req.body;
    const userId = req.user._id;

    console.log(`[applySuggestion] Input: resumeId=${resumeId}, section=${suggestion?.section}`);

    // ────────────────────────────────────────────────────────────────────
    // 1. STEP 1: Fetch latest resume from MongoDB
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 1: Fetching resume from DB...`);
    const resume = await Resume.findOne({ _id: resumeId, userId });
    
    if (!resume) {
      console.log(`[applySuggestion] ❌ Resume not found or unauthorized`);
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }
    console.log(`[applySuggestion] ✓ Resume fetched: _id=${resume._id}`);

    // ────────────────────────────────────────────────────────────────────
    // 2. STEP 2: Validate suggestion object
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 2: Validating suggestion...`);
    if (!suggestion || !suggestion.section || !suggestion.improvedText) {
      console.log(`[applySuggestion] ❌ Invalid suggestion object`);
      return res.status(400).json({ success: false, message: 'Invalid suggestion' });
    }
    console.log(`[applySuggestion] ✓ Suggestion valid: section=${suggestion.section}`);

    // ────────────────────────────────────────────────────────────────────
    // 3. STEP 3 & 4: Replace field + prevent double apply
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 3: Replacing field...`);
    console.log(`[applySuggestion] STEP 4: Checking for double-apply...`);
    
    const replaceResult = replaceField(resume, suggestion);
    
    if (!replaceResult.success) {
      console.log(`[applySuggestion] ❌ Field replacement failed: ${replaceResult.reason}`);
      return res.status(400).json({ success: false, message: replaceResult.reason });
    }

    if (replaceResult.skipped) {
      console.log(`[applySuggestion] ⊘ Suggestion already applied (skipped)`);
      return res.status(200).json({
        success: true,
        skipped: true,
        message: 'Suggestion already applied',
      });
    }

    console.log(`[applySuggestion] ✓ Field replaced successfully`);

    // ────────────────────────────────────────────────────────────────────
    // 5. STEP 5: Save resume to MongoDB
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 5: Saving resume to DB...`);
    await resume.save();
    console.log(`[applySuggestion] ✓ Resume saved`);

    // ────────────────────────────────────────────────────────────────────
    // 6. STEP 6: RE-FETCH updated resume from DB (CRITICAL!)
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 6: RE-FETCHING resume from DB (CRITICAL step)...`);
    const updatedResume = await Resume.findOne({ _id: resumeId, userId });
    
    if (!updatedResume) {
      console.log(`[applySuggestion] ❌ Resume lost after save!`);
      return res.status(500).json({ success: false, message: 'Resume lost after save' });
    }
    console.log(`[applySuggestion] ✓ Resume re-fetched from DB (fresh data)`);

    // ────────────────────────────────────────────────────────────────────
    // Get Job Description
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] Fetching Job Description...`);
    let jdId = updatedResume.jdId;
    
    if (!jdId) {
      const latestReport = await ATSReport.findOne({ resumeId }).sort({ createdAt: -1 });
      jdId = latestReport?.jdId;
    }

    if (!jdId) {
      console.log(`[applySuggestion] ❌ No linked Job Description`);
      return res.status(400).json({
        success: false,
        message: 'No linked Job Description. Please add one first.',
      });
    }

    const jd = await JobDescription.findOne({ _id: jdId });
    if (!jd) {
      console.log(`[applySuggestion] ❌ JD not found: ${jdId}`);
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }
    console.log(`[applySuggestion] ✓ JD fetched: ${jd.title}`);

    // ────────────────────────────────────────────────────────────────────
    // 7. STEP 7: Recalculate ATS score (USING FRESH RESUME)
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 7: Recalculating ATS score (using FRESH resume)...`);
    const scoreResult = evaluateResume(updatedResume, jd);
    console.log(`[applySuggestion] ✓ Score calculated: ${scoreResult.totalScore} (breakdown: KW=${scoreResult.breakdown.keywordMatch}% CV=${scoreResult.breakdown.completeness}%)`);

    // ────────────────────────────────────────────────────────────────────
    // 8. STEP 8: Regenerate suggestions (from same evaluation)
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 8: Regenerating suggestions...`);
    const newSuggestions = scoreResult.suggestions;
    console.log(`[applySuggestion] ✓ Generated ${newSuggestions.length} suggestions`);

    // ────────────────────────────────────────────────────────────────────
    // 9. STEP 9: Save new ATSReport
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 9: Saving new ATSReport...`);
    const newReport = new ATSReport({
      resumeId: updatedResume._id,
      userId,
      jdId,
      totalScore: scoreResult.totalScore,
      breakdown: scoreResult.breakdown,
      suggestions: newSuggestions,
      missingKeywords: scoreResult.missingKeywords,
      overallFeedback: scoreResult.overallFeedback,
      generatedAt: new Date(),
    });
    await newReport.save();
    console.log(`[applySuggestion] ✓ ATSReport saved`);

    // Update resume score
    updatedResume.atsScore = scoreResult.totalScore;
    await updatedResume.save();

    // ────────────────────────────────────────────────────────────────────
    // 10. STEP 10: Return updated data
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applySuggestion] STEP 10: Returning response...`);
    console.log(`[applySuggestion] ✅ SUCCESS [${operationId}]\n`);

    return res.status(200).json({
      success: true,
      data: {
        updatedResume: {
          _id: updatedResume._id,
          summary: updatedResume.summary,
          experience: updatedResume.experience,
          projects: updatedResume.projects,
          skills: updatedResume.skills,
          atsScore: scoreResult.totalScore,
        },
        newScore: scoreResult.totalScore,
        newBreakdown: scoreResult.breakdown,
        newSuggestions,
        missingKeywords: scoreResult.missingKeywords,
        feedback: scoreResult.overallFeedback,
      },
    });
  } catch (error) {
    console.error(`[applySuggestion] ❌ ERROR:`, error.message);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// APPLY ALL SUGGESTIONS
// ──────────────────────────────────────────────────────────────────────────────

const applyAllSuggestions = async (req, res) => {
  const operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`\n[${'='*60}]`);
  console.log(`[applyAllSuggestions] START [${operationId}]`);
  console.log(`[${'='*60}]\n`);

  try {
    const { resumeId, suggestions: incomingSuggestions } = req.body;
    const userId = req.user._id;

    console.log(`[applyAllSuggestions] Input: resumeId=${resumeId}, suggestions=${incomingSuggestions?.length}`);

    // ────────────────────────────────────────────────────────────────────
    // 1. Fetch resume
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 1: Fetching resume...`);
    const resume = await Resume.findOne({ _id: resumeId, userId });
    
    if (!resume) {
      console.log(`[applyAllSuggestions] ❌ Resume not found`);
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }
    console.log(`[applyAllSuggestions] ✓ Resume fetched`);

    // ────────────────────────────────────────────────────────────────────
    // 2. Loop through ALL suggestions
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 2: Applying ${incomingSuggestions?.length || 0} suggestions in memory...`);
    let appliedCount = 0;

    if (incomingSuggestions && Array.isArray(incomingSuggestions)) {
      for (const sug of incomingSuggestions) {
        try {
          const result = replaceField(resume, sug);
          if (result.success && !result.skipped) {
            appliedCount++;
            console.log(`[applyAllSuggestions]   ✓ Applied: ${sug.section} (${appliedCount})`);
          } else if (result.skipped) {
            console.log(`[applyAllSuggestions]   ⊘ Skipped: ${sug.section} (${result.reason})`);
          }
        } catch (err) {
          console.warn(`[applyAllSuggestions]   ⚠ Failed to apply ${sug.section}:`, err.message);
        }
      }
    }

    if (appliedCount === 0) {
      console.log(`[applyAllSuggestions] No suggestions to apply`);
      return res.status(200).json({
        success: true,
        appliedCount: 0,
        message: 'No suggestions applied',
      });
    }

    console.log(`[applyAllSuggestions] ✓ Applied ${appliedCount} suggestions in memory`);

    // ────────────────────────────────────────────────────────────────────
    // 3. Save resume ONCE
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 3: Saving resume...`);
    await resume.save();
    console.log(`[applyAllSuggestions] ✓ Resume saved`);

    // ────────────────────────────────────────────────────────────────────
    // 4. RE-FETCH resume (CRITICAL!)
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 4: RE-FETCHING resume (CRITICAL)...`);
    const updatedResume = await Resume.findOne({ _id: resumeId, userId });
    console.log(`[applyAllSuggestions] ✓ Resume re-fetched (fresh data)`);

    // Get JD
    let jdId = updatedResume.jdId;
    if (!jdId) {
      const latestReport = await ATSReport.findOne({ resumeId }).sort({ createdAt: -1 });
      jdId = latestReport?.jdId;
    }

    if (!jdId) {
      console.log(`[applyAllSuggestions] ❌ No JD linked`);
      return res.status(400).json({ success: false, message: 'No linked Job Description' });
    }

    const jd = await JobDescription.findOne({ _id: jdId });
    if (!jd) {
      console.log(`[applyAllSuggestions] ❌ JD not found`);
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }

    // ────────────────────────────────────────────────────────────────────
    // 5. Recalculate score ONCE
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 5: Recalculating score ONCE (using FRESH resume)...`);
    const scoreResult = evaluateResume(updatedResume, jd);
    console.log(`[applyAllSuggestions] ✓ Score: ${scoreResult.totalScore}`);

    // ────────────────────────────────────────────────────────────────────
    // 6. Regenerate suggestions ONCE
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 6: Regenerating suggestions...`);
    const newSuggestions = scoreResult.suggestions;
    console.log(`[applyAllSuggestions] ✓ Generated ${newSuggestions.length} new suggestions`);

    // ────────────────────────────────────────────────────────────────────
    // 7. Save new ATSReport
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] STEP 7: Saving new ATSReport...`);
    const newReport = new ATSReport({
      resumeId: updatedResume._id,
      userId,
      jdId,
      totalScore: scoreResult.totalScore,
      breakdown: scoreResult.breakdown,
      suggestions: newSuggestions,
      missingKeywords: scoreResult.missingKeywords,
      overallFeedback: scoreResult.overallFeedback,
      generatedAt: new Date(),
    });
    await newReport.save();
    console.log(`[applyAllSuggestions] ✓ ATSReport saved`);

    // Update resume score
    updatedResume.atsScore = scoreResult.totalScore;
    await updatedResume.save();

    // ────────────────────────────────────────────────────────────────────
    // 8. Return updated data
    // ────────────────────────────────────────────────────────────────────
    console.log(`[applyAllSuggestions] ✅ SUCCESS [${operationId}]\n`);

    return res.status(200).json({
      success: true,
      data: {
        appliedCount,
        newScore: scoreResult.totalScore,
        newBreakdown: scoreResult.breakdown,
        newSuggestions,
        missingKeywords: scoreResult.missingKeywords,
        feedback: scoreResult.overallFeedback,
      },
    });
  } catch (error) {
    console.error(`[applyAllSuggestions] ❌ ERROR:`, error.message);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  applySuggestion,
  applyAllSuggestions,
};
