// ---------- Configuration ----------
const API_KEY = "";      // Gemini key (do not share it)
const YT_API_KEY = "";   // YouTube Data API key
const MODEL = "gemini-3.8-flash";
const MAX_FILE_BYTES = 10 * 1024 * 1024, MAX_TEXT_CHARS = 60000;
const RETRY = [429, 500, 503, 504], MAX_ATTEMPTS = 4;

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const show = (el, d) => { el.classList.remove('hidden'); if (d) el.classList.add(d); };
const hide = (el, d) => { el.classList.add('hidden'); if (d) el.classList.remove(d); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseJSON = (t) => JSON.parse(t.replace(/```json|```/gi, '').trim());
const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Could not save (storage full or blocked).'); } }
};
function clean(html) { // strip scripts / event handlers from AI-made HTML
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(n => n.remove());
    d.body.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return d.body.innerHTML;
}
const decode = (s) => new DOMParser().parseFromString(s || '', 'text/html').documentElement.textContent;
let toastTimer;
function toast(msg, ok = false) {
    $('toastMsg').textContent = msg; const t = $('toast');
    t.classList.toggle('ok', ok); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}
const stagger = (el) => [...el.children].forEach((c, i) => c.style.setProperty('--n', i));
const openModal = (m) => m.classList.add('open'), closeModal = (m) => m.classList.remove('open');

// ---------- State ----------
let src = null;            // { mime, b64 } or { text }
let uploadId = 0, quizData = null, answers = {}, reviewerHTML = '', videosData = null;
let subjects = store.get('edu_subjects', ['Computer Science 101', 'Mathematics']);
let materials = store.get('edu_materials', []);
let openSub = null, editingSub = null;

// ---------- Progress with learned time estimates ----------
// Real durations are measured and averaged, so the estimate adapts to your connection and the model.
const timing = store.get('edu_timing', { reviewer: 18, quiz: 18, videos: 14 });
const STEPS = {
    reviewer: ['Reading your notes…', 'Extracting key concepts…', 'Writing your reviewer…'],
    quiz: ['Reading your notes…', 'Drafting questions…', 'Checking answers…'],
    videos: ['Finding your topic…', 'Searching YouTube…', 'Picking the best videos…']
};
function makeProgress(name, el) {
    el.innerHTML = '<div class="progress-card"><div class="progress-title"></div><div class="progress-track"><div class="progress-fill"></div></div><div class="progress-meta"><span class="pct"></span><span class="hint"></span></div></div>';
    const q = (s) => el.querySelector(s); let timer, t0 = 0;
    const paint = () => {
        const exp = timing[name], t = (Date.now() - t0) / 1000, steps = STEPS[name];
        const pct = 92 * (1 - Math.exp(-t / (exp * 0.6)));
        q('.progress-title').textContent = steps[Math.min(steps.length - 1, Math.floor(pct / (92 / steps.length)))];
        q('.progress-fill').style.width = pct + '%'; q('.pct').textContent = Math.round(pct) + '%';
        q('.hint').textContent = t < exp ? `About ${Math.max(1, Math.round(exp - t))}s left` : 'Almost there…';
    };
    return {
        start() { t0 = Date.now(); clearInterval(timer); paint(); timer = setInterval(paint, 200); show(el, 'flex'); },
        stop() { clearInterval(timer); hide(el, 'flex'); },
        finish() {
            const actual = Math.min(90, (Date.now() - t0) / 1000);
            timing[name] = Math.round((timing[name] * 0.5 + actual * 0.5) * 10) / 10; store.set('edu_timing', timing);
            clearInterval(timer); q('.progress-fill').style.width = '100%'; q('.pct').textContent = '100%';
            setTimeout(() => hide(el, 'flex'), 250);
        }
    };
}
const P = { reviewer: makeProgress('reviewer', $('rvLoading')), quiz: makeProgress('quiz', $('quizLoading')), videos: makeProgress('videos', $('vLoading')) };

