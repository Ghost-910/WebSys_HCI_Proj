<div align="center">

# EduMaxxing: The Streamlined Anti-Cram Engine

**A client-first, AI-powered study workspace that turns raw lecture files into structured reviewers, customizable active-recall quizzes, and curated video lectures.**

[![Architecture](https://img.shields.io/badge/Architecture-2--Tier_Thick_Client_%2F_BaaS-blue?style=flat-square)](#system-architecture)
[![AI Engine](https://img.shields.io/badge/AI_Engine-Ollama_%2B_Gemini_Failover-8b5cf6?style=flat-square)](#hybrid-ai-generation-ollama--gemini-failover)
[![Auth](https://img.shields.io/badge/Auth-Firebase_Authentication-f59e0b?style=flat-square)](#key-features)
[![Course](https://img.shields.io/badge/BSU_Alangilan-Web_Systems_%26_HCI_Final_Project-10b981?style=flat-square)](#meet-the-developers)

</div>

---

## Overview

**EduMaxxing** eliminates the friction of last-minute exam review by uniting passive note-reading with active recall inside a single split-grid dashboard. Students drop in lecture PDFs, Word documents, plain text notes, or whiteboard/notebook photos, and the application extracts content locally in the browser—synthesizing structured HTML study guides, auto-graded multiple-choice quizzes, and topic-matched YouTube video lectures without uploading raw documents to a custom backend server.

> **Academic Context:** Developed as the joint Final Project for **Web Systems and Technologies** and **Human-Computer Interaction (HCI)** at **Batangas State University – Alangilan Campus**.

---

## Key Features

### Authentication & Personalization
* **Firebase Authentication:** Responsive split-screen onboarding supporting Email/Password registration, Sign-In, and one-click Google Sign-In (`auth.js`), complete with per-user `localStorage` data isolation.
* **Student Profile & Study Analytics:** Tracks quantifiable learning progress—such as *Total Files Uploaded* and *Quizzes Completed*—alongside editable student details and dark/light theme persistence.

### Privacy-First Client-Side Parsing
* **Zero-Server Document Extraction:** Drag and drop `.pdf`, `.docx`, `.txt`, `.md`, or image files directly into the workspace. Client-side libraries (`pdf.js` and `mammoth.js`) extract text and compress images in-browser before AI inference.
* **Input Validation Guards:** Enforces a `10 MB` file size ceiling and strict MIME/extension checks with clear toast notifications before modifying active workspace state.

### Hybrid AI Generation (Ollama + Gemini Failover)
* **Local-First Inference (`ollama.js`):** Prioritizes a local Ollama microservice (`gemma4`) for zero-cost, offline-capable, privacy-preserving synthesis.
* **Automatic Cloud Failover:** Seamlessly reroutes requests to the Google Gemini API whenever the local Ollama service is unreachable or offline.
* **Self-Learning Wait Timer:** Records historical generation durations in `localStorage` to compute dynamic, hardware-aware estimated completion times alongside staged progress bars.

### Multi-Modal Review Workspace
Uses an iOS-inspired segmented control paired with a persistent source preview card to switch effortlessly between three study modes:
1. **Structured Reviewers:** Clean, scannable HTML study guides with one-click **Copy** and **Print / Save as PDF** export utilities.
2. **Customizable Practice Quizzes (`5 / 10 / 15` Questions):** Auto-graded active-recall assessments featuring live progress tracking, answer-count submit guards, detailed explanations, **Retake**, and **New Quiz** generation with anti-repeat question memory.
3. **Curated Video Lectures:** Topic-extracted YouTube tutorials fetched dynamically via the YouTube Data API v3 with resilient JSON response normalization.

### Offline-Resilient Subject Repository & Data Portability
* **Categorized Subject Folders:** Organize saved reviewers and quizzes into custom subjects stored locally in `localStorage`, complete with live search filtering, hierarchical breadcrumbs (`breadcrumbs.js`), and **Standalone Quiz Mode** for offline practice.
* **JSON Backup & Restore:** Export the entire workspace (subjects, reviewers, quiz history, and stats) as a portable `.json` archive and restore it across browsers at any time.

---

## System Architecture

### Logical View (3-Layer Architecture)

| Layer | Modules & Technologies | Responsibilities |
| :--- | :--- | :--- |
| **Presentation Layer** | `index.html`, Tailwind CSS, `style.css`, `scrollbar.css` | Split-grid dashboard, glassmorphism cards, dark/light themes, modals, and floating navigation. |
| **Application Layer** | `script.js`, `ollama.js`, `auth.js`, `quiz-flow.js`, `breadcrumbs.js`, `ux-enhancements.js` | Client-side file parsing (`pdf.js`, `mammoth.js`), AI failover routing, quiz grading, validation guards, and keyboard accessibility. |
| **Data Layer** | Browser `localStorage` & Firebase Authentication | Per-user offline persistence for subjects, reviewers, quizzes, and metrics; cloud identity verification via Firebase. |

### Physical Deployment (2-Tier "Thick Client" / Serverless BaaS)
* **Tier 1 — Browser Client:** Executes UI rendering, document parsing, image compression, quiz scoring, and local persistence directly on the user's device.
* **Tier 2 — External Microservices & BaaS:** Connects to **Firebase Auth** (identity), **Local Ollama / Google Gemini API** (AI synthesis), and **YouTube Data API v3** (curated video search).

---

## Project Structure

```text
WEBSYS_HCI_FINALPROJ/
├── index.html              # Main SPA layout, modals, segmented workspace, and navigation
├── style.css               # Custom glassmorphism styles, dark mode tokens, and animations
├── scrollbar.css           # Custom cross-browser scrollbar styling
├── script.js               # Core state management, file parsing, reviewer/quiz/video logic
├── ollama.js               # Local Ollama client with automatic Google Gemini API failover
├── auth.js                 # Firebase Authentication (Email/Password & Google Sign-In)
├── quiz-flow.js            # Quiz submission guards, scoring logic, and attempt persistence
├── breadcrumbs.js          # Hierarchical breadcrumb navigation for Subjects and Quizzes
├── ux-enhancements.js      # Progress bars, 5/10/15 quiz controls, backup/restore, Esc shortcuts
├── config.example.js       # Template configuration file for API keys and Firebase settings
├── config.js               # Local credentials (gitignored — do not commit)
└── README.md               # Project documentation
