#!/bin/bash
set -e

# Project ID and number
PROJECT_ID="PVT_kwHOA-gUlc4BYlCC"
PROJECT_NUM="1"
OWNER="ppradyoth"

# Field IDs
CAT_FIELD_ID="PVTSSF_lAHOA-gUlc4BYlCCzhTp6hY" # Category V2
STATUS_FIELD_ID="PVTSSF_lAHOA-gUlc4BYlCCzhTp5B4"

# Category Option IDs for Category V2
CAT_AI_SEC="b76e3946"   # 🛡️ AI Security
CAT_GEN_AI="fe9a45a3"   # 🔥 Gen AI
CAT_TRAD_ML="e7877594"  # ⚙️ Traditional ML
CAT_BIO_COMP="2b5d615f" # 🧠 Biocomputing
CAT_OSS="8d7c8294"      # 🤝 Open Source Contributions
CAT_COLLEGE="333210d5"  # 🎓 College Projects (2023 & Before - Non-ML)
CAT_STEALTH="4d2c8df4"  # 🔒 Enterprise Innovation (Stealth)

# Status Option IDs
STATUS_IN_PROGRESS="47fc9ee4"
STATUS_DONE="98236657"

# Clean up already created items to prevent duplication
echo "Cleaning up any existing items to ensure a clean slate..."
items=$(gh project item-list "$PROJECT_NUM" --owner "$OWNER" --format json | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(0, 'utf-8'));
  if (data.items) {
    console.log(data.items.map(i => i.id).join(' '));
  }
")

for id in $items; do
  echo "Deleting item $id..."
  gh project item-delete "$PROJECT_NUM" --owner "$OWNER" --id "$id"
done
echo "Clean slate achieved!"
echo "-----------------------------------"

create_and_edit_item() {
  local title="$1"
  local body="$2"
  local cat_option_id="$3"
  local status_option_id="$4"

  echo "Creating item: $title..."
  
  # Create draft item
  res=$(gh project item-create "$PROJECT_NUM" --owner "$OWNER" --title "$title" --body "$body" --format json)
  item_id=$(echo "$res" | node -e "const fs = require('fs'); console.log(JSON.parse(fs.readFileSync(0, 'utf-8')).id);")
  
  echo "Created item ID: $item_id"
  
  # Edit Category V2
  echo "Categorizing item..."
  gh project item-edit --id "$item_id" --field-id "$CAT_FIELD_ID" --project-id "$PROJECT_ID" --single-select-option-id "$cat_option_id"
  
  # Edit Status
  echo "Setting status..."
  gh project item-edit --id "$item_id" --field-id "$STATUS_FIELD_ID" --project-id "$PROJECT_ID" --single-select-option-id "$status_option_id"
  
  echo "Item successfully completed!"
  echo "-----------------------------------"
}

# ==============================================================================
# Category 1: 🛡️ AI Security
# ==============================================================================

BODY_AKRIVON='**AI Boundary Testing & Runtime Scope Enforcement Proxy Gateway**

An enterprise-grade safety proxy and automated red-teaming tool designed to keep deployed LLM applications safe, secure, and strictly aligned within their defined scopes.

* **Key Features**:
  * **IntentScan**: Automated red-teaming simulating Role Transformation, Gradual Drift, and Language Variation attacks
  * **IntentEnforce**: Low-latency runtime reverse proxy utilizing LLM classification allow/block policies
* **Tech Stack**: Python 3.11, FastAPI, Google Gemini Pro API, React + Vite + TS, Firebase Cloud Functions & Hosting

🔗 **GitHub**: https://github.com/ppradyoth/akrivon-ai'

create_and_edit_item "🛡️ Akrivon AI" "$BODY_AKRIVON" "$CAT_AI_SEC" "$STATUS_IN_PROGRESS"


BODY_SAFETY='**Absolute LLM Safety Robustness Evaluation Suite**

An advanced LLM safety benchmark that evaluates absolute, severity-weighted category failure rates instead of shifting, relative statistics (Z-scores).

* **Key Features**:
  * Built on top of the UK AISI\''s open-source **inspect_ai** framework
  * Risk-adjusted severity weighting: prompt injection (0.3), jailbreaks (0.3), data exfiltration (0.2), toxicity (0.1), malware (0.1)
  * Custom async model-graded evaluator utilizing safety-auditing rubrics
* **Tech Stack**: Python, Inspect AI, Async Model Grader

🔗 **GitHub**: https://github.com/ppradyoth/weighted-safety-refusal'

create_and_edit_item "📊 Weighted Safety Refusal" "$BODY_SAFETY" "$CAT_AI_SEC" "$STATUS_DONE"


BODY_RESOURCES='**Curated Directory of State-of-the-Art Adversarial AI Security Tools**

Curated directory of state-of-the-art Adversarial AI Security tools, vulnerability scanners, safety benchmarks, guardrails, and compliance standards.

🔗 **GitHub**: https://github.com/ppradyoth/ai-security-resources'

