// --- Configuration ---
// IMPORTANT: paste a NEW key here (the old one was exposed and must be revoked).
// Get one at https://aistudio.google.com/apikey
const API_KEY = ""; // API KEY HERE AI
// YouTube Data API v3 key (create one in Google Cloud Console and restrict it to "YouTube Data API v3").
const YT_API_KEY = ""; //API YT KEY HERE
const MODEL = "gemini-3.8-flash";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// --- State ---
let currentBase64Image = null;
let currentMimeType = null;
let generatedQuizData = null;
let userAnswers = {};
let uploadId = 0; // guards against stale responses

// --- DOM Elements ---
const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput');
const uploadArea = $('uploadArea');
const previewContainer = $('previewContainer');
const imagePreview = $('imagePreview');
const clearBtn = $('clearBtn');

const btnTabReviewer = $('btnTabReviewer');
const btnTabQuiz = $('btnTabQuiz');
const tabReviewerContent = $('tabReviewerContent');
const tabQuizContent = $('tabQuizContent');

const reviewerEmptyState = $('reviewerEmptyState');
const reviewerLoadingState = $('reviewerLoadingState');
const reviewerContainer = $('reviewerContainer');

const generateQuizBtn = $('generateQuizBtn');
const quizEmptyState = $('quizEmptyState');
const quizLoadingState = $('quizLoadingState');
const quizContainer = $('quizContainer');
const questionsWrapper = $('questionsWrapper');
const submitQuizBtn = $('submitQuizBtn');
const scoreDisplay = $('scoreDisplay');
const scoreValue = $('scoreValue');
const quizStatusBadge = $('quizStatusBadge');

const btnTabVideos = $('btnTabVideos');
const tabVideosContent = $('tabVideosContent');
const videosEmptyState = $('videosEmptyState');
const videosLoadingState = $('videosLoadingState');
const videosContainer = $('videosContainer');
const generateVideosBtn = $('generateVideosBtn');

const errorToast = $('errorToast');
const errorMessage = $('errorMessage');

// --- Helpers for show/hide (Tailwind 'hidden' vs 'flex') ---
function show(el, display = null) {
    if (el._progress) el._progress.start();
    el.classList.remove('hidden');
    if (display) el.classList.add(display);
}
function hide(el, display = null) {
    if (el._progress) el._progress.stop();
    el.classList.add('hidden');
    if (display) el.classList.remove(display);
}

// --- Progress bar (estimated: the API gives no real progress, so this eases toward ~92%) ---
function makeProgress(overlay, steps, expectedSec) {
    overlay.innerHTML = '<div class="progress-card"><div class="progress-title"></div>' +
        '<div class="progress-track"><div class="progress-fill"></div></div>' +
        '<div class="progress-meta"><span class="pct">0%</span><span class="hint"></span></div></div>';
    const title = overlay.querySelector('.progress-title');
    const fill = overlay.querySelector('.progress-fill');
    const pctEl = overlay.querySelector('.pct');
    const hint = overlay.querySelector('.hint');
    let timer = null, t0 = 0;

    function tick() {
        const t = (Date.now() - t0) / 1000;
        const pct = 92 * (1 - Math.exp(-t / (expectedSec * 0.6)));
        const step = Math.min(steps.length - 1, Math.floor(pct / (92 / steps.length)));
        title.textContent = steps[step];
        fill.style.width = pct + '%';
        pctEl.textContent = Math.round(pct) + '%';
        hint.textContent = t < expectedSec ? `About ${Math.max(1, Math.round(expectedSec - t))}s left` : 'Almost there…';
    }
    return {
        start() { clearInterval(timer); t0 = Date.now(); tick(); timer = setInterval(tick, 200); },
        stop() { clearInterval(timer); timer = null; }
    };
}

reviewerLoadingState._progress = makeProgress(reviewerLoadingState, ['Reading your notes…', 'Extracting key concepts…', 'Writing your reviewer…'], 15);
quizLoadingState._progress = makeProgress(quizLoadingState, ['Reading your notes…', 'Drafting questions…', 'Checking answers…'], 18);
videosLoadingState._progress = makeProgress(videosLoadingState, ['Finding your topic…', 'Searching YouTube…', 'Picking the best videos…'], 8);

// --- Event Listeners ---
btnTabReviewer.addEventListener('click', () => switchTab('reviewer'));
btnTabQuiz.addEventListener('click', () => switchTab('quiz'));
btnTabVideos.addEventListener('click', () => switchTab('videos'));
generateVideosBtn.addEventListener('click', generateVideoSuggestions);
fileInput.addEventListener('change', handleFileSelect);
clearBtn.addEventListener('click', fullReset);
generateQuizBtn.addEventListener('click', generateQuizFromNotes);
submitQuizBtn.addEventListener('click', gradeQuiz);

