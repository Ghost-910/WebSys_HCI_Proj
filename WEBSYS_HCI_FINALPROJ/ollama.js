(function () {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    const OLLAMA_URL = 'http://localhost:11434';
    const TEXT_MODEL = 'gemma4:e4b-it-qat';       
    const VISION_MODEL = 'gemma4:e4b-it-qat';   
    const NUM_CTX = 12288;                 
    const MAX_PARALLEL = 1;                
    const MAX_CHARS = Math.floor(NUM_CTX * 2.6);

    // Updated to catch both Qwen and Gemma 2/4 internal thought formatting
    const stripThink = (t) => t.replace(/<\|channel>thought\\n[\s\S]*?(?=\[Final answer\]|<\|)/g, '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();
    
    const lower = (s) => Array.isArray(s) ? s.map(lower) : (s && typeof s === 'object')
        ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v)])) : s;

    let active = 0; const queue = [];
    const acquire = () => new Promise(r => { const go = () => { active++; r(); }; active < MAX_PARALLEL ? go() : queue.push(go); });
    const release = () => { active--; const n = queue.shift(); if (n) n(); };

    // PDFs: Ollama can't read them, so read the text in the browser 
    const pdfCache = new Map();
    async function loadPdfJs() {
        if (window.pdfjsLib) return;
        await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF reader (it needs internet once).'));
            document.head.appendChild(s);
        });
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    function readPdf(b64) {
        const key = b64.length + ':' + b64.slice(0, 64);
        if (pdfCache.has(key)) return pdfCache.get(key);
        const p = (async () => {
            await loadPdfJs();
            const bin = atob(b64), bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            let text = ''; const n = Math.min(pdf.numPages, 60);
            for (let i = 1; i <= n; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); text += tc.items.map(x => x.str).join(' ') + '\n'; }
            if (text.replace(/\s/g, '').length >= 200) return { text, images: [] };
            const images = [];                                   
            for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
                const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1.4 }), c = document.createElement('canvas');
                c.width = vp.width; c.height = vp.height;
                await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                images.push(c.toDataURL('image/jpeg', 0.7).split(',')[1]);
            }
            return { text: '', images };
        })();
        p.catch(() => pdfCache.delete(key));
        pdfCache.set(key, p); return p;
    }

