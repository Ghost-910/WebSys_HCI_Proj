// patch.js: load AFTER script.js. Adds (1) the iOS liquid-glass bottom nav with a sliding pill
// and (2) a safer Gemini caller that fixes 429 errors. It overrides functions from script.js,
// so your existing files stay as they are.

// ---------- 1) Liquid-glass bottom navigation ----------
(function () {
    const css = `
    .bnav-wrap{position:fixed;left:0;right:0;bottom:max(16px,env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none;z-index:40}
    .bnav{pointer-events:auto;position:relative;display:flex;width:min(92vw,380px);padding:5px;border-radius:999px;
        background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(28px) saturate(200%);backdrop-filter:blur(28px) saturate(200%);
        border:1px solid rgba(255,255,255,.75);
        box-shadow:0 10px 36px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.6),inset 0 -1px 0 rgba(255,255,255,.12);
        animation:bnavIn .8s cubic-bezier(.34,1.56,.64,1) both}
    .dark .bnav{background:rgba(44,44,48,.55);border-color:rgba(255,255,255,.16)}
    .bnav-pill{position:absolute;top:5px;bottom:5px;left:5px;width:calc((100% - 10px)/3);border-radius:999px;
        background:rgba(0,122,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 2px 10px rgba(0,122,255,.2);
        transform:translateX(calc(var(--i,0)*100%));transition:transform .6s cubic-bezier(.34,1.56,.64,1)}
    .bnav button{position:relative;z-index:1;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0;
        color:#6c6c70;transition:color .3s,transform .4s cubic-bezier(.34,1.56,.64,1)}
    .dark .bnav button{color:#aeaeb2}
    .bnav button span{font-size:10.5px!important;font-weight:600!important}
    .bnav button:active{transform:scale(.86)}
    .bnav button.active{color:#007aff}.dark .bnav button.active{color:#0a84ff}
    .bnav button.active svg{animation:bnavPop .6s cubic-bezier(.34,1.56,.64,1)}
    .view-in{animation:viewIn .55s cubic-bezier(.22,1,.36,1) both}
    @keyframes bnavIn{from{opacity:0;transform:translateY(60px) scale(.9)}to{opacity:1;transform:none}}
    @keyframes bnavPop{0%{transform:scale(.7)}100%{transform:scale(1)}}
    @keyframes viewIn{from{opacity:0;transform:translateY(16px) scale(.985);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}
    @media (prefers-reduced-motion:reduce){.bnav,.bnav-pill,.view-in{animation:none!important;transition:none!important}}`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    st.textContent = css;
    document.head.appendChild(st);

    const btns = { 
        home: $('navHomeBtn'), 
        subjects: $('navSubjectsBtn'),
        mastery: $('navReviewersBtn'),
        profile: $('navProfileBtn') };

    const nav = btns.home.parentElement;
    const wrap = nav.parentElement;

    wrap.className = 'bnav-wrap'; 
    nav.className = 'bnav';

    const pill = document.createElement('span'); 
    pill.className = 'bnav-pill'; 
    nav.prepend(pill);

    function setNav(view) {
        const selectedView = view === 'reviewers' ? null : view;

        Object.entries(btns).forEach(([k, b]) => { 
            b.className = k === view ? 'active' : ''; 
        });

        if (selectedView) {
            nav.style.setProperty('--i', Object.keys(btns).indexOf(selectedView));
            pill.style.opacity = '1';
        } else {
            pill.style.opacity = '0';
        }
    }

    const original = switchMainView;
    switchMainView = function (view) {
        original(view); setNav(view);
        const el = { 
            home: viewHome, 
            subjects: viewSubjects, 
            reviewers: viewReviewers,
            mastery: viewMastery,
            profile: viewProfile 
        }[view];

        if (el) {
            el.classList.remove('view-in'); 
            void el.offsetWidth; 
            el.classList.add('view-in');
        }
    };

    setNav('home');
})();