// Drag and Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
    uploadArea.addEventListener(name, e => { e.preventDefault(); e.stopPropagation(); });
});
uploadArea.addEventListener('dragover', () => uploadArea.classList.add('bg-blue-50', 'border-blue-400'));
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('bg-blue-50', 'border-blue-400'));
uploadArea.addEventListener('drop', (e) => {
    uploadArea.classList.remove('bg-blue-50', 'border-blue-400');
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect({ target: fileInput });
    }
});

// --- Tabs ---
function switchTab(tab) {
    const tabs = {
        reviewer: [btnTabReviewer, tabReviewerContent],
        quiz: [btnTabQuiz, tabQuizContent],
        videos: [btnTabVideos, tabVideosContent]
    };
    Object.entries(tabs).forEach(([name, [btn, content]]) => {
        btn.classList.toggle('active', name === tab);
        if (name === tab) show(content, 'flex'); else hide(content, 'flex');
    });
}

// --- File handling ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        return showError('Please upload a PNG, JPG, or WebP image.');
    }
    if (file.size > MAX_FILE_BYTES) {
        return showError('Image is larger than 5MB. Please use a smaller one.');
    }

    const reader = new FileReader();
    reader.onerror = () => showError('Could not read that file.');
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        imagePreview.src = dataUrl;
        hide(uploadArea);
        show(previewContainer, 'flex');

        // Reset any previous quiz for the new image
        resetQuizOnly();
        resetVideosOnly();
        const myId = ++uploadId;

        // Shrink the image before sending (much faster uploads and responses)
        shrinkImage(dataUrl).then(({ mime, base64 }) => {
            if (myId !== uploadId) return; // user changed/cleared the image meanwhile
            currentMimeType = mime;
            currentBase64Image = base64;
            generateQuizBtn.disabled = false;

            switchTab('reviewer');
            generateReviewerFromNotes();
            generateQuizFromNotes(); // start the quiz in the background
        });
    };
    reader.readAsDataURL(file);
}

// Downscale to max 1600px on the longest side and re-encode as JPEG
function shrinkImage(dataUrl, maxSize = 1600, quality = 0.85) {
    return new Promise((resolve) => {
        const fallback = () => resolve({ mime: dataUrl.slice(5, dataUrl.indexOf(';')), base64: dataUrl.split(',')[1] });
        const img = new Image();
        img.onerror = fallback;
        img.onload = () => {
            try {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; // avoids black background on transparent PNGs
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const out = canvas.toDataURL('image/jpeg', quality);
                resolve({ mime: 'image/jpeg', base64: out.split(',')[1] });
            } catch (_) { fallback(); }
        };
        img.src = dataUrl;
    });
}

function resetVideosOnly() {
    videosContainer.innerHTML = '';
    hide(videosContainer, 'flex');
    hide(videosLoadingState, 'flex');
    show(videosEmptyState);
    generateVideosBtn.disabled = true;
}

function resetQuizOnly() {
    generatedQuizData = null;
    userAnswers = {};
    questionsWrapper.innerHTML = '';
    hide(quizContainer, 'flex');
    show(quizEmptyState);
    show(submitQuizBtn);
    submitQuizBtn.disabled = true;
    submitQuizBtn.classList.add('opacity-50', 'cursor-not-allowed');
    hide(scoreDisplay, 'flex');
    quizStatusBadge.textContent = 'In Progress';
    quizStatusBadge.className = 'bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full';
}

function fullReset() {
    uploadId++;
    fileInput.value = '';
    currentBase64Image = null;
    currentMimeType = null;
    imagePreview.src = '';
    hide(previewContainer, 'flex');
    show(uploadArea);

    reviewerContainer.innerHTML = '';
    hide(reviewerContainer);
    hide(reviewerLoadingState, 'flex');
    show(reviewerEmptyState);

    resetQuizOnly();
    resetVideosOnly();
    generateQuizBtn.disabled = true;
    switchTab('reviewer');
}

// --- Gemini API ---
const RETRY_STATUSES = [429, 500, 503, 504];
const MAX_ATTEMPTS = 4;           // 1 try + 3 retries
const FALLBACK_MODEL = "";        // optional: a second model name to try if the main one stays overloaded

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const urlFor = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