// Turn the app's Gemini-style request into an Ollama request 
async function build(payload, stream) {
    const parts = (payload.contents || []).flatMap(c => c.parts || []);
    let instr = '', material = '', images = [];
    for (const p of parts) {
        if (p.inlineData) {
            if (p.inlineData.mimeType === 'application/pdf') { const r = await readPdf(p.inlineData.data); material += r.text + '\n'; images.push(...r.images); }
            else images.push(p.inlineData.data);
        } else if (typeof p.text === 'string') {
            if (p.text.startsWith('STUDY MATERIAL:')) material += p.text.slice(15) + '\n'; else instr += p.text + '\n';
        }
    }
    material = material.trim().slice(0, MAX_CHARS);
    const schema = payload.generationConfig && payload.generationConfig.responseSchema;
    
    // STRICT FORMATTING OVERRIDE
    let formatInstructions = schema 
        ? '\n\nCRITICAL: Reply with JSON only, matching the required structure. No markdown formatting or conversational text.' 
        : '\n\nCRITICAL: Do NOT use LaTeX, math blocks, or special formatting tags like $ or \\to. Use standard keyboard characters only (e.g., -> for arrows, ^ for exponents).';

    const content = (material ? `STUDY MATERIAL:\n${material}\n\n---\n` : '') + instr.trim() + formatInstructions;
    const msg = { role: 'user', content }; if (images.length) msg.images = images;

    const systemPrompt = schema
        ? 'You are a strict academic assistant. Extract information ONLY from the provided study material. Explicitly ignore metadata like course codes, student names, dates, or syllabus headers. Reply with valid JSON only, matching the required schema. No markdown code blocks or conversational text.'
        : 'You are a strict academic professor. Analyze the provided study material and extract key academic concepts accurately. Explicitly ignore metadata like course codes, student names, dates, or syllabus headers. CRITICAL RULES: 1. Rely ONLY on the exact content visible in the provided text or image—do NOT invent outside examples. 2. NO LaTeX or dollar signs ($); write math and symbols as plain text (e.g., -> for arrows, ^ for exponents). 3. Output ONLY the requested HTML study guide using <h3>, <ul>, <li>, <p>, <strong> with NO conversational filler and NO markdown code blocks.';

    return {
        model: images.length ? VISION_MODEL : TEXT_MODEL, stream,
        messages: [{ role: 'system', content: systemPrompt }, msg],
        ...(schema ? { format: lower(schema) } : {}),
        options: { num_ctx: NUM_CTX, temperature: 0.25 }, keep_alive: '30m'
    };
}

    async function post(body) {
        let r;
        try { r = await fetch(OLLAMA_URL + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
        catch (e) { throw new Error(`Can't reach Ollama at ${OLLAMA_URL}. Make sure Ollama is running and allows this page (set OLLAMA_ORIGINS=* and restart it).`); }
        if (!r.ok) {
            let m = ''; try { m = (await r.json()).error || ''; } catch (_) { }
            if (r.status === 404 || /not found/i.test(m)) throw new Error(`Model “${body.model}” is not installed. Run:  ollama pull ${body.model}`);
            throw new Error('Ollama error ' + r.status + (m ? ': ' + m.slice(0, 140) : ''));
        }
        return r;
    }

  // Save the original Gemini functions as backups 
  const originalCallGemini = window.callGemini;
  const originalGemStream = window.gemStream;

  // Replace the functions with an Automatic Fallback system 
  window.callGemini = async function (payload) {
      await acquire();
      try {
          const j = await (await post(await build(payload, false))).json();
          let t = stripThink((j.message && j.message.content) || '').trim();
          
          const schema = payload.generationConfig && payload.generationConfig.responseSchema;
          if (schema) {
              const isArray = schema.type === 'ARRAY' || schema.type === 'array';
              const match = isArray ? t.match(/\[[\s\S]*\]/) : t.match(/\{[\s\S]*\}/);
              if (match) t = match[0];
          }

          if (!t) throw new Error('Empty answer from Ollama');
          return t;
        } catch (error) {
            console.warn("Ollama failed. Rerouting to Gemini...", error);
            return await originalCallGemini(payload); // Trigger the backup!
        } finally { 
            release(); 
        }
  };

  window.gemStream = async function (payload, onChunk) {   
      await acquire();
      try {
          const r = await post(await build(payload, true));
          const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', raw = '', sent = 0, any = false;
          for (;;) {
              const { done, value } = await reader.read(); if (done) break;
              buf += dec.decode(value, { stream: true }); let i;
              while ((i = buf.indexOf('\n')) >= 0) {
                  const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
                  try {
                      const piece = (JSON.parse(line).message || {}).content || ''; if (!piece) continue;
                      raw += piece;
                      const clean = stripThink(raw).replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/, '');
                      if (clean.length > sent) { onChunk(clean.slice(sent)); sent = clean.length; any = true; }
                  } catch (_) { }
              }
          }
          if (!any) throw new Error('Empty answer from Ollama');
        } catch (error) {
            console.warn("Ollama failed. Rerouting to Gemini stream...", error);
            await originalGemStream(payload, onChunk); // Trigger the backup!
        } finally { 
            release(); 
        }
  };

   
  setTimeout(() => {
    fetch(OLLAMA_URL + '/api/tags').then(r => r.json()).then(j => {
        const names = (j.models || []).map(m => m.name);
        if (!names.some(n => n === TEXT_MODEL || n.startsWith(TEXT_MODEL)))
            console.info(`[AI] Ollama model "${TEXT_MODEL}" not installed. Using Gemini cloud fallback.`);
    }).catch(() => {
        console.info('[AI] Local Ollama offline. Using Gemini cloud fallback.');
    });
}, 1500);
  console.info('EduMaxxing: configured with Ollama (Primary) and Gemini (Backup)');
})();