// quiz-flow.js: load AFTER script.js:  <script src="quiz-flow.js"></script>
// Fixes the "back" buttons around retaking a quiz, so each path returns to the right page.
//   From the Quizzes page      -> quiz -> "Return to Quiz Record"            -> quiz record only
//   From Subjects > a reviewer -> quiz -> "Return to Reviewer and Quiz Record" -> that reviewer page (Subjects tab)
(function () {
    let quizOrigin = 'reader';        // 'list' = started from the Quizzes page, 'reader' = started from a reviewer page
    let readerRecordOnly = false;     // true while the reader shows only the quiz record

    function setLabel(btn, text) {
        const t = [...btn.childNodes].reverse().find(n => n.nodeType === 3);
        if (t) t.textContent = ' ' + text + ' '; else btn.append(text);
    }

    // Bottom bar highlight: pages opened from a subject stay under "Subjects"
    updateBottomNav = function (view) {
        const btns = { home: getEl('navHomeBtn'), subjects: getEl('navSubjectsBtn'), reviewers: getEl('navReviewersBtn'), profile: getEl('navProfileBtn') };
        let navKey = view;
        if (view === 'mastery') navKey = 'reviewers';
        else if (view === 'reviewers' || view === 'standaloneQuiz') navKey = savedMaterialReturnView === 'subjects' ? 'subjects' : 'reviewers';
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
})();