// ---------- Gemini (with retries for 503/429) ----------
async function callGemini(payload) {
    if (!API_KEY) throw new Error('Add your Gemini API key at the top of script.js.');
    let last;
    for (let a = 1; a <= MAX_ATTEMPTS; a++) {
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (!r.ok) {
                let d = ''; try { d = (await r.json()).error?.message || ''; } catch { }
                const e = new Error(`API error ${r.status}${d ? ': ' + d : ''}`); e.status = r.status; throw e;
            }
            const text = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('The AI returned an empty response. Try again.');
            return text;
        } catch (e) {
            last = e;
            if (!(RETRY.includes(e.status) || e instanceof TypeError) || a === MAX_ATTEMPTS) break;
            await sleep(2000 * 2 ** (a - 1) + Math.random() * 500);
        }
    }
    throw last?.status === 503 ? new Error("Google's AI servers are busy. Try again in a minute.") : last;
}
const sourceParts = () => src.text !== undefined ? [{ text: 'STUDY MATERIAL:\n' + src.text }] : [{ inlineData: { mimeType: src.mime, data: src.b64 } }];

// One job = progress bar + request + result, ignoring stale results
async function job(name, id, empty, request, onOk) {
    if (!src) return;
    hide(empty); P[name].start();
    try {
        const out = await request(); if (id !== uploadId) return;
        onOk(out); P[name].finish();
    } catch (e) {
        if (id !== uploadId) return;
        P[name].stop(); console.error(e); toast(e.message || 'Something went wrong.'); show(empty, 'flex');
    }
}
const ask = (text, schema) => callGemini({
    contents: [{ role: 'user', parts: [{ text }, ...sourceParts()] }],
    ...(schema ? { generationConfig: { responseMimeType: 'application/json', responseSchema: schema } } : {})
});

