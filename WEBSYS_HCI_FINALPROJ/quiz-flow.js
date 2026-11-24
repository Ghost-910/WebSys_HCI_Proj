(function () {
    let quizOrigin = 'reader';
    let readerRecordOnly = false;

    function setLabel(btn, text) {
        const t = [...btn.childNodes].reverse().find(n => n.nodeType === 3);
        if (t) t.textContent = ' ' + text + ' '; else btn.append(text);
    }

    // Quiz switcher styles
    const qSwStyle = document.createElement('style');
    qSwStyle.textContent = `
    .quiz-switcher { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 1rem; }
    .quiz-pill { min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1.5px solid var(--line);
        font-size: 13px; font-weight: 600; color: var(--ios-label); transition: background-color .15s, border-color .15s, color .15s; }
    .quiz-pill:hover { border-color: var(--btn-blue); background: rgba(10, 132, 255, .08); }
    .quiz-pill.on { background: var(--btn-blue); border-color: var(--btn-blue); color: #fff; }
    .quiz-meta-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 1rem; }`;
    document.head.appendChild(qSwStyle);

    // Inject quiz switcher right above #savedQuizAttempts (no index.html edit needed)
    const attemptsBox = getEl('savedQuizAttempts');
    let switcherEl = getEl('savedQuizSwitcher');
    if (attemptsBox && !switcherEl) {
        switcherEl = document.createElement('div');
        switcherEl.id = 'savedQuizSwitcher';
        attemptsBox.before(switcherEl);
    }

    // Bottom bar highlight: pages opened from a subject stay under "Subjects"
    updateBottomNav = function (view) {
        const btns = { home: getEl('navHomeBtn'), subjects: getEl('navSubjectsBtn'), reviewers: getEl('navReviewersBtn'), profile: getEl('navProfileBtn') };
        let navKey = view;
        if (view === 'mastery') navKey = 'reviewers';
        else if (view === 'standaloneQuiz') navKey = 'reviewers';
        else if (view === 'reviewers') navKey = savedMaterialReturnView === 'subjects' ? 'subjects' : 'reviewers';
        Object.keys(btns).forEach(k => { if (btns[k]) btns[k].className = (k === navKey) ? 'active' : ''; });
        const nav = btns.home && btns.home.parentElement, pill = nav && nav.querySelector('.bnav-pill');
        if (pill && btns[navKey]) { nav.style.setProperty('--i', Object.keys(btns).indexOf(navKey)); pill.style.opacity = '1'; }
        else if (pill) pill.style.opacity = '0';
    };

    function updateRetakeBtn(activeQuiz) {
        const rb = getEl('retakeQuizFromReviewerBtn');
        if (!rb) return;
        if (activeQuiz && activeQuiz.quizData && activeQuiz.quizData.length) {
            rb.textContent = (activeQuiz.quizAttempts && activeQuiz.quizAttempts.length) ? 'Retake Quiz' : 'Take Quiz';
            rb.classList.remove('hidden');
        } else {
            rb.classList.add('hidden');
        }
    }

    function renderQuizSwitcher(item) {
        if (!switcherEl) return;
        normalizeMaterial(item);
        const list = item.quizzes || [];
        if (!list.length) {
            switcherEl.innerHTML = '';
            return;
        }
        const active = getQuizById(item, currentQuizId);
        currentQuizId = active.id;

        const pills = list.map((q, idx) => {
            const on = q.id === active.id;
            const best = (q.quizAttempts && q.quizAttempts.length)
                ? Math.max.apply(Math, q.quizAttempts.map(a => a.correctCount))
                : (q.quizResult ? q.quizResult.correctCount : null);
            const badge = best !== null ? ` · ${best}/${q.quizData.length}` : '';
            return `<button type="button" class="quiz-pill ${on ? 'on' : ''}" data-qid="${q.id}">${escapeHTML(q.title || ('Quiz ' + (idx + 1)))}${badge}</button>`;
        }).join('');

        switcherEl.innerHTML = `
            <div class="quiz-switcher" role="tablist" aria-label="Saved quizzes">${pills}</div>
            <div class="quiz-meta-actions">
                <span class="text-xs text-gray-500 dark:text-gray-400 mr-auto">${escapeHTML(active.title)} · ${active.quizData.length} questions</span>
                <button type="button" class="ios-btn ios-btn-sm bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200" data-qact="rename-quiz">Rename quiz</button>
                <button type="button" class="ios-btn ios-btn-sm ios-btn-tint" data-qact="delete-quiz">Delete quiz</button>
            </div>`;
    }

    // Reviewer page. recordOnly = show just the quiz record (no reviewer text)
    window.loadSavedMaterial = function (id, returnView, subject, recordOnly, quizId) {
        const item = savedMaterials.find(m => m.id === id); if (!item) return;
        normalizeMaterial(item);
        readerRecordOnly = !!recordOnly;
        currentMaterialId = item.id;
        savedMaterialReturnView = returnView || 'subjects';
        savedMaterialReturnSubject = subject || null;

        const activeQuiz = getQuizById(item, quizId || currentQuizId);
        currentQuizId = activeQuiz ? activeQuiz.id : null;
        pendingQuizResult = activeQuiz ? (activeQuiz.quizResult || null) : null;
        generatedQuizData = activeQuiz ? activeQuiz.quizData : [];

        getEl('savedReviewerTitle').textContent = item.title || 'Saved Reviewer';
        getEl('savedReviewerSubject').textContent = item.subject || 'Uncategorized';
        getEl('savedReviewerContent').innerHTML = item.reviewerHTML || '<p>No reviewer available.</p>';

        renderQuizSwitcher(item);
        renderSavedQuizAttempts(item);
        updateRetakeBtn(activeQuiz);

        recordOnly ? hide(getEl('savedReviewerContent')) : show(getEl('savedReviewerContent'));
        const sec = getEl('savedQuizAttempts').parentElement;
        ['border-t', 'mt-8', 'pt-8'].forEach(c => sec.classList.toggle(c, !recordOnly));
        setLabel(getEl('backToSubjectsFromReaderBtn'), recordOnly ? 'Back to Quizzes' : 'Back to Subject');

        switchMainView('reviewers'); show(getEl('savedReviewerReader'));
    };

    // Quiz page. 'mastery' = opened from the Quizzes page; anything else = opened from a reviewer page
    window.localSavedMaterial = function (id, returnView, quizId) {
        const item = savedMaterials.find(m => m.id === id);
        if (!item) return showToast('Quiz not available.');
        normalizeMaterial(item);
        const quiz = getQuizById(item, quizId || currentQuizId);
        if (!quiz || !quiz.quizData || !quiz.quizData.length) return showToast('Quiz not available.');

        currentMaterialId = item.id;
        currentQuizId = quiz.id;
        generatedQuizData = quiz.quizData;
        if (returnView === 'mastery') {
            quizOrigin = 'list';
            savedMaterialReturnView = 'mastery';
            savedMaterialReturnSubject = null;
        } else {
            quizOrigin = 'reader';
        }
        setLabel(getEl('backToReviewerFromQuizBtn'), quizOrigin === 'list' ? 'Return to Quiz Record' : 'Return to Reviewer and Quiz Record');
        switchMainView('standaloneQuiz'); renderStandaloneQuizUI();
    };

    // Replace the old button handlers
    getEl('savedReviewerReader').addEventListener('click', (e) => {
        if (!e.target.closest('#retakeQuizFromReviewerBtn')) return;
        e.stopPropagation();
        localSavedMaterial(currentMaterialId, readerRecordOnly ? 'mastery' : 'reader', currentQuizId);
    }, true);

    getEl('viewStandaloneQuiz').addEventListener('click', (e) => {
        if (!e.target.closest('#backToReviewerFromQuizBtn')) return;
        e.stopPropagation();
        loadSavedMaterial(currentMaterialId, savedMaterialReturnView, savedMaterialReturnSubject, quizOrigin === 'list', currentQuizId);
    }, true);

    // Confirmation / rename pop-up
    const ov = document.createElement('div');
    ov.id = 'dialogModalOverlay';
    ov.className = 'fixed inset-0 bg-black/50 z-[70] hidden backdrop-blur-sm flex items-center justify-center transition-opacity opacity-0';
    ov.innerHTML = `<div class="ios-card w-full max-w-md p-6 transform scale-95 transition-transform duration-300 mx-4">
        <h3 id="dialogTitle" class="text-xl font-bold text-gray-900 dark:text-white mb-2"></h3>
        <p id="dialogMsg" class="text-sm text-gray-500 dark:text-gray-400 mb-4"></p>
        <input id="dialogInput" type="text" maxlength="50" class="ios-input mb-5 hidden">
        <div class="flex gap-3 justify-end">
            <button id="cancelDialogBtn" type="button" class="ios-btn bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Cancel</button>
            <button id="okDialogBtn" type="button" class="ios-btn ios-btn-blue">OK</button>
        </div></div>`;
    document.body.appendChild(ov);
    const dTitle = getEl('dialogTitle'), dMsg = getEl('dialogMsg'), dInput = getEl('dialogInput'), dOk = getEl('okDialogBtn'), dCancel = getEl('cancelDialogBtn');

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

    // Quiz switcher clicks (select, rename, delete quiz)
    if (switcherEl) {
        switcherEl.addEventListener('click', async (e) => {
            const item = savedMaterials.find(m => m.id === currentMaterialId);
            if (!item) return;
            normalizeMaterial(item);

            const pill = e.target.closest('[data-qid]');
            if (pill) {
                currentQuizId = pill.dataset.qid;
                const active = getQuizById(item, currentQuizId);
                generatedQuizData = active ? active.quizData : [];
                renderQuizSwitcher(item);
                renderSavedQuizAttempts(item);
                updateRetakeBtn(active);
                return;
            }

            const actBtn = e.target.closest('[data-qact]');
            if (!actBtn) return;
            const active = getQuizById(item, currentQuizId);
            if (!active) return;

            if (actBtn.dataset.qact === 'rename-quiz') {
                const v = await dialog({ title: 'Rename quiz', message: 'Give this quiz a clear name (e.g., Terms, Part 2).', input: active.title || 'Quiz', okText: 'Save' });
                if (!v) return;
                active.title = v;
                syncLegacyMaterialFields(item);
                syncUserStorage();
                renderQuizSwitcher(item);
                renderMasteryList();
                showToast('Quiz renamed.');
            } else if (actBtn.dataset.qact === 'delete-quiz') {
                await window.removeQuizFromMaterial(item.id, active.id, true);
            }
        });
    }

    // Quiz record: collapsed by default, expand to see results, rename, delete
    const expanded = new Set(); let shownFor = null;
    const defaultName = (i) => 'Attempt ' + (i + 1);

    renderSavedQuizAttempts = function (item) {
        const box = getEl('savedQuizAttempts'); if (!box) return;
        normalizeMaterial(item);
        const activeQuiz = getQuizById(item, currentQuizId);
        const key = item.id + ':' + (activeQuiz ? activeQuiz.id : 'none');
        if (shownFor !== key) { expanded.clear(); shownFor = key; }

        if (!activeQuiz || !activeQuiz.quizData || !activeQuiz.quizData.length) {
            box.innerHTML = '<p class="text-sm text-gray-500">No quizzes saved in this session yet.</p>';
            return;
        }
        const attempts = activeQuiz.quizAttempts || [];
        if (!attempts.length) {
            box.innerHTML = '<p class="text-sm text-gray-500">No answered quiz attempts yet. Take this quiz to start your record.</p>';
            return;
        }
        box.innerHTML = attempts.map((a, i) => {
            const open = expanded.has(i);
            const details = activeQuiz.quizData.map((q, qi) => {
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

    function bestResult(quiz) {
        const list = (quiz && quiz.quizAttempts) || []; if (!list.length) return null;
        const b = list.reduce((x, y) => (y.correctCount > x.correctCount ? y : x));
        return { correctCount: b.correctCount, incorrectCount: b.incorrectCount, totalQuestions: b.totalQuestions, gradedAt: b.gradedAt };
    }

    getEl('savedQuizAttempts').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const card = b.closest('.attempt'), i = +card.dataset.i;
        const item = savedMaterials.find(m => m.id === currentMaterialId);
        const quiz = getQuizById(item, currentQuizId);
        const a = quiz && quiz.quizAttempts[i]; if (!a) return;

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
            quiz.quizAttempts.splice(i, 1); expanded.clear(); quiz.quizResult = bestResult(quiz);
            syncLegacyMaterialFields(item);
            syncUserStorage(); renderQuizSwitcher(item); renderSavedQuizAttempts(item); updateRetakeBtn(quiz); renderMasteryList();
            showToast('Attempt deleted.');
        }
    });

    // Delete a single quiz from a session (keeps the reviewer and any other quizzes intact)
    window.removeQuizFromMaterial = async function (materialId, quizId, fromReader) {
        const m = savedMaterials.find(x => x.id === materialId); if (!m) return;
        normalizeMaterial(m);
        const q = m.quizzes.find(x => x.id === quizId); if (!q) return;
        const n = (q.quizAttempts || []).length;
        const ok = await dialog({
            title: 'Delete this quiz?',
            message: `“${q.title}”${n ? ` and its ${n} attempt${n > 1 ? 's' : ''}` : ''} will be removed from “${m.title || 'Saved session'}”. Your reviewer and other quizzes will stay saved.`,
            okText: 'Delete', danger: true
        });
        if (!ok) return;
        m.quizzes = m.quizzes.filter(x => x.id !== quizId);
        if (dashMaterialId === m.id && dashQuizId === quizId) dashQuizId = null;
        syncLegacyMaterialFields(m);
        syncUserStorage(); renderMasteryList(); renderSubjectsGrid();

        if (fromReader && currentMaterialId === m.id) {
            const next = m.quizzes[0] || null;
            currentQuizId = next ? next.id : null;
            generatedQuizData = next ? next.quizData : [];
            if (!next && readerRecordOnly) {
                switchMainView('mastery');
            } else {
                renderQuizSwitcher(m);
                renderSavedQuizAttempts(m);
                updateRetakeBtn(next);
            }
        }
        showToast('Quiz removed.');
    };

    // Delete a whole saved session
    window.removeMaterial = async function (id) {
        const m = savedMaterials.find(x => x.id === id); if (!m) return;
        const ok = await dialog({ title: 'Delete this study session?', message: `“${m.title || 'Saved session'}” will be removed with its reviewer and every saved quiz. This can't be undone.`, okText: 'Delete', danger: true });
        if (!ok) return;
        savedMaterials = savedMaterials.filter(x => x.id !== id);
        if (dashMaterialId === id) { dashMaterialId = null; dashQuizId = null; }
        syncUserStorage(); renderMasteryList(); renderSubjectsGrid(); showToast('Study session removed.');
    };

    // Saved sessions inside a subject: Open / Edit / Delete
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
        openSubjectDetail(getEl('subjectDetailTitle').textContent); renderSubjectsGrid(); renderMasteryList();
        showToast(moved ? `Moved to “${eSubj.value}”.` : 'Changes saved.');
        editing = null;
    });

    // Saved sessions inside an open subject
    window.openSubjectDetail = function (subject) {
        hide(getEl('subjectsMainView')); show(getEl('subjectDetailView'));
        getEl('subjectDetailTitle').textContent = subject;
        const items = savedMaterials.filter(m => m.subject === subject), lst = getEl('savedItemsList');
        lst.innerHTML = items.length === 0
            ? '<div class="ios-card p-8 text-center"><p class="font-semibold text-gray-900 dark:text-white mb-1">Nothing saved here yet</p><p class="text-sm text-gray-500">Make a study session on the Dashboard, then tap “Save to Subject”.</p></div>'
            : items.map(m => {
                normalizeMaterial(m);
                const qCount = m.quizzes.length;
                const aCount = m.quizzes.reduce((s, q) => s + (q.quizAttempts ? q.quizAttempts.length : 0), 0);
                const meta = qCount
                    ? `Reviewer + ${qCount} ${qCount === 1 ? 'quiz' : 'quizzes'}` + (aCount ? ` · ${aCount} attempt${aCount > 1 ? 's' : ''}` : '')
                    : 'Reviewer only';
                return `<div class="ios-card p-5 flex flex-wrap items-center justify-between gap-3 session-row" data-id="${Number(m.id)}">
                    <div class="min-w-0">
                        <p class="font-bold text-gray-900 dark:text-white truncate">${escapeHTML(m.title || 'Study Session')}</p>
                        <p class="text-xs text-gray-500 mt-0.5">${escapeHTML(m.date || '')} · ${meta}</p>
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
        normalizeMaterial(item);
        const subject = getEl('subjectDetailTitle').textContent;
        if (b.dataset.act === 'open') loadSavedMaterial(item.id, 'subjects', subject);
        else if (b.dataset.act === 'edit') openEdit(item);
        else if (b.dataset.act === 'delete') {
            const qCount = item.quizzes.length;
            const aCount = item.quizzes.reduce((s, q) => s + (q.quizAttempts ? q.quizAttempts.length : 0), 0);
            const ok = await dialog({
                title: 'Delete this study session?',
                message: `“${item.title || 'Study Session'}” will be permanently removed${qCount ? ` with ${qCount} ${qCount === 1 ? 'quiz' : 'quizzes'}` + (aCount ? ` and ${aCount} attempt${aCount > 1 ? 's' : ''}` : '') : ''}. This can't be undone.`,
                okText: 'Delete', danger: true
            });
            if (!ok) return;
            savedMaterials = savedMaterials.filter(m => m.id !== item.id);
            if (dashMaterialId === item.id) { dashMaterialId = null; dashQuizId = null; }
            syncUserStorage(); openSubjectDetail(subject); renderSubjectsGrid(); renderMasteryList(); showToast('Study session deleted.');
        }
    });
})();