async function callGemini(payload) {
    if (API_KEY.startsWith('PASTE_')) {
        throw new Error('Add your API key to script.js first.');
    }

    const models = FALLBACK_MODEL ? [MODEL, FALLBACK_MODEL] : [MODEL];
    let lastError = null;

    for (const model of models) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const response = await fetch(urlFor(model), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    let detail = '';
                    try { detail = (await response.json()).error?.message || ''; } catch (_) {}
                    const err = new Error(`API error ${response.status}${detail ? ': ' + detail : ''}`);
                    err.status = response.status;
                    throw err;
                }

                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('The AI returned an empty response. Try a clearer image.');
                return text;
            } catch (err) {
                lastError = err;
                const retryable = RETRY_STATUSES.includes(err.status) || err instanceof TypeError; // TypeError = network hiccup
                if (!retryable) throw err;
                if (attempt < MAX_ATTEMPTS) {
                    // 2s, 4s, 8s plus a little randomness
                    await sleep(2000 * 2 ** (attempt - 1) + Math.random() * 500);
                }
            }
        }
    }

    if (lastError && lastError.status === 503) {
        throw new Error('Google\'s AI servers are busy right now. Please try again in a minute.');
    }
    throw lastError;
}

async function generateReviewerFromNotes() {
    if (!currentBase64Image) return;
    const myId = uploadId;

    hide(reviewerEmptyState);
    hide(reviewerContainer);
    show(reviewerLoadingState, 'flex');

    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: "Analyze the image. Extract key concepts and definitions. Format as an HTML study guide (Reviewer) using <h3>, <ul>, <li>, <p>, <strong>. Do not use markdown blocks." },
                { inlineData: { mimeType: currentMimeType, data: currentBase64Image } }
            ]
        }]
    };

    try {
        let html = await callGemini(payload);
        if (myId !== uploadId) return;
        html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
        reviewerContainer.innerHTML = html;
        hide(reviewerLoadingState, 'flex');
        show(reviewerContainer);
        generateVideosBtn.disabled = false;
        generateVideoSuggestions(); // runs after the reviewer, using its text (fast, no image)
    } catch (error) {
        console.error(error);
        showError(error.message || 'Failed to generate reviewer.');
        hide(reviewerLoadingState, 'flex');
        show(reviewerEmptyState);
    }
}

async function generateQuizFromNotes() {
    if (!currentBase64Image) return;
    const myId = uploadId;

    hide(quizEmptyState);
    hide(quizContainer, 'flex');
    show(quizLoadingState, 'flex');

    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: "Generate exactly 5 multiple-choice questions based ONLY on the legible content in the image. Each question needs 4 options." },
                { inlineData: { mimeType: currentMimeType, data: currentBase64Image } }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        question: { type: "STRING" },
                        options: { type: "ARRAY", items: { type: "STRING" } },
                        correctAnswerIndex: { type: "INTEGER" },
                        explanation: { type: "STRING" }
                    },
                    required: ["question", "options", "correctAnswerIndex", "explanation"]
                }
            }
        }
    };

    try {
        const text = await callGemini(payload);
        if (myId !== uploadId) return;
        const clean = text.replace(/```json|```/gi, '').trim();
        generatedQuizData = JSON.parse(clean).slice(0, 5);
        if (!generatedQuizData.length) throw new Error('No questions were generated.');
        renderQuizUI();
    } catch (error) {
        console.error(error);
        showError(error.message || 'Failed to generate quiz.');
        hide(quizLoadingState, 'flex');
        show(quizEmptyState);
    }
}