// ---------- Tabs ----------
const T = { reviewer: $('tabReviewer'), quiz: $('tabQuiz'), videos: $('tabVideos') };
function switchTab(tab) {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('seg').style.setProperty('--i', Object.keys(T).indexOf(tab));
    Object.entries(T).forEach(([n, el]) => {
        if (n === tab) { show(el, 'flex'); el.classList.remove('tab-in'); void el.offsetWidth; el.classList.add('tab-in'); } else hide(el, 'flex');
    });
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ---------- Files ----------
const EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
function kindOf(f) {
    const x = (f.name.split('.').pop() || '').toLowerCase();
    if (EXT[x]) return ['image', EXT[x]]; if (f.type.startsWith('image/')) return ['image', f.type];
    if (x === 'pdf' || f.type === 'application/pdf') return ['pdf', 'application/pdf'];
    if (x === 'docx') return ['docx']; if (x === 'txt' || x === 'md' || f.type === 'text/plain') return ['text'];
    return null;
}
const readURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(f); });
function shrink(url, max = 1600) { // smaller image = faster upload and faster AI
    const raw = { mime: url.slice(5, url.indexOf(';')), b64: url.split(',')[1] };
    return new Promise(res => {
        const i = new Image(); i.onerror = () => res(raw);
        i.onload = () => {
            try {
                const s = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement('canvas');
                c.width = Math.round(i.width * s); c.height = Math.round(i.height * s);
                const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(i, 0, 0, c.width, c.height);
                res({ mime: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
            } catch { res(raw); }
        };
        i.src = url;
    });
}
const fmtSize = (b) => b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;

async function handleFile(file) {
    if (!file) return;
    const info = kindOf(file);
    if (!info) return toast('Unsupported file. Use an image, PDF, Word (.docx) or text file.');
    if (file.size > MAX_FILE_BYTES) return toast('That file is larger than 10MB.');
    resetResults(); const id = uploadId;
    try {
        let s, card = true;
        if (info[0] === 'image') {
            const url = await readURL(file);
            $('imagePreview').src = url; show($('imagePreview')); hide($('fileCard'), 'flex'); card = false;
            s = /hei[cf]/.test(info[1]) ? { mime: info[1], b64: url.split(',')[1] } : await shrink(url);
        } else if (info[0] === 'pdf') { s = { mime: info[1], b64: (await readURL(file)).split(',')[1] }; }
        else if (info[0] === 'docx') {
            if (!window.mammoth) throw new Error('Word support did not load. Check your connection and reload.');
            s = { text: (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value };
        } else { s = { text: await file.text() }; }
        if (s.text !== undefined) { s.text = s.text.trim().slice(0, MAX_TEXT_CHARS); if (!s.text) throw new Error('No readable text found in that file.'); }
        if (id !== uploadId) return;
        if (card) {
            hide($('imagePreview')); show($('fileCard'), 'flex');
            $('fileIcon').textContent = { pdf: '📕', docx: '📘', text: '📝' }[info[0]];
            $('fileName').textContent = file.name; $('fileMeta').textContent = `${info[0].toUpperCase()} · ${fmtSize(file.size)}`;
        }
        src = s; hide($('uploadArea')); show($('previewBox'), 'flex');
        ['genReviewerBtn', 'genQuizBtn', 'genVideosBtn'].forEach(b => $(b).disabled = false);
        switchTab('reviewer'); genReviewer(id); genQuiz(id); genVideos(id); // all three run in parallel
    } catch (e) { console.error(e); toast(e.message || 'Could not read that file.'); $('fileInput').value = ''; }
}
$('fileInput').addEventListener('change', e => handleFile(e.target.files[0]));
const drop = $('uploadArea');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); e.stopPropagation(); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

function resetResults() {
    uploadId++; Object.values(P).forEach(p => p.stop());
    reviewerHTML = ''; quizData = null; answers = {}; videosData = null;
    $('rvBox').innerHTML = ''; hide($('rvBox')); show($('rvEmpty'), 'flex'); hide($('saveBar'), 'flex');
    $('qWrap').innerHTML = ''; hide($('quizBox'), 'flex'); show($('quizEmpty'), 'flex'); hide($('scoreBox')); show($('submitBtn'));
    $('submitBtn').disabled = true; $('vBox').innerHTML = ''; hide($('vBox'), 'flex'); show($('vEmpty'), 'flex');
}
$('clearBtn').addEventListener('click', () => {
    resetResults(); src = null; $('fileInput').value = ''; hide($('previewBox'), 'flex'); show($('uploadArea'));
    ['genReviewerBtn', 'genQuizBtn', 'genVideosBtn'].forEach(b => $(b).disabled = true); switchTab('reviewer');
});

// ---------- Reviewer ----------
function genReviewer(id = uploadId) {
    return job('reviewer', id, $('rvEmpty'),
        () => ask('Analyze the provided study material (photo, PDF or text). Extract key concepts and definitions. Format as a concise HTML study guide using <h3>, <ul>, <li>, <p>, <strong>. No markdown and no code fences.'),
        (t) => {
            reviewerHTML = clean(t.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim());
            $('rvBox').innerHTML = reviewerHTML; show($('rvBox')); show($('saveBar'), 'flex');
        });
}

// ---------- Quiz ----------
const QUIZ_SCHEMA = { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, correctAnswerIndex: { type: 'INTEGER' }, explanation: { type: 'STRING' } }, required: ['question', 'options', 'correctAnswerIndex', 'explanation'] } };
function genQuiz(id = uploadId) {
    return job('quiz', id, $('quizEmpty'),
        async () => parseJSON(await ask('Generate exactly 5 multiple-choice questions (4 options each) based ONLY on the legible content of the provided material.', QUIZ_SCHEMA)).slice(0, 5),
        (data) => {
            if (!data.length) throw new Error('No questions were generated.');
            quizData = data; answers = {};
            $('qWrap').innerHTML = data.map((q, i) => `<div class="qcard"><p class="font-semibold t1"><span style="color:var(--blue)">${i + 1}.</span> ${esc(q.question)}</p>` +
                q.options.map((o, j) => `<label class="opt"><input type="radio" name="q_${i}" value="${j}"><span>${esc(o)}</span></label>`).join('') +
                `<div class="expl hidden"><b>Explanation:</b> <span class="t2">${esc(q.explanation)}</span></div></div>`).join('');
            $('scoreTotal').textContent = data.length; hide($('scoreBox')); show($('submitBtn')); $('submitBtn').disabled = true;
            show($('quizBox'), 'flex'); stagger($('qWrap'));
        });
}
$('qWrap').addEventListener('change', (e) => {
    const r = e.target; if (r.type !== 'radio') return;
    answers[+r.name.slice(2)] = +r.value;
    r.closest('.qcard').querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o.contains(r)));
    $('submitBtn').disabled = Object.keys(answers).length !== quizData.length;
});
$('submitBtn').addEventListener('click', () => {
    let score = 0;
    [...$('qWrap').children].forEach((card, i) => {
        const q = quizData[i], ok = answers[i] === q.correctAnswerIndex; if (ok) score++;
        card.querySelectorAll('input').forEach(r => r.disabled = true);
        card.querySelectorAll('.opt').forEach((o, j) => { o.classList.remove('sel'); o.classList.add('done'); if (j === q.correctAnswerIndex) o.classList.add('ok'); else if (j === answers[i]) o.classList.add('bad'); });
        card.querySelector('.expl').classList.remove('hidden');
    });
    $('scoreVal').textContent = score; hide($('submitBtn')); show($('scoreBox'));
});

