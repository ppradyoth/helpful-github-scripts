const { execSync } = require('child_process');

// Configuration
const OWNER = 'ppradyoth';

const CATEGORIES = {
  AI_SEC: '🛡️ AI Security',
  GEN_AI: '🔥 Gen AI',
  TRAD_ML: '⚙️ Traditional ML',
  BIO_COMP: '🧠 Biocomputing',
  OSS: '🤝 Open Source Contributions',
  COLLEGE: '🎓 College Projects (2023 & Before - Non-ML)',
  STEALTH: '🔒 Enterprise Innovation (Stealth)'
};

// Run a GraphQL query via gh CLI
function runGraphQL(query, variables = {}) {
  const payload = { query };
  if (Object.keys(variables).length > 0) {
    payload.variables = variables;
  }
  const cmd = `gh api graphql -f query='${query.replace(/'/g, "'\\''")}'`;
  const result = execSync(cmd, { encoding: 'utf8' });
  return JSON.parse(result);
}

// Heuristics Classifier Function
function classifyRepo(name, description, isFork) {
  const n = name.toLowerCase();
  const d = (description || '').toLowerCase();

  // 🧠 Biocomputing
  if (n.includes('wetware') || n.includes('neuron') || n.includes('brain') || n.includes('biocomput') || d.includes('organoid') || d.includes('biocomputer')) {
    return CATEGORIES.BIO_COMP;
  }

  // 🛡️ AI Security
  if (n.includes('security') || n.includes('red-team') || n.includes('safety') || n.includes('refusal') || n.includes('vuln') || n.includes('pentest') || n.includes('malware') || n.includes('jailbreak') || n.includes('injection') || n.includes('gate') || n.includes('guard') || n.includes('garak') || n.includes('promptfoo') || n.includes('inspect') || d.includes('ai security') || d.includes('adversarial ai') || d.includes('mlsecops')) {
    return CATEGORIES.AI_SEC;
  }

  // 🔥 Gen AI
  if (n.includes('ctf') || n.includes('prompt') || n.includes('llm') || n.includes('dspy') || n.includes('agent') || n.includes('gpt') || n.includes('gemini') || n.includes('claude') || d.includes('large language model') || d.includes('generative ai') || d.includes('rag') || n.includes('helpful-github-scripts')) {
    return CATEGORIES.GEN_AI;
  }

  // 🤝 Open Source Contributions
  if (isFork || n.includes('hacktoberfest') || n.includes('contribute') || n.includes('contrib') || n.includes('fork') || n.includes('tableit') || d.includes('contribution') || d.includes('fork')) {
    return CATEGORIES.OSS;
  }

  // ⚙️ Traditional ML
  if (n.includes('ml-101') || n.includes('mlops') || n.includes('stock') || n.includes('predictor') || n.includes('sentiment') || n.includes('schmaltz') || n.includes('surveyor') || n.includes('classifier') || n.includes('predict') || n.includes('recommend') || d.includes('machine learning') || d.includes('regression') || d.includes('classification') || n.includes('mood-tracker')) {
    return CATEGORIES.TRAD_ML;
  }

  // 🎓 College Projects (2023 & Before - Non-ML)
  return CATEGORIES.COLLEGE;
}

// Custom descriptions for manual showcase projects
const MANUAL_PROJECTS = [
  {
    title: '🧠 Synaptic Wetware',
    category: CATEGORIES.BIO_COMP,
    status: 'Done',
    body: '**Organoid Intelligence (OI) Biocomputer Simulator**\n\nA state-of-the-art interactive web dashboard simulating an organoid biocomputer lab, running living human brain cells on silicon chips. Grounded in Nature & Frontiers publications.\n\n* **Key Features**:\n  * Real-time Hodgkin-Huxley & Izhikevich neuron physics\n  * MaxInterval burst detection on 64-channel MEA grids with oscilloscope traces\n  * DishBrain Pong training playground & Baltimore Declaration ethics monitor (IIT-Φ proxy)\n* **Tech Stack**: React 18, TypeScript, Vite 6\n\n🔗 **GitHub**: https://github.com/ppradyoth/synaptic-wetware\n🔗 **Demo**: https://synaptic-wetware.vercel.app'
  },
  {
    title: '🛡️ Model Vulnerability Scoring System',
    category: CATEGORIES.STEALTH,
    status: 'Done',
    body: '**CVSS-aligned Embedding-based Model Scorer (AI-VSS)**\n\nStandardized scoring system for AI model vulnerabilities (AI-VSS) using embedding-based similarity to JPMC\'s AI Attack Library. Created for JPMorganChase Innovation Week.\n\n* **Tech Stack**: Python, Embedding Models, CVSS, AI Attack Library'
  },
  {
    title: '🛡️ AEGIS',
    category: CATEGORIES.STEALTH,
    status: 'Done',
    body: '**Blockchain-anchored State Recovery with AI Anomaly Monitors**\n\nAEGIS anchors JPMC system state to Hyperledger Fabric\'s immutable ledger and layers an AI monitor to detect anomalies and trigger pre-emptive recovery. Presented at DEVUP 2026.\n\n* **Tech Stack**: Hyperledger Fabric, Solidity, Python, AI'
  },
  {
    title: '🤝 Open-Source Ecosystem Contributions',
    category: CATEGORIES.OSS,
    status: 'Done',
    body: '**AI Security & LLM Open Source Ecosystem Contributions**\n\nActive contributor and maintainer of state-of-the-art open-source AI safety, red-teaming, and model evaluations frameworks.\n\n* **Key Contributions**:\n  * **garak** — The LLM vulnerability scanner\n  * **promptfoo** — Red-teaming, pentesting, and evaluation for LLMs/RAGs\n  * **DSPy** — Programming framework for language models\n  * **NeMo Guardrails** — NVIDIA\'s programmable guardrails for LLMs\n  * **inspect_evals** — Collection of evals for Inspect AI (UK AISI)'
  }
];