// ---------- 2) Faster generation + real YouTube videos ----------
(function () {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const GEN = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL;

    // Up to 3 AI requests at once (the old patch allowed 1, which made reviewer, quiz and videos wait in line).
    // If you start seeing 429 errors again, change MAX_PARALLEL to 1.
    const MAX_PARALLEL = 3;
    let active = 0; const queue = [];
    const acquire = () => new Promise(res => { const go = () => { active++; res(); }; active < MAX_PARALLEL ? go() : queue.push(go); });
    const release = () => { active--; const n = queue.shift(); if (n) n(); };

    // POST with retries for 429 / 503. Returns the successful Response.
    async function fetchRetry(url, payload) {
        if (!API_KEY) throw new Error('Gemini key missing. Add it to config.js.');
        for (let attempt = 1; ; attempt++) {
            let r;
            try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
            catch (e) { if (attempt < 3) { await sleep(2000 * attempt); continue; } throw new Error('Network error. Check your internet connection.'); }
            if (r.ok) return r;
            let msg = '', delayMs = null;
            try {
                const err = (await r.json()).error || {};
                msg = (err.message || '').split('\n')[0].slice(0, 160);
                const info = (err.details || []).find(d => String(d['@type']).includes('RetryInfo'));
                if (info?.retryDelay) delayMs = parseFloat(info.retryDelay) * 1000;
            } catch (_) { }
            if (r.status === 429) {
                if (/limit:\s*0/i.test(msg)) throw new Error('429: this model has no free quota on your key. Try a different MODEL, or enable billing in Google AI Studio.');
                if (attempt < 3) { const w = Math.min(Math.max(delayMs ?? 15000, 5000), 45000); showToast(`Rate limit reached. Retrying in ${Math.round(w / 1000)}s…`); await sleep(w); continue; }
                throw new Error('429 rate limit: ' + (msg || 'too many requests. Wait a minute and try again.'));
            }
            if ([500, 503, 504].includes(r.status) && attempt < 4) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
            throw new Error(`API error ${r.status}${msg ? ': ' + msg : ''}`);
        }
    }

    callGemini = async function (payload) {
        await acquire();
        try {
            const text = (await (await fetchRetry(`${GEN}:generateContent?key=${API_KEY}`, payload)).json()).candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('The AI returned an empty response. Try again.');
            return text;
        } finally { release(); }
    };

    // Streaming: text arrives as the AI writes it, so something shows in seconds instead of after the whole answer
    async function gemStream(payload, onChunk) {
        await acquire();
        try {
            const r = await fetchRetry(`${GEN}:streamGenerateContent?alt=sse&key=${API_KEY}`, payload);
            const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', any = false;
            for (;;) {
                const { done, value } = await reader.read(); if (done) break;
                buf += dec.decode(value, { stream: true }); let i;
                while ((i = buf.indexOf('\n')) >= 0) {
                    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                    if (!line.startsWith('data:')) continue;
                    try { const t = (JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''); if (t) { any = true; onChunk(t); } } catch (_) { }
                }
            }
            if (!any) throw new Error('The AI returned an empty response. Try again.');
        } finally { release(); }
    }

    function clean(html) {
        const d = new DOMParser().parseFromString(html, 'text/html');
        d.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(n => n.remove());
        d.body.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
        return d.body.innerHTML;
    }

    // ----- Reviewer (streamed) -----
    async function streamReviewer() {
        if (!hasSource()) return;
        const myId = uploadId;
        hide($('reviewerEmptyState')); hide(reviewerContainer); show($('reviewerLoadingState'), 'flex'); startLoadingTimer('reviewerTimer');
        const payload = { contents: [{ role: 'user', parts: [{ text: 'Analyze the study material. Extract key academic concepts and definitions. Explicitly ignore metadata like course codes, student names, or syllabus headers. Be concise. Format as an HTML study guide using <h3>, <ul>, <li>, <p>, <strong>. Do not use markdown code blocks.' }, ...sourceParts()] }] };
        let full = '';
        try {
            await gemStream(payload, (chunk) => {
                if (myId !== uploadId) return;
                full += chunk;
                reviewerContainer.innerHTML = clean(full.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, ''));
                hide($('reviewerLoadingState'), 'flex'); show(reviewerContainer);
            });
            if (myId !== uploadId) return;
            currentGeneratedReviewerHTML = reviewerContainer.innerHTML;
            $('currentSessionLabel').textContent = currentUploadedFileName || 'Generated Session';
            saveActionHeader.classList.remove('hidden');
        } catch (e) {
            if (myId !== uploadId) return;
            showToast(e.message || 'Failed to generate reviewer.');
            hide($('reviewerLoadingState'), 'flex');
            if (!full) show($('reviewerEmptyState'));
        }
    }

    // ----- Videos: ask the AI for topics straight from the file (no waiting for the reviewer) -----
    const VID_SCHEMA = { type: 'OBJECT', properties: { topic: { type: 'STRING' }, suggestions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, query: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['title', 'query', 'reason'] } } }, required: ['topic', 'suggestions'] };
    async function smartVideos() {
        if (!hasSource()) return;
        const myId = uploadId;
        hide($('videosEmptyState')); hide(videosContainer, 'flex'); show($('videosLoadingState'), 'flex');
        const payload = { contents: [{ role: 'user', parts: [{ text: 'Identify the main topic of the study material and suggest 4 specific YouTube search queries (3-8 words each) that would help a student learn more. Give each a short title and one sentence on why it helps.' }, ...sourceParts()] }], generationConfig: { responseMimeType: 'application/json', responseSchema: VID_SCHEMA } };
        try {
            const data = JSON.parse((await callGemini(payload)).replace(/```json|```/gi, '').trim());
            if (myId !== uploadId) return;
            await attachVideos(data);
            if (myId !== uploadId) return;
            renderVideos(data);
        } catch (e) {
            if (myId !== uploadId) return;
            showToast(e.message || 'Failed to suggest videos.');
            hide($('videosLoadingState'), 'flex'); show($('videosEmptyState'));
        }
    }

    // ----- Real YouTube videos (with a visible reason + a backup source when YouTube's API fails) -----
    console.info('EduMaxxing patch v3 loaded');
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function ytMessage(e) {
        const m = (e.message || '').toLowerCase();
        if (e.reason === 'keyInvalid' || m.includes('api key not valid')) return 'Your YouTube key is invalid. Check YT_API_KEY in config.js.';
        if (e.reason === 'accessNotConfigured' || m.includes('has not been used') || m.includes('disabled')) return 'YouTube Data API v3 is not enabled for your key. Turn it on in Google Cloud (APIs & Services > Library).';
        if (e.reason === 'quotaExceeded' || m.includes('quota')) return 'Your YouTube daily quota is used up. It resets daily.';
        if (m.includes('referer')) return 'Your YouTube key is restricted to other website addresses. Allow this page\'s address in Google Cloud, or open the page from http://localhost.';
        return 'YouTube said: ' + (e.message || 'unknown error').slice(0, 140);
    }

    // Backup: public Piped search (no key). Best effort: instances come and go.
    const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
    async function backupLookup(q) {
        for (const base of PIPED) {
            try {
                const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
                const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`, { signal: ctl.signal }); clearTimeout(t);
                if (!r.ok) continue;
                const v = ((await r.json()).items || []).find(x => x.url && x.url.includes('watch?v='));
                const id = v && new URL(v.url, 'https://x').searchParams.get('v');
                if (id) return { id, title: esc(v.title), channel: esc(v.uploaderName), thumb: v.thumbnail || '' };
            } catch (_) { }
        }
        return null;
    }

    attachVideos = async function (data) {
        const key = YT_API_KEY || (typeof CONFIG === 'object' && Object.entries(CONFIG).find(([k, v]) => /yt|youtube/i.test(k) && v) || [])[1];
        let reason = key ? '' : 'No YouTube key found. Add YT_API_KEY to config.js.';
        const results = await Promise.all(data.suggestions.map(async (item) => {
            if (key) {
                try {
                    const p = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '1', q: item.query, safeSearch: 'strict', videoEmbeddable: 'true', key });
                    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p), j = await r.json();
                    if (!r.ok) throw Object.assign(new Error(j.error?.message || 'request failed'), { reason: j.error?.errors?.[0]?.reason });
                    const v = j.items && j.items[0];
                    if (v && v.id && v.id.videoId) return { id: v.id.videoId, title: v.snippet.title, channel: v.snippet.channelTitle, thumb: v.snippet.thumbnails?.medium?.url || '' };
                } catch (e) { console.error('YouTube lookup failed:', e); reason = reason || ytMessage(e); }
            }
            return backupLookup(item.query);   // keyless backup so you still get real videos
        }));
        data.suggestions.forEach((it, i) => { if (results[i]) it.video = results[i]; });
        data._note = data.suggestions.some(it => !it.video) ? (reason || 'No matching video was found for some topics.') : '';
    };

    // Show the reason inside the Videos tab (toasts disappear too fast to read)
    const baseRenderVideos = renderVideos;
    renderVideos = function (data) {
        baseRenderVideos(data);
        if (!data._note) return;
        const b = document.createElement('div');
        b.className = 'text-sm p-3 rounded-xl border border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200';
        b.innerHTML = '<b>Showing search links for some topics.</b> ' + esc(data._note);
        videosContainer.insertBefore(b, videosContainer.children[1] || null);
    };

    // ----- Upload: start reviewer, quiz and videos at the same time -----
    finalizeUpload = function (name, type, icon, isImg) {
        hide(uploadArea); show(previewContainer, 'flex');
        if (!isImg) { hide(imagePreview); show(fileCard, 'flex'); fileName.textContent = name; fileMeta.textContent = type; fileIcon.textContent = icon; }
        hide(quizContainer, 'flex'); show($('quizEmptyState')); hide(scoreDisplay, 'flex');
        hide(videosContainer, 'flex'); show($('videosEmptyState'));
        generateQuizBtn.disabled = false; generateVideosBtn.disabled = false;
        switchTab('reviewer');
        streamReviewer(); generateQuizFromNotes(); smartVideos();
    };

    // ----- Timers: one per loading screen, so they no longer cancel each other -----
    const started = {}; let ticker = null;
    function tick() {
        Object.keys(started).forEach(id => {
            const el = $(id), secs = Math.floor((Date.now() - started[id]) / 1000);
            const box = el && el.closest('[id$="LoadingState"]');
            if (!el || (box && box.classList.contains('hidden'))) {   // loading screen closed: save how long it took
                try { localStorage.setItem('edu_avg_' + id, String(Math.round((+localStorage.getItem('edu_avg_' + id) || secs) * 0.5 + secs * 0.5))); } catch (_) { }
                delete started[id]; return;
            }
            el.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
        });
        if (!Object.keys(started).length) { clearInterval(ticker); ticker = null; }
    }
    startLoadingTimer = function (id) {
        started[id] = Date.now();
        const el = $(id), avg = +localStorage.getItem('edu_avg_' + id);
        if (el) { el.textContent = '00:00'; if (avg && el.previousElementSibling) el.previousElementSibling.textContent = `Usually about ${avg} seconds`; }
        if (!ticker) ticker = setInterval(tick, 500);
    };
    stopLoadingTimer = function () { };
})();

// ---------- 3) "Save to Subject": create a new subject right in the Save window ----------
(function () {
    const sel = saveSubjectSelect;
    const wrap = document.createElement('div');
    wrap.id = 'saveNewSubjectWrap'; wrap.className = 'hidden mb-6';
    wrap.innerHTML = '<label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">New subject name</label>' +
        '<input type="text" id="saveNewSubjectInput" maxlength="60" placeholder="e.g., Data Structures" class="ios-input">';
    sel.insertAdjacentElement('afterend', wrap);
    const input = wrap.querySelector('input');
    const sync = () => wrap.classList.toggle('hidden', sel.value !== '__new__');

    // Runs after script.js has filled the list: add the "create new" choice (and pick it when there are no subjects yet)
    openSaveModalBtn.addEventListener('click', () => {
        sel.appendChild(new Option('+ Create new subject…', '__new__'));
        if (!savedSubjects.length) sel.value = '__new__';
        input.value = ''; sync();
        if (sel.value === '__new__') setTimeout(() => input.focus(), 300);
    });
    sel.addEventListener('change', () => { sync(); if (sel.value === '__new__') input.focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('confirmSaveBtn').click(); } });

    // Before script.js saves: create the subject, then let its normal save run with the new subject selected
    saveModalOverlay.addEventListener('click', (e) => {
        if (!e.target.closest('#confirmSaveBtn') || sel.value !== '__new__') return;
        const name = input.value.trim();
        if (!name) { e.stopPropagation(); showToast('Type a name for your new subject.'); input.focus(); return; }
        const existing = savedSubjects.find(s => s.toLowerCase() === name.toLowerCase());
        const finalName = existing || name;
        if (!existing) savedSubjects.push(finalName);
        sel.insertBefore(new Option(finalName, finalName), sel.firstChild);
        sel.value = finalName;
    }, true);
})();

// ---------- 4) Hover fill effects: Rename, Delete, Upload New, Save to Subject ----------
(function () {
    const st = document.createElement('style');
    st.textContent = `
    #subjectsGrid > div button, #clearBtn, #openSaveModalBtn {
        transition: background-color .18s ease, color .18s ease, border-color .18s ease, transform .1s ease;
    }
    /* Rename fills blue */
    #subjectsGrid > div button[title="Rename"]:hover, #subjectsGrid > div button[title="Rename"]:focus-visible {
        background: var(--btn-blue) !important; color: #fff !important; border-color: var(--btn-blue) !important;
    }
    /* Delete fills red */
    #subjectsGrid > div button[title="Delete"]:hover, #subjectsGrid > div button[title="Delete"]:focus-visible {
        background: var(--btn-red) !important; color: #fff !important; border-color: var(--btn-red) !important;
    }
    /* Upload New fills red (same as Sign Out) */
    #clearBtn:hover, .dark #clearBtn:hover { background: var(--btn-red); color: #fff; border-color: var(--btn-red); filter: none; }
    /* Save to Subject fills blue */
    #openSaveModalBtn:hover { background: var(--btn-blue) !important; color: #fff !important; filter: none; }`;
    document.head.appendChild(st);
})();