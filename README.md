<div align="center">

# EduMaxxing: The Streamlined Anti-Cram Engine

**A client-first, AI-powered study workspace that turns raw lecture files into structured reviewers, customizable active-recall quizzes, and curated video lectures.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2563eb?style=flat-square)](https://ghost-910.github.io/WebSys_HCI_Proj/)
[![Architecture](https://img.shields.io/badge/Architecture-2--Tier_Thick_Client_%2F_BaaS-blue?style=flat-square)](#system-architecture)
[![AI Engine](https://img.shields.io/badge/AI_Engine-Ollama_%2B_Gemini_Failover-8b5cf6?style=flat-square)](#hybrid-ai-generation-ollama--gemini-failover)
[![Auth](https://img.shields.io/badge/Auth-Firebase_Authentication-f59e0b?style=flat-square)](#key-features)
[![Course](https://img.shields.io/badge/BSU_Alangilan-Web_Systems_%26_HCI_Final_Project-10b981?style=flat-square)](#meet-the-developers)

🔗 **Try it live:** https://ghost-910.github.io/WebSys_HCI_Proj/

</div>

---

## Overview

**EduMaxxing** eliminates the friction of last-minute exam review by uniting passive note-reading with active recall inside a single split-grid dashboard. Students drop in lecture PDFs, Word documents, plain text notes, or whiteboard/notebook photos, and the application extracts content locally in the browser—synthesizing structured HTML study guides, auto-graded multiple-choice quizzes, and topic-matched YouTube video lectures without uploading raw documents to a custom backend server.

> **Academic Context:** Developed as the joint Final Project for **Web Systems and Technologies** and **Human-Computer Interaction (HCI)** at **Batangas State University – Alangilan Campus**.

---

## Key Features

### Authentication & Personalization
- **Firebase Authentication:** Responsive split-screen onboarding supporting Email/Password registration, Sign-In, and one-click Google Sign-In (`auth.js`), complete with per-user `localStorage` data isolation.
- **Student Profile & Study Analytics:** Tracks quantifiable learning progress—such as *Total Files Uploaded* and *Quizzes Completed*—alongside editable student details and dark/light theme persistence.

### Privacy-First Client-Side Parsing
- **Zero-Server Document Extraction:** Drag and drop `.pdf`, `.docx`, `.txt`, `.md`, or image files directly into the workspace. Client-side libraries (`pdf.js` and `mammoth.js`) extract text and compress images in-browser before AI inference.
- **Input Validation Guards:** Enforces a `10 MB` file size ceiling and strict MIME/extension checks with clear toast notifications before modifying active workspace state.

### Hybrid AI Generation (Ollama + Gemini Failover)
- **Local-First Inference (`ollama.js`):** Prioritizes a local Ollama microservice (`gemma4`, sequential queue `MAX_PARALLEL = 1`) for zero-cost, offline-capable, privacy-preserving synthesis.
- **Automatic Cloud Failover Chain:** Seamlessly reroutes to a 4-model Gemini chain (`gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.8-flash` → `gemini-3.6-flash`) when local Ollama is unreachable, with SSE streaming, trailing-buffer flushing, and automatic retry on `RECITATION` stops or rate limits.
- **Self-Learning Wait Timer:** Records historical generation durations in `localStorage` to compute dynamic, hardware-aware estimated completion times alongside staged progress bars.

### Multi-Modal Review Workspace
Uses an iOS-inspired segmented control paired with a persistent source preview card to switch effortlessly between three study modes:
1. **Structured Reviewers:** Clean, scannable HTML study guides with one-click **Copy** and **Print / Save as PDF** export utilities.
2. **Customizable Practice Quizzes (`5 / 10 / 15` Questions):** Auto-graded active-recall assessments featuring live progress tracking, answer-count submit guards, detailed explanations, **Retake**, isolated Dashboard quiz state, and **New Quiz** generation that tracks previously asked and missed concepts.
3. **Curated Video Lectures:** Topic-extracted YouTube tutorials fetched dynamically via the YouTube Data API v3 with resilient JSON response normalization and Piped/search fallbacks.

### Multi-Quiz Saved Sessions & Offline Subject Repository
- **One Session, Multiple Quizzes (`quizzes[]`):** Keep multiple practice quizzes grouped under a single saved study session instead of duplicating the reviewer. When saving a newly generated quiz, `save-modal.js` lets you choose between **Add to existing session** (with an existing-session picker and custom quiz name) or **Save as new session**.
- **Interactive Quiz Switcher & Independent Records:** Open any saved session to switch between quizzes via pill tabs showing each quiz's best score, expand or collapse attempt histories per quiz, and rename or delete individual quizzes without affecting the reviewer or sibling quizzes.
- **Backward-Compatible Storage:** Automatic `normalizeMaterial()` migration converts legacy single-quiz saves into the `quizzes[]` format on the fly so existing user data never breaks.
- **Categorized Subject Folders & Data Portability:** Organize saved sessions into custom subjects stored locally in `localStorage`, complete with live search filtering, hierarchical breadcrumbs (`breadcrumbs.js`), **Standalone Quiz Mode** for offline practice, and full `.json` backup/restore.

---

## System Architecture

### Logical View (3-Layer Architecture)

| Layer | Modules & Technologies | Responsibilities |
| :--- | :--- | :--- |
| **Presentation Layer** | `index.html`, Tailwind CSS, `style.css`, `scrollbars.css`, `branding.js`, `Photos/` | Split-grid dashboard, brand visuals, glassmorphism cards, dark/light themes, modals, and floating navigation. |
| **Application Layer** | `script.js`, `ollama.js`, `auth.js`, `quiz-flow.js`, `save-modal.js`, `breadcrumbs.js`, `ui-enhancements.js` | Client-side file parsing (`pdf.js`, `mammoth.js`), AI failover routing, multi-quiz session management, quiz grading, save/navigation flows, and UI polish. |
| **Data Layer** | Browser `localStorage` & Firebase Authentication | Per-user offline persistence for subjects, reviewers, multi-quiz sessions (`quizzes[]`), and metrics; cloud identity verification via Firebase. |

### Physical Deployment (2-Tier "Thick Client" / Serverless BaaS)
- **Tier 1 — Browser Client (GitHub Pages):** Hosted statically via GitHub Actions CI/CD (`.github/workflows/static.yml`), executing UI rendering, document parsing, image compression, quiz scoring, and local persistence directly on the user's device.
- **Tier 2 — External Microservices & BaaS:** Connects to **Firebase Auth** (identity), **Local Ollama / Google Gemini API** (AI synthesis), and **YouTube Data API v3** (curated video search).

## Project Structure

```text
WebSys_HCI_Proj/
├── .github/workflows/
│   └── static.yml              # GitHub Actions workflow (injects CONFIG_JS secret & deploys to Pages)
├── README.md                   # Project documentation (rendered on GitHub home)
└── WEBSYS_HCI_FINALPROJ/
    ├── index.html              # Main SPA layout, modals, segmented workspace, and navigation
    ├── style.css               # Custom glassmorphism styles, dark mode tokens, and animations
    ├── scrollbars.css          # Custom cross-browser scrollbar styling
    ├── script.js               # Core state management, file parsing, reviewer/quiz/video logic, multi-quiz normalization
    ├── ollama.js               # Local Ollama client with automatic Google Gemini API failover
    ├── auth.js                 # Firebase Authentication (Email/Password & Google Sign-In)
    ├── branding.js             # Brand logo and visual identity helpers
    ├── quiz-flow.js            # Saved reviewer reader, multi-quiz pill switcher, attempt records, per-quiz rename/delete
    ├── save-modal.js           # Save modal with subject chips and Add-to-Existing vs. New Session toggle
    ├── breadcrumbs.js          # Hierarchical breadcrumb navigation for Subjects and Quizzes
    ├── ui-enhancements.js      # Progress bars, quiz controls, modals/shortcuts, and UX polish
    ├── Photos/                 # Brand logo and visual/image assets
    ├── config.example.js       # Template configuration file for API keys and Firebase settings
    └── .gitignore              # Ignored files and local configuration rules (excludes config.js)
```

---

## Getting Started

### Prerequisites
- **Modern Web Browser:** Google Chrome, Microsoft Edge, or Safari (with JavaScript enabled).
- **Local Static Server:** VS Code **Live Server** extension (recommended on port `5500`) or Python `http.server`.
- **API & Auth Credentials:** A Firebase project (with Email/Password and Google providers enabled), a Google Gemini API key, and a YouTube Data API v3 key.
- **Optional (For Local AI):** [Ollama](https://ollama.com/) installed locally with a vision/text model pulled (e.g., `ollama pull gemma4:e4b-it-qat`).

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone [https://github.com/Ghost-910/WebSys_HCI_Proj.git](https://github.com/Ghost-910/WebSys_HCI_Proj.git)
   cd WebSys_HCI_Proj/WEBSYS_HCI_FINALPROJ
   ```

2. **Configure environment credentials**
   Duplicate `config.example.js` as `config.js` inside `WEBSYS_HCI_FINALPROJ/` and populate your keys:
   ```bash
   cp config.example.js config.js
   ```
   > **Security Note:** `config.js` is listed in `.gitignore` and excluded from Git history so API keys are never committed to version control.

3. **Enable CORS for Local Ollama (Optional — Local AI Mode)**
   If running Ollama locally alongside Live Server (`http://localhost:5500`), allow browser origins before launching Ollama:
   ```bash
   # macOS
   launchctl setenv OLLAMA_ORIGINS "*"
   ```
   *(Restart the Ollama app after running this command so the environment variable takes effect.)*

4. **Launch the application**
   Open the folder in VS Code, right-click `index.html`, and select **Open with Live Server** (or visit `http://localhost:5500/WEBSYS_HCI_FINALPROJ/index.html`).

### Live Deployment & API Security
- **GitHub Actions CI/CD:** Pushing to `main` triggers `.github/workflows/static.yml`, which dynamically injects `config.js` from the `CONFIG_JS` repository secret before publishing to GitHub Pages.
- **Google Cloud Key Restrictions:** API keys are hardened with **HTTP referrer restrictions** (`https://ghost-910.github.io/*` and local development ports) and **API-level restrictions** isolating Gemini API and YouTube Data API v3 to their respective keys, while Firebase Authentication restricts authorized domains to `ghost-910.github.io`.

---

## Human-Computer Interaction & Usability Highlights

EduMaxxing was engineered around **Jakob Nielsen's 10 Usability Heuristics** to minimize cognitive load during high-stress study sessions:

| Heuristic | Implementation in EduMaxxing |
| :--- | :--- |
| **Visibility of System Status** | Staged progress bars, self-learning countdown timers, live quiz answer counters (`X / N answered`), per-quiz score badges, and instant toast feedback. |
| **User Control & Freedom** | Global `Esc` key dismissal for all modals and drawers, **Upload New** cancellation mid-generation, choosing between appending to an existing session or creating a new one, quiz retakes, and full JSON export/restore. |
| **Error Prevention** | Pre-upload checks for `10 MB` file limits and supported MIME types, disabled submit buttons until all questions are answered, and destructive-action confirmation dialogs. |
| **Recognition Rather Than Recall** | Split-pane layout keeping the source document visible beside generated notes, categorized subject cards, quiz switcher pills, and clickable breadcrumb trails. |
| **Aesthetic & Minimalist Design** | High-contrast dark/light study surfaces, clean typography, and focused segmented tabs that prevent visual clutter. |

---

## Defense Q&A & Architectural Rationale

### Why use a 2-Tier "Thick Client" / Serverless BaaS architecture instead of building a custom backend server?
- **Zero Hosting & Maintenance Overhead:** For a student study tool, offloading authentication to Firebase Auth and AI/video calls to external APIs/local Ollama eliminates server provisioning and backend downtime while keeping the frontend fast and responsive.
- **Client-Side Privacy & Speed:** Parsing `.pdf` and `.docx` files and compressing images directly in the browser avoids sending raw lecture files through an intermediate backend server.

### Why pair local Ollama with Google Gemini failover instead of relying on only one?
- **Resilience & Cost Efficiency:** Local Ollama keeps inference free and private on the student's machine, while automatic failover to Gemini ensures study generation still works on the live GitHub Pages deployment or whenever local hardware is busy or Ollama isn't running.

### Why store study sessions and analytics in `localStorage` with JSON backup/restore instead of a cloud database right away?
- **Instant Offline Access & User Ownership:** `localStorage` makes reading saved reviewers, switching between saved quizzes, taking standalone quizzes, and viewing progress instant even with spotty campus Wi-Fi, while `.json` export/restore gives students portable backups without locking data inside a proprietary database.

### How does the system prevent bad inputs, accidental data loss, or duplicate sessions?
- **Input & State Guards:** `handleFileSelect()` rejects unsupported types and files over `10 MB` before mutating state, while **Upload New** cancels active loading states before clearing the workspace.
- **Multi-Quiz Append & Normalization:** `save-modal.js` detects when a new quiz is generated for an already-saved session and offers to append it to `quizzes[]` instead of duplicating the reviewer, while `normalizeMaterial()` seamlessly migrates older single-quiz saves.

---

## MVP & Project Iteration

- **Core MVP:** Started as a working client-side study workspace focused on uploading lecture materials, generating structured study reviewers and practice quizzes, and viewing curated study videos.
- **Iterative Improvements:** Expanded with Firebase authentication, customizable quiz controls, multi-quiz saved sessions (`quizzes[]`) with append-vs-new prompts and quiz switcher pills, edit/delete actions on saved items, subject organization and breadcrumbs, UI/branding polish (`branding.js` and visual assets), hybrid AI generation (Ollama with Gemini failover), and automated GitHub Pages deployment with restricted API keys.
- **Current Demo Scope:** Live on GitHub Pages (`https://ghost-910.github.io/WebSys_HCI_Proj/`) and self-contained on the client side (`localStorage` + external auth/AI/video APIs) for fast, predictable live demonstrations, while deferring full multi-device cloud database synchronization to the future roadmap.

---

## Future Roadmap

- **Full 3-Tier Cloud Migration:** Transition from browser `localStorage` to a dedicated backend database and API layer (e.g., PostgreSQL / Firebase Firestore) to enable multi-device synchronization across laptops, tablets, and phones.
- **Server-Side Key & Token Proxy:** Move external API key management and JWT session verification to a secure backend proxy while retaining **client-side file parsing** to minimize server storage and protect raw documents.
- **Explicit Local-Only Privacy Toggle:** Expose a user-facing **"Local Mode"** switch in Profile settings so privacy-conscious students can lock inference strictly to their local Ollama instance and prevent external cloud fallback when desired.
- **Richer Mobile & Accessibility Polish:** Further refine small-screen spacing, touch targets, and keyboard navigation for mobile study sessions.

---

## Meet the Developers

| Name | Role | Focus Areas |
| :--- | :--- | :--- |
| **Vhenise Bulaon** | Backend & Systems Developer | AI routing (`ollama.js` / Gemini failover), Firebase Auth, client-side parsers, storage & state architecture, CI/CD & API security |
| **Iah Velasco** | Frontend & UI/UX Developer | Responsive split-grid layout, glassmorphism styling, dark/light theming, HCI interaction design |

<p align="center">
  <em>Batangas State University – The National Engineering University (Alangilan Campus)</em>
</p>
