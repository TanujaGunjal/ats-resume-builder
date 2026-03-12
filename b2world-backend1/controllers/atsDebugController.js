/**
 * ATS Score Debug Endpoint
 * 
 * Use this to capture detailed logs of what's happening when /api/ats/score fails.
 * This helps identify the exact error point.
 * 
 * USAGE:
 * POST /api/ats/score/debug
 * Body: { "resumeId": "..." }
 * 
 * Returns detailed debugging information instead of user-friendly error
 */

const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const JobDescription = require('../models/JobDescription');
const ATSEngineAdapter = require('../services/atsEngineAdapter');
const ATSReport = require('../models/ATSReport');

module.exports = {
  debugATSScore: async (req, res) => {
    const debug = [];
    const log = (msg) => {
      console.log(msg);
      debug.push(msg);
    };

    try {
      const resumeId = req.body?.resumeId;
      log(`\n📋 DEBUG: Starting ATS score calculation for resumeId=${resumeId}`);

      // Step 1: Validation
      log(`\n1️⃣ STEP 1: Validate inputs`);
      if (!resumeId) {
        log(`❌ FAIL: resumeId is missing`);
        return res.status(400).json({ success: false, debug, error: 'resumeId missing' });
      }

      if (!mongoose.Types.ObjectId.isValid(resumeId)) {
        log(`❌ FAIL: resumeId format invalid: ${resumeId}`);
        return res.status(400).json({ success: false, debug, error: 'Invalid resumeId format' });
      }
      log(`✅ PASS: resumeId is valid`);

      // Step 2: Fetch Resume
      log(`\n2️⃣ STEP 2: Fetch resume from MongoDB`);
      const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
      if (!resume) {
        log(`❌ FAIL: Resume not found for id=${resumeId}`);
        return res.status(404).json({ success: false, debug, error: 'Resume not found' });
      }
      log(`✅ PASS: Resume found`);
      log(`   - Resume ID: ${resume._id}`);
      log(`   - JD ID: ${resume.jdId || 'NOT SET'}`);
      log(`   - Has summary: ${!!resume.summary}`);
      log(`   - Experience items: ${resume.experience?.length || 0}`);
      log(`   - Skills: ${resume.skills?.length || 0}`);

      // Step 3: Check JD Link
      log(`\n3️⃣ STEP 3: Check if JD is linked`);
      if (!resume.jdId) {
        log(`⚠️ WARNING: No JD linked to resume`);
        return res.status(200).json({
          success: true,
          debug,
          message: 'No JD linked',
          data: { totalScore: null, scoringMode: 'no-jd' }
        });
      }
      log(`✅ PASS: JD ID found: ${resume.jdId}`);

      // Step 4: Fetch JD
      log(`\n4️⃣ STEP 4: Fetch JobDescription from MongoDB`);
      const jd = await JobDescription.findOne({ _id: resume.jdId, userId: req.user._id });
      if (!jd) {
        log(`❌ FAIL: JobDescription not found for id=${resume.jdId}`);
        return res.status(404).json({ success: false, debug, error: 'Job description not found' });
      }
      log(`✅ PASS: JobDescription found`);
      log(`   - JD ID: ${jd._id}`);
      log(`   - Has jdText: ${!!jd.jdText}`);
      log(`   - jdText length: ${(jd.jdText || '').length}`);
      log(`   - Has description: ${!!jd.description}`);
      log(`   - description length: ${(jd.description || '').length}`);
      log(`   - Extracted keywords: ${jd.extractedKeywords?.length || 0}`);
      if (jd.extractedKeywords?.length > 0) {
        log(`   - Sample keywords: ${jd.extractedKeywords.slice(0, 3).join(', ')}`);
      }

      // Step 5: Format for Engine
      log(`\n5️⃣ STEP 5: Convert MongoDB objects to engine format`);
      try {
        const engineResume = ATSEngineAdapter.resumeToEngineFormat(resume);
        log(`✅ PASS: Resume converted to engine format`);
        log(`   - Keys: ${Object.keys(engineResume).join(', ')}`);
      } catch (err) {
        log(`❌ FAIL: Could not convert resume: ${err.message}`);
        return res.status(500).json({ success: false, debug, error: err.message });
      }

      try {
        const engineJD = ATSEngineAdapter.jobDescriptionToEngineFormat(jd);
        log(`✅ PASS: JD converted to engine format`);
        log(`   - Keys: ${Object.keys(engineJD).join(', ')}`);
        log(`   - Title: ${engineJD.title}`);
        log(`   - Description length: ${engineJD.description.length}`);
        log(`   - Keywords: ${engineJD.extractedKeywords.length}`);
      } catch (err) {
        log(`❌ FAIL: Could not convert JD: ${err.message}`);
        return res.status(500).json({ success: false, debug, error: err.message });
      }

      // Step 6: Score Resume
      log(`\n6️⃣ STEP 6: Call ATSEngineAdapter.scoreResume()`);
      let scoreResult;
      try {
        scoreResult = ATSEngineAdapter.scoreResume(resume, jd);
        log(`✅ PASS: Score calculated`);
        log(`   - Score: ${scoreResult.score}`);
        log(`   - Breakdown keys: ${Object.keys(scoreResult.breakdown).join(', ')}`);
        log(`   - Suggestions: ${scoreResult.suggestions?.length || 0}`);
        log(`   - Keywords matched: ${scoreResult.keywords?.matched?.length || 0}`);
        log(`   - Keywords missing: ${scoreResult.keywords?.missing?.length || 0}`);
      } catch (err) {
        log(`❌ FAIL: scoreResume error: ${err.message}`);
        log(`   Stack: ${err.stack?.split('\n').slice(0, 3).join('\n')}`);
        return res.status(500).json({ success: false, debug, error: err.message });
      }

      // Step 7: Format Suggestions
      log(`\n7️⃣ STEP 7: Format suggestions for API`);
      try {
        const suggestions = ATSEngineAdapter.formatSuggestionsForAPI(scoreResult.suggestions || []);
        log(`✅ PASS: Suggestions formatted`);
        log(`   - Count: ${suggestions.length}`);
        if (suggestions.length > 0) {
          log(`   - First suggestion type: ${suggestions[0].type}`);
          log(`   - First suggestion has itemIndex: ${suggestions[0].itemIndex !== undefined}`);
          log(`   - First suggestion has bulletIndex: ${suggestions[0].bulletIndex !== undefined}`);
        }
      } catch (err) {
        log(`❌ FAIL: formatSuggestionsForAPI error: ${err.message}`);
        return res.status(500).json({ success: false, debug, error: err.message });
      }

      // Step 8: Transform Breakdown
      log(`\n8️⃣ STEP 8: Transform breakdown for ATSReport schema`);
      try {
        const breakdown = ATSEngineAdapter.transformBreakdownForATSReport(
          scoreResult.breakdown,
          scoreResult.details
        );
        log(`✅ PASS: Breakdown transformed`);
        log(`   - Keys: ${Object.keys(breakdown).join(', ')}`);
      } catch (err) {
        log(`❌ FAIL: transformBreakdownForATSReport error: ${err.message}`);
        return res.status(500).json({ success: false, debug, error: err.message });
      }

      // Step 9: Save ATSReport
      log(`\n9️⃣ STEP 9: Create and save ATSReport`);
      try {
        const suggestions = ATSEngineAdapter.formatSuggestionsForAPI(scoreResult.suggestions || []);
        const breakdown = ATSEngineAdapter.transformBreakdownForATSReport(
          scoreResult.breakdown,
          scoreResult.details
        );

        const atsReport = await ATSReport.create({
          resumeId: resume._id,
          userId: req.user._id,
          jdId: resume.jdId,
          totalScore: scoreResult.score,
          keywordMatchPercent: scoreResult.breakdown?.keywordMatch || 0,
          breakdown,
          missingKeywords: scoreResult.keywords?.missing || [],
          jdKeywords: scoreResult.keywords?.matched || [],
          suggestions,
          createdAt: new Date()
        });

        log(`✅ PASS: ATSReport created`);
        log(`   - Report ID: ${atsReport._id}`);
        log(`   - Score: ${atsReport.totalScore}`);
        log(`   - Suggestions saved: ${atsReport.suggestions?.length || 0}`);
      } catch (err) {
        log(`❌ FAIL: ATSReport.create() error: ${err.message}`);
        if (err.errors) {
          log(`   - Validation errors:`);
          Object.entries(err.errors).forEach(([key, val]) => {
            log(`     - ${key}: ${val.message}`);
          });
        }
        return res.status(500).json({ success: false, debug, error: err.message });
      }

      // Success!
      log(`\n✅ SUCCESS: All steps completed`);
      return res.status(200).json({
        success: true,
        debug,
        message: 'All checks passed',
        score: scoreResult.score
      });

    } catch (err) {
      debug.push(`\n❌ UNEXPECTED ERROR: ${err.message}`);
      debug.push(`Stack: ${err.stack}`);
      
      return res.status(500).json({
        success: false,
        debug,
        error: err.message
      });
    }
  }
};