// ---------- Videos ----------
const VID_SCHEMA = { type: 'OBJECT', properties: { topic: { type: 'STRING' }, suggestions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, query: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['title', 'query', 'reason'] } } }, required: ['topic', 'suggestions'] };
async function ytLookup(query) {
    if (!YT_API_KEY) return null;
    const p = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '1', q: query, safeSearch: 'strict', videoEmbeddable: 'true', key: YT_API_KEY });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p);
    if (!r.ok) { const e = new Error('YouTube API error ' + r.status); e.status = r.status; throw e; }
    const v = (await r.json()).items?.[0]; if (!v?.id?.videoId) return null;
    const th = v.snippet.thumbnails || {};
    return { id: v.id.videoId, title: decode(v.snippet.title), channel: decode(v.snippet.channelTitle), thumb: (th.medium || th.default || {}).url || '' };
}
const videoHref = (it) => it.video ? `https://www.youtube.com/watch?v=${encodeURIComponent(it.video.id)}` : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(it.query);
function genVideos(id = uploadId) {
    return job('videos', id, $('vEmpty'),
        async () => {
            const d = parseJSON(await ask('Identify the main topic of the provided study material and suggest 4 YouTube videos that would help the student learn it. For each give a short title, a YouTube search query (3-8 specific words) and one sentence on why it helps. Cover different angles.', VID_SCHEMA));
            d.suggestions = (d.suggestions || []).slice(0, 4); let warned = false; const seen = new Set();
            const res = await Promise.all(d.suggestions.map(s => ytLookup(s.query).catch(e => { if (!warned) { warned = true; toast(e.status === 403 ? 'YouTube quota or key problem. Showing search links.' : 'Could not load videos. Showing search links.'); } return null; })));
            d.suggestions.forEach((s, i) => { if (res[i] && !seen.has(res[i].id)) { seen.add(res[i].id); s.video = res[i]; } });
            if (!d.suggestions.length) throw new Error('No video suggestions were generated.');
            return d;
        },
        (d) => {
            videosData = d;
            $('vBox').innerHTML = `<div><h2 class="text-xl font-bold t1">Videos to watch</h2><p class="text-sm t2 mt-1">Topic: ${esc(d.topic)}</p></div>` + d.suggestions.map(it => {
                const v = it.video, h = esc(videoHref(it));
                return `<div class="vcard">${v?.thumb ? `<a class="vthumb" href="${h}" target="_blank" rel="noopener noreferrer"><img src="${esc(v.thumb)}" alt="" loading="lazy"></a>` : ''}
                <div class="flex flex-col min-w-0 flex-grow"><h3 class="font-semibold t1">${esc(v ? v.title : it.title)}</h3>${v ? `<p class="text-xs t2 mt-0.5">${esc(v.channel)}</p>` : ''}
                <p class="text-sm t2 mt-2">${esc(it.reason)}</p><a class="btn btn-red btn-sm mt-3 self-start" href="${h}" target="_blank" rel="noopener noreferrer">${v ? 'Watch on YouTube' : 'Search on YouTube'}</a></div></div>`;
            }).join('');
            show($('vBox'), 'flex'); stagger($('vBox'));
        });
}
$('genReviewerBtn').addEventListener('click', () => genReviewer());
$('genQuizBtn').addEventListener('click', () => genQuiz());
$('genVideosBtn').addEventListener('click', () => genVideos());

