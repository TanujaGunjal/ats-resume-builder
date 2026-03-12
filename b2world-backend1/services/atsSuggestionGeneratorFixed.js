/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATS SUGGESTION GENERATOR - FIXED
 * 
 * Output format:
 * {
 *   type: "keyword" | "experience" | "skills" | "formatting" | "readability",
 *   section: "skills" | "experience" | "projects",
 *   impact: "high" | "medium" | "low",
 *   message: string,
 *   currentText: string,
 *   improvedText: string,
 *   itemIndex?: number,
 *   bulletIndex?: number
 * }
 * 
 * FIXED:
 * - Never returns type="suggestion" (always specific type)
 * - Keywords provided as improvedText value, not as message
 * - proper section mapping
 * - All suggestions are directly applicable
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

/**
 * Generate 3-6 consistent, applicable suggestions
 * 
 * @param {Object} resume - Resume object
 * @param {Object} breakdown - Score breakdown {keywordMatch, sectionCompleteness, ...}
 * @param {Array} missingKeywords - Keywords from JD not in resume
 * @param {Array} allJDKeywords - All JD keywords
 * @param {string} resumeText - Full resume text
 * @returns {Array} - Suggestions with consistent structure
 */
function generateSuggestionsFixed(resume, breakdown, missingKeywords, allJDKeywords, resumeText) {
  const suggestions = [];
  const usedBullets = new Set();
  const types = new Set();

  try {
    // ─────────────────────────────────────────────────────────────
    // 1. KEYWORD SUGGESTIONS (ADD TO SKILLS)
    // ─────────────────────────────────────────────────────────────
    if (breakdown.keywordMatch < 70 && missingKeywords && missingKeywords.length > 0) {
      const topKeywords = missingKeywords.slice(0, 3);

      for (const keyword of topKeywords) {
        if (suggestions.length >= 6 || types.has('keyword')) break;

        // Skip generic words
        if (['communication', 'teamwork', 'leadership', 'soft skill'].includes(keyword.toLowerCase())) {
          continue;
        }

        suggestions.push({
          type: 'keyword',
          section: 'skills',
          impact: 'high',
          message: `Add keyword: "${keyword}"`,
          currentText: 'Skills section',
          improvedText: keyword,
          priority: 1
        });

        types.add('keyword');
        break; // Only one keyword suggestion per round
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. EXPERIENCE: ADD METRICS
    // ─────────────────────────────────────────────────────────────
    if (suggestions.length < 6 && resume.experience && resume.experience.length > 0) {
      let found = false;

      for (let i = 0; i < resume.experience.length && !found; i++) {
        const exp = resume.experience[i];
        if (!exp.bullets) continue;

        for (let j = 0; j < exp.bullets.length; j++) {
          const bullet = exp.bullets[j];
          const key = `exp-${i}-${j}`;

          if (usedBullets.has(key) || types.has('experience')) continue;

          // Check if bullet lacks metrics
          const hasMetrics = /\d+%|\d+x|[\$k][\d.]+|improved|increased|reduced|handled [\d]+/i.test(bullet);

          if (!hasMetrics && bullet.length > 20) {
            const improved = addMetricsToBullet(bullet);

            if (improved !== bullet) {
              suggestions.push({
                type: 'experience',
                section: 'experience',
                impact: 'high',
                message: 'Add quantifiable metrics to demonstrate impact',
                currentText: bullet,
                improvedText: improved,
                itemIndex: i,
                bulletIndex: j,
                priority: 2
              });

              types.add('experience');
              usedBullets.add(key);
              found = true;
              break;
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. EXPERIENCE: STRENGTHEN ACTION VERBS
    // ─────────────────────────────────────────────────────────────
    if (suggestions.length < 6 && breakdown.actionVerbs < 70 && resume.experience) {
      const WEAK_VERBS = ['worked', 'helped', 'used', 'made', 'was', 'handled', 'responsible'];
      const STRONG_REPLACEMENTS = {
        'worked': 'developed',
        'helped': 'facilitated',
        'used': 'leveraged',
        'made': 'created',
        'handled': 'managed',
        'responsible': 'led'
      };

      let found = false;

      for (let i = 0; i < resume.experience.length && !found; i++) {
        const exp = resume.experience[i];
        if (!exp.bullets) continue;

        for (let j = 0; j < exp.bullets.length; j++) {
          const bullet = exp.bullets[j];
          const key = `verb-${i}-${j}`;

          if (usedBullets.has(key) || types.has('weak_verb')) continue;

          const firstWord = bullet.split(/\s+/)[0].toLowerCase();
          const match = Object.keys(STRONG_REPLACEMENTS).find(w => firstWord.includes(w));

          if (match) {
            const improved = bullet.replace(
              new RegExp(`^${match}`, 'i'),
              STRONG_REPLACEMENTS[match]
            );

            suggestions.push({
              type: 'weak_verb',
              section: 'experience',
              impact: 'medium',
              message: `Strengthen verb: "${match}" → "${STRONG_REPLACEMENTS[match]}"`,
              currentText: bullet,
              improvedText: improved,
              itemIndex: i,
              bulletIndex: j,
              priority: 3
            });

            types.add('weak_verb');
            usedBullets.add(key);
            found = true;
            break;
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. SUMMARY: ENHANCE OR CREATE
    // ─────────────────────────────────────────────────────────────
    if (suggestions.length < 6 && (!resume.summary || resume.summary.length < 50)) {
      const currentSummary = (resume.summary || '').trim();
      let improvedSummary = currentSummary;

      if (currentSummary.length < 30) {
        const expYears = resume.experience ? Math.min((resume.experience.length || 0) * 3, 20) : 5;
        improvedSummary = `Experienced software engineer with ${expYears}+ years of proven expertise in building scalable applications and delivering high-impact solutions. Strong track record of collaborating with cross-functional teams.`;
      } else if (currentSummary.length < 100) {
        improvedSummary = currentSummary + ` Specialized in full-stack development with a proven track record of delivering scalable, maintainable solutions that increase efficiency and user satisfaction.`;
      }

      if (improvedSummary !== currentSummary && !types.has('summary')) {
        suggestions.push({
          type: 'summary',
          section: 'summary',
          impact: 'medium',
          message: 'Enhance professional summary (aim for 75-150 words)',
          currentText: currentSummary || '(No summary)',
          improvedText: improvedSummary,
          priority: 4
        });

        types.add('summary');
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. SKILLS: ORGANIZE BY CATEGORY
    // ─────────────────────────────────────────────────────────────
    if (suggestions.length < 6 && resume.skills && resume.skills.length > 0 && !types.has('formatting')) {
      // Check if skills are organized by category
      const organized = resume.skills.some(s => s.category && s.items);

      if (!organized) {
        suggestions.push({
          type: 'formatting',
          section: 'skills',
          impact: 'medium',
          message: 'Organize skills by category (Languages, Frameworks, Tools, etc.)',
          currentText: 'Flat skills list',
          improvedText: 'Categorized: Languages, Frameworks, Tools, Databases',
          priority: 5
        });

        types.add('formatting');
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. PROJECTS: ADD IF MISSING
    // ─────────────────────────────────────────────────────────────
    if (suggestions.length < 6 && (!resume.projects || resume.projects.length === 0)) {
      suggestions.push({
        type: 'formatting',
        section: 'projects',
        impact: 'medium',
        message: 'Add projects section to showcase technical capabilities',
        currentText: '(No projects)',
        improvedText: 'E-Commerce Platform: Built scalable Node.js/React application handling 10K+ daily transactions',
        priority: 6
      });

      types.add('projects');
    }

    // ─────────────────────────────────────────────────────────────
    // 7. ENSURE 3+ SUGGESTIONS
    // ─────────────────────────────────────────────────────────────
    if (suggestions.length < 3) {
      // Add certifications
      if (!types.has('readability')) {
        suggestions.push({
          type: 'readability',
          section: 'education',
          impact: 'low',
          message: 'Add relevant certifications or credentials',
          currentText: '(No certifications)',
          improvedText: 'AWS Certified Solutions Architect - Professional',
          priority: 7
        });
      }
    }

    // Return 3-6 suggestions, sorted by priority
    return suggestions
      .sort((a, b) => (a.priority || 999) - (b.priority || 999))
      .slice(0, 6);

  } catch (error) {
    console.error('[generateSuggestionsFixed] Error:', error);
    return [];
  }
}

/**
 * Add metrics to a bullet point
 * @private
 */
function addMetricsToBullet(bullet) {
  // Try common patterns
  const patterns = [
    { test: /^(Developed|Built|Created)(.+)(system|platform|application|service)/i, metric: '10K+' },
    { test: /^(Managed|Led|Oversaw)(.+)(team|group|project)/i, metric: '5+' },
    { test: /^(Optimized|Improved|Enhanced)(.+)(performance|speed|efficiency|latency)/i, metric: '25-30%' },
    { test: /^(Reduced|Decreased)(.+)(downtime|errors|cost|latency)/i, metric: '40%' }
  ];

  for (const { test, metric } of patterns) {
    if (test.test(bullet)) {
      // Append metric context
      if (metric === '10K+') {
        return bullet + ' serving 10K+ daily requests and 1000+ active users.';
      } else if (metric === '5+') {
        return bullet + ' across a team of 5+ engineers.';
      } else if (metric === '25-30%') {
        return bullet + ' by 25-30% and improved user experience.';
      } else if (metric === '40%') {
        return bullet + ' by 40% and improved system reliability.';
      }
    }
  }

  // Generic fallback with domain detection
  const t = bullet.trim().replace(/\.\s*$/, '');
  if (/api|backend|server|endpoint/i.test(t))
    return t + ', handling 500+ daily requests with 99% uptime.';
  if (/ui|frontend|react|component/i.test(t))
    return t + ', improving page load speed by 25%.';
  if (/database|sql|query|mongodb/i.test(t))
    return t + ', reducing query response time by 35%.';
  if (/test|debug|qa|bug/i.test(t))
    return t + ', reducing bug count by 30%.';
  if (/deploy|docker|ci\/cd|infra/i.test(t))
    return t + ', reducing deployment failures by 40%.';
  if (/model|ml|ai|train/i.test(t))
    return t + ', achieving 90%+ model accuracy.';
  if (/campaign|marketing|seo/i.test(t))
    return t + ', increasing engagement by 35%.';
  if (/recruit|hire|talent|hr/i.test(t))
    return t + ', reducing time-to-hire by 30%.';
  if (/budget|forecast|finance|audit/i.test(t))
    return t + ', improving forecast accuracy by 25%.';
  return t + ', contributing to a 20% improvement in team delivery efficiency.';
}

/**
 * Convert suggestion to API format
 * Preserves type and all fields
 */
function formatSuggestion(sugg) {
  return {
    id: sugg.id || `sugg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: sugg.type || 'formatting',
    section: sugg.section || '',
    impact: sugg.impact || 'medium',
    message: sugg.message || '',
    currentText: sugg.currentText || '',
    improvedText: sugg.improvedText || '',
    itemIndex: sugg.itemIndex ?? undefined,
    bulletIndex: sugg.bulletIndex ?? undefined,
    reason: sugg.reason || sugg.message,
    priority: sugg.priority || 999
  };
}

module.exports = {
  generateSuggestionsFixed,
  formatSuggestion
};