async function main() {
  try {
    console.log('Fetching all existing Projects on profile...');
    const currentProjects = JSON.parse(execSync(`gh project list --owner ${OWNER} --format json`, { encoding: 'utf8' }));
    
    // Map category name -> { id, number }
    const boardsMap = {};
    const projectsArray = currentProjects.projects || [];
    projectsArray.forEach(p => {
      boardsMap[p.title] = { id: p.id, number: p.number };
    });

    // 1. Ensure all 7 Category Project Boards exist
    for (const catName of Object.values(CATEGORIES)) {
      if (!boardsMap[catName]) {
        console.log(`\nCreating dedicated project board: "${catName}"...`);
        const createRes = JSON.parse(execSync(`gh project create --owner ${OWNER} --title "${catName.replace(/"/g, '\\"')}" --format json`, { encoding: 'utf8' }));
        boardsMap[catName] = { id: createRes.id, number: createRes.number };
        console.log(`Created board ID: ${createRes.id} (Number: ${createRes.number})`);
      } else {
        console.log(`Board already exists: "${catName}" (Number: ${boardsMap[catName].number})`);
      }
    }

    // 2. Fetch all public repos
    console.log('\nFetching public repositories...');
    const reposData = JSON.parse(execSync(`gh repo list ${OWNER} --limit 100 --json name,description,isFork,url,isPrivate`, { encoding: 'utf8' }));
    const publicRepos = reposData.filter(r => !r.isPrivate && r.name !== OWNER);
    console.log(`Fetched ${publicRepos.length} public repositories.`);

    // 3. For each board, populate and classify
    for (const [catKey, catName] of Object.entries(CATEGORIES)) {
      console.log(`\n======================================================`);
      console.log(`Processing Project Board: "${catName}"`);
      console.log(`======================================================`);

      const board = boardsMap[catName];

      // Fetch the fields to get the Done / In Progress option IDs for this project
      const fieldsQuery = `
        query {
          node(id: "${board.id}") {
            ... on ProjectV2 {
              fields(first: 20) {
                nodes {
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    options {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const fieldsData = runGraphQL(fieldsQuery);
      const fields = fieldsData.data.node.fields.nodes;
      const statusField = fields.find(f => f.name === 'Status');
      const statusDoneId = statusField?.options.find(o => o.name === 'Done')?.id;
      const statusInProgressId = statusField?.options.find(o => o.name === 'In Progress')?.id;

      // Fetch currently existing items on this board to avoid duplicates
      const itemsQuery = `
        query {
          node(id: "${board.id}") {
            ... on ProjectV2 {
              items(first: 100) {
                nodes {
                  content {
                    ... on DraftIssue {
                      title
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const itemsData = runGraphQL(itemsQuery);
      const existingItems = itemsData.data.node.items.nodes;
      const existingTitles = new Set(existingItems.map(i => i.content?.title || ''));

      console.log(`Found ${existingTitles.size} existing items on this board.`);

      // A. Add target repositories belonging to this category
      const targetRepos = publicRepos.filter(r => classifyRepo(r.name, r.description, r.isFork) === catName);
      console.log(`Found ${targetRepos.length} repositories matching this category.`);

      for (const repo of targetRepos) {
        const title = `${repo.isFork ? '🤝' : '🛠️'} ${repo.name}`;
        if (existingTitles.has(title)) {
          console.log(`- Skipping: ${repo.name} (already present)`);
          continue;
        }

        console.log(`- Adding: ${repo.name}...`);
        const body = `**${repo.description || 'No description provided.'}**\n\n🔗 **GitHub**: ${repo.url}`;
        
        // Create draft item on this specific board
        const createRes = JSON.parse(execSync(`gh project item-create ${board.number} --owner ${OWNER} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --format json`, { encoding: 'utf8' }));
        const itemId = createRes.id;

        // Set status to Done (or In Progress for active/stealth PoCs)
        const isEnforce = repo.name.includes('akrivon-ai');
        const targetStatusId = isEnforce ? statusInProgressId : statusDoneId;
        if (targetStatusId && statusField) {
          execSync(`gh project item-edit --id "${itemId}" --field-id "${statusField.id}" --project-id "${board.id}" --single-select-option-id "${targetStatusId}"`);
        }
      }

      // B. Add manual/stealth showcase projects if they match this category
      const targetManual = MANUAL_PROJECTS.filter(p => p.category === catName);
      for (const proj of targetManual) {
        if (existingTitles.has(proj.title)) {
          console.log(`- Skipping manual project: ${proj.title} (already present)`);
          continue;
        }

        console.log(`- Adding manual project: ${proj.title}...`);
        const createRes = JSON.parse(execSync(`gh project item-create ${board.number} --owner ${OWNER} --title "${proj.title.replace(/"/g, '\\"')}" --body "${proj.body.replace(/"/g, '\\"')}" --format json`, { encoding: 'utf8' }));
        const itemId = createRes.id;

        const targetStatusId = proj.status === 'In Progress' ? statusInProgressId : statusDoneId;
        if (targetStatusId && statusField) {
          execSync(`gh project item-edit --id "${itemId}" --field-id "${statusField.id}" --project-id "${board.id}" --single-select-option-id "${targetStatusId}"`);
        }
      }
    }

    console.log('\nAll 7 boards successfully synchronized, populated, and organized!');

  } catch (error) {
    console.error('Error during separate board classification:', error.message);
    process.exit(1);
  }
}

main();
