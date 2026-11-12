// breadcrumbs.js (v2): load AFTER quiz-flow.js. Replaces the earlier breadcrumbs.js.
// Dashboard card hover (rounded), breadcrumb trail, browser Back support, and usability safeguards.
(function () {
    // =====================  STYLES  =====================
    const st = document.createElement('style');
    st.textContent = `
    /* Dashboard cards: each is its own rounded tile, so the hover outline follows the corners */
    #viewHome > section.grid { padding: 6px; gap: 6px !important; }
    #viewHome > section.grid > div { border-radius: 10px !important; box-shadow: none !important; cursor: pointer;
        transition: background-color .18s ease, box-shadow .18s ease; }
    #viewHome > section.grid > div:hover, #viewHome > section.grid > div:focus-visible {
        background: rgba(0, 98, 204, .09) !important; box-shadow: inset 0 0 0 2px var(--btn-blue) !important; outline: none; }
    #viewHome > section.grid > div:nth-child(2):hover, #viewHome > section.grid > div:nth-child(2):focus-visible {
        background: rgba(138, 58, 185, .1) !important; box-shadow: inset 0 0 0 2px var(--btn-purple) !important; }
    #viewHome > section.grid > div:hover p:last-child, #viewHome > section.grid > div:focus-visible p:last-child {
        text-decoration: underline; text-underline-offset: 3px; }

    /* Breadcrumb trail */
    #breadcrumbBar .crumbs { display: flex; flex-wrap: wrap; align-items: center; list-style: none; margin: 0; padding: 0; font-size: 14px; }
    .crumb-item { display: inline-flex; align-items: center; min-width: 0; }
    .crumb-sep { margin: 0 4px; color: var(--ios-label2); font-weight: 700; }
    .crumb-link { min-height: 40px; padding: 0 8px; border-radius: 8px; font-weight: 600; color: var(--btn-blue);
        max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color .15s; }
    .dark .crumb-link { color: #64a8ff; }
    .crumb-link:hover { background: var(--ios-fill); text-decoration: underline; }
    .crumb-current { padding: 0 8px; font-weight: 700; color: var(--ios-label); max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Quiz tab: the container had a fixed height, so the sticky "answered / Submit" bar got stuck mid-page
       with the rest of the quiz showing below it. Let the container grow, so the bar pins to the bottom. */
    #quizContainer { height: auto !important; min-height: 100%; }
    #quizContainer > div:last-child { position: sticky; bottom: 0; z-index: 5; background: var(--ios-card-bg);
        box-shadow: 0 -10px 14px -10px rgba(0, 0, 0, .18); }

    /* Other usability bits */
    .skip-link { position: fixed; left: 12px; top: -60px; z-index: 100; padding: 10px 16px; border-radius: 10px; background: var(--btn-blue); color: #fff; font-weight: 600; transition: top .15s; }
    .skip-link:focus { top: 12px; }
    .quiz-progress { font-size: 14px; font-weight: 600; color: var(--ios-label2); }
    #submitQuizBtn:disabled::after, #standaloneSubmitQuizBtn:disabled::after { content: none !important; }
    .pw-toggle { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); min-height: 36px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--btn-blue); }
    .dark .pw-toggle { color: #64a8ff; }
    #subjectsGrid > div.subjects-empty::after { content: none !important; }
    #subjectsGrid > div.subjects-empty:hover { border-color: var(--ios-sep) !important; box-shadow: none !important; }`;
    document.head.appendChild(st);

    // =====================  DASHBOARD CARDS  =====================
    document.querySelectorAll('#viewHome > section.grid > div').forEach(c => {
        c.tabIndex = 0; c.setAttribute('role', 'link');
        c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
    });

    // =====================  BREADCRUMBS + BROWSER BACK  =====================
    const bar = document.createElement('nav');
    bar.id = 'breadcrumbBar'; bar.setAttribute('aria-label', 'Breadcrumb');
    bar.className = 'max-w-7xl mx-auto w-full px-4 md:px-8 pt-3';
    bar.innerHTML = '<ol class="crumbs"></ol>';
    getEl('mainAppWrapper').querySelector('header').after(bar);
    const list = bar.firstElementChild;

    const VIEWS = { home: 'viewHome', subjects: 'viewSubjects', mastery: 'viewMastery', profile: 'viewProfile', reviewers: 'viewReviewers', quiz: 'viewStandaloneQuiz' };
    const shown = (id) => !getEl(id).classList.contains('hidden');
    const currentView = () => Object.keys(VIEWS).find(k => shown(VIEWS[k])) || 'home';
    const itemNow = () => savedMaterials.find(m => m.id === currentMaterialId);

    function build() {
        const v = currentView(), item = itemNow();
        const home = { t: 'Dashboard', go: () => switchMainView('home') };
        const subjects = { t: 'Subjects', go: () => switchMainView('subjects') };
        const quizzes = { t: 'Quizzes', go: () => switchMainView('mastery') };
        const subject = (s) => ({ t: s, go: () => { switchMainView('subjects'); openSubjectDetail(s); } });
        const fromList = savedMaterialReturnView === 'mastery';
        switch (v) {
            case 'home': return [{ t: 'Dashboard' }];
            case 'subjects': return shown('subjectDetailView') ? [home, subjects, { t: getEl('subjectDetailTitle').textContent }] : [home, { t: 'Subjects' }];
            case 'mastery': return [home, { t: 'Quizzes' }];
            case 'profile': return [home, { t: 'Profile' }];
        }
        if (!item) return [home, { t: 'Saved session' }];
        const title = item.title || 'Saved session';
        if (v === 'reviewers') return fromList ? [home, quizzes, { t: title + ' (record)' }] : [home, subjects, subject(item.subject), { t: title }];
        const record = fromList
            ? { t: title, go: () => loadSavedMaterial(item.id, 'mastery', null, true) }
            : { t: title, go: () => loadSavedMaterial(item.id, 'subjects', item.subject) };
        return [home, quizzes, record, { t: 'Quiz' }];   // a quiz always sits under Quizzes
    }

    // A small description of the current page, used for the Back button
    function descriptor() {
        const v = currentView(), item = itemNow();
        if (v === 'subjects') return shown('subjectDetailView') ? { v: 'subject', s: getEl('subjectDetailTitle').textContent } : { v: 'subjects' };
        if ((v === 'reviewers' || v === 'quiz') && item) return { v: v === 'quiz' ? 'quiz' : 'reader', id: item.id, rv: savedMaterialReturnView, s: savedMaterialReturnSubject, rec: savedMaterialReturnView === 'mastery' };
        return { v };
    }
    function restore(d) {
        if (d.v === 'subject') { switchMainView('subjects'); openSubjectDetail(d.s); }
        else if (d.v === 'reader' || d.v === 'quiz') loadSavedMaterial(d.id, d.rv, d.s, d.rec);
        else switchMainView(d.v);
    }

    let lastKey = null, restoring = false;
    function render() {
        const parts = build(); list.innerHTML = '';
        parts.forEach((p, i) => {
            const li = document.createElement('li'); li.className = 'crumb-item';
            if (i > 0) { const s = document.createElement('span'); s.className = 'crumb-sep'; s.setAttribute('aria-hidden', 'true'); s.textContent = '›'; li.append(s); }
            if (p.go && i < parts.length - 1) {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'crumb-link';
                b.textContent = p.t; b.title = p.t; b.addEventListener('click', p.go); li.append(b);
            } else {
                const c = document.createElement('span'); c.className = 'crumb-current';
                c.textContent = p.t; c.title = p.t; c.setAttribute('aria-current', 'page'); li.append(c);
            }
            list.append(li);
        });
        document.title = parts[parts.length - 1].t + ' · EduMaxxing';
        const d = descriptor(), key = JSON.stringify(d);
        if (key !== lastKey) {
            if (lastKey === null) history.replaceState(d, '');
            else { if (!restoring) history.pushState(d, ''); window.scrollTo(0, 0); }
            lastKey = key;
        }
    }
    window.addEventListener('popstate', (e) => {    // phone/browser Back moves between pages instead of leaving the site
        if (!e.state || getEl('mainAppWrapper').classList.contains('hidden')) return;
        restoring = true; try { restore(e.state); } catch (_) { }
        setTimeout(() => { restoring = false; lastKey = JSON.stringify(descriptor()); }, 0);
    });
    const mo = new MutationObserver(render);
    Object.values(VIEWS).concat('subjectDetailView').forEach(id => mo.observe(getEl(id), { attributes: true, attributeFilter: ['class'] }));
    mo.observe(getEl('subjectDetailTitle'), { childList: true, characterData: true, subtree: true });
    render();

    // =====================  PROTECT UNSAVED WORK  =====================
    const unsaved = () => !!currentGeneratedReviewerHTML && currentMaterialId === null;
    let leaving = false;
    getEl('previewContainer').addEventListener('click', (e) => {          // "Upload New"
        if (e.target.closest('#clearBtn') && unsaved() &&
            !confirm('Start over? Your reviewer, quiz and videos are not saved yet.\n\nPress Cancel, then use “Save to Subject” to keep them.')) e.stopPropagation();
    }, true);
    document.addEventListener('click', (e) => {                            // both "Sign Out" buttons
        if (!e.target.closest('#drawerLogoutBtn, #profileSignOutBtn')) return;
        if (unsaved() && !confirm('Sign out? Your current reviewer, quiz and videos are not saved yet.')) { e.stopPropagation(); e.preventDefault(); }
        else leaving = true;
    }, true);
    window.addEventListener('beforeunload', (e) => { if (unsaved() && !leaving) { e.preventDefault(); e.returnValue = ''; } });

    // =====================  EMPTY STATES THAT TELL YOU WHAT TO DO  =====================
    const baseSubjects = renderSubjectsGrid;
    renderSubjectsGrid = function () {
        baseSubjects();
        if (!savedSubjects.length) getEl('subjectsGrid').innerHTML = `<div class="subjects-empty col-span-full ios-card p-8 text-center"><p class="font-semibold text-gray-900 dark:text-white mb-1">No subjects yet</p><p class="text-sm text-gray-500 mb-4">Subjects are folders for your saved reviewers and quizzes.</p><button id="emptySubjectsBtn" class="ios-btn ios-btn-blue">+ Create your first subject</button></div>`;
    };
    getEl('subjectsGrid').addEventListener('click', (e) => { if (e.target.closest('#emptySubjectsBtn')) getEl('addNewSubjectBtn').click(); });
    renderSubjectsGrid();

    const baseQuizzes = renderMasteryList;
    renderMasteryList = function () {
        baseQuizzes();
        if (!savedMaterials.some(m => m.quizData && m.quizData.length)) getEl('masteryPageList').innerHTML = `<div class="col-span-full ios-card p-8 text-center"><p class="font-semibold text-gray-900 dark:text-white mb-1">No saved quizzes yet</p><p class="text-sm text-gray-500 mb-4">Upload notes, take the quiz, then tap “Save to Subject” to keep it here.</p><button id="emptyQuizzesBtn" class="ios-btn ios-btn-blue">Go to Dashboard</button></div>`;
    };
    getEl('masteryPageList').addEventListener('click', (e) => { if (e.target.closest('#emptyQuizzesBtn')) switchMainView('home'); });

    // =====================  QUIZ PROGRESS ("2 of 5 answered")  =====================
    function quizProgress(wrapperId, btnId) {
        const w = getEl(wrapperId), btn = getEl(btnId); if (!w || !btn) return;
        const el = document.createElement('span'); el.className = 'quiz-progress'; el.style.marginRight = 'auto'; btn.before(el);
        const update = () => { const total = w.children.length, done = w.querySelectorAll('input:checked').length; el.textContent = (btn.classList.contains('hidden') || !total) ? '' : `${done} of ${total} answered`; };
        w.addEventListener('change', update); btn.addEventListener('click', () => setTimeout(update, 0));
        new MutationObserver(update).observe(w, { childList: true });
        new MutationObserver(update).observe(btn, { attributes: true, attributeFilter: ['class'] });
    }
    quizProgress('questionsWrapper', 'submitQuizBtn');
    quizProgress('standaloneQuestionsWrapper', 'standaloneSubmitQuizBtn');

    // =====================  HELP, SHORTCUTS, ACCESSIBILITY  =====================
    const help = document.createElement('div');
    help.id = 'helpModalOverlay';
    help.className = 'fixed inset-0 bg-black/50 z-50 hidden backdrop-blur-sm flex items-center justify-center transition-opacity opacity-0';
    help.innerHTML = `<div class="ios-card w-full max-w-md p-6 transform scale-95 transition-transform duration-300 mx-4">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">How EduMaxxing works</h3>
        <ol class="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-6">
            <li><b>Upload</b> a photo, PDF, Word or text file on the Dashboard.</li>
            <li>The <b>Reviewer, Quiz and Videos</b> are made for you. Switch between them with the tabs.</li>
            <li>Tap <b>Save to Subject</b> to keep them. You can create the subject right there.</li>
            <li><b>Subjects</b> holds your saved reviewers. <b>Quizzes</b> lets you retake or remove quizzes.</li>
            <li>Use the <b>trail under the top bar</b> or your browser's Back button to move around.</li>
        </ol>
        <div class="flex justify-end"><button id="cancelHelpBtn" class="ios-btn ios-btn-blue">Got it</button></div></div>`;
    document.body.appendChild(help);
    getEl('cancelHelpBtn').addEventListener('click', () => closeModal(help));
    getEl('sideMenuDrawer').addEventListener('click', (e) => {
        if (!e.target.closest('#drawerHelpBtn')) return;
        e.stopPropagation(); closeSideDrawer(); openModal(help);
    }, true);

    const overlays = [...document.querySelectorAll('[id$="ModalOverlay"]')];
    overlays.forEach(o => {
        o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
        o.addEventListener('click', (e) => { if (e.target === o) o.querySelector('[id^="cancel"]')?.click(); });   // click outside closes
        new MutationObserver(() => {                                                                              // focus goes back to what opened it
            const open = !o.classList.contains('hidden');
            if (open && !o._open) { o._open = true; o._last = document.activeElement; }
            else if (!open && o._open) { o._open = false; o._last && o._last.focus && o._last.focus(); }
        }).observe(o, { attributes: true, attributeFilter: ['class'] });
    });
    document.addEventListener('keydown', (e) => {                       // Esc closes pop-ups, then the menu
        if (e.key !== 'Escape') return;
        const open = overlays.find(o => !o.classList.contains('hidden') && !o.classList.contains('opacity-0'));
        if (open) open.querySelector('[id^="cancel"]')?.click();
        else if (!getEl('sideMenuDrawer').classList.contains('-translate-x-full')) closeSideDrawer();
    });

    const skip = document.createElement('a');                          // keyboard users can jump past the navigation
    skip.className = 'skip-link'; skip.href = '#'; skip.textContent = 'Skip to main content';
    skip.addEventListener('click', (e) => { e.preventDefault(); const m = [...document.querySelectorAll('main')].find(x => !x.classList.contains('hidden')); if (m) { m.tabIndex = -1; m.focus(); } });
    document.body.prepend(skip);

    getEl('hamburgerBtn').setAttribute('aria-label', 'Open menu');
    getEl('themeToggleBtn').setAttribute('aria-label', 'Toggle dark mode');
    getEl('errorToast').setAttribute('role', 'status'); getEl('errorToast').setAttribute('aria-live', 'polite');
    document.querySelectorAll('label').forEach(l => {                   // clicking a label focuses its field
        const f = l.nextElementSibling;
        if (!l.htmlFor && f && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) { f.id = f.id || 'f_' + Math.random().toString(36).slice(2, 8); l.htmlFor = f.id; }
    });

    // Sign-in form: show/hide password + browser autofill hints
    const pw = getEl('authPasswordInput');
    if (pw) {
        const wrap = document.createElement('div'); wrap.className = 'relative'; pw.replaceWith(wrap); wrap.append(pw); pw.style.paddingRight = '70px';
        const t = document.createElement('button'); t.type = 'button'; t.className = 'pw-toggle'; t.textContent = 'Show'; t.setAttribute('aria-label', 'Show password');
        t.addEventListener('click', () => { const s = pw.type === 'password'; pw.type = s ? 'text' : 'password'; t.textContent = s ? 'Hide' : 'Show'; t.setAttribute('aria-label', (s ? 'Hide' : 'Show') + ' password'); });
        wrap.append(t);
        pw.autocomplete = 'current-password'; getEl('authEmailInput').autocomplete = 'email';
        getEl('tabSignUpBtn').addEventListener('click', () => { pw.autocomplete = 'new-password'; });
        getEl('tabSignInBtn').addEventListener('click', () => { pw.autocomplete = 'current-password'; });
    }
})();