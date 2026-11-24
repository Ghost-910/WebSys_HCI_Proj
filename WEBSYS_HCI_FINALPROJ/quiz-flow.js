(function () {
    let quizOrigin = 'reader';        
    let readerRecordOnly = false;     

    function setLabel(btn, text) {
        const t = [...btn.childNodes].reverse().find(n => n.nodeType === 3);
        if (t) t.textContent = ' ' + text + ' '; else btn.append(text);
    }

    // Bottom bar highlight: pages opened from a subject stay under "Subjects"
    updateBottomNav = function (view) {
        const btns = { home: getEl('navHomeBtn'), subjects: getEl('navSubjectsBtn'), reviewers: getEl('navReviewersBtn'), profile: getEl('navProfileBtn') };
        let navKey = view;
        if (view === 'mastery') navKey = 'reviewers';
        else if (view === 'standaloneQuiz') navKey = 'reviewers';   // taking a quiz always lives under the Quizzes tab
        else if (view === 'reviewers') navKey = savedMaterialReturnView === 'subjects' ? 'subjects' : 'reviewers';
        Object.keys(btns).forEach(k => { if (btns[k]) btns[k].className = (k === navKey) ? 'active' : ''; });
        const nav = btns.home && btns.home.parentElement, pill = nav && nav.querySelector('.bnav-pill');
        if (pill && btns[navKey]) { nav.style.setProperty('--i', Object.keys(btns).indexOf(navKey)); pill.style.opacity = '1'; }
        else if (pill) pill.style.opacity = '0';
    };

    // Reviewer page. recordOnly = show just the quiz record (no reviewer text)
    window.loadSavedMaterial = function (id, returnView, subject, recordOnly) {
        const item = savedMaterials.find(m => m.id === id); if (!item) return;
        readerRecordOnly = !!recordOnly;
        currentMaterialId = item.id; pendingQuizResult = item.quizResult || null;
        savedMaterialReturnView = returnView || 'subjects'; savedMaterialReturnSubject = subject || null;

        getEl('savedReviewerTitle').textContent = item.title || 'Saved Reviewer';
        getEl('savedReviewerSubject').textContent = item.subject || 'Uncategorized';
        getEl('savedReviewerContent').innerHTML = item.reviewerHTML || '<p>No reviewer available.</p>';
        generatedQuizData = item.quizData || [];
        renderSavedQuizAttempts(item);

        // reviewer text hidden in record-only mode
        recordOnly ? hide(getEl('savedReviewerContent')) : show(getEl('savedReviewerContent'));
        const sec = getEl('savedQuizAttempts').parentElement;
        ['border-t', 'mt-8', 'pt-8'].forEach(c => sec.classList.toggle(c, !recordOnly));
        setLabel(getEl('backToSubjectsFromReaderBtn'), recordOnly ? 'Back to Quizzes' : 'Back to Subject');

        const rb = getEl('retakeQuizFromReviewerBtn');
        if (rb) {
            rb.textContent = (item.quizAttempts && item.quizAttempts.length) ? 'Retake Quiz' : 'Take Quiz';
            (item.quizData && item.quizData.length) ? rb.classList.remove('hidden') : rb.classList.add('hidden');
        }
        switchMainView('reviewers'); show(getEl('savedReviewerReader'));
    };

    // Quiz page. 'mastery' = opened from the Quizzes page; anything else = opened from a reviewer page
    window.localSavedMaterial = function (id, returnView) {
        const item = savedMaterials.find(m => m.id === id);
        if (!item || !item.quizData || !item.quizData.length) return showToast('Quiz not available.');
        currentMaterialId = item.id; generatedQuizData = item.quizData;
        if (returnView === 'mastery') { quizOrigin = 'list'; savedMaterialReturnView = 'mastery'; savedMaterialReturnSubject = null; }
        else quizOrigin = 'reader';                    // keep the original return page (e.g. the subject) untouched
        setLabel(getEl('backToReviewerFromQuizBtn'), quizOrigin === 'list' ? 'Return to Quiz Record' : 'Return to Reviewer and Quiz Record');
        switchMainView('standaloneQuiz'); renderStandaloneQuizUI();
    };

    // Replace the old button handlers (they would send everything to the same page)
    getEl('savedReviewerReader').addEventListener('click', (e) => {
        if (!e.target.closest('#retakeQuizFromReviewerBtn')) return;
        e.stopPropagation();
        localSavedMaterial(currentMaterialId, readerRecordOnly ? 'mastery' : 'reader');
    }, true);

    getEl('viewStandaloneQuiz').addEventListener('click', (e) => {
        if (!e.target.closest('#backToReviewerFromQuizBtn')) return;
        e.stopPropagation();
        loadSavedMaterial(currentMaterialId, savedMaterialReturnView, savedMaterialReturnSubject, quizOrigin === 'list');
    }, true);

    // Confirmation / rename pop-up (same look as the other pop-ups) 
    const ov = document.createElement('div');
    ov.id = 'dialogModalOverlay';
    ov.className = 'fixed inset-0 bg-black/50 z-[70] hidden backdrop-blur-sm flex items-center justify-center transition-opacity opacity-0';
    ov.innerHTML = `<div class="ios-card w-full max-w-md p-6 transform scale-95 transition-transform duration-300 mx-4">
        <h3 id="dialogTitle" class="text-xl font-bold text-gray-900 dark:text-white mb-2"></h3>
        <p id="dialogMsg" class="text-sm text-gray-500 dark:text-gray-400 mb-4"></p>
        <input id="dialogInput" type="text" maxlength="40" class="ios-input mb-5 hidden">
        <div class="flex gap-3 justify-end">
            <button id="cancelDialogBtn" type="button" class="ios-btn bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Cancel</button>
            <button id="okDialogBtn" type="button" class="ios-btn ios-btn-blue">OK</button>
        </div></div>`;
    document.body.appendChild(ov);
    const dTitle = getEl('dialogTitle'), dMsg = getEl('dialogMsg'), dInput = getEl('dialogInput'), dOk = getEl('okDialogBtn'), dCancel = getEl('cancelDialogBtn');

    // Resolves to true (confirm), the typed text (prompt), or null (cancelled / Esc / clicked outside)
    function dialog({ title, message = '', input = null, okText = 'OK', danger = false }) {
        return new Promise(resolve => {
            dTitle.textContent = title; dMsg.textContent = message; dMsg.classList.toggle('hidden', !message);
            dInput.classList.toggle('hidden', input === null); if (input !== null) dInput.value = input;
            dOk.textContent = okText; dOk.className = 'ios-btn ' + (danger ? 'ios-btn-red' : 'ios-btn-blue');
            const done = (v) => { dOk.onclick = dCancel.onclick = dInput.onkeydown = null; closeModal(ov); resolve(v); };
            dOk.onclick = () => done(input === null ? true : dInput.value.trim());
            dCancel.onclick = () => done(null);
            dInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); dOk.click(); } };
            openModal(ov);
            setTimeout(() => { if (input !== null) { dInput.focus(); dInput.select(); } else dCancel.focus(); }, 80);
        });
    }

    // Quiz record: collapsed by default, expand to see results, rename, delete
    const expanded = new Set(); let shownFor = null;
    const defaultName = (i) => 'Attempt ' + (i + 1);

    renderSavedQuizAttempts = function (item) {
        const box = getEl('savedQuizAttempts'); if (!box) return;
        if (shownFor !== item.id) { expanded.clear(); shownFor = item.id; }
        const attempts = item.quizAttempts || [];
        if (!item.quizData || !attempts.length) {
            box.innerHTML = '<p class="text-sm text-gray-500">No answered quiz attempts yet. Take the quiz to start your record.</p>'; return;
        }
        box.innerHTML = attempts.map((a, i) => {
            const open = expanded.has(i);
            const details = item.quizData.map((q, qi) => {
                const sel = a.answers ? a.answers[qi] : undefined, ok = sel === q.correctAnswerIndex;
                return `<div class="border-t border-gray-200 dark:border-gray-700 pt-4"><p class="font-semibold mb-2">${qi + 1}. ${escapeHTML(q.question)}</p>` +
                    (sel === undefined ? '<p class="text-sm text-gray-500">No answer</p>'
                        : `<p class="text-sm ${ok ? 'text-green-600' : 'text-red-500'}">Your answer: ${escapeHTML(q.options[sel])} ${ok ? '✓ Correct' : '✗'}</p>`) +
                    (ok ? '' : `<p class="text-sm text-green-600 mt-1">Correct answer: ${escapeHTML(q.options[q.correctAnswerIndex])}</p>`) +
                    `<p class="text-sm text-gray-500 mt-1">${escapeHTML(q.explanation || '')}</p></div>`;
            }).join('');
            return `<div class="ios-card p-4 attempt" data-i="${i}">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="font-bold text-gray-900 dark:text-white truncate min-w-0">${escapeHTML(a.name || defaultName(i))}</h4>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="ios-btn ios-btn-sm ios-btn-blue" data-act="toggle" aria-expanded="${open}">${open ? 'Collapse' : 'Expand'}</button>
                        <button type="button" class="ios-btn ios-btn-sm bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200" data-act="rename">Rename</button>
                        <button type="button" class="ios-btn ios-btn-sm ios-btn-tint" data-act="delete">Delete</button>
                    </div>
                </div>
                <div class="attempt-body ${open ? '' : 'hidden'} space-y-4 mt-4">
                    <p class="text-sm font-semibold text-blue-500">Score: ${a.correctCount}/${a.totalQuestions} · ${escapeHTML(a.gradedAt || '')}</p>${details}
                </div></div>`;
        }).join('');
    };

    function bestResult(item) {
        const list = item.quizAttempts || []; if (!list.length) return null;
        const b = list.reduce((x, y) => (y.correctCount > x.correctCount ? y : x));
        return { correctCount: b.correctCount, incorrectCount: b.incorrectCount, totalQuestions: b.totalQuestions, gradedAt: b.gradedAt };
    }

    getEl('savedQuizAttempts').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const card = b.closest('.attempt'), i = +card.dataset.i;
        const item = savedMaterials.find(m => m.id === currentMaterialId), a = item && item.quizAttempts[i]; if (!a) return;

        if (b.dataset.act === 'toggle') {
            const open = card.querySelector('.attempt-body').classList.toggle('hidden') === false;
            open ? expanded.add(i) : expanded.delete(i);
            b.textContent = open ? 'Collapse' : 'Expand'; b.setAttribute('aria-expanded', open);
        } else if (b.dataset.act === 'rename') {
            const v = await dialog({ title: 'Rename attempt', message: 'Give this attempt a name you will recognise.', input: a.name || defaultName(i), okText: 'Save' });
            if (v === null) return;
            if (v && v !== defaultName(i)) a.name = v; else delete a.name;
            syncUserStorage(); renderSavedQuizAttempts(item); showToast('Attempt renamed.');
        } else if (b.dataset.act === 'delete') {
            const ok = await dialog({ title: 'Delete this attempt?', message: `“${a.name || defaultName(i)}” and its results will be permanently removed.`, okText: 'Delete', danger: true });
            if (!ok) return;
            item.quizAttempts.splice(i, 1); expanded.clear(); item.quizResult = bestResult(item);
            syncUserStorage(); renderSavedQuizAttempts(item);
            const rb = getEl('retakeQuizFromReviewerBtn');
            if (rb && item.quizData && item.quizData.length) rb.textContent = item.quizAttempts.length ? 'Retake Quiz' : 'Take Quiz';
            showToast('Attempt deleted.');
        }
    });

    // Deleting a whole saved session from the Quizzes page also asks first (with the same pop-up)
    window.removeMaterial = async function (id) {
        const m = savedMaterials.find(x => x.id === id); if (!m) return;
        const ok = await dialog({ title: 'Delete this study session?', message: `“${m.title || 'Saved session'}” will be removed with its reviewer and every quiz attempt. This can't be undone.`, okText: 'Delete', danger: true });
        if (!ok) return;
        savedMaterials = savedMaterials.filter(x => x.id !== id);
        syncUserStorage(); renderMasteryList(); renderSubjectsGrid(); showToast('Study session removed.');
    };

    //  Saved sessions inside a subject: Open / Edit / Delete 
    const rowStyle = document.createElement('style');
    rowStyle.textContent = `
    .session-row [data-act] { transition: background-color .18s ease, color .18s ease, border-color .18s ease; }
    .session-row [data-act="edit"]:hover { background: var(--btn-blue) !important; color: #fff !important; border-color: var(--btn-blue) !important; }
    .session-row [data-act="delete"]:hover { background: var(--btn-red); color: #fff; border-color: var(--btn-red); filter: none; }`;
    document.head.appendChild(rowStyle);

    // Edit pop-up: rename a session and/or move it to another subject
    const em = document.createElement('div');
    em.id = 'editSessionModalOverlay';
    em.className = 'fixed inset-0 bg-black/50 z-50 hidden backdrop-blur-sm flex items-center justify-center transition-opacity opacity-0';
    em.innerHTML = `<div class="ios-card w-full max-w-md p-6 transform scale-95 transition-transform duration-300 mx-4">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Edit study session</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Change its name, or move it to another subject.</p>
        <label for="editSessionTitle" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Session title</label>
        <input id="editSessionTitle" type="text" maxlength="60" autocomplete="off" class="ios-input mb-4">
        <label for="editSessionSubject" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Subject</label>
        <select id="editSessionSubject" class="ios-input mb-6"></select>
        <div class="flex gap-3 justify-end">
            <button id="cancelEditSessionBtn" type="button" class="ios-btn bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Cancel</button>
            <button id="saveEditSessionBtn" type="button" class="ios-btn ios-btn-blue">Save changes</button>
        </div></div>`;
    document.body.appendChild(em);
    const eTitle = getEl('editSessionTitle'), eSubj = getEl('editSessionSubject'), eOk = getEl('saveEditSessionBtn');
    let editing = null;
    const refreshOk = () => { eOk.disabled = !eTitle.value.trim(); };

    function openEdit(item) {
        editing = item; eTitle.value = item.title || '';
        eSubj.innerHTML = ''; savedSubjects.forEach(s => eSubj.add(new Option(s, s))); eSubj.value = item.subject;
        refreshOk(); openModal(em);
        setTimeout(() => { eTitle.focus(); eTitle.select(); }, 80);
    }
    eTitle.addEventListener('input', refreshOk);
    eTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !eOk.disabled) { e.preventDefault(); eOk.click(); } });
    getEl('cancelEditSessionBtn').addEventListener('click', () => { closeModal(em); editing = null; });
    eOk.addEventListener('click', () => {
        if (!editing) return;
        const t = eTitle.value.trim(); if (!t) return;
        const moved = eSubj.value !== editing.subject;
        editing.title = t; editing.subject = eSubj.value;
        syncUserStorage(); closeModal(em);
        openSubjectDetail(getEl('subjectDetailTitle').textContent); renderSubjectsGrid();
        showToast(moved ? `Moved to “${eSubj.value}”.` : 'Changes saved.');
        editing = null;
    });

    // The list of saved sessions in an open subject, now with Open / Edit / Delete on every row
    window.openSubjectDetail = function (subject) {
        hide(getEl('subjectsMainView')); show(getEl('subjectDetailView'));
        getEl('subjectDetailTitle').textContent = subject;
        const items = savedMaterials.filter(m => m.subject === subject), lst = getEl('savedItemsList');
        lst.innerHTML = items.length === 0
            ? '<div class="ios-card p-8 text-center"><p class="font-semibold text-gray-900 dark:text-white mb-1">Nothing saved here yet</p><p class="text-sm text-gray-500">Make a study session on the Dashboard, then tap “Save to Subject”.</p></div>'
            : items.map(m => {
                const n = (m.quizAttempts || []).length, hasQuiz = !!(m.quizData && m.quizData.length);
                return `<div class="ios-card p-5 flex flex-wrap items-center justify-between gap-3 session-row" data-id="${Number(m.id)}">
                    <div class="min-w-0">
                        <p class="font-bold text-gray-900 dark:text-white truncate">${escapeHTML(m.title || 'Study Session')}</p>
                        <p class="text-xs text-gray-500 mt-0.5">${escapeHTML(m.date || '')} · ${hasQuiz ? 'Reviewer + quiz' + (n ? ` · ${n} attempt${n > 1 ? 's' : ''}` : '') : 'Reviewer only'}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="ios-btn ios-btn-sm ios-btn-blue" data-act="open">Open</button>
                        <button type="button" class="ios-btn ios-btn-sm bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200" data-act="edit">Edit</button>
                        <button type="button" class="ios-btn ios-btn-sm ios-btn-tint" data-act="delete">Delete</button>
                    </div></div>`;
            }).join('');
    };

    getEl('savedItemsList').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const row = b.closest('.session-row'), item = row && savedMaterials.find(m => m.id === +row.dataset.id); if (!item) return;
        const subject = getEl('subjectDetailTitle').textContent;
        if (b.dataset.act === 'open') loadSavedMaterial(item.id, 'subjects', subject);
        else if (b.dataset.act === 'edit') openEdit(item);
        else if (b.dataset.act === 'delete') {
            const n = (item.quizAttempts || []).length, hasQuiz = !!(item.quizData && item.quizData.length);
            const ok = await dialog({
                title: 'Delete this study session?',
                message: `“${item.title || 'Study Session'}” will be permanently removed${hasQuiz ? ' with its quiz' + (n ? ` and ${n} attempt${n > 1 ? 's' : ''}` : '') : ''}. This can't be undone.`,
                okText: 'Delete', danger: true
            });
            if (!ok) return;
            savedMaterials = savedMaterials.filter(m => m.id !== item.id);
            syncUserStorage(); openSubjectDetail(subject); renderSubjectsGrid(); showToast('Study session deleted.');
        }
    });
})();