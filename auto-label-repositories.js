const { execSync } = require('child_process');

// Configuration
const OWNER = 'ppradyoth';

// Standardized mapping of categories to optimized, search-friendly topics (all lowercase, no emojis)
const TOPICS_MAPPING = {
  BIO_COMP: ['biocomputing', 'organoid-intelligence', 'neuroscience', 'neural-simulation'],
  AI_SEC: ['ai-security', 'mlsecops', 'red-teaming', 'prompt-injection', 'jailbreaking', 'ai-safety'],
  GEN_AI: ['generative-ai', 'llms', 'ai-agents', 'rag', 'dspy', 'artificial-intelligence'],
  OSS: ['open-source', 'hacktoberfest', 'oss-contributions'],
  TRAD_ML: ['machine-learning', 'mlops', 'data-science', 'predictive-modeling'],
  COLLEGE: ['college-projects', 'academic', 'university-projects']
};

const CATEGORIES = {
  BIO_COMP: '🧠 Biocomputing',
  AI_SEC: '🛡️ AI Security',
  GEN_AI: '🔥 Gen AI',
  OSS: '🤝 Open Source Contributions',
  TRAD_ML: '⚙️ Traditional ML',
  COLLEGE: '🎓 College Projects'
};

// Heuristics Classifier Function
function classifyRepo(name, description, isFork) {
  const n = name.toLowerCase();
  const d = (description || '').toLowerCase();

  // 🧠 Biocomputing
  if (n.includes('wetware') || n.includes('neuron') || n.includes('brain') || n.includes('biocomput') || d.includes('organoid') || d.includes('biocomputer')) {
    return 'BIO_COMP';
  }

  // 🛡️ AI Security
  if (n.includes('security') || n.includes('red-team') || n.includes('safety') || n.includes('refusal') || n.includes('vuln') || n.includes('pentest') || n.includes('malware') || n.includes('jailbreak') || n.includes('injection') || n.includes('gate') || n.includes('guard') || n.includes('garak') || n.includes('promptfoo') || n.includes('inspect') || d.includes('ai security') || d.includes('adversarial ai') || d.includes('mlsecops')) {
    return 'AI_SEC';
  }

  // 🔥 Gen AI
  if (n.includes('ctf') || n.includes('prompt') || n.includes('llm') || n.includes('dspy') || n.includes('agent') || n.includes('gpt') || n.includes('gemini') || n.includes('claude') || d.includes('large language model') || d.includes('generative ai') || d.includes('rag') || n.includes('helpful-github-scripts')) {
    return 'GEN_AI';
  }

  // 🤝 Open Source Contributions
  if (isFork || n.includes('hacktoberfest') || n.includes('contribute') || n.includes('contrib') || n.includes('fork') || n.includes('tableit') || d.includes('contribution') || d.includes('fork')) {
    return 'OSS';
  }

  // ⚙️ Traditional ML
  if (n.includes('ml-101') || n.includes('mlops') || n.includes('stock') || n.includes('predictor') || n.includes('sentiment') || n.includes('schmaltz') || n.includes('surveyor') || n.includes('classifier') || n.includes('predict') || n.includes('recommend') || d.includes('machine learning') || d.includes('regression') || d.includes('classification') || n.includes('mood-tracker')) {
    return 'TRAD_ML';
  }

  // 🎓 College Projects (2023 & Before - Non-ML)
  return 'COLLEGE';
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

  if (isDryRun) {
    console.log('\x1b[33m%s\x1b[0m', '=== RUNNING IN DRY-RUN MODE ===');
    console.log('To apply changes, run with: node auto-label-repositories.js --execute\n');
  } else {
    console.log('\x1b[31m%s\x1b[0m', '=== RUNNING IN LIVE EXECUTION MODE ===\n');
  }

  try {
    // Fetch public repos
    console.log('Fetching public repositories...');
    const reposData = JSON.parse(execSync('env GITHUB_TOKEN="" gh repo list ppradyoth --limit 100 --json name,repositoryTopics,description,isFork', { encoding: 'utf8' }));
    
    // Filter out user's profile README repo
    const publicRepos = reposData.filter(r => r.name !== OWNER);
    console.log(`Fetched ${publicRepos.length} public repositories.\n`);

    const summary = [];

    for (const repo of publicRepos) {
      const categoryKey = classifyRepo(repo.name, repo.description, repo.isFork);
      const targetTopics = TOPICS_MAPPING[categoryKey] || [];
      const currentTopics = (repo.repositoryTopics || []).map(t => t.name);

      // Find topics to add (those that are not already present on the repository)
      const topicsToAdd = targetTopics.filter(t => !currentTopics.includes(t));

      summary.push({
        name: repo.name,
        category: CATEGORIES[categoryKey],
        current: currentTopics.join(', ') || '(none)',
        proposed: targetTopics.join(', '),
        toAdd: topicsToAdd
      });

      if (topicsToAdd.length === 0) {
        console.log(`\x1b[32m✔ %s\x1b[0m is already fully labeled with proposed topics.`, repo.name);
        continue;
      }

      console.log(`\x1b[34mℹ %s\x1b[0m [Category: %s]`, repo.name, CATEGORIES[categoryKey]);
      console.log(`  Current topics:  ${currentTopics.join(', ') || '(none)'}`);
      console.log(`  Proposed topics: ${targetTopics.join(', ')}`);
      console.log(`  Topics to add:   \x1b[33m${topicsToAdd.join(', ')}\x1b[0m`);

      if (!isDryRun) {
        console.log(`  Executing: gh repo edit ${OWNER}/${repo.name} --add-topic "${topicsToAdd.join(',')}"...`);
        try {
          execSync(`env GITHUB_TOKEN="" gh repo edit ${OWNER}/${repo.name} --add-topic "${topicsToAdd.join(',')}"`, { stdio: 'inherit' });
          console.log(`  \x1b[32m✔ Successfully updated topics for ${repo.name}\x1b[0m\n`);
        } catch (err) {
          console.error(`  \x1b[31m✖ Failed to update topics for ${repo.name}: ${err.message}\x1b[0m\n`);
        }
      } else {
        console.log('  [Dry Run] No API call made.\n');
      }
    }

    console.log('======================================================');
    console.log('SUMMARY OF CLASSIFICATION');
    console.log('======================================================');
    console.table(summary.map(s => ({
      'Repository': s.name,
      'Classification Category': s.category,
      'Current Topics': s.current,
      'Topics to Add': s.toAdd.join(', ') || 'None (Up-to-date)'
    })));

    if (isDryRun) {
      console.log('\n\x1b[33mDry-run finished. Review the proposed topics above.\x1b[0m');
      console.log('To apply these topics to your GitHub repositories, run:');
      console.log('\x1b[1mnode auto-label-repositories.js --execute\x1b[0m\n');
    } else {
      console.log('\n\x1b[32mLabeled successfully!\x1b[0m\n');
    }

  } catch (error) {
    console.error('Error during repository labeling execution:', error);
    process.exit(1);
  }
}

main();