function renderQuizUI() {
    hide(quizLoadingState, 'flex');
    show(quizContainer, 'flex');

    questionsWrapper.innerHTML = '';
    userAnswers = {};

    generatedQuizData.forEach((qData, qIndex) => {
        const block = document.createElement('div');
        block.className = 'bg-white border border-gray-100 rounded-xl p-5 shadow-sm';

        const qHeader = document.createElement('h3');
        qHeader.className = 'text-base font-semibold text-gray-800 mb-4';
        const num = document.createElement('span');
        num.className = 'text-blue-500 mr-2';
        num.textContent = `${qIndex + 1}.`;
        qHeader.append(num, document.createTextNode(qData.question));
        block.appendChild(qHeader);

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'space-y-3';

        qData.options.forEach((optText, optIndex) => {
            const label = document.createElement('label');
            label.className = 'quiz-option flex items-center p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-blue-50 hover:border-blue-200';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `question_${qIndex}`;
            radio.value = optIndex;
            radio.className = 'h-4 w-4 text-blue-600';

            radio.addEventListener('change', () => {
                optionsDiv.querySelectorAll('label').forEach(l =>
                    l.classList.remove('bg-blue-50', 'border-blue-400', 'ring-1', 'ring-blue-400'));
                label.classList.add('bg-blue-50', 'border-blue-400', 'ring-1', 'ring-blue-400');
                userAnswers[qIndex] = parseInt(radio.value, 10);

                if (Object.keys(userAnswers).length === generatedQuizData.length) {
                    submitQuizBtn.disabled = false;
                    submitQuizBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            });

            const span = document.createElement('span');
            span.className = 'ml-3 text-sm text-gray-700';
            span.textContent = optText;

            label.append(radio, span);
            optionsDiv.appendChild(label);
        });

        block.appendChild(optionsDiv);

        const explanationDiv = document.createElement('div');
        explanationDiv.id = `explanation_${qIndex}`;
        explanationDiv.className = 'hidden mt-4 p-3 bg-gray-50 border-l-4 rounded-r-lg text-sm';
        const title = document.createElement('span');
        title.className = 'font-semibold block mb-1';
        title.textContent = 'Explanation:';
        const body = document.createElement('span');
        body.className = 'text-gray-600';
        body.textContent = qData.explanation;
        explanationDiv.append(title, body);
        block.appendChild(explanationDiv);

        questionsWrapper.appendChild(block);
    });

    scoreValue.parentElement.lastElementChild.textContent = `/${generatedQuizData.length}`;
}

function gradeQuiz() {
    let correctCount = 0;

    generatedQuizData.forEach((qData, qIndex) => {
        const isCorrect = userAnswers[qIndex] === qData.correctAnswerIndex;
        if (isCorrect) correctCount++;

        const block = questionsWrapper.children[qIndex];
        const labels = block.querySelectorAll('label');
        block.querySelectorAll('input').forEach(r => r.disabled = true);

        labels.forEach((label, optIndex) => {
            label.className = 'flex items-center p-3 rounded-lg border opacity-70 cursor-default';
            if (optIndex === qData.correctAnswerIndex) {
                label.classList.add('bg-green-50', 'border-green-500', 'text-green-800', 'opacity-100');
            } else if (optIndex === userAnswers[qIndex] && !isCorrect) {
                label.classList.add('bg-red-50', 'border-red-400', 'text-red-700', 'opacity-100');
            } else {
                label.classList.add('border-gray-200');
            }
        });

        const explanationDiv = $(`explanation_${qIndex}`);
        explanationDiv.classList.remove('hidden');
        explanationDiv.classList.add(isCorrect ? 'border-green-500' : 'border-red-400');
    });

    scoreValue.textContent = correctCount;
    hide(submitQuizBtn);
    show(scoreDisplay, 'flex');
    quizStatusBadge.textContent = 'Completed';
    quizStatusBadge.className = 'bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full';
}

// --- YouTube suggestions ---
// Gemini can't reliably give real video links, so it suggests topics and search
// phrases, and each card opens a YouTube search for that phrase (always a working link).
async function generateVideoSuggestions() {
    const notesText = (reviewerContainer.innerText || '').trim().slice(0, 6000);
    if (!notesText) return;
    const myId = uploadId;

    hide(videosEmptyState);
    hide(videosContainer, 'flex');
    show(videosLoadingState, 'flex');

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text:
                "Below is a student's study guide. Identify its main topic and suggest 4 YouTube videos " +
                "that would help them learn it. For each, give a short title describing what the video covers, " +
                "a YouTube search query (3-8 words, specific, e.g. including 'explained' or 'tutorial' when fitting), " +
                "and one sentence on why it helps. Cover different angles (overview, deeper dive, examples, practice).\n\n" +
                notesText
            }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    topic: { type: "STRING" },
                    suggestions: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING" },
                                query: { type: "STRING" },
                                reason: { type: "STRING" }
                            },
                            required: ["title", "query", "reason"]
                        }
                    }
                },
                required: ["topic", "suggestions"]
            }
        }
    };

    try {
        const text = await callGemini(payload);
        if (myId !== uploadId) return;
        const data = JSON.parse(text.replace(/```json|```/gi, '').trim());
        if (!data.suggestions || !data.suggestions.length) throw new Error('No video suggestions were generated.');
        await attachVideos(data);
        if (myId !== uploadId) return;
        renderVideos(data);
    } catch (error) {
        if (myId !== uploadId) return;
        console.error(error);
        showError(error.message || 'Failed to suggest videos.');
        hide(videosLoadingState, 'flex');
        show(videosEmptyState);
    }
}

