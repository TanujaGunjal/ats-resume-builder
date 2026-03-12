/**
 * evaluateResume.js — Production ATS Scoring
 * Scoring model based on Jobscan/Resume Worded methodology:
 *   Keyword Match   40%
 *   Completeness    20%
 *   Formatting      20%
 *   Action Verbs    10%
 *   Readability     10%
 */

'use strict';

const SuggestionRuleEngine = require('./suggestionRuleEngine');
const { normalizeSuggestions } = require('../utils/suggestionNormalizer');

// ─── Synonym map: when a JD keyword matches any synonym, count as matched ────
const SYNONYMS = {
  'javascript':                  ['js'],
  'typescript':                  ['ts'],
  'python':                      ['python3', 'py'],
  'golang':                      ['go lang', 'go'],
  'node.js':                     ['nodejs', 'node js', 'node'],
  'react':                       ['reactjs', 'react.js', 'react js'],
  'vue':                         ['vuejs', 'vue.js'],
  'angular':                     ['angularjs', 'angular.js'],
  'next.js':                     ['nextjs', 'next js'],
  'spring boot':                 ['springboot', 'spring'],
  'postgresql':                  ['postgres', 'pg'],
  'mongodb':                     ['mongo'],
  'elasticsearch':               ['elastic search'],
  'aws':                         ['amazon web services'],
  'google cloud':                ['gcp'],
  'microsoft azure':             ['azure'],
  'kubernetes':                  ['k8s'],
  'ci/cd':                       ['cicd', 'ci cd', 'continuous integration', 'continuous deployment'],
  'rest api':                    ['restful', 'rest apis', 'restful api'],
  'graphql':                     ['graph ql'],
  'scikit-learn':                ['sklearn', 'scikit learn', 'scikit'],
  'machine learning':            ['ml'],
  'deep learning':               ['neural network', 'neural networks', 'dl'],
  'natural language processing': ['nlp'],
  'data visualization':          ['tableau', 'power bi', 'powerbi', 'matplotlib',
                                   'seaborn', 'plotly', 'data viz'],
  'statistics':                  ['statistical analysis', 'statistical modeling', 'stats'],
  'predictive modeling':         ['predictive modelling', 'predictive analytics'],
  'tensorflow':                  ['tf'],
  'pytorch':                     ['torch'],
  'numpy':                       ['np'],
  'pandas':                      ['pd'],
  'apache spark':                ['spark', 'pyspark'],
  'power bi':                    ['powerbi'],
  'microservices':               ['microservice'],
  'object-oriented programming': ['oop', 'oops', 'object oriented'],
  'agile':                       ['scrum', 'kanban'],
  'react native':                ['react-native'],
};

/** Escape regex special chars */
function escRx(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[\\s\\-]+');
}

/** True if keyword (or any synonym) appears as a whole word in text */
function matchKeyword(text, rawKw) {
  const kw = rawKw.toLowerCase().trim();
  if (new RegExp('\\b' + escRx(kw) + '\\b').test(text)) return true;
  for (const [canon, syns] of Object.entries(SYNONYMS)) {
    if (kw === canon || syns.includes(kw)) {
      for (const form of [canon, ...syns]) {
        if (new RegExp('\\b' + escRx(form) + '\\b').test(text)) return true;
      }
    }
  }
  return false;
}

