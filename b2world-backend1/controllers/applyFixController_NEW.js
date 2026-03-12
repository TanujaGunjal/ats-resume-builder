/**
 * Apply Fix Controllers - Clean Rebuild
 * Single responsibility: Update resume + recalculate score
 */

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSReport = require('../models/ATSReport');
const evaluateResume = require('../services/evaluateResume');

// ============================================================
// APPLY SINGLE SUGGESTION
// ============================================================

const applySuggestion = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resumeId, jobDescriptionId, suggestionId } = req.body;
    const userId = req.user._id;

    console.log('[applySuggestion] START', { resumeId, jobDescriptionId, suggestionId });

    // Validate inputs
    if (!resumeId || !mongoose.Types.ObjectId.isValid(resumeId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid resumeId' });
    }

    if (!jobDescriptionId || !mongoose.Types.ObjectId.isValid(jobDescriptionId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid jobDescriptionId' });
    }

    // Step 1: Fetch resume
    const resume = await Resume.findOne({ _id: resumeId, userId }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Resume not found' });
    }
    console.log('[applySuggestion] Fetched resume', { skills: resume.skills?.length });

    // Step 2: Fetch job description
    const jd = await JobDescription.findOne({ _id: jobDescriptionId }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Job description not found' });
    }
    console.log('[applySuggestion] Fetched JD', { keywords: jd.extractedKeywords?.length });

    // Step 3: Fetch latest report to get suggestions
    const latestReport = await ATSReport.findOne({ resumeId }).sort({ createdAt: -1 }).session(session);
    if (!latestReport) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'No ATS report found' });
    }

    const targetSuggestion = latestReport.suggestions?.find(s => s._id?.toString() === suggestionId);
    if (!targetSuggestion) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    console.log('[applySuggestion] Found suggestion', { type: targetSuggestion.type });

    // Step 4: Apply suggestion
    applySuggestionToResume(resume, targetSuggestion);
    console.log('[applySuggestion] Suggestion applied');

    // Step 5: Save resume
    await resume.save({ session });
    console.log('[applySuggestion] Resume saved');

    // Step 6: Re-fetch resume (CRITICAL - fresh data)
    const updatedResume = await Resume.findOne({ _id: resumeId, userId }).session(session);
    if (!updatedResume) throw new Error('Resume lost after save');
    console.log('[applySuggestion] Resume re-fetched', { skills: updatedResume.skills?.length });

    // Step 7: Recalculate score
    const evaluation = evaluateResume(updatedResume, jd);
    console.log('[applySuggestion] Score calculated', { score: evaluation.totalScore, matched: evaluation.matchedKeywords?.length });

    // Step 8: Save new ATS report
    await ATSReport.create([{
      resumeId: updatedResume._id,
      userId,
      jobDescriptionId,
      totalScore: evaluation.totalScore,
      breakdown: evaluation.breakdown,
      matchedKeywords: evaluation.matchedKeywords,
      missingKeywords: evaluation.missingKeywords,
      suggestions: evaluation.suggestions,
      createdAt: new Date()
    }], { session });
    console.log('[applySuggestion] ATSReport saved');

    // Update resume score
    updatedResume.atsScore = evaluation.totalScore;
    await updatedResume.save({ session });

    await session.commitTransaction();
    session.endSession();

    console.log('[applySuggestion] SUCCESS');

    return res.status(200).json({
      success: true,
      data: {
        resumeId: updatedResume._id,
        totalScore: evaluation.totalScore,
        breakdown: evaluation.breakdown,
        matchedKeywords: evaluation.matchedKeywords,
        missingKeywords: evaluation.missingKeywords,
        suggestions: evaluation.suggestions
      }
    });

  } catch (error) {
    try { await session.abortTransaction(); } catch (_) {}
    session.endSession();
    console.error('[applySuggestion] ERROR:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================================
// APPLY ALL SUGGESTIONS
// ============================================================

const applyAllSuggestions = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resumeId, jobDescriptionId } = req.body;
    const userId = req.user._id;

    console.log('[applyAllSuggestions] START', { resumeId, jobDescriptionId });

    // Validate inputs
    if (!resumeId || !mongoose.Types.ObjectId.isValid(resumeId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid resumeId' });
    }

    if (!jobDescriptionId || !mongoose.Types.ObjectId.isValid(jobDescriptionId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid jobDescriptionId' });
    }

    // Step 1: Fetch resume + JD
    const resume = await Resume.findOne({ _id: resumeId, userId }).session(session);
    if (!resume) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Resume not found' });
    }

    const jd = await JobDescription.findOne({ _id: jobDescriptionId }).session(session);
    if (!jd) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Job description not found' });
    }

    console.log('[applyAllSuggestions] Fetched resume + JD');

    // Step 2: Get latest suggestions
    const latestReport = await ATSReport.findOne({ resumeId }).sort({ createdAt: -1 }).session(session);
    if (!latestReport || !latestReport.suggestions) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'No suggestions found' });
    }

    const suggestions = latestReport.suggestions;
    console.log('[applyAllSuggestions] Found suggestions', { count: suggestions.length });

    // Step 3: Apply all suggestions in memory
    let appliedCount = 0;
    for (const sug of suggestions) {
      try {
        applySuggestionToResume(resume, sug);
        appliedCount++;
      } catch (err) {
        console.warn('[applyAllSuggestions] Skipped suggestion:', err.message);
      }
    }

    console.log('[applyAllSuggestions] Applied in memory', { count: appliedCount });

    if (appliedCount === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ success: true, data: { appliedCount: 0 } });
    }

    // Step 4: Save resume ONCE
    await resume.save({ session });
    console.log('[applyAllSuggestions] Resume saved');

    // Step 5: Re-fetch resume
    const updatedResume = await Resume.findOne({ _id: resumeId, userId }).session(session);
    if (!updatedResume) throw new Error('Resume lost after save');
    console.log('[applyAllSuggestions] Resume re-fetched');

    // Step 6: Recalculate score ONCE
    const evaluation = evaluateResume(updatedResume, jd);
    console.log('[applyAllSuggestions] Score recalculated', { score: evaluation.totalScore });

    // Step 7: Save new report
    await ATSReport.create([{
      resumeId: updatedResume._id,
      userId,
      jobDescriptionId,
      totalScore: evaluation.totalScore,
      breakdown: evaluation.breakdown,
      matchedKeywords: evaluation.matchedKeywords,
      missingKeywords: evaluation.missingKeywords,
      suggestions: evaluation.suggestions,
      createdAt: new Date()
    }], { session });

    updatedResume.atsScore = evaluation.totalScore;
    await updatedResume.save({ session });

    await session.commitTransaction();
    session.endSession();

    console.log('[applyAllSuggestions] SUCCESS', { applied: appliedCount, score: evaluation.totalScore });

    return res.status(200).json({
      success: true,
      data: {
        appliedCount,
        resumeId: updatedResume._id,
        totalScore: evaluation.totalScore,
        breakdown: evaluation.breakdown,
        matchedKeywords: evaluation.matchedKeywords,
        missingKeywords: evaluation.missingKeywords,
        suggestions: evaluation.suggestions
      }
    });

  } catch (error) {
    try { await session.abortTransaction(); } catch (_) {}
    session.endSession();
    console.error('[applyAllSuggestions] ERROR:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

// ============================================================
// HELPER: Apply suggestion to resume object
// ============================================================

const applySuggestionToResume = (resume, suggestion) => {
  if (!suggestion) return;

  console.log('[applySuggestionToResume]', { type: suggestion.type, title: suggestion.title });

  switch (suggestion.type) {
    case 'skill':
    case 'missing-keywords':
      // Add missing keywords as skills
      if (!Array.isArray(resume.skills)) resume.skills = [];
      
      const skillsToAdd = suggestion.items || [];
      for (const skill of skillsToAdd) {
        const skillLower = String(skill).toLowerCase().trim();
        
        // Check if already exists
        const exists = resume.skills.some(s => {
          if (typeof s === 'string') return s.toLowerCase() === skillLower;
          if (s.items && Array.isArray(s.items)) {
            return s.items.some(i => String(i).toLowerCase() === skillLower);
          }
          return false;
        });

        if (!exists) {
          // Add to first skill group or create new one
          if (resume.skills.length === 0) {
            resume.skills.push({ category: 'Technical', items: [skill] });
          } else if (resume.skills[0].items && Array.isArray(resume.skills[0].items)) {
            resume.skills[0].items.push(skill);
          } else {
            resume.skills.push({ category: 'Technical', items: [skill] });
          }
        }
      }
      break;

    case 'summary':
    case 'add-summary':
      if (!resume.summary) {
        resume.summary = suggestion.description || 'Results-driven professional with strong technical expertise.';
      }
      break;

    case 'experience':
    case 'improve-verbs':
      // Update weak bullets with better wording
      if (Array.isArray(resume.experience)) {
        resume.experience.forEach(exp => {
          if (Array.isArray(exp.bullets)) {
            exp.bullets = exp.bullets.map(bullet => {
              const text = String(bullet || '').toLowerCase();
              if (!text.startsWith('achieved') && !text.startsWith('built') && !text.startsWith('developed')) {
                return 'Developed and delivered ' + bullet;
              }
              return bullet;
            });
          }
        });
      }
      break;

    case 'add-bullets':
      // Would need more context about what bullets to add
      break;

    default:
      console.warn('[applySuggestionToResume] Unknown suggestion type:', suggestion.type);
  }
};

module.exports = {
  applySuggestion,
  applyAllSuggestions
};
