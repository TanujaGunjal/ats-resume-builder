/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ATS KEYWORD EXTRACTOR - FIXED
 * 
 * FIXES:
 * - Only extracts single technology terms (not full sentences)
 * - Prioritizes explicit skill lists from JD
 * - Avoids generic phrases like "Developed on data analysis"
 * - Returns: ['python', 'pandas', 'sql', 'aws', 'docker'] NOT ["Developed on data analysis"]
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// Comprehensive technology keyword database
const TECHNOLOGY_KEYWORDS = {
  // Programming Languages
  'python': 1, 'javascript': 1, 'typescript': 1, 'java': 1, 'csharp': 1, 'c++': 1,
  'c#': 1, 'go': 1, 'rust': 1, 'kotlin': 1, 'scala': 1, 'php': 1, 'ruby': 1, 'swift': 1,
  'r': 1, 'matlab': 1, 'perl': 1, 'lua': 1, 'groovy': 1, 'clojure': 1, 'elixir': 1,
  
  // Frontend Frameworks
  'react': 1, 'vue': 1, 'angular': 1, 'svelte': 1, 'ember': 1, 'backbone': 1,
  'next.js': 1, 'nuxt': 1, 'gatsby': 1, 'remix': 1, 'astro': 1,
  
  // Backend Frameworks
  'node.js': 1, 'django': 1, 'flask': 1, 'fastapi': 1, 'spring': 1, 'spring-boot': 1,
  'express': 1, 'nestjs': 1, 'nest.js': 1, 'rails': 1, 'laravel': 1, 'symfony': 1,
  'fastapi': 1, 'tornado': 1, '.net': 1, 'asp.net': 1, 'asp': 1,
  
  // Databases
  'sql': 1, 'mysql': 1, 'postgresql': 1, 'postgres': 1, 'mongodb': 1, 'nosql': 1,
  'oracle': 1, 'mssql': 1, 'cassandra': 1, 'dynamodb': 1, 'firestore': 1,
  'redis': 1, 'elasticsearch': 1, 'neo4j': 1, 'firebase': 1, 'supabase': 1,
  
  // Data Science & ML
  'pandas': 1, 'numpy': 1, 'scikit-learn': 1, 'scipy': 1, 'tensorflow': 1,
  'keras': 1, 'pytorch': 1, 'sklearn': 1, 'matplotlib': 1, 'seaborn': 1,
  'ggplot': 1, 'plotly': 1, 'bokeh': 1, 'spark': 1, 'hadoop': 1,
  'airflow': 1, 'dbt': 1, 'tableau': 1, 'powerbi': 1, 'looker': 1,
  
  // Cloud Platforms
  'aws': 1, 'azure': 1, 'gcp': 1, 'google-cloud': 1, 'heroku': 1, 'digitalocean': 1,
  'linode': 1, 'vultr': 1, 'cloudflare': 1, 'vercel': 1, 'netlify': 1, 'ibm-cloud': 1,
  
  // Container & Orchestration
  'docker': 1, 'kubernetes': 1, 'k8s': 1, 'docker-compose': 1, 'openshift': 1,
  'helm': 1, 'vagrant': 1, 'terraform': 1, 'ansible': 1, 'chef': 1, 'puppet': 1,
  
  // DevOps & CI/CD
  'jenkins': 1, 'github-actions': 1, 'gitlab-ci': 1, 'circleci': 1, 'travis-ci': 1,
  'bamboo': 1, 'spinnaker': 1, 'gitops': 1, 'prometheus': 1, 'grafana': 1,
  'elk-stack': 1, 'splunk': 1, 'datadog': 1, 'newrelic': 1, 'sumologic': 1,
  
  // API & Web Services
  'rest': 1, 'restful': 1, 'graphql': 1, 'soap': 1, 'rpc': 1, 'grpc': 1,
  'websocket': 1, 'swagger': 1, 'openapi': 1, 'postman': 1,
  
  // Mobile Development
  'react-native': 1, 'flutter': 1, 'swift': 1, 'kotlin': 1, 'xamarin': 1,
  'ionic': 1, 'cordova': 1, 'nativescript': 1, 'ios': 1, 'android': 1,
  
  // Testing Frameworks
  'jest': 1, 'mocha': 1, 'cypress': 1, 'selenium': 1, 'junit': 1, 'pytest': 1,
  'unittest': 1, 'rspec': 1, 'testng': 1, 'jmeter': 1, 'postman': 1, 'soapui': 1,
  
  // Version Control
  'git': 1, 'github': 1, 'gitlab': 1, 'bitbucket': 1, 'svn': 1, 'mercurial': 1,
  
  // Build Tools
  'npm': 1, 'yarn': 1, 'pnpm': 1, 'maven': 1, 'gradle': 1, 'ant': 1,
  'webpack': 1, 'parcel': 1, 'vite': 1, 'gulp': 1, 'grunt': 1, 'rollup': 1,
  
  // JavaScript/Node Ecosystem
  'express': 1, 'axios': 1, 'lodash': 1, 'moment': 1, 'date-fns': 1,
  'jquery': 1, 'typescript': 1, 'babel': 1, 'eslint': 1, 'prettier': 1,
  
  // Messaging & Queues
  'rabbitmq': 1, 'kafka': 1, 'activemq': 1, 'nats': 1, 'redis-pub-sub': 1,
  'sqs': 1, 'sns': 1, 'pubsub': 1, 'mqtt': 1, 'amqp': 1,
  
  // Microservices & Architecture
  'microservices': 1, 'service-mesh': 1, 'istio': 1, 'consul': 1, 'eureka': 1,
  'api-gateway': 1, 'load-balancing': 1, 'caching': 1, 'event-driven': 1,
  
  // Documentation & Collaboration
  'jira': 1, 'confluence': 1, 'trello': 1, 'asana': 1, 'monday': 1,
  'slack': 1, 'teams': 1, 'discord': 1, 'notion': 1,
  
  // Miscellaneous
  'linux': 1, 'unix': 1, 'windows': 1, 'macos': 1, 'bash': 1, 'shell': 1,
  'json': 1, 'xml': 1, 'yaml': 1, 'csv': 1, 'api': 1, 'rest-api': 1,
  'oauth': 1, 'jwt': 1, 'saml': 1, 'ldap': 1, 'kerberos': 1,
  'ssl': 1, 'tls': 1, 'https': 1, 'ssh': 1, 'vpn': 1
};

/**
 * Extract ONLY single technology keywords from JD
 * Avoids extracting full sentences or generic phrases
 * 
 * FIXES Issue #3 by:
 * - Only returning technology terms (no sentences)
 * - Supporting multi-part terms like "node.js", "rest-api"
 * - Avoiding generic words like "communication", "teamwork"
 * 
 * @param {string} jdText - Job description text
 * @returns {string[]} - Technology keywords only
 */
function extractJDKeywordsFixed(jdText) {
  if (!jdText || typeof jdText !== 'string') {
    return [];
  }

  const results = [];
  const seen = new Set();

  // Option 1: Try to find explicit "Skills" or "Requirements" section
  const skillsMatch = jdText.match(
    /(?:required\s+skills?|skills?\s+required|technical\s+skills?|core\s+competencies)[:\s]+([^.]+?)(?=\n\n|\n[A-Z]|$)/i
  );

  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    extractTechKeywords(skillsText, results, seen);
  }

  // Option 2: Extract from bullet points (usually under Requirements/Skills)
  const bulletMatches = jdText.match(/^[\s]*[-•*]\s+(.+)$/gm);
  if (bulletMatches) {
    for (const bullet of bulletMatches) {
      extractTechKeywords(bullet, results, seen);
    }
  }

  // Option 3: If no skills found, scan entire text but be very restrictive
  if (results.length === 0) {
    extractTechKeywords(jdText, results, seen, true); // strict mode
  }

  return results;
}

/**
 * Extract technology keywords from text
 * Only matches words/terms in the TECHNOLOGY_KEYWORDS database
 * 
 * @private
 * @param {string} text - Text to extract from
 * @param {Array} results - Results array to populate
 * @param {Set} seen - Set to track seen keywords
 * @param {boolean} strict - If true, only return exact matches, no substring
 */
function extractTechKeywords(text, results, seen, strict = false) {
  const normalized = text.toLowerCase();

  // Sort by length DESC so we match longer terms first (node.js before node)
  const sortedKeywords = Object.keys(TECHNOLOGY_KEYWORDS).sort((a, b) => b.length - a.length);

  for (const keyword of sortedKeywords) {
    if (seen.has(keyword)) continue;

    // Match whole words only (avoid matching 'node' in 'inode')
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    
    if (pattern.test(normalized)) {
      results.push(keyword);
      seen.add(keyword);
    }
  }
}

/**
 * Extract keywords limited to job description's explicit skill list
 * Even more restrictive - only from dedicated skills section
 * 
 * @param {string} jdText - Job description text
 * @returns {string[]} - Technology keywords from explicit skills sections only
 */
function extractExplicitSkills(jdText) {
  if (!jdText || typeof jdText !== 'string') {
    return [];
  }

  const results = [];
  const seen = new Set();

  // Find "Skills", "Requirements", "Qualifications" sections
  const patterns = [
    /(?:required\s+)?skills?[\s:]+([^.]+?)(?=\n[A-Z]|\n\n|$)/i,
    /(?:technical\s+)?requirements?[\s:]+([^.]+?)(?=\n[A-Z]|\n\n|$)/i,
    /qualifications?[\s:]+([^.]+?)(?=\n[A-Z]|\n\n|$)/i,
    /must\s+have[\s:]+([^.]+?)(?=\n[A-Z]|\n\n|$)/i,
    /experience\s+with[\s:]+([^.]+?)(?=\n[A-Z]|\n\n|$)/i
  ];

  for (const pattern of patterns) {
    const match = jdText.match(pattern);
    if (match) {
      extractTechKeywords(match[1], results, seen);
    }
  }

  return results;
}

module.exports = {
  extractJDKeywordsFixed,
  extractExplicitSkills,
  TECHNOLOGY_KEYWORDS
};
