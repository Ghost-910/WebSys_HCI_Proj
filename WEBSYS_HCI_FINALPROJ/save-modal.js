(function () {
    const ov = getEl('saveModalOverlay'), card = ov.firstElementChild;
    const sel = getEl('saveSubjectSelect'), title = getEl('saveTitleInput'), ok = getEl('confirmSaveBtn');
    const newInput = getEl('saveNewSubjectInput'), openBtn = getEl('openSaveModalBtn');

    // Styles
    const st = document.createElement('style');
    st.textContent = `
    .visually-hidden { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .subj-chips { display: flex; flex-wrap: wrap; gap: 8px; max-height: 9.5rem; overflow-y: auto; padding: 2px; margin-bottom: 1rem; }
    .subj-chip { min-height: 40px; max-width: 100%; padding: 0 14px; border-radius: 999px; border: 1.5px solid var(--line);
        font-size: 14px; font-weight: 600; color: var(--ios-label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        transition: background-color .15s, border-color .15s, color .15s; }
    .subj-chip:hover { border-color: var(--btn-blue); background: rgba(10, 132, 255, .08); }
    .subj-chip.on { background: var(--btn-blue); border-color: var(--btn-blue); color: #fff; }
    .subj-new { border-style: dashed; color: var(--btn-blue); }
    .dark .subj-new { color: #64a8ff; }
    .subj-new.on { color: #fff; }
    .save-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1rem; }
    .sum-chip { font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 999px; }
    .sum-ok { background: rgba(52, 199, 89, .16); color: #1b7f37; }
    .dark .sum-ok { color: #30d158; }
    .sum-warn { background: rgba(255, 159, 10, .18); color: #8a5a00; }
    .dark .sum-warn { color: #ffb340; }
    .save-mode-box { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 1rem; }
    .save-mode-btn { min-height: 42px; padding: 8px 12px; border-radius: 12px; border: 1.5px solid var(--line);
        font-size: 13px; font-weight: 600; color: var(--ios-label); text-align: center;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color .15s, border-color .15s, color .15s; }
    .save-mode-btn:hover { border-color: var(--btn-blue); background: rgba(10, 132, 255, .08); }
    .save-mode-btn.on { background: var(--btn-blue); border-color: var(--btn-blue); color: #fff; }
    .save-mode-box.hidden, .subj-chips.hidden { display: none !important; }`;
    document.head.appendChild(st);

    // Layout
    const h3 = card.querySelector('h3');
    h3.textContent = 'Save study session'; h3.classList.replace('mb-4', 'mb-1');
    const sub = document.createElement('p');
    sub.className = 'text-sm text-gray-500 dark:text-gray-400 mb-4';
    sub.textContent = 'Keep this reviewer and quiz so you can come back to them.';
    h3.after(sub);
    const summary = document.createElement('div'); summary.className = 'save-summary'; sub.after(summary);

    // Mode toggle
    const modeBox = document.createElement('div');
    modeBox.className = 'save-mode-box hidden';
    modeBox.innerHTML = `
        <button type="button" id="saveModeAppendBtn" class="save-mode-btn">Add to existing session</button>
        <button type="button" id="saveModeNewBtn" class="save-mode-btn">Save as new session</button>`;
    summary.after(modeBox);
    const btnAppend = getEl('saveModeAppendBtn');
    const btnNew = getEl('saveModeNewBtn');

    // Append-only fields: target session picker + quiz name
    const appendBox = document.createElement('div');
    appendBox.className = 'hidden mb-5';
    appendBox.innerHTML = `
        <label for="saveTargetSessionSelect" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Add to session</label>
        <select id="saveTargetSessionSelect" class="ios-input mb-4"></select>
        <label for="saveQuizNameInput" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Quiz name</label>
        <input id="saveQuizNameInput" type="text" maxlength="50" autocomplete="off" placeholder="e.g., Quiz 2" class="ios-input">`;
    modeBox.after(appendBox);
    const targetSelect = getEl('saveTargetSessionSelect');
    const quizNameInput = getEl('saveQuizNameInput');

    const labels = [...card.querySelectorAll('label')].filter(l => !appendBox.contains(l) && !l.closest('#saveNewSubjectWrap'));
    const titleLabel = labels[0], subjectLabel = labels[1];
    titleLabel.textContent = 'Session title'; subjectLabel.textContent = 'Subject';
    title.maxLength = 60; title.autocomplete = 'off'; title.classList.replace('mb-4', 'mb-5');

    const chips = document.createElement('div');
    chips.className = 'subj-chips'; chips.setAttribute('role', 'radiogroup'); chips.setAttribute('aria-label', 'Subject');
    sel.before(chips);
    sel.classList.add('visually-hidden'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    card.style.maxHeight = '90vh'; card.style.overflowY = 'auto';

    let currentMode = 'new';
    let targetExisting = null;

    const chip = (kind, text) => `<span class="sum-chip sum-${kind}">${kind === 'ok' ? '✓' : '!'} ${escapeHTML(text)}</span>`;
    const shortText = (s, max = 20) => (s && s.length > max ? s.slice(0, max - 1) + '…' : (s || ''));

    function renderSummary(alreadySavedSameQuiz) {
        const hasReviewer = !!currentGeneratedReviewerHTML;
        const hasQuiz = !!(dashQuizData && dashQuizData.length);
        const quizBusy = !getEl('quizLoadingState').classList.contains('hidden');
        const n = pendingQuizAttempts.length, parts = [];
        parts.push(hasReviewer ? chip('ok', 'Reviewer included') : chip('warn', 'No reviewer yet'));
        parts.push(quizBusy ? chip('warn', 'Quiz is still being made · not included yet')
            : hasQuiz ? chip('ok', 'Quiz included' + (n ? ` · ${n} attempt${n > 1 ? 's' : ''}` : ''))
            : chip('warn', 'No quiz yet · saved without it'));
        if (alreadySavedSameQuiz) {
            parts.push(chip('warn', `This quiz is already saved in “${alreadySavedSameQuiz.title}”. Generate a new quiz to add another one, or save a copy below.`));
        }
        summary.innerHTML = parts.join('');
    }

    function renderChips() {
        chips.innerHTML = '';
        [...sel.options].forEach(o => {
            const isNew = o.value === '__new__', on = o.value === sel.value;
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'subj-chip' + (isNew ? ' subj-new' : '') + (on ? ' on' : '');
            b.textContent = isNew ? '+ New subject' : o.text; b.title = b.textContent;
            b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on));
            b.addEventListener('click', () => { sel.value = o.value; sel.dispatchEvent(new Event('change')); renderChips(); update(); });
            chips.append(b);
        });
    }

    function applyMode(mode) {
        currentMode = mode;
        ov.dataset.saveMode = mode;
        const isAppend = mode === 'append' && !!targetExisting;
        btnAppend.classList.toggle('on', isAppend);
        btnNew.classList.toggle('on', !isAppend);

        appendBox.classList.toggle('hidden', !isAppend);
        titleLabel.classList.toggle('hidden', isAppend);
        title.classList.toggle('hidden', isAppend);
        subjectLabel.classList.toggle('hidden', isAppend);
        chips.classList.toggle('hidden', isAppend);

        const newWrap = getEl('saveNewSubjectWrap');
        if (newWrap) {
            if (isAppend) newWrap.classList.add('hidden');
            else newWrap.classList.toggle('hidden', sel.value !== '__new__');
        }
        h3.textContent = isAppend ? `Add quiz to “${shortText(targetExisting.title, 26)}”` : 'Save study session';
        sub.textContent = isAppend
            ? `This adds a new quiz inside “${targetExisting.title}” (${targetExisting.subject}).`
            : 'Keep this reviewer and quiz so you can come back to them.';
        update();
    }

    function update() {
        if (currentMode === 'append' && targetExisting) {
            ok.disabled = !quizNameInput.value.trim();
            ok.textContent = `Add to “${shortText(targetExisting.title, 18)}”`;
            return;
        }
        const isNew = sel.value === '__new__';
        ok.disabled = !(title.value.trim() && (!isNew || newInput.value.trim()));
        const name = shortText(sel.value, 22);
        ok.textContent = isNew ? 'Create & save' : `Save to “${name}”`;
    }

    targetSelect.addEventListener('change', () => {
        targetExisting = savedMaterials.find(m => m.id === Number(targetSelect.value)) || null;
        if (targetExisting) {
            normalizeMaterial(targetExisting);
            quizNameInput.value = `Quiz ${targetExisting.quizzes.length + 1}`;
        }
        applyMode('append');
    });

    btnAppend.addEventListener('click', () => { applyMode('append'); setTimeout(() => { quizNameInput.focus(); quizNameInput.select(); }, 50); });
    btnNew.addEventListener('click', () => { applyMode('new'); setTimeout(() => { title.focus(); title.select(); }, 50); });

    openBtn.addEventListener('click', () => {
        sel.innerHTML = '';
        savedSubjects.forEach(s => sel.add(new Option(s, s)));
        sel.add(new Option('+ Create new subject...', '__new__'));
        const last = localStorage.getItem('edu_lastSubject');
        sel.value = !savedSubjects.length ? '__new__' : (savedSubjects.includes(last) ? last : savedSubjects[0]);
        sel.dispatchEvent(new Event('change'));

        const baseTitle = currentUploadedFileName ? currentUploadedFileName.replace(/\.[^/.]+$/, '').trim().toLowerCase() : '';
        const byDashId = dashMaterialId !== null ? savedMaterials.find(m => m.id === dashMaterialId) : null;
        const byName = !byDashId && baseTitle
            ? [...savedMaterials].reverse().find(m => (m.title || '').trim().toLowerCase() === baseTitle)
            : null;
        targetExisting = byDashId || byName || (savedMaterials.length ? savedMaterials[savedMaterials.length - 1] : null);

        targetSelect.innerHTML = '';
        [...savedMaterials].reverse().forEach(m => {
            normalizeMaterial(m);
            targetSelect.add(new Option(`${m.title || 'Study Session'} (${m.subject || 'Uncategorized'})`, String(m.id)));
        });
        if (targetExisting) {
            normalizeMaterial(targetExisting);
            targetSelect.value = String(targetExisting.id);
        }

        const hasQuiz = !!(dashQuizData && dashQuizData.length);
        const hasUnsavedQuiz = !!(hasQuiz && !dashQuizId);
        const canAppend = !!(savedMaterials.length > 0 && hasUnsavedQuiz);
        const shouldDefaultAppend = !!(canAppend && (byDashId || byName));
        const alreadySavedSameQuiz = (hasQuiz && dashQuizId && byDashId) ? byDashId : null;

        renderSummary(alreadySavedSameQuiz);
        renderChips();

        if (canAppend) {
            modeBox.classList.remove('hidden');
            quizNameInput.value = `Quiz ${targetExisting.quizzes.length + 1}`;
            applyMode(shouldDefaultAppend ? 'append' : 'new');
            setTimeout(() => {
                const focusEl = shouldDefaultAppend ? quizNameInput : title;
                focusEl.focus(); focusEl.select();
            }, 120);
        } else {
            modeBox.classList.add('hidden');
            applyMode('new');
            setTimeout(() => { title.focus(); title.select(); }, 120);
        }
    });

    title.addEventListener('input', update);
    newInput.addEventListener('input', update);
    quizNameInput.addEventListener('input', update);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) { e.preventDefault(); ok.click(); } });
    quizNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) { e.preventDefault(); ok.click(); } });
    ok.addEventListener('click', () => {
        if (ov.dataset.saveMode !== 'append') {
            try { localStorage.setItem('edu_lastSubject', sel.value); } catch (_) { }
        }
    });
})();