/**
 * ================================================================================
 * EVALUATE RESUME FUNCTION - PRODUCTION GRADE
 * ================================================================================
 * Calculates ATS score and generates suggestions from FRESH resume data
 * Must be called AFTER resume is saved and re-fetched from MongoDB
 * ================================================================================
 */

/**
 * Main evaluation function
 * Takes FRESH resume and job description
 * Returns score, breakdown, and fresh suggestions
 * ✅ FIXED: Proper skill normalization and keyword matching
 */
const evaluateResume = (resume, jobDescription) => {
  console.log(`[evaluateResume] Starting evaluation for resume: ${resume._id}`);

  if (!resume) throw new Error('Resume is required');
  if (!jobDescription) throw new Error('Job description is required');

  // ──────────────────────────────────────────────────────────────────────
  // 0. NORMALIZE SKILLS (handles both string[] and object[] formats)
  // ──────────────────────────────────────────────────────────────────────
  const normalizedSkills = (resume.skills || [])
    .map(skill => {
      if (typeof skill === 'string') return skill.toLowerCase().trim();
      if (typeof skill === 'object' && skill.name) return String(skill.name).toLowerCase().trim();
      if (typeof skill === 'object' && skill.items && Array.isArray(skill.items)) {
        return skill.items.map(item => (typeof item === 'string' ? item.toLowerCase().trim() : '')).join(' ');
      }
      return '';
    })
    .filter(s => s)
    .join(' ');

  console.log(`[evaluateResume] Normalized skills: "${normalizedSkills.substring(0, 100)}..."`);

  // ──────────────────────────────────────────────────────────────────────
  // 1. KEYWORD MATCHING (40%)
  // ──────────────────────────────────────────────────────────────────────
  const jdKeywords = jobDescription.extractedKeywords || [];
  
  // ✅ FIXED: Normalize JD keywords
  const normalizedJDKeywords = (jdKeywords || [])
    .map(k => String(k).toLowerCase().trim())
    .filter(k => k);

  console.log(`[evaluateResume] DEBUG - JD INFO:`);
  console.log(`[evaluateResume]   - JD ID: ${jobDescription._id}`);
  console.log(`[evaluateResume]   - JD Title: "${jobDescription.jobTitle || jobDescription.title || 'N/A'}"`);
  console.log(`[evaluateResume]   - JD Keywords count: ${normalizedJDKeywords.length}`);
  if (normalizedJDKeywords.length > 0) {
    console.log(`[evaluateResume]   - JD Keywords (first 10): ${normalizedJDKeywords.slice(0, 10).join(', ')}`);
  }

  // ✅ FIXED: Build complete resume text
  const resumeText = [
    normalizedSkills,
    resume.summary || '',
    ...(resume.experience || []).flatMap(e => e.responsibilities || e.bullets || []),
    ...(resume.projects || []).flatMap(p => p.description || p.bullets || []),
  ]
    .filter(t => t)
    .join(' ')
    .toLowerCase();

  console.log(`[evaluateResume] Resume text length: ${resumeText.length} chars`);

  // ✅ FIXED: Match keywords using includes()
  const matchedKeywords = normalizedJDKeywords.filter(keyword =>
    resumeText.includes(keyword)
  );

  const keywordMatch = normalizedJDKeywords.length > 0
    ? Math.round((matchedKeywords.length / normalizedJDKeywords.length) * 100)
    : 100;

  console.log(`[evaluateResume] JD Keywords: ${JSON.stringify(normalizedJDKeywords)}`);
  console.log(`[evaluateResume] Resume Text: "${resumeText.substring(0, 200)}..."`);
  console.log(`[evaluateResume] Matched Keywords: ${JSON.stringify(matchedKeywords)}`);
  console.log(`[evaluateResume] Keyword match: ${keywordMatch}% (${matchedKeywords.length}/${normalizedJDKeywords.length})`);

  // ──────────────────────────────────────────────────────────────────────
  // 2. COMPLETENESS (20%)
  // ──────────────────────────────────────────────────────────────────────
  const hasAllSections = resume.summary && resume.experience?.length && resume.skills?.length;
  const completeness = hasAllSections ? 90 : 60;
  console.log(`[evaluateResume] Completeness: ${completeness}%`);

  // ──────────────────────────────────────────────────────────────────────
  // 3. FORMATTING (20%)
  // ──────────────────────────────────────────────────────────────────────
  const bulletCount = (resume.experience || []).reduce((sum, e) => sum + (e.bullets?.length || 0), 0)
                     + (resume.projects || []).reduce((sum, p) => sum + (p.bullets?.length || 0), 0);
  const formatting = bulletCount >= 10 ? 85 : bulletCount >= 5 ? 70 : 50;
  console.log(`[evaluateResume] Formatting: ${formatting}% (${bulletCount} bullets)`);

  // ──────────────────────────────────────────────────────────────────────
  // 4. ACTION VERBS (10%)
  // ──────────────────────────────────────────────────────────────────────
  const STRONG_VERBS = [
    'developed', 'built', 'implemented', 'designed', 'led', 'optimized',
    'engineered', 'automated', 'analyzed', 'architected', 'deployed',
    'created', 'established', 'launched', 'delivered', 'achieved',
    'managed', 'coordinated', 'facilitated', 'improved', 'enhanced',
  ];

  const allBullets = [
    ...(resume.experience || []).flatMap(e => e.bullets || []),
    ...(resume.projects || []).flatMap(p => p.bullets || []),
  ];

  const bulletsWithStrongVerb = allBullets.filter(bullet => {
    const text = String(bullet).toLowerCase();
    return STRONG_VERBS.some(verb => text.includes(verb));
  }).length;

  const actionVerbs = allBullets.length > 0 
    ? Math.round((bulletsWithStrongVerb / allBullets.length) * 100)
    : 100;
  console.log(`[evaluateResume] Action verbs: ${actionVerbs}% (${bulletsWithStrongVerb}/${allBullets.length})`);

  // ──────────────────────────────────────────────────────────────────────
  // 5. READABILITY (10%)
  // ──────────────────────────────────────────────────────────────────────
  const avgBulletLength = allBullets.length > 0 
    ? Math.round(allBullets.reduce((sum, b) => sum + String(b).length, 0) / allBullets.length)
    : 0;
  const readability = avgBulletLength >= 80 && avgBulletLength <= 150 ? 90 : avgBulletLength > 150 ? 60 : 70;
  console.log(`[evaluateResume] Readability: ${readability}% (avg bullet: ${avgBulletLength} chars)`);

  // ──────────────────────────────────────────────────────────────────────
  // TOTAL SCORE (weighted average)
  // ──────────────────────────────────────────────────────────────────────
  const totalScore = Math.round(
    keywordMatch * 0.40 +
    completeness * 0.20 +
    formatting * 0.20 +
    actionVerbs * 0.10 +
    readability * 0.10
  );

  console.log(`[evaluateResume] TOTAL SCORE: ${totalScore}%`);
  console.log(`[evaluateResume] BREAKDOWN: keyword=${keywordMatch}%, completeness=${completeness}%, formatting=${formatting}%, actionVerbs=${actionVerbs}%, readability=${readability}%`);

  // ──────────────────────────────────────────────────────────────────────
  // GENERATE SUGGESTIONS
  // ──────────────────────────────────────────────────────────────────────
  const suggestions = [];

  // Missing keywords suggestions
  const missingKeywords = normalizedJDKeywords.filter(k => !resumeText.includes(k));
  if (missingKeywords.length > 0) {
    suggestions.push({
      id: 'missing-keywords',
      title: 'Add Missing Keywords',
      description: `Your resume is missing ${missingKeywords.length} keyword(s) from the job description. Consider adding: ${missingKeywords.slice(0, 5).join(', ')}${missingKeywords.length > 5 ? '...' : ''}`,
      priority: 'high',
      impact: 'keyword-match',
      missingKeywords: missingKeywords,
    });
  }

  // Completeness suggestions
  if (!hasAllSections) {
    suggestions.push({
      id: 'completeness',
      title: 'Complete Your Resume Sections',
      description: 'Add all major sections (Summary, Experience, Skills, Projects, Education) for a complete profile.',
      priority: 'high',
      impact: 'completeness',
    });
  }

  // Formatting suggestions
  if (bulletCount < 10) {
    suggestions.push({
      id: 'formatting',
      title: 'Add More Bullet Points',
      description: `Add more bullet points to your experience and projects to improve formatting. Target: 10+, Current: ${bulletCount}`,
      priority: 'medium',
      impact: 'formatting',
    });
  }

  // Action verb suggestions
  if (actionVerbs < 80) {
    suggestions.push({
      id: 'action-verbs',
      title: 'Use Stronger Action Verbs',
      description: 'Start your bullet points with strong action verbs like "Developed", "Built", "Implemented", "Designed", etc.',
      priority: 'medium',
      impact: 'action-verbs',
    });
  }

  console.log(`[evaluateResume] Generated ${suggestions.length} suggestions`);

  return {
    totalScore,
    breakdown: {
      keywordMatch,
      completeness,
      formatting,
      actionVerbs,
      readability,
    },
    suggestions,
    missingKeywords,
    overallFeedback: totalScore >= 80 ? 'Excellent resume!' : totalScore >= 70 ? 'Good resume, room for improvement.' : 'Resume needs work.',
  };
};

module.exports = evaluateResume;