// Decode HTML entities that YouTube leaves in titles (&amp;, &#39;, ...)
function decodeEntities(str) {
    return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent;
}

// Look up the top embeddable video for a query. Returns null on any problem.
async function fetchYouTubeVideo(query) {
    if (YT_API_KEY.startsWith('PASTE_')) return null;
    const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: '1',
        q: query,
        safeSearch: 'strict',
        videoEmbeddable: 'true',
        key: YT_API_KEY
    });
    const response = await fetch('https://www.googleapis.com/youtube/v3/search?' + params);
    if (!response.ok) {
        let detail = '';
        try { detail = (await response.json()).error?.message || ''; } catch (_) {}
        const err = new Error(`YouTube API error ${response.status}${detail ? ': ' + detail : ''}`);
        err.status = response.status;
        throw err;
    }
    const json = await response.json();
    const item = json.items && json.items[0];
    if (!item || !item.id || !item.id.videoId) return null;
    const thumbs = item.snippet.thumbnails || {};
    return {
        id: item.id.videoId,
        title: decodeEntities(item.snippet.title),
        channel: decodeEntities(item.snippet.channelTitle),
        thumb: (thumbs.medium || thumbs.high || thumbs.default || {}).url || ''
    };
}

// Attach a real video to each suggestion (in parallel). Failures fall back to a search link.
async function attachVideos(data) {
    let reportedError = false;
    const seen = new Set();
    const results = await Promise.all(data.suggestions.slice(0, 6).map(async (item) => {
        try {
            return await fetchYouTubeVideo(item.query);
        } catch (err) {
            console.error(err);
            if (!reportedError) {
                reportedError = true;
                showError(err.status === 403
                    ? 'YouTube quota or key problem. Showing search links instead.'
                    : (err.message || 'Could not load videos. Showing search links instead.'));
            }
            return null;
        }
    }));
    data.suggestions = data.suggestions.slice(0, 6);
    data.suggestions.forEach((item, i) => {
        const v = results[i];
        if (v && !seen.has(v.id)) { seen.add(v.id); item.video = v; } // skip duplicates
    });
}

function renderVideos(data) {
    videosContainer.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'pb-4 border-b border-gray-100';
    const h2 = document.createElement('h2');
    h2.className = 'text-xl font-bold text-gray-900';
    h2.textContent = 'Videos to watch';
    const sub = document.createElement('p');
    sub.className = 'text-sm text-gray-500 mt-1';
    sub.textContent = `Topic: ${data.topic}`;
    heading.append(h2, sub);
    videosContainer.appendChild(heading);

    data.suggestions.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 hover:border-red-200 transition-colors';

        const hasVideo = !!item.video;
        const href = hasVideo
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(item.video.id)}`
            : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.query);

        if (hasVideo && item.video.thumb) {
            const thumbLink = document.createElement('a');
            thumbLink.href = href;
            thumbLink.target = '_blank';
            thumbLink.rel = 'noopener noreferrer';
            thumbLink.className = 'shrink-0 block sm:w-52';
            const img = document.createElement('img');
            img.src = item.video.thumb;
            img.alt = item.video.title;
            img.loading = 'lazy';
            img.className = 'w-full aspect-video object-cover rounded-lg bg-gray-100';
            thumbLink.appendChild(img);
            card.appendChild(thumbLink);
        }

        const info = document.createElement('div');
        info.className = 'flex flex-col flex-grow min-w-0';

        const title = document.createElement('h3');
        title.className = 'text-base font-semibold text-gray-900';
        title.textContent = hasVideo ? item.video.title : item.title;
        info.appendChild(title);

        if (hasVideo) {
            const channel = document.createElement('p');
            channel.className = 'text-xs text-gray-500 mt-0.5';
            channel.textContent = item.video.channel;
            info.appendChild(channel);
        }

        const reason = document.createElement('p');
        reason.className = 'text-sm text-gray-600 mt-2';
        reason.textContent = item.reason;
        info.appendChild(reason);

        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'mt-3 self-start ios-btn ios-btn-red ios-btn-sm';
        link.textContent = hasVideo ? 'Watch on YouTube' : 'Search on YouTube';
        info.appendChild(link);

        card.appendChild(info);
        videosContainer.appendChild(card);
    });

    hide(videosLoadingState, 'flex');
    show(videosContainer, 'flex');
}

// --- Error toast ---
let toastTimer = null;
function showError(message) {
    console.error(message);
    errorMessage.textContent = message;
    errorToast.classList.remove('translate-y-20', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => errorToast.classList.add('translate-y-20', 'opacity-0'), 5000);
}