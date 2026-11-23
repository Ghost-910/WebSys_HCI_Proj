# EduMaxxing: The Streamlined Anti-Cram Engine

A client-first, AI-powered study workspace built for university students. It transforms static lecture materials—including PDFs,
Word documents, plain text, and lecture photos—into structured HTML reciewers, (need to edit pa:`auto-graded 5-item active recall quizzes`), and curated YouTube 
video tutorials in one split-grid dashboard.

>Built as a ***Web Systems and Technologies*** & ***Human-Computer Interaction (HCI)*** Final Project.
---
## Key Features 

-**Real Authentication (Firebase Authentication):** Responsive split-screen onboarding with Email/Password registration, Sign In, and Google
Sign-In powered by Firebase Authentication. <br> <br>
-**Client-Side File Parsing:** Drag and drop `.pdf`, `.docx`, `.txt`, or image files directly into the workspace. Libraries like `.pds.js`, and 
`mammoth.js` exact raw text locally in the browser without uploading raw files to an external server. <br><br>
-**Hybrid AI Generation (Ollama + Gemini Failover):** Prioritizes a local Ollama microservice for zero-cost, privacy-first inference, with
an automatic failover to the Google Gemini API when local Ollama is unavailable. <br><br>
-**Self-Learning Generation Timer:** Tracks and averages previous generation durations to display a dynamic, hardware-aware estimated wait time
during AI processing. <br><br>
-**Multi-Modal Review Workspace:** Uses an iOS-styled segmented tab control alongside a persistent source preview to switch cleanly between: <br>
  - **Reviewers:** Structured, scannable HTML summaries. <br>
  - **Practice Quizzes:** <br>
  - **Curated Video Lectures:** Topic-matched YouTube video cards fetched via the YouTube Data API. <br>
  <br>
  
-**Offline-Resilient Subject Repository:** Save study sessions into categorized subject folders stored in `localStorage`, complete with hierarchical
breadcrumb navigation, delete-confirmation safeguards, and **Standalone Quiz Mode** for offline active recall. <br><br>
-**Student Profile & Study Metrics:** Dynamically tracks quantifiable study progress (such as *Total Files Uploaded* and *Quizzes Completed*)
alongside editable student details. <br><br>

---

## System Architecture
**Logical View (3-Layer Architecture):** <br>
 - **Presentation Layer:** HTML5, Tailwind CSS, custom styling (`style.css`, `scrollbar.css`), and responsive glassmorphism UI components. <br>
 - **Application Layer:** Client-side document parsers (`pdf.js`, `mammoth.js`), AI routing (`ollama.js`), quiz grading (`quiz-flow.js`), 
   navigation (`breadcrumbs.js`), and auth orchestration (`auth.js`). <br>
 - **Data Layer:** Browser `localStorage` for offline-accessible study sessions and user metrics, paired with Firebase Authentication for identity 
   verification. <br>
   <br>
   
**Physical Deployment (2-Tier "Thick Client" / Serverless BaaS):** <br>
 - **Tier 1 (Browser Client):** Executed UI rendering, file parsing, quiz grading, and local persistence. <br>
 - **Tier 2 (External Microservices & BaaS):** Firebase Auth (identity), Ollama/Gemini API (AI synthesis), and YouTube Data API v3 (curated lectures).

---

## Project Structure
```text

```

---

## Getting Started
```text


```

### Prerequisities
```text


```

---

## Human-Computer Interaction & Usability Highlights <br>

*EduMaxxing was designed around Jakob Nielsien's Usability Heuristics to reduce cognitive load during exam propagation:*
- **Visibility of System Status:** Live progress indicators, dynamic estimated wait timers, and instant quiz grading feedback. <br>
- **Recognition Rather Than Recall:** Persistent split-grid previews, categorized subject folder cards, and breadcrumb trails. <br>
- **Error Prevention:** Explicit confirmation prompts before deleting saved study sessions. <br>
- **Aesthetic & Minimalist Design:** Clean typography, high-contrast study surfaces, and clutter-free glassmorphism cards.

---

## Future Roadmap 
- Migrate from `localStorage` to a full **3-Tier Cloud Architecture**
- Move API key management and JWT verification to the backend while retaining **client-side file parsing** to minimize server storage and protect raw documents.
- Retain an opt-in **"Local Mode"** toggle so privacy-focused students can continue routing AI requests to their own Ollama instance.

---

## Meet the Developers

| Name         | Role              |
|------        |------             |
|Vhenise Bulaon| Backend Developer |
|Iah Velasco   |Frontend Developer |

 *Batangas State University - Alangilan*  