create_and_edit_item "🛡️ ai-security-resources" "$BODY_RESOURCES" "$CAT_AI_SEC" "$STATUS_DONE"


BODY_SKILL='**Custom Claude Code Skill for AI/ML Security Research**

An advanced, purpose-built model capability extension designed for automated AI/ML vulnerability hunting and security bug bounty assessments.

* **Key Features**:
  * Fine-tuned prompt chains and command routines targeting model security weaknesses
  * Automated reconnaissance rulesets for probing exposed LLM endpoints
* **Tech Stack**: Javascript, Node.js, Claude Code SDK'

create_and_edit_item "🧠 ai-red-teamer-skill" "$BODY_SKILL" "$CAT_AI_SEC" "$STATUS_DONE"

# ==============================================================================
# Category 2: 🔥 Gen AI
# ==============================================================================

BODY_CTF='**Interactive AI Hacking Capture-The-Flag Playground**

A gamified Capture The Flag platform designed to teach hands-on adversarial thinking. Mapped directly to real-world risk frameworks (OWASP LLM Top 10 & MITRE ATLAS).

* **Key Features**:
  * **5 Progressive Levels**: Covers basic injection, jailbreaks, intent drift, token smuggling, and multi-vector bypasses
  * **Zero-API-cost heuristics engine**: Checks success conditions instantly without API latency or expense
* **Tech Stack**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui

🔗 **GitHub**: https://github.com/ppradyoth/prompt-injection-ctf'

create_and_edit_item "🎮 Prompt Injection CTF" "$BODY_CTF" "$CAT_GEN_AI" "$STATUS_DONE"


BODY_MLOPS='**End-to-End MLOps Model Lifecycle & Monitoring Pipeline**

An end-to-end MLOps workflow demonstrating model lifecycle, monitoring, and deployment practices.

🔗 **GitHub**: https://github.com/ppradyoth/llm-ops-workshop'

create_and_edit_item "⚙️ llm-ops-workshop" "$BODY_MLOPS" "$CAT_GEN_AI" "$STATUS_DONE"

# ==============================================================================
# Category 3: ⚙️ Traditional ML
# ==============================================================================

BODY_WORKSHOP='**Machine Learning Workshop for Early-Career Engineers**

Source code and materials from the ML-101 workshop hosted by IEEE Bangalore Section at IEEE CCONNECT. Built to make machine learning accessible to early-career engineers.

🔗 **GitHub**: https://github.com/ppradyoth/ML-101-Workshop'

create_and_edit_item "⚙️ ML-101-Workshop" "$BODY_WORKSHOP" "$CAT_TRAD_ML" "$STATUS_DONE"


BODY_STOCK='**Hybrid Financial Time-Series Forecasting System**

A hybrid forecasting system that fuses an LSTM time-series model, live market sentiment scraped from news/social feeds, and fundamental intrinsic value calculations. 

* **Recognition**: Top 5 Project at Nokia Bangalore University Conclave 2022.
* **Tech Stack**: Python, LSTM, NLP Sentiment Analysis

🔗 **GitHub**: https://github.com/ppradyoth/stock-predictor'

create_and_edit_item "📈 stock-predictor" "$BODY_STOCK" "$CAT_TRAD_ML" "$STATUS_DONE"


BODY_SCHMALTZ='**Multi-Classifier Tweet Sentiment Analysis Benchmarking**

A rigorous four-way classifier benchmark on live tweet sentiment (SVM, Random Forest, Logistic Regression, kNN) with GCP Natural Language API integration.

* **Awards**: Best Project Award by Computer Society India 2022.
* **Tech Stack**: Python, scikit-learn, Google Cloud NLP, Flask

🔗 **GitHub**: https://github.com/ppradyoth/schmaltz-surveyor'

create_and_edit_item "📊 schmaltz-surveyor" "$BODY_SCHMALTZ" "$CAT_TRAD_ML" "$STATUS_DONE"


BODY_MINDFUL='**Mindful-Me (Mood-Tracker) Mental Health Platform**

A full-stack mental health diagnostics and therapy matchmaking application, using multiple signal models to track emotional state in real time.

* **Key Features**:
  * Real-time emotional state diagnostics via two-channel evaluation (OpenCV facial expression recognition + BERT text sentiment)
  * Intelligent, proximity-based therapist matchmaking utilizing Appwrite location indexing
* **Tech Stack**: Vue.js, Flask (Python), OpenCV, TensorFlow, BERT, Appwrite'

create_and_edit_item "💚 Mindful-Me (Mood-Tracker)" "$BODY_MINDFUL" "$CAT_TRAD_ML" "$STATUS_DONE"

# ==============================================================================
# Category 4: 🧠 Biocomputing
# ==============================================================================

BODY_WETWARE='**Organoid Intelligence (OI) Biocomputer Simulator**

A state-of-the-art interactive web dashboard simulating an organoid biocomputer lab, running living human brain cells on silicon chips. Grounded in Nature & Frontiers publications.

* **Key Features**:
  * Real-time Hodgkin-Huxley & Izhikevich neuron physics (Euler integration)
  * MaxInterval burst detection on 64-channel MEA grids with rolling oscilloscope traces
  * DishBrain Pong training playground & Baltimore Declaration ethics monitor (IIT-Φ proxy)
* **Tech Stack**: React 18, TypeScript, Vite 6, Vanilla CSS (glassmorphism)

🔗 **GitHub**: https://github.com/ppradyoth/synaptic-wetware
🔗 **Demo**: https://synaptic-wetware.vercel.app'

create_and_edit_item "🧠 Synaptic Wetware" "$BODY_WETWARE" "$CAT_BIO_COMP" "$STATUS_DONE"

# ==============================================================================
# Category 5: 🤝 Open Source Contributions
# ==============================================================================

BODY_CONTRIBS='**AI Security & LLM Open Source Ecosystem Contributions**

Active contributor and maintainer of state-of-the-art open-source AI safety, red-teaming, and model evaluations frameworks.

* **Key Contributions**:
  * **garak** — The LLM vulnerability scanner (Firm-wide JPMC red-team engine)
  * **promptfoo** — Red-teaming, pentesting, and evaluation for LLMs/RAGs
  * **DSPy** — Programming framework for language models
  * **NeMo Guardrails** — NVIDIA\''s programmable guardrails for LLM interfaces
  * **inspect_evals** — Collection of evals for Inspect AI (UK AISI)'

create_and_edit_item "🤝 Open-Source Ecosystem Contributions" "$BODY_CONTRIBS" "$CAT_OSS" "$STATUS_DONE"

# ==============================================================================
# Category 6: 🎓 College Projects (2023 & Before - Non-ML)
# ==============================================================================

BODY_LENS='**Hyperlocal Campus Augmented Reality Community Lenses**

Source files for 80 custom lenses created during tenure as a Snapchat Opinion Leader at Under 25, collectively reaching over 6.5 million views.

🔗 **GitHub**: https://github.com/ppradyoth/Lens-Studio-Lenses'

create_and_edit_item "🌌 Lens-Studio-Lenses" "$BODY_LENS" "$CAT_COLLEGE" "$STATUS_DONE"


BODY_TICKETS='**CS Freshers Party Ticket Generator & Scanner**

A secure ticket generation and mobile scanning utility built for high-throughput entry management at CS Freshers Party 2021.

* **Tech Stack**: Python, QR Code Cryptographic Encodings, Flask Backend'

create_and_edit_item "🎫 ticket-generator-scanner" "$BODY_TICKETS" "$CAT_COLLEGE" "$STATUS_DONE"


BODY_WT='**Blood Bank Management System Web Application**

A core Web Technologies course project: Blood Bank Management System web application built with HTML, CSS, and JavaScript.

🔗 **GitHub**: https://github.com/ppradyoth/wtproject'

create_and_edit_item "💉 wtproject (Blood Bank)" "$BODY_WT" "$CAT_COLLEGE" "$STATUS_DONE"


BODY_DBMS='**psychmytrip — Database Management Systems (DBMS) Project**

A comprehensive tour and travel database application using structured SQL schemas for user bookings, destinations, and payments.

🔗 **GitHub**: https://github.com/ppradyoth/psychmytrip'

create_and_edit_item "✈️ psychmytrip (DBMS)" "$BODY_DBMS" "$CAT_COLLEGE" "$STATUS_DONE"


BODY_BOT='**Telegram Compliment Bot**

A lightweight Telegram bot that automatically sends friendly, randomized compliments to users who interact with it.

🔗 **GitHub**: https://github.com/ppradyoth/bende-bot'

create_and_edit_item "🤖 bende-bot" "$BODY_BOT" "$CAT_COLLEGE" "$STATUS_DONE"

# ==============================================================================
# Category 7: 🔒 Enterprise Innovation (Stealth)
# ==============================================================================

BODY_VSS='**CVSS-aligned Embedding-based Model Scorer (AI-VSS)**

Standardized scoring system for AI model vulnerabilities (AI-VSS) using embedding-based similarity to JPMC\''s AI Attack Library. Created for JPMorganChase Innovation Week.

* **Tech Stack**: Python, Embedding Models, CVSS, AI Attack Library'

create_and_edit_item "🛡️ Model Vulnerability Scoring System" "$BODY_VSS" "$CAT_STEALTH" "$STATUS_DONE"


BODY_AEGIS='**Blockchain-anchored State Recovery with AI Anomaly Monitors**

AEGIS anchors system state to Hyperledger Fabric\''s immutable ledger and layers an AI monitor to detect anomalies and trigger pre-emptive recovery. Presented at DEVUP 2026, JPMC\''s invite-only technical conference.

* **Tech Stack**: Hyperledger Fabric, Solidity, Python, AI'

create_and_edit_item "🛡️ AEGIS" "$BODY_AEGIS" "$CAT_STEALTH" "$STATUS_DONE"

echo "All project board items successfully created!"
