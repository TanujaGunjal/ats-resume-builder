/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APPLY FIX LOGIC - REFACTORED
 * 
 * FIXES:
 * 1. Apply single suggestion correctly
 * 2. Recalculate score after applying
 * 3. Generate new suggestions
 * 4. Save new ATSReport with updated score
 * 5. Prevent duplicate applications
 * 6. Apply all suggestions sequentially with deduplication
 * 
 * FLOW:
 * Step 1: Fetch resume & JD
 * Step 2: Locate section and apply improvement
 * Step 3: Save resume to MongoDB
 * Step 4: Re-fetch resume from DB
 * Step 5: Recalculate ATS score
 * Step 6: Generate new suggestions
 * Step 7: Save new ATSReport
 * Step 8: Return response with updated score & suggestions
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');

// Import ATS scoring (use whichever engine you've chosen)
const { calculateATSScore } = require('./atsScoreCalculator');
// OR: const atsService = require('./atsService');

/**
 * STEP 1-2: Apply suggestion to resume object (in-memory)
 * Handles: skills, experience, projects, summary
 * Returns: {success, reason, skipped}
 * 
 * ✅ ISSUE #2 FIX: Always defaults itemIndex/bulletIndex to 0 if missing
 */
function applySuggestionToResumeInMemory(resume, suggestion) {
  const { section, improvedText, currentText } = suggestion;
  
  // ✅ FIX: Default to 0 if not provided
  let itemIndex = suggestion.itemIndex;
  let bulletIndex = suggestion.bulletIndex;
  
  // Handle undefined or null
  if (itemIndex === undefined || itemIndex === null) {
    itemIndex = 0;
  }
  if (bulletIndex === undefined || bulletIndex === null) {
    bulletIndex = 0;
  }

  if (!section || !improvedText) {
    return { success: false, reason: 'Missing section or improvedText' };
  }

  try {
    switch (section) {
      // ───────────────────────── SKILLS ──────────────────────────
      case 'skills': {
        if (!resume.skills) resume.skills = [];

        // Check if skill already exists
        const normalizedImproved = improvedText.toLowerCase().trim();
        const skillExists = (resume.skills || []).some(s => {
          if (typeof s === 'string') {
            return s.toLowerCase().includes(normalizedImproved);
          }
          if (s && typeof s === 'object' && s.items && Array.isArray(s.items)) {
            return s.items.some(i => String(i).toLowerCase().includes(normalizedImproved));
          }
          return false;
        });

        if (skillExists) {
          return { success: true, skipped: true, reason: 'Skill already exists' };
        }

        // Add to first category with items[] structure, or create new
        if (resume.skills.length > 0 && resume.skills[0]?.items) {
          resume.skills[0].items.push(improvedText);
        } else if (resume.skills.length > 0 && resume.skills[0]?.category) {
          resume.skills[0].items = resume.skills[0].items || [];
          resume.skills[0].items.push(improvedText);
        } else {
          resume.skills.push({ category: 'Technical Skills', items: [improvedText] });
        }

        resume.markModified('skills');
        return { success: true, skipped: false, reason: 'Skill added' };
      }

      // ───────────────────────── SUMMARY ──────────────────────────
      case 'summary': {
        if (!improvedText || improvedText.length < 20) {
          return { success: false, reason: 'Summary text too short' };
        }

        resume.summary = improvedText;
        resume.markModified('summary');
        return { success: true, skipped: false, reason: 'Summary updated' };
      }

      // ───────────────────────── EXPERIENCE ──────────────────────────
      case 'experience': {
        // ✅ ISSUE #2 FIX: Default to 0 if invalid
        if (!resume.experience || resume.experience.length === 0) {
          return { success: false, reason: 'No experience entries found' };
        }
        
        const expIndex = Math.min(itemIndex, resume.experience.length - 1);
        if (expIndex < 0) {
          return { success: false, reason: `Invalid experience index: ${itemIndex}` };
        }

        const exp = resume.experience[expIndex];
        if (!exp.bullets) exp.bullets = [];

        // ✅ ISSUE #2 FIX: Handle bulletIndex with defaults
        const effBulletIndex = Math.max(0, Math.min(bulletIndex, exp.bullets.length));

        if (effBulletIndex < exp.bullets.length) {
          // REPLACE existing bullet
          exp.bullets[effBulletIndex] = improvedText;
        } else {
          // APPEND to end
          exp.bullets.push(improvedText);
        }

        resume.markModified('experience');
        return { success: true, skipped: false, reason: 'Experience updated' };
      }

      // ───────────────────────── PROJECTS ──────────────────────────
      case 'projects': {
        if (!resume.projects || resume.projects.length === 0) {
          return { success: false, reason: 'No projects found' };
        }
        
        const projIndex = Math.min(itemIndex, resume.projects.length - 1);
        if (projIndex < 0) {
          return { success: false, reason: `Invalid projects index: ${itemIndex}` };
        }

        const proj = resume.projects[projIndex];
        if (!proj.bullets) proj.bullets = [];

        // ✅ ISSUE #2 FIX: Handle bulletIndex with defaults
        const projBulletIndex = Math.max(0, Math.min(bulletIndex, proj.bullets.length));

        if (projBulletIndex < proj.bullets.length) {
          proj.bullets[projBulletIndex] = improvedText;
        } else {
          proj.bullets.push(improvedText);
        }

        resume.markModified('projects');
        return { success: true, skipped: false, reason: 'Project updated' };
      }

      // ───────────────────────── EDUCATION ──────────────────────────
      case 'education': {
        if (!resume.education || resume.education.length === 0) {
          return { success: false, reason: 'No education entries found' };
        }
        
        const eduIndex = Math.min(itemIndex, resume.education.length - 1);
        if (eduIndex < 0) {
          return { success: false, reason: `Invalid education index: ${itemIndex}` };
        }

        const edu = resume.education[eduIndex];
        edu.description = improvedText;
        resume.markModified('education');
        return { success: true, skipped: false, reason: 'Education updated' };
      }

      default:
        return { success: false, reason: `Unknown section: ${section}` };
    }
  } catch (error) {
    console.error('[applySuggestionToResumeInMemory] Error:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * MAIN: Apply single suggestion and recalculate score
 */
async function applySingleSuggestionAndRecalculate(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      resumeId,
      jdId,
      jobDescriptionId,
      section,
      itemIndex,
      bulletIndex,
      improvedText,
      currentText
    } = req.body;

    const operationId = `apply-single-${Date.now()}`;
    console.log(`[${operationId}] START: Applying suggestion`);

    // ─────────────────── VALIDATE INPUTS ──────────────────────
    if (!resumeId || !jobDescriptionId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Missing resumeId or jobDescriptionId'
      });
    }

    if (!section || !improvedText) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Missing section or improvedText'
      });
    }

    // ─────────────────── STEP 1: FETCH RESUME ──────────────────────
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    console.log(`[${operationId}] ✓ Resume fetched: ${resumeId}`);

    // ─────────────────── STEP 2: FETCH JOB DESCRIPTION ──────────────────────
    const jd = await JobDescription.findOne({ _id: jobDescriptionId, userId: req.user._id }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }

    console.log(`[${operationId}] ✓ Job description fetched: ${jobDescriptionId}`);

    // ─────────────────── STEP 3: APPLY SUGGESTION ──────────────────────
    const suggestion = { section, itemIndex, bulletIndex, improvedText, currentText };
    const applyResult = applySuggestionToResumeInMemory(resume, suggestion);

    if (!applyResult.success) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Could not apply suggestion: ${applyResult.reason}`
      });
    }

    console.log(`[${operationId}] ✓ Suggestion applied: ${applyResult.reason}`);

    // ─────────────────── STEP 4: SAVE RESUME ──────────────────────
    await resume.save({ session });
    console.log(`[${operationId}] ✓ Resume saved to MongoDB`);

    // ─────────────────── STEP 5: RE-FETCH RESUME (verify save) ──────────────────────
    const updatedResume = await Resume.findById(resumeId).session(session);
    if (!updatedResume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ success: false, message: 'Failed to verify resume save' });
    }

    console.log(`[${operationId}] ✓ Resume re-fetched from DB`);

    // ─────────────────── STEP 6: RECALCULATE ATS SCORE ──────────────────────
    console.log(`[${operationId}] Recalculating ATS score...`);
    const scoreResult = calculateATSScore(updatedResume, jd);

    if (!scoreResult || scoreResult.score === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ success: false, message: 'Failed to recalculate score' });
    }

    console.log(`[${operationId}] ✓ New score: ${scoreResult.score}`);

    // ─────────────────── STEP 7: SAVE NEW ATS REPORT ──────────────────────
    const newReport = new ATSReport({
      resumeId: resume._id,
      userId: req.user._id,
      jdId: jd._id,
      totalScore: scoreResult.score,
      breakdown: scoreResult.breakdown,
      scoringMode: 'job-specific',
      keywords: scoreResult.keywords,
      suggestions: scoreResult.suggestions || [],
      createdAt: new Date()
    });

    await newReport.save({ session });
    console.log(`[${operationId}] ✓ New ATSReport saved`);

    // ─────────────────── COMMIT TRANSACTION ──────────────────────
    await session.commitTransaction();
    session.endSession();

    // ─────────────────── STEP 8: RETURN RESPONSE ──────────────────────
    console.log(`[${operationId}] ✓ COMPLETE`);

    return res.json({
      success: true,
      message: 'Suggestion applied and score recalculated',
      data: {
        score: scoreResult.score,
        breakdown: scoreResult.breakdown,
        keywords: scoreResult.keywords,
        suggestions: scoreResult.suggestions,
        improvedScore: true
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[applySingleSuggestionAndRecalculate] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to apply suggestion',
      error: error.message
    });
  }
}

/**
 * MAIN: Apply all suggestions sequentially
 * 
 * Rules:
 * - Skip duplicate fixes (same section/bullet)
 * - Apply each fix only once
 * - Save resume once after all fixes
 * - Recalculate score once
 * - Regenerate suggestions
 * - Save new ATSReport once
 */
async function applyAllSuggestionsAndRecalculate(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resumeId, jdId, jobDescriptionId, suggestions } = req.body;

    const operationId = `apply-all-${Date.now()}`;
    console.log(`[${operationId}] START: Applying ${suggestions?.length || 0} suggestions`);

    // ─────────────────── VALIDATE ──────────────────────
    if (!resumeId || !jobDescriptionId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Missing resumeId or jobDescriptionId'
      });
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No suggestions provided'
      });
    }

    // ─────────────────── STEP 1: FETCH RESUME & JD ──────────────────────
    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    const jd = await JobDescription.findOne({ _id: jobDescriptionId, userId: req.user._id }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }

    console.log(`[${operationId}] ✓ Resume & JD fetched`);

    // ─────────────────── STEP 2-3: APPLY ALL SUGGESTIONS ──────────────────────
    const appliedFixes = [];
    const seenKeys = new Set(); // Prevent duplicate fixes

    for (let i = 0; i < suggestions.length; i++) {
      const sugg = suggestions[i];
      const key = `${sugg.section}-${sugg.itemIndex}-${sugg.bulletIndex}`;

      // Skip if we've already applied a fix to this location
      if (seenKeys.has(key)) {
        console.log(`[${operationId}] ⊘ Skipping duplicate fix to ${key}`);
        continue;
      }

      const result = applySuggestionToResumeInMemory(resume, sugg);

      if (result.success && !result.skipped) {
        appliedFixes.push(sugg);
        seenKeys.add(key);
        console.log(`[${operationId}] ✓ Applied fix ${i + 1}/${suggestions.length} to ${key}`);
      } else {
        console.log(`[${operationId}] ⊘ Skipped fix ${i + 1}: ${result.reason}`);
      }
    }

    if (appliedFixes.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No suggestions could be applied',
        data: { appliedCount: 0 }
      });
    }

    console.log(`[${operationId}] ✓ Applied ${appliedFixes.length}/${suggestions.length} fixes`);

    // ─────────────────── STEP 4: SAVE RESUME ONCE ──────────────────────
    await resume.save({ session });
    console.log(`[${operationId}] ✓ Resume saved after all fixes`);

    // ─────────────────── STEP 5: RE-FETCH RESUME ──────────────────────
    const updatedResume = await Resume.findById(resumeId).session(session);
    if (!updatedResume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ success: false, message: 'Failed to verify resume save' });
    }

    // ─────────────────── STEP 6: RECALCULATE SCORE ONCE ──────────────────────
    console.log(`[${operationId}] Recalculating ATS score...`);
    const scoreResult = calculateATSScore(updatedResume, jd);

    console.log(`[${operationId}] ✓ New score: ${scoreResult.score}`);

    // ─────────────────── STEP 7: SAVE NEW ATS REPORT ──────────────────────
    const newReport = new ATSReport({
      resumeId: resume._id,
      userId: req.user._id,
      jdId: jd._id,
      totalScore: scoreResult.score,
      breakdown: scoreResult.breakdown,
      scoringMode: 'job-specific',
      keywords: scoreResult.keywords,
      suggestions: scoreResult.suggestions || [],
      createdAt: new Date()
    });

    await newReport.save({ session });
    console.log(`[${operationId}] ✓ New ATSReport saved`);

    // ─────────────────── COMMIT & RESPOND ──────────────────────
    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: `Applied ${appliedFixes.length} suggestions and recalculated score`,
      data: {
        appliedCount: appliedFixes.length,
        score: scoreResult.score,
        breakdown: scoreResult.breakdown,
        keywords: scoreResult.keywords,
        suggestions: scoreResult.suggestions
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[applyAllSuggestionsAndRecalculate] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to apply all suggestions',
      error: error.message
    });
  }
}

module.exports = {
  applySingleSuggestionAndRecalculate,
  applyAllSuggestionsAndRecalculate,
  applySuggestionToResumeInMemory
};