// ---------- Theme, drawer, navigation ----------
function applyTheme(dark) { document.documentElement.classList.toggle('dark', dark); $('themeIcon').textContent = dark ? '☀️' : '🌙'; }
applyTheme(localStorage.getItem('theme') ? localStorage.getItem('theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
$('themeBtn').addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark'); applyTheme(dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { }
    $('themeIcon').animate([{ transform: 'rotate(-120deg) scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' });
});
const setDrawer = (open) => { $('drawer').classList.toggle('open', open); $('drawerOverlay').classList.toggle('open', open); };
$('hamburgerBtn').addEventListener('click', () => setDrawer(true));
$('drawerOverlay').addEventListener('click', () => setDrawer(false));

function go(view) {
    const home = view === 'home', shown = home ? $('viewHome') : $('viewSubjects');
    hide(home ? $('viewSubjects') : $('viewHome')); show(shown);
    shown.classList.remove('view-in'); void shown.offsetWidth; shown.classList.add('view-in');
    $('bottomNav').dataset.active = view;
    $('navHome').classList.toggle('active', home); $('navSubjects').classList.toggle('active', !home);
    if (!home) { openSub = null; renderSubjects(); }
    scrollTo({ top: 0, behavior: 'smooth' });
}
$('navHome').addEventListener('click', () => go('home'));
$('navSubjects').addEventListener('click', () => go('subjects'));

// ---------- Subjects: add / rename / delete ----------
const saveSubjects = () => store.set('edu_subjects', subjects), saveMaterials = () => store.set('edu_materials', materials);
function renderSubjects() {
    hide($('subjectDetail')); show($('subjectsGrid'));
    const g = $('subjectsGrid');
    g.innerHTML = subjects.map(s => {
        const n = materials.filter(m => m.subject === s).length;
        return `<div class="card sub-card" data-open="${esc(s)}"><div class="flex justify-between items-start mb-3"><div class="bubble">📚</div>
        <div class="flex gap-1"><button class="icon-btn" data-edit="${esc(s)}" aria-label="Rename ${esc(s)}">✏️</button><button class="icon-btn danger" data-del="${esc(s)}" aria-label="Delete ${esc(s)}">🗑️</button></div></div>
        <h3 class="text-lg font-bold t1">${esc(s)}</h3><p class="text-sm t2 mt-1">${n} saved ${n === 1 ? 'material' : 'materials'}</p></div>`;
    }).join('') || '<p class="t2">No subjects yet. Tap “+ New Subject”.</p>';
    stagger(g);
}
$('subjectsGrid').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]'), de = e.target.closest('[data-del]'), op = e.target.closest('[data-open]');
    if (ed) return openSubModal(ed.dataset.edit);
    if (de) {
        const s = de.dataset.del, n = materials.filter(m => m.subject === s).length;
        if (confirm(`Delete “${s}”${n ? ` and its ${n} saved material${n > 1 ? 's' : ''}` : ''}? This can't be undone.`)) {
            subjects = subjects.filter(x => x !== s); materials = materials.filter(m => m.subject !== s); saveSubjects(); saveMaterials(); renderSubjects(); toast('Subject deleted.', true);
        }
        return;
    }
    if (op) openSubject(op.dataset.open);
});
function openSubModal(name = null) {
    editingSub = name; $('subModalTitle').textContent = name ? 'Rename Subject' : 'New Subject'; $('subOk').textContent = name ? 'Save' : 'Create';
    $('subInput').value = name || ''; openModal($('subModal')); setTimeout(() => $('subInput').focus(), 250);
}
function submitSubject() {
    const v = $('subInput').value.trim(); if (!v) return;
    if (subjects.some(s => s.toLowerCase() === v.toLowerCase() && s !== editingSub)) return toast('That subject already exists.');
    if (editingSub) {
        subjects = subjects.map(s => s === editingSub ? v : s); materials.forEach(m => { if (m.subject === editingSub) m.subject = v; });
        if (openSub === editingSub) { openSub = v; $('detailTitle').textContent = v; } saveMaterials();
    } else subjects.push(v);
    saveSubjects(); closeModal($('subModal')); openSub ? openSubject(openSub) : renderSubjects();
}
$('newSubjectBtn').addEventListener('click', () => openSubModal());
$('subCancel').addEventListener('click', () => closeModal($('subModal')));
$('subOk').addEventListener('click', submitSubject);
$('subInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitSubject(); });

// ---------- Saved materials: view / delete ----------
function openSubject(s) {
    openSub = s; hide($('subjectsGrid')); show($('subjectDetail')); $('detailTitle').textContent = s;
    const items = materials.filter(m => m.subject === s).reverse(), list = $('savedList');
    list.innerHTML = items.map(m => `<div class="item-row"><div class="min-w-0"><p class="font-bold t1">Study Session</p><p class="text-sm t2">${esc(m.date)} · ${[m.reviewerHTML && 'Reviewer', m.quizData?.length && 'Quiz', m.videos?.suggestions?.length && 'Videos'].filter(Boolean).join(' + ') || 'Empty'}</p></div>
        <div class="flex gap-2"><button class="btn btn-sm btn-soft" data-view="${m.id}">View</button><button class="btn btn-sm btn-tint" data-rm="${m.id}">Delete</button></div></div>`).join('') || '<p class="t2">No materials saved yet. Generate one on Home and tap “Save to Subject”.</p>';
    stagger(list);
}
$('savedList').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'), r = e.target.closest('[data-rm]');
    if (v) viewMaterial(materials.find(m => m.id === +v.dataset.view));
    if (r && confirm('Delete this saved material?')) { materials = materials.filter(m => m.id !== +r.dataset.rm); saveMaterials(); openSubject(openSub); }
});
$('backBtn').addEventListener('click', () => { openSub = null; renderSubjects(); });
function viewMaterial(m) {
    if (!m) return;
    let h = m.reviewerHTML ? `<div class="reviewer">${clean(m.reviewerHTML)}</div>` : '';
    if (m.quizData?.length) h += '<h3 class="sec t1">Quiz</h3>' + m.quizData.map((q, i) => `<div class="qcard mb-3"><p class="font-semibold t1">${i + 1}. ${esc(q.question)}</p>${q.options.map((o, j) => `<div class="opt done ${j === q.correctAnswerIndex ? 'ok' : ''}">${esc(o)}</div>`).join('')}<div class="expl"><b>Why:</b> <span class="t2">${esc(q.explanation)}</span></div></div>`).join('');
    if (m.videos?.suggestions?.length) h += '<h3 class="sec t1">Videos</h3>' + m.videos.suggestions.map(it => `<a class="vcard mb-3" href="${esc(videoHref(it))}" target="_blank" rel="noopener noreferrer"><div class="min-w-0"><p class="font-semibold t1">${esc(it.video ? it.video.title : it.title)}</p><p class="text-sm t2 mt-1">${esc(it.reason)}</p></div></a>`).join('');
    $('viewTitle').textContent = `${m.subject} · ${m.date}`; $('viewBody').innerHTML = h || '<p class="t2">Nothing saved in this session.</p>'; openModal($('viewModal'));
}
$('viewClose').addEventListener('click', () => closeModal($('viewModal')));
$('viewModal').addEventListener('click', e => { if (e.target === $('viewModal')) closeModal($('viewModal')); });

// ---------- Save current results ----------
$('openSaveBtn').addEventListener('click', () => {
    if (!subjects.length) { toast('Create a subject first.'); return go('subjects'); }
    $('saveSelect').innerHTML = subjects.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join(''); openModal($('saveModal'));
});
$('saveCancel').addEventListener('click', () => closeModal($('saveModal')));
$('saveOk').addEventListener('click', () => {
    const subject = $('saveSelect').value;
    materials.push({ id: Date.now(), subject, date: new Date().toLocaleDateString(), reviewerHTML, quizData, videos: videosData });
    saveMaterials(); closeModal($('saveModal')); toast(`Saved to ${subject}.`, true);
});
['subModal', 'saveModal'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) closeModal($(id)); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.modal.open').forEach(closeModal); setDrawer(false); } });

renderSubjects();
