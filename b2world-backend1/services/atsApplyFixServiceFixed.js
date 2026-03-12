/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APPLY FIX ENGINE - FIXED
 * 
 * Fixes:
 * 1. Removes type='suggestion' detection that skips valid suggestions
 * 2. Handles keyword suggestions by directly using improvedText value
 * 3. Handles experience/projects suggestions by currentText → improvedText
 * 4. Properly recalculates score after applying
 * 5. Generates new suggestions
 * 6. Supports apply-all with deduplication
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');
const ATSEngineAdapter = require('./atsEngineAdapter');

/**
 * Apply a single suggestion to resume object (in-memory)
 * 
 * FIXED:
 * - Remove type='suggestion' blocking
 * - Use improvedText directly for keywords (not parse text)
 * - Use currentText to find and replace for experience/projects
 * - Preserve suggestion type structure
 * 
 * @param {Object} resume - Resume object
 * @param {Object} suggestion - {type, section, improvedText, currentText, itemIndex, bulletIndex}
 * @returns {Object} - {success, skipped, reason}
 */
function applySuggestionToResume(resume, suggestion) {
  const { type, section, improvedText, currentText, itemIndex, bulletIndex } = suggestion;

  if (!section || !improvedText) {
    return { success: false, reason: 'Missing section or improvedText' };
  }

  try {
    switch (section) {
      // ─────────────────────── SKILLS ──────────────────────
      case 'skills': {
        if (!resume.skills) resume.skills = [];

        // Normalize for comparison
        const normalizedImproved = improvedText.trim().toLowerCase();

        // Check if skill already exists
        const skillExists = (resume.skills || []).some(s => {
          if (typeof s === 'string') {
            return s.toLowerCase() === normalizedImproved;
          }
          if (s && typeof s === 'object' && s.items && Array.isArray(s.items)) {
            return s.items.some(i => String(i).toLowerCase() === normalizedImproved);
          }
          return false;
        });

        if (skillExists) {
          return { success: true, skipped: true, reason: 'Skill already exists' };
        }

        // Add to first category with items[] structure
        if (resume.skills.length > 0 && resume.skills[0]?.items) {
          resume.skills[0].items.push(improvedText);
          resume.markModified('skills');
          return { success: true, skipped: false, reason: 'Skill added' };
        } else if (resume.skills.length > 0 && resume.skills[0]?.category) {
          // Category exists but no items yet
          if (!resume.skills[0].items) resume.skills[0].items = [];
          resume.skills[0].items.push(improvedText);
          resume.markModified('skills');
          return { success: true, skipped: false, reason: 'Skill added' };
        } else {
          // Create new category
          resume.skills.push({
            category: 'Technical Skills',
            items: [improvedText]
          });
          resume.markModified('skills');
          return { success: true, skipped: false, reason: 'Skill added' };
        }
      }

      // ─────────────────────── SUMMARY ──────────────────────
      case 'summary': {
        if (!improvedText || improvedText.length < 20) {
          return { success: false, reason: 'Summary text too short' };
        }

        resume.summary = improvedText;
        resume.markModified('summary');
        return { success: true, skipped: false, reason: 'Summary updated' };
      }

      // ─────────────────────── EXPERIENCE ──────────────────────
      case 'experience': {
        if (!resume.experience || resume.experience.length === 0) {
          return { success: false, reason: 'No experience entries' };
        }

        // If currentText provided: FIND and REPLACE
        if (currentText && currentText.trim().length > 0) {
          let foundAndReplaced = false;

          for (let i = 0; i < resume.experience.length; i++) {
            const exp = resume.experience[i];
            if (!exp.bullets) continue;

            for (let j = 0; j < exp.bullets.length; j++) {
              if (exp.bullets[j].trim() === currentText.trim()) {
                // FOUND! Replace it
                exp.bullets[j] = improvedText;
                resume.markModified('experience');
                foundAndReplaced = true;
                console.log(`[applySuggestionToResume] ✓ Replaced bullet at exp[${i}].bullets[${j}]`);
                return { success: true, skipped: false, reason: 'Experience bullet updated' };
              }
            }
          }

          if (!foundAndReplaced) {
            return { success: false, reason: `Bullet text not found: "${currentText.substring(0, 50)}"` };
          }
        }

        // Otherwise: Use itemIndex/bulletIndex if provided
        if (itemIndex !== undefined && itemIndex >= 0 && itemIndex < resume.experience.length) {
          const exp = resume.experience[itemIndex];
          if (!exp.bullets) exp.bullets = [];

          if (bulletIndex !== undefined && bulletIndex >= 0 && bulletIndex < exp.bullets.length) {
            // REPLACE existing
            exp.bullets[bulletIndex] = improvedText;
          } else {
            // APPEND
            exp.bullets.push(improvedText);
          }

          resume.markModified('experience');
          return { success: true, skipped: false, reason: 'Experience bullet added/updated' };
        }

        return { success: false, reason: 'Could not locate experience entry' };
      }

      // ─────────────────────── PROJECTS ──────────────────────
      case 'projects': {
        if (!resume.projects || resume.projects.length === 0) {
          return { success: false, reason: 'No project entries' };
        }

        // If currentText provided: FIND and REPLACE
        if (currentText && currentText.trim().length > 0) {
          for (let i = 0; i < resume.projects.length; i++) {
            const proj = resume.projects[i];
            if (!proj.bullets) continue;

            for (let j = 0; j < proj.bullets.length; j++) {
              if (proj.bullets[j].trim() === currentText.trim()) {
                proj.bullets[j] = improvedText;
                resume.markModified('projects');
                return { success: true, skipped: false, reason: 'Project bullet updated' };
              }
            }
          }
        }

        // Otherwise: Use itemIndex/bulletIndex
        if (itemIndex !== undefined && itemIndex >= 0 && itemIndex < resume.projects.length) {
          const proj = resume.projects[itemIndex];
          if (!proj.bullets) proj.bullets = [];

          if (bulletIndex !== undefined && bulletIndex >= 0 && bulletIndex < proj.bullets.length) {
            proj.bullets[bulletIndex] = improvedText;
          } else {
            proj.bullets.push(improvedText);
          }

          resume.markModified('projects');
          return { success: true, skipped: false, reason: 'Project bullet added/updated' };
        }

        return { success: false, reason: 'Could not locate project entry' };
      }

      // ─────────────────────── EDUCATION ──────────────────────
      case 'education': {
        if (!resume.education || !resume.education[itemIndex]) {
          return { success: false, reason: `Invalid education index: ${itemIndex}` };
        }

        const edu = resume.education[itemIndex];
        edu.description = improvedText;
        resume.markModified('education');
        return { success: true, skipped: false, reason: 'Education updated' };
      }

      default:
        return { success: false, reason: `Unknown section: ${section}` };
    }
  } catch (error) {
    console.error('[applySuggestionToResume] Error:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * APPLY SINGLE SUGGESTION
 * 
 * Full workflow:
 * 1. Fetch resume & JD
 * 2. Apply suggestion in-memory
 * 3. Save resume
 * 4. Re-fetch from DB
 * 5. Recalculate score
 * 6. Generate new suggestions
 * 7. Save ATSReport
 * 8. Return response
 */
async function applySuggestion(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resumeId, jobDescriptionId, type, section, improvedText, currentText, itemIndex, bulletIndex } = req.body;
    const opId = `apply-${Date.now()}`;

    console.log(`[${opId}] START: Applying suggestion`);
    console.log(`[${opId}] Suggestion: type=${type}, section=${section}, improvedText="${improvedText?.substring(0, 50)}"`);

    // ─────────────────── VALIDATE ──────────────────────
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

    // ─────────────────── STEP 1: FETCH RESUME & JD ──────────────────────
    const resume = await Resume.findOne({ _id: resumeId }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    const jd = await JobDescription.findOne({ _id: jobDescriptionId }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }

    console.log(`[${opId}] ✓ Fetched resume & JD`);

    // ─────────────────── STEP 2: APPLY SUGGESTION ──────────────────────
    const suggestion = { type, section, improvedText, currentText, itemIndex, bulletIndex };
    const applyResult = applySuggestionToResume(resume, suggestion);

    if (!applyResult.success) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Failed to apply suggestion: ${applyResult.reason}`
      });
    }

    if (applyResult.skipped) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({
        success: true,
        skipped: true,
        message: applyResult.reason
      });
    }

    console.log(`[${opId}] ✓ Suggestion applied in-memory`);

    // ─────────────────── STEP 3: SAVE RESUME ──────────────────────
    await resume.save({ session });
    console.log(`[${opId}] ✓ Resume saved to MongoDB`);

    // ─────────────────── STEP 4: RE-FETCH FROM DB ──────────────────────
    const freshResume = await Resume.findById(resumeId).session(session);
    if (!freshResume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ success: false, message: 'Resume lost after save' });
    }

    console.log(`[${opId}] ✓ Resume re-fetched from DB`);

    // ─────────────────── STEP 5: RECALCULATE SCORE ──────────────────────
    console.log(`[${opId}] Recalculating ATS score...`);
    const scoreResult = ATSEngineAdapter.scoreResume(freshResume, jd);

    if (!scoreResult || scoreResult.score === undefined) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ success: false, message: 'Failed to calculate score' });
    }

    console.log(`[${opId}] ✓ New score: ${scoreResult.score}`);

    // ─────────────────── STEP 6: GENERATE NEW SUGGESTIONS ──────────────────────
    const newSuggestions = ATSEngineAdapter.formatSuggestionsForAPI(scoreResult.suggestions || []);
    console.log(`[${opId}] ✓ Generated ${newSuggestions.length} new suggestions`);

    // ─────────────────── STEP 7: SAVE ATS REPORT ──────────────────────
    const report = new ATSReport({
      resumeId,
      jdId: jobDescriptionId,
      totalScore: scoreResult.score,
      breakdown: scoreResult.breakdown,
      keywords: scoreResult.keywords,
      suggestions: newSuggestions,
      scoringMode: 'job-specific'
    });

    await report.save({ session });
    console.log(`[${opId}] ✓ ATSReport saved`);

    // ─────────────────── COMMIT & RESPOND ──────────────────────
    await session.commitTransaction();
    session.endSession();

    console.log(`[${opId}] ✓ COMPLETE - Applied suggestion and recalculated score`);

    return res.json({
      success: true,
      message: 'Suggestion applied successfully',
      data: {
        score: scoreResult.score,
        breakdown: scoreResult.breakdown,
        keywords: scoreResult.keywords,
        suggestions: newSuggestions
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[applySuggestion] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to apply suggestion',
      error: error.message
    });
  }
}

/**
 * APPLY ALL SUGGESTIONS
 * 
 * Rules:
 * - Apply each suggestion once
 * - Skip duplicates (same section/text combo)
 * - Save resume once after all
 * - Recalculate score once
 * - Generate suggestions once
 */
async function applyAllSuggestions(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resumeId, jobDescriptionId, suggestions } = req.body;
    const opId = `apply-all-${Date.now()}`;

    console.log(`[${opId}] START: Applying ${suggestions?.length || 0} suggestions`);

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

    // ─────────────────── FETCH RESUME & JD ──────────────────────
    const resume = await Resume.findOne({ _id: resumeId }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    const jd = await JobDescription.findOne({ _id: jobDescriptionId }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Job description not found' });
    }

    console.log(`[${opId}] ✓ Fetched resume & JD`);

    // ─────────────────── APPLY EACH SUGGESTION ──────────────────────
    const applied = [];
    const seen = new Set();

    for (let i = 0; i < suggestions.length; i++) {
      const sugg = suggestions[i];
      const key = `${sugg.section}-${sugg.currentText}-${sugg.improvedText}`;

      // Skip duplicates
      if (seen.has(key)) {
        console.log(`[${opId}] ⊘ Skipping duplicate: ${key.substring(0, 60)}`);
        continue;
      }

      const result = applySuggestionToResume(resume, sugg);

      if (result.success && !result.skipped) {
        applied.push(sugg);
        seen.add(key);
        console.log(`[${opId}] ✓ Applied suggestion ${applied.length}/${suggestions.length}`);
      } else if (result.skipped) {
        console.log(`[${opId}] ⊘ Skipped: ${result.reason}`);
      } else {
        console.log(`[${opId}] ✗ Failed: ${result.reason}`);
      }
    }

    if (applied.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No suggestions could be applied'
      });
    }

    console.log(`[${opId}] ✓ Applying ${applied.length}/${suggestions.length} suggestions`);

    // ─────────────────── SAVE RESUME ONCE ──────────────────────
    await resume.save({ session });
    console.log(`[${opId}] ✓ Resume saved`);

    // ─────────────────── RE-FETCH FROM DB ──────────────────────
    const freshResume = await Resume.findById(resumeId).session(session);
    if (!freshResume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ success: false, message: 'Resume lost after save' });
    }

    // ─────────────────── RECALCULATE SCORE ONCE ──────────────────────
    console.log(`[${opId}] Recalculating ATS score...`);
    const scoreResult = ATSEngineAdapter.scoreResume(freshResume, jd);

    console.log(`[${opId}] ✓ New score: ${scoreResult.score}`);

    // ─────────────────── GENERATE NEW SUGGESTIONS ──────────────────────
    const newSuggestions = ATSEngineAdapter.formatSuggestionsForAPI(scoreResult.suggestions || []);

    // ─────────────────── SAVE REPORT ──────────────────────
    const report = new ATSReport({
      resumeId,
      jdId: jobDescriptionId,
      totalScore: scoreResult.score,
      breakdown: scoreResult.breakdown,
      keywords: scoreResult.keywords,
      suggestions: newSuggestions,
      scoringMode: 'job-specific'
    });

    await report.save({ session });

    // ─────────────────── COMMIT & RESPOND ──────────────────────
    await session.commitTransaction();
    session.endSession();

    console.log(`[${opId}] ✓ COMPLETE - Applied ${applied.length} suggestions`);

    return res.json({
      success: true,
      message: `Applied ${applied.length} suggestions`,
      data: {
        appliedCount: applied.length,
        score: scoreResult.score,
        breakdown: scoreResult.breakdown,
        keywords: scoreResult.keywords,
        suggestions: newSuggestions
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[applyAllSuggestions] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to apply suggestions',
      error: error.message
    });
  }
}

module.exports = {
  applySuggestion,
  applyAllSuggestions,
  applySuggestionToResume
};