/** Build a single searchable string from all resume sections */
function buildText(resume) {
  const parts = [];

  // Skills
  (resume.skills || []).forEach(s => {
    if (typeof s === 'string') parts.push(s);
    else if (s?.items) parts.push(...s.items.map(String));
    else if (s?.name) parts.push(String(s.name));
  });

  // Summary
  if (resume.summary) parts.push(resume.summary);

  // Experience
  (resume.experience || []).forEach(exp => {
    parts.push(exp.role || exp.position || '');
    parts.push(exp.company || exp.companyName || '');
    parts.push(exp.description || '');
    parts.push(...(exp.bullets || exp.responsibilities || []));
  });

  // Projects
  (resume.projects || []).forEach(p => {
    parts.push(p.title || p.name || '');
    parts.push(p.description || '');
    if (p.techStack) parts.push(...p.techStack);
    parts.push(...(p.bullets || []));
  });

  // Education
  (resume.education || []).forEach(e => {
    parts.push(e.degree || '', e.field || e.major || '', e.school || e.university || '');
  });

  // Keep hyphens, slashes, dots so scikit-learn / ci/cd / node.js stay intact
  return parts
    .map(p => String(p || '').toLowerCase().trim())
    .join(' ')
    .replace(/[^\p{L}\p{N}\s.\-\/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Generate deterministic overall feedback from score breakdown */
function buildOverallFeedback(breakdown, totalScore, matchedKeywords, missingKeywords) {
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];

  if (breakdown.keywordMatch >= 80) strengths.push('Strong keyword alignment with job description');
  else if (breakdown.keywordMatch >= 60) strengths.push('Good keyword coverage for core skills');
  else weaknesses.push('Low keyword match — add missing skills from the job description');

  if (breakdown.formatting >= 80) strengths.push('Clean and ATS-optimized format');
  else weaknesses.push('Improve formatting by adding more bullet points to experience');

  if (breakdown.completeness >= 80) strengths.push('Well-structured and comprehensive resume');
  else weaknesses.push('Resume is missing key sections — add summary, skills, or experience depth');

  if (breakdown.actionVerbs >= 80) strengths.push('Effective use of strong action verbs');
  else weaknesses.push('Use stronger action verbs (Developed, Engineered, Optimized) to start bullets');

  if (breakdown.readability >= 75) strengths.push('Clear and impactful bullet points');
  else weaknesses.push('Bullet points are too short or lack quantified achievements');

  if (missingKeywords.length > 0) {
    recommendations.push(
      `Add these missing keywords: ${missingKeywords.slice(0, 5).join(', ')}`
    );
  }
  if (breakdown.readability < 75) {
    recommendations.push('Quantify achievements (e.g. "reduced load time by 40%")');
  }
  if (breakdown.actionVerbs < 70) {
    recommendations.push('Start bullets with strong verbs: Developed, Led, Automated, Optimized');
  }

  return { strengths, weaknesses, recommendations };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
const evaluateResume = (resume, jobDescription) => {
  if (!resume) throw new Error('Resume required');
  if (!jobDescription) throw new Error('JobDescription required');

  const resumeText = buildText(resume);

  // ── 1. Extract JD keywords (keep original form — do NOT strip dots/slashes) ──
  const jdKeywords = (jobDescription.extractedKeywords || [])
    .map(kw => (typeof kw === 'string' ? kw : kw?.keyword || '').trim())
    .filter(k => k.length > 1)
    .filter((k, i, a) => a.findIndex(x => x.toLowerCase() === k.toLowerCase()) === i);

  // ── 2. KEYWORD MATCH (40%) ────────────────────────────────────────────────
  const matchedKeywords = jdKeywords.filter(kw => matchKeyword(resumeText, kw));
  const missingKeywords = jdKeywords.filter(kw => !matchKeyword(resumeText, kw));
  const keywordMatch = jdKeywords.length > 0
    ? Math.round((matchedKeywords.length / jdKeywords.length) * 100)
    : 100;

  // ── 3. COMPLETENESS (20%) — granular 0–100 ───────────────────────────────
  let cp = 0;
  // Identity (20 pts)
  if (resume.personalInfo?.fullName || resume.contact?.name) cp += 10;
  if (resume.personalInfo?.email  || resume.contact?.email)  cp += 5;
  if (resume.personalInfo?.phone  || resume.contact?.phone)  cp += 5;
  // Summary (15 pts)
  const sumLen = (resume.summary || '').trim().length;
  if (sumLen >= 150) cp += 15;
  else if (sumLen >= 60) cp += 10;
  else if (sumLen > 0)  cp += 5;
  // Experience depth (25 pts)
  const exps = resume.experience || [];
  const expBullets = exps.reduce((n, e) => n + (e.bullets?.length || e.responsibilities?.length || 0), 0);
  if (exps.length >= 2 && expBullets >= 6) cp += 25;
  else if (exps.length >= 1 && expBullets >= 3) cp += 15;
  else if (exps.length >= 1) cp += 8;
  // Skills count (15 pts)
  const skillCount = (resume.skills || []).reduce((n, s) =>
    n + (typeof s === 'string' ? 1 : (s?.items?.length || 0)), 0);
  if (skillCount >= 10) cp += 15;
  else if (skillCount >= 5) cp += 10;
  else if (skillCount > 0) cp += 5;
  // Education (10 pts)
  if ((resume.education || []).length > 0) cp += 10;
  // Bonus sections (15 pts)
  if ((resume.projects      || []).length > 0) cp += 7;
  if ((resume.certifications|| []).length > 0) cp += 4;
  if ((resume.achievements  || []).length > 0) cp += 4;
  const completeness = Math.min(100, cp);

  // ── 4. FORMATTING (20%) — proportional ───────────────────────────────────
  const allBullets = [
    ...(resume.experience || []).flatMap(e => e.bullets || e.responsibilities || []),
    ...(resume.projects   || []).flatMap(p => p.bullets || []),
  ];
  const bulletCount = allBullets.length;
  // 5 bullets=55, 10=70, 15=82, 20=90, 25+=93 (max 93 from bullets alone)
  const bulletScore = bulletCount === 0 ? 0 : Math.min(93, 40 + bulletCount * 2.1);
  const structureBonus =
    ((resume.personalInfo?.fullName || resume.contact?.name) ? 3 : 0) +
    ((resume.summary && resume.summary.trim().length > 20) ? 2 : 0) +
    ((resume.skills  && resume.skills.length > 0) ? 2 : 0);
  const formatting = Math.min(95, Math.round(bulletScore + structureBonus));

  // ── 5. ACTION VERBS (10%) ─────────────────────────────────────────────────
  const STRONG_VERBS = new Set([
    'achieved','architected','automated','built','collaborated','coordinated','created',
    'decreased','defined','delivered','deployed','designed','developed','drove',
    'engineered','enhanced','established','executed','facilitated','generated','grew',
    'implemented','improved','increased','initiated','integrated','launched','led',
    'managed','mentored','migrated','optimized','orchestrated','owned','pioneered',
    'produced','reduced','refactored','resolved','scaled','shipped','simplified',
    'spearheaded','streamlined','transformed',
  ]);
  const bulletsWithVerb = allBullets.filter(b => {
    const first = String(b || '').toLowerCase().trim().split(/\s+/)[0];
    return STRONG_VERBS.has(first);
  }).length;
  const actionVerbs = allBullets.length > 0
    ? Math.round((bulletsWithVerb / allBullets.length) * 100)
    : 0;

  // ── 6. READABILITY (10%) — grades bullet quality ─────────────────────────
  let readability = 50;
  if (allBullets.length > 0) {
    const avgLen = Math.round(
      allBullets.reduce((s, b) => s + String(b || '').length, 0) / allBullets.length
    );
    const metricsCount = allBullets.filter(b => /\d+%|\d+x|\d+[kmb]|\$\d+/i.test(String(b||''))).length;
    const metricsRatio = metricsCount / allBullets.length;
    // Score by length: 50-160 chars ideal
    let ls;
    if      (avgLen >= 60 && avgLen <= 160) ls = 82;
    else if (avgLen >= 40 && avgLen <  60)  ls = 68;
    else if (avgLen >  160)                 ls = 72;
    else                                    ls = 42; // < 40 chars = very weak
    readability = Math.min(100, Math.round(ls + metricsRatio * 18));
  }

  // ── 7. TOTAL SCORE ────────────────────────────────────────────────────────
  const totalScore = Math.round(
    keywordMatch  * 0.40 +
    completeness  * 0.20 +
    formatting    * 0.20 +
    actionVerbs   * 0.10 +
    readability   * 0.10
  );

  // ── 8. OVERALL FEEDBACK (deterministic — no random) ─────────────────────
  const overallFeedback = buildOverallFeedback(
    { keywordMatch, completeness, formatting, actionVerbs, readability },
    totalScore,
    matchedKeywords,
    missingKeywords
  );

  // ── 9. SUGGESTIONS ───────────────────────────────────────────────────────
  const engine = new SuggestionRuleEngine();
  const rawSuggestions = engine.generateSuggestions(resume, missingKeywords.slice(0, 5));
  const suggestions = normalizeSuggestions(rawSuggestions);

  return {
    totalScore,
    breakdown: { keywordMatch, completeness, formatting, actionVerbs, readability },
    matchedKeywords,
    missingKeywords,
    overallFeedback,
    suggestions,
    debugInfo: {
      resumeTextLength: resumeText.length,
      jdKeywordCount:   jdKeywords.length,
      bulletCount,
    },
  };
};

module.exports = evaluateResume;
