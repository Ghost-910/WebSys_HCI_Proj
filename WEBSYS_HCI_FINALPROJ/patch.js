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

    const btns = { home: $('navHomeBtn'), subjects: $('navSubjectsBtn'), profile: $('navProfileBtn') };
    const nav = btns.home.parentElement, wrap = nav.parentElement;
    wrap.className = 'bnav-wrap'; nav.className = 'bnav';
    const pill = document.createElement('span'); pill.className = 'bnav-pill'; nav.prepend(pill);

    function setNav(view) {
        Object.entries(btns).forEach(([k, b]) => { b.className = k === view ? 'active' : ''; });
        nav.style.setProperty('--i', Object.keys(btns).indexOf(view));
    }
    const original = switchMainView;
    switchMainView = function (view) {
        original(view); setNav(view);
        const el = { home: viewHome, subjects: viewSubjects, profile: viewProfile }[view];
        el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
    };
    setNav('home');
})();

// ---------- 2) Gemini caller that handles 429 / 503 properly ----------
// - Sends 1 request at a time (no bursts that trip per-minute limits)
// - On 429, waits the delay Google asks for, then retries
// - Shows Google's real error message instead of just "API error 429"
(function () {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let gate = Promise.resolve();

    async function request(payload) {
        if (!API_KEY) throw new Error('Paste your Gemini API key at the top of script.js.');
        for (let attempt = 1; ; attempt++) {
            let r;
            try {
                r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
            } catch (e) {
                if (attempt < 3) { await sleep(2000 * attempt); continue; }
                throw new Error('Network error. Check your internet connection.');
            }
            if (r.ok) {
                const text = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('The AI returned an empty response. Try again.');
                return text;
            }
            let msg = '', delayMs = null;
            try {
                const err = (await r.json()).error || {};
                msg = (err.message || '').split('\n')[0].slice(0, 160);
                const info = (err.details || []).find(d => String(d['@type']).includes('RetryInfo'));
                if (info?.retryDelay) delayMs = parseFloat(info.retryDelay) * 1000;
            } catch (_) { }

            if (r.status === 429) {
                if (/limit:\s*0/i.test(msg)) throw new Error('429: this model has no free quota on your key. Try a different MODEL, or enable billing in Google AI Studio.');
                if (attempt < 3) {
                    const wait = Math.min(Math.max(delayMs ?? 15000, 5000), 45000);
                    showToast(`Rate limit reached. Retrying in ${Math.round(wait / 1000)}s…`);
                    await sleep(wait); continue;
                }
                throw new Error('429 rate limit: ' + (msg || 'too many requests. Wait a minute and try again.'));
            }
            if ([500, 503, 504].includes(r.status) && attempt < 4) { await sleep(2000 * 2 ** (attempt - 1)); continue; }
            throw new Error(`API error ${r.status}${msg ? ': ' + msg : ''}`);
        }
    }

    callGemini = function (payload) {
        const run = gate.then(() => request(payload));
        gate = run.catch(() => { });
        return run;
    };
})();