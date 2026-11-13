// save-modal.js: a clearer, faster "Save study session" pop-up. Load AFTER script.js:
//   <script src="save-modal.js"></script>
// It builds on the existing pop-up (same buttons and ids), so saving still works exactly as before.
(function () {
    const ov = getEl('saveModalOverlay'), card = ov.firstElementChild;
    const sel = getEl('saveSubjectSelect'), title = getEl('saveTitleInput'), ok = getEl('confirmSaveBtn');
    const newInput = getEl('saveNewSubjectInput'), openBtn = getEl('openSaveModalBtn');

    // ---------- Styles ----------
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
    .dark .sum-warn { color: #ffb340; }`;
    document.head.appendChild(st);

    // ---------- Layout: heading, short explanation, what will be saved, subject chips ----------
    const h3 = card.querySelector('h3');
    h3.textContent = 'Save study session'; h3.classList.replace('mb-4', 'mb-1');
    const sub = document.createElement('p');
    sub.className = 'text-sm text-gray-500 dark:text-gray-400 mb-4';
    sub.textContent = 'Keep this reviewer and quiz so you can come back to them.';
    h3.after(sub);
    const summary = document.createElement('div'); summary.className = 'save-summary'; sub.after(summary);

    const labels = card.querySelectorAll('label');
    labels[0].textContent = 'Session title'; labels[1].textContent = 'Subject';
    title.maxLength = 60; title.autocomplete = 'off'; title.classList.replace('mb-4', 'mb-5');
    const chips = document.createElement('div');
    chips.className = 'subj-chips'; chips.setAttribute('role', 'radiogroup'); chips.setAttribute('aria-label', 'Subject');
    sel.before(chips);
    sel.classList.add('visually-hidden'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');   // still holds the value the app saves
    card.style.maxHeight = '90vh'; card.style.overflowY = 'auto';

    // ---------- Rendering ----------
    const chip = (kind, text) => `<span class="sum-chip sum-${kind}">${kind === 'ok' ? '✓' : '!'} ${escapeHTML(text)}</span>`;
    function renderSummary() {
        const hasReviewer = !!currentGeneratedReviewerHTML;
        const hasQuiz = !!(generatedQuizData && generatedQuizData.length);
        const quizBusy = !getEl('quizLoadingState').classList.contains('hidden');
        const n = pendingQuizAttempts.length, parts = [];
        parts.push(hasReviewer ? chip('ok', 'Reviewer included') : chip('warn', 'No reviewer yet'));
        parts.push(quizBusy ? chip('warn', 'Quiz is still being made · not included yet')
            : hasQuiz ? chip('ok', 'Quiz included' + (n ? ` · ${n} attempt${n > 1 ? 's' : ''}` : ''))
            : chip('warn', 'No quiz yet · saved without it'));
        const already = savedMaterials.find(m => m.id === currentMaterialId);
        if (already) parts.push(chip('warn', `Already saved in “${already.subject}”. Saving again makes a copy.`));
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
    function update() {                      // the Save button only works when the form is complete, and says where it will save
        const isNew = sel.value === '__new__';
        ok.disabled = !(title.value.trim() && (!isNew || newInput.value.trim()));
        const name = sel.value.length > 22 ? sel.value.slice(0, 21) + '…' : sel.value;
        ok.textContent = isNew ? 'Create & save' : `Save to “${name}”`;
    }

    // ---------- Behaviour ----------
    openBtn.addEventListener('click', () => {         // runs after the app has opened the pop-up
        sel.innerHTML = '';                            // rebuilt safely (subject names with quotes can't break it)
        savedSubjects.forEach(s => sel.add(new Option(s, s)));
        sel.add(new Option('+ Create new subject...', '__new__'));
        const last = localStorage.getItem('edu_lastSubject');   // start on the subject you used last
        sel.value = !savedSubjects.length ? '__new__' : (savedSubjects.includes(last) ? last : savedSubjects[0]);
        sel.dispatchEvent(new Event('change'));
        renderSummary(); renderChips(); update();
        setTimeout(() => { title.focus(); title.select(); }, 120);
    });
    title.addEventListener('input', update);
    newInput.addEventListener('input', update);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) { e.preventDefault(); ok.click(); } });
    ok.addEventListener('click', () => { try { localStorage.setItem('edu_lastSubject', sel.value); } catch (_) { } });
})();