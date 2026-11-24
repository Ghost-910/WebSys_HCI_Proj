// Adds: Quiz progress bar & live submit counter, Dashboard Retake/New Quiz,
// Unsaved reviewer guard, JSON Backup/Restore, Reviewer Copy & Print/PDF, and Live Search.
(function () {
    // Shared Print & Progress Bar Styles
    const style = document.createElement('style');
    style.textContent = `
        .ux-progress-track { height: 8px; border-radius: 999px; background: rgba(120,120,128,.16); overflow: hidden; }
        .ux-progress-fill { height: 100%; width: 0%; border-radius: 999px; background: #007aff; transition: width .3s cubic-bezier(.4,0,.2,1), background-color .3s ease; }
        .ux-progress-fill.is-done { background: #34c759; }
        #uxPrintArea { display: none; }
        @media print {
            body > *:not(#uxPrintArea) { display: none !important; }
            #uxPrintArea {
                display: block !important;
                background: #fff !important;
                color: #111 !important;
                padding: 24px 32px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                line-height: 1.6;
            }
            #uxPrintArea h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
            #uxPrintArea .ux-print-meta { font-size: 12px; color: #555; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
            #uxPrintArea h3 { font-size: 16px; font-weight: 700; margin-top: 16px; margin-bottom: 6px; }
            #uxPrintArea ul { list-style: disc; padding-left: 20px; margin-bottom: 10px; }
            #uxPrintArea li { margin-bottom: 4px; }
        }
    `;
    document.head.appendChild(style);

    const printArea = document.createElement('div');
    printArea.id = 'uxPrintArea';
    document.body.appendChild(printArea);

    function printReviewer(title, subtitle, html) {
        if (!html || !html.trim()) return showToast('No reviewer content to print.');
        printArea.innerHTML = `
            <h1>${escapeHTML(title || 'EduMaxxing Study Guide')}</h1>
            <div class="ux-print-meta">${escapeHTML(subtitle || 'Generated with EduMaxxing')} · ${new Date().toLocaleDateString()}</div>
            <div>${html}</div>
        `;
        window.print();
    }

    async function copyReviewerText(el) {
        const text = el ? el.innerText.trim() : '';
        if (!text) return showToast('No reviewer content to copy.');
        try {
            await navigator.clipboard.writeText(text);
            showToast('Reviewer copied to clipboard!');
        } catch (_) {
            showToast('Could not copy automatically. Try selecting the text.');
        }
    }

    // Reusable iOS Confirmation Modal
    const confirmOverlay = document.createElement('div');
    confirmOverlay.id = 'uxConfirmOverlay';
    confirmOverlay.className = 'fixed inset-0 bg-black/50 z-[75] hidden backdrop-blur-sm flex items-center justify-center transition-opacity opacity-0';
    confirmOverlay.innerHTML = `
        <div class="ios-card w-full max-w-md p-6 transform scale-95 transition-transform duration-300 mx-4">
            <h3 id="uxConfirmTitle" class="text-xl font-bold text-gray-900 dark:text-white mb-2"></h3>
            <p id="uxConfirmMsg" class="text-sm text-gray-500 dark:text-gray-400 mb-6"></p>
            <div class="flex gap-3 justify-end">
                <button id="uxConfirmCancelBtn" type="button" class="ios-btn bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Cancel</button>
                <button id="uxConfirmOkBtn" type="button" class="ios-btn ios-btn-red">Continue</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmOverlay);

    function uxConfirm({ title, message, okText = 'Continue', danger = true }) {
        return new Promise((resolve) => {
            getEl('uxConfirmTitle').textContent = title;
            getEl('uxConfirmMsg').textContent = message;
            const okBtn = getEl('uxConfirmOkBtn');
            const cancelBtn = getEl('uxConfirmCancelBtn');
            okBtn.textContent = okText;
            okBtn.className = 'ios-btn ' + (danger ? 'ios-btn-red' : 'ios-btn-blue');
            const finish = (val) => {
                okBtn.onclick = cancelBtn.onclick = null;
                closeModal(confirmOverlay);
                resolve(val);
            };
            okBtn.onclick = () => finish(true);
            cancelBtn.onclick = () => finish(false);
            openModal(confirmOverlay);
        });
    }

    function attachQuizProgress(wrapperId, submitBtnId, barId) {
        const wrapper = getEl(wrapperId);
        const submitBtn = getEl(submitBtnId);
        if (!wrapper || !submitBtn) return;

        const barWrap = document.createElement('div');
        barWrap.id = barId;
        barWrap.className = 'mb-5 shrink-0 p-3.5 rounded-2xl bg-gray-100/80 dark:bg-[#2c2c2e] border border-gray-200/60 dark:border-gray-700/60';
        barWrap.innerHTML = `
            <div class="flex justify-between items-center text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                <span>Quiz Progress</span>
                <span class="ux-progress-label">0 / 0 answered</span>
            </div>
            <div class="ux-progress-track"><div class="ux-progress-fill"></div></div>
        `;
        wrapper.parentElement.insertBefore(barWrap, wrapper);

        const fill = barWrap.querySelector('.ux-progress-fill');
        const label = barWrap.querySelector('.ux-progress-label');

        function updateProgress() {
            const total = wrapper.children.length;
            if (!total) {
                barWrap.classList.add('hidden');
                return;
            }
            barWrap.classList.remove('hidden');
            const answered = wrapper.querySelectorAll('input[type="radio"]:checked').length;
            const remaining = Math.max(0, total - answered);
            const pct = Math.round((answered / total) * 100);
            fill.style.width = pct + '%';
            label.textContent = `${answered} / ${total} answered`;
            submitBtn.textContent = remaining > 0 ? `Answer ${remaining} more to submit` : 'Submit Answers';
        }

        wrapper.addEventListener('change', updateProgress);
        new MutationObserver(updateProgress).observe(wrapper, { childList: true });
        updateProgress();
    }

    attachQuizProgress('questionsWrapper', 'submitQuizBtn', 'uxDashQuizProgress');
    attachQuizProgress('standaloneQuestionsWrapper', 'standaloneSubmitQuizBtn', 'uxStandaloneQuizProgress');

    const scoreDisplay = getEl('scoreDisplay');
    if (scoreDisplay) {
        scoreDisplay.classList.add('flex-wrap', 'gap-3');
        const actions = document.createElement('div');
        actions.className = 'flex flex-wrap items-center gap-2';
        actions.innerHTML = `
            <button type="button" id="uxRetakeDashQuizBtn" class="ios-btn ios-btn-sm bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Retake</button>
            <button type="button" id="uxNewDashQuizBtn" class="ios-btn ios-btn-sm ios-btn-purple">New Quiz</button>
        `;
        scoreDisplay.appendChild(actions);

        getEl('uxRetakeDashQuizBtn').addEventListener('click', () => {
            if (typeof renderQuizUI === 'function' && Array.isArray(dashQuizData) && dashQuizData.length) {
                renderQuizUI();
            }
        });

        getEl('uxNewDashQuizBtn').addEventListener('click', () => {
            dashMaterialId = null;
            dashQuizData = null;
            currentMaterialId = null;
            generatedQuizData = null;
            pendingQuizResult = null;
            pendingQuizAttempts = [];
            hide(getEl('quizContainer'), 'flex');
            hide(getEl('scoreDisplay'), 'flex');
            show(getEl('quizEmptyState'));
        });
    }

    const clearBtn = getEl('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();

            const isSaved = dashMaterialId !== null;
            const ok = await uxConfirm({
                title: isSaved ? 'Clear current workspace?' : 'Clear unsaved study material?',
                message: isSaved
                    ? 'Uploading a new file will clear the current preview, reviewer, quiz, and videos from the Dashboard. Your saved copy in My Subjects will stay safe.'
                    : 'Uploading a new file will permanently clear your current file, reviewer, quiz, and videos. Save to a subject first if you want to keep them.',
                okText: 'Clear & Upload New',
                danger: true
            });
            if (ok && typeof fullReset === 'function') {
                fullReset();

                // Immediately hide all active loading spinners & stop progress bars
                ['reviewerLoadingState', 'quizLoadingState', 'videosLoadingState'].forEach((id) => {
                    hide(getEl(id), 'flex');
                });

                // Reset remaining session state and disable generate buttons until a new file is uploaded
                currentMaterialId = null; dashMaterialId = null; dashQuizData = null;
                generatedQuizData = null;
                hide(getEl('scoreDisplay'), 'flex');
                if (getEl('generateQuizBtn')) getEl('generateQuizBtn').disabled = true;
                if (getEl('generateVideosBtn')) getEl('generateVideosBtn').disabled = true;
            }
        }, true);
    }

    const viewProfile = getEl('viewProfile');
    if (viewProfile) {
        const backupCard = document.createElement('div');
        backupCard.className = 'ios-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4';
        backupCard.innerHTML = `
            <div>
                <h4 class="text-lg font-bold text-gray-900 dark:text-white">Data Backup & Restore</h4>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Export your subjects, saved reviewers, and quiz history as a JSON file, or restore a previous backup.</p>
            </div>
            <div class="flex flex-wrap gap-2 shrink-0">
                <button type="button" id="uxExportBackupBtn" class="ios-btn ios-btn-sm ios-btn-blue">Export Backup</button>
                <button type="button" id="uxImportBackupBtn" class="ios-btn ios-btn-sm bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200">Import Backup</button>
                <input type="file" id="uxImportBackupInput" accept=".json,application/json" class="hidden">
            </div>
        `;
        viewProfile.appendChild(backupCard);

        getEl('uxExportBackupBtn').addEventListener('click', () => {
            const payload = {
                app: 'EduMaxxing',
                version: 1,
                exportedAt: new Date().toISOString(),
                subjects: savedSubjects || [],
                materials: savedMaterials || [],
                stats: userStats || { uploads: 0, quizzesGraded: 0 }
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `edumaxxing-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Backup exported!');
        });

        const importInput = getEl('uxImportBackupInput');
        getEl('uxImportBackupBtn').addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            importInput.value = '';
            if (!file) return;
            try {
                const data = JSON.parse(await file.text());
                if (!Array.isArray(data.subjects) || !Array.isArray(data.materials)) {
                    return showToast('Invalid EduMaxxing backup file.');
                }
                const ok = await uxConfirm({
                    title: 'Restore from backup?',
                    message: `This will replace your current local data with ${data.subjects.length} subject(s) and ${data.materials.length} saved session(s).`,
                    okText: 'Restore Backup',
                    danger: false
                });
                if (!ok) return;
                savedSubjects = data.subjects;
                savedMaterials = data.materials;
                if (data.stats) userStats = data.stats;
                syncUserStorage();
                renderSubjectsGrid();
                renderMasteryList();
                showToast('Backup restored successfully!');
            } catch (_) {
                showToast('Could not read that JSON file.');
            }
        });
    }

    const openSaveBtn = getEl('openSaveModalBtn');
    if (openSaveBtn && openSaveBtn.parentElement) {
        const header = openSaveBtn.parentElement;
        header.classList.add('gap-3', 'flex-wrap', 'sm:flex-nowrap');

        const sessionLabel = getEl('currentSessionLabel');
        if (sessionLabel) {
            sessionLabel.classList.add('truncate', 'min-w-0', 'flex-1');
            new MutationObserver(() => {
                sessionLabel.title = sessionLabel.textContent || '';
            }).observe(sessionLabel, { childList: true, characterData: true, subtree: true });
        }

        const btnGroup = document.createElement('div');
        btnGroup.className = 'flex items-center gap-2 shrink-0';
        header.insertBefore(btnGroup, openSaveBtn);

        btnGroup.innerHTML = `
            <button type="button" id="uxCopyDashReviewerBtn" class="ios-btn ios-btn-sm whitespace-nowrap bg-gray-100 dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200">Copy</button>
            <button type="button" id="uxPrintDashReviewerBtn" class="ios-btn ios-btn-sm whitespace-nowrap bg-gray-100 dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200">Print / PDF</button>
        `;
        openSaveBtn.classList.add('whitespace-nowrap');
        btnGroup.appendChild(openSaveBtn);

        getEl('uxCopyDashReviewerBtn').addEventListener('click', () => copyReviewerText(getEl('reviewerContainer')));
        getEl('uxPrintDashReviewerBtn').addEventListener('click', () => {
            const title = (currentUploadedFileName || 'Study Guide').replace(/\.[^/.]+$/, '');
            printReviewer(title, 'EduMaxxing Dashboard Reviewer', getEl('reviewerContainer')?.innerHTML || '');
        });
    }

    const savedReviewerTitle = getEl('savedReviewerTitle');
    if (savedReviewerTitle && savedReviewerTitle.parentElement) {
        const headerBar = savedReviewerTitle.parentElement;
        headerBar.classList.add('flex', 'flex-wrap', 'items-start', 'justify-between', 'gap-3');
        const textWrap = document.createElement('div');
        textWrap.appendChild(savedReviewerTitle);
        const subjEl = getEl('savedReviewerSubject');
        if (subjEl) textWrap.appendChild(subjEl);
        headerBar.prepend(textWrap);

        const readerActions = document.createElement('div');
        readerActions.className = 'flex items-center gap-2';
        readerActions.innerHTML = `
            <button type="button" id="uxCopySavedReviewerBtn" class="ios-btn ios-btn-sm bg-gray-100 dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200">Copy</button>
            <button type="button" id="uxPrintSavedReviewerBtn" class="ios-btn ios-btn-sm bg-gray-100 dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200">Print / PDF</button>
        `;
        headerBar.appendChild(readerActions);

        getEl('uxCopySavedReviewerBtn').addEventListener('click', () => copyReviewerText(getEl('savedReviewerContent')));
        getEl('uxPrintSavedReviewerBtn').addEventListener('click', () => {
            printReviewer(
                getEl('savedReviewerTitle')?.textContent || 'Saved Reviewer',
                getEl('savedReviewerSubject')?.textContent || 'EduMaxxing',
                getEl('savedReviewerContent')?.innerHTML || ''
            );
        });
    }

    function attachLiveSearch(gridId, inputId, placeholder) {
        const grid = getEl(gridId);
        if (!grid) return;

        const searchWrap = document.createElement('div');
        searchWrap.className = 'mb-5 relative';
        searchWrap.innerHTML = `
            <input type="search" id="${inputId}" placeholder="${placeholder}" class="ios-input !pl-10">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
        `;
        grid.parentElement.insertBefore(searchWrap, grid);

        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'hidden text-sm text-gray-500 text-center py-8';
        emptyMsg.textContent = 'No matching items found.';
        grid.parentElement.insertBefore(emptyMsg, grid.nextSibling);

        const input = getEl(inputId);
        function applyFilter() {
            const q = input.value.trim().toLowerCase();
            const cards = Array.from(grid.children);
            let visible = 0;
            cards.forEach((card) => {
                const match = !q || card.textContent.toLowerCase().includes(q);
                card.classList.toggle('hidden', !match);
                if (match) visible++;
            });
            emptyMsg.classList.toggle('hidden', !(q && cards.length > 0 && visible === 0));
        }

        input.addEventListener('input', applyFilter);
        new MutationObserver(applyFilter).observe(grid, { childList: true });
    }

    attachLiveSearch('subjectsGrid', 'uxSubjectSearch', 'Search subjects...');
    attachLiveSearch('masteryPageList', 'uxQuizSearch', 'Search quizzes by title or subject...');

    const revLoading = getEl('reviewerLoadingState');
    if (revLoading) {
        const revBarWrap = document.createElement('div');
        revBarWrap.className = 'w-64 max-w-[80%] mt-4';
        revBarWrap.innerHTML = `
            <div class="flex justify-between items-center text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                <span id="uxRevStageLabel">Reading study material...</span>
                <span id="uxRevPctLabel">0%</span>
            </div>
            <div class="ux-progress-track"><div id="uxRevBarFill" class="ux-progress-fill"></div></div>
        `;
        revLoading.appendChild(revBarWrap);

        const stageEl = getEl('uxRevStageLabel');
        const pctEl = getEl('uxRevPctLabel');
        const fillEl = getEl('uxRevBarFill');

        let revTick = null;
        let revStart = 0;

        function updateRevBar() {
            const elapsed = (Date.now() - revStart) / 1000;
            const estSecs = Math.max(15, +(localStorage.getItem('edu_avg_reviewerTimer') || 45));
            const pct = Math.min(92, Math.round((1 - Math.exp(-elapsed / (estSecs * 0.45))) * 95));

            fillEl.style.width = pct + '%';
            pctEl.textContent = pct + '%';

            if (pct < 25) stageEl.textContent = 'Reading study material...';
            else if (pct < 60) stageEl.textContent = 'Extracting key concepts...';
            else if (pct < 85) stageEl.textContent = 'Structuring study guide...';
            else stageEl.textContent = 'Finalizing reviewer...';
        }

        function syncRevObserver() {
            const isVisible = !revLoading.classList.contains('hidden');
            if (isVisible && !revTick) {
                revStart = Date.now();
                fillEl.style.width = '5%';
                pctEl.textContent = '5%';
                stageEl.textContent = 'Reading study material...';
                revTick = setInterval(updateRevBar, 300);
            } else if (!isVisible && revTick) {
                clearInterval(revTick);
                revTick = null;
                fillEl.style.width = '100%';
                pctEl.textContent = '100%';
            }
        }

        new MutationObserver(syncRevObserver).observe(revLoading, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const overlays = [
            'uxConfirmOverlay',
            'dialogModalOverlay',
            'editSessionModalOverlay',
            'saveModalOverlay',
            'addSubjectModalOverlay',
            'editSubjectModalOverlay',
            'deleteSubjectModalOverlay',
            'googleModalOverlay'
        ];
        for (const id of overlays) {
            const el = getEl(id);
            if (el && !el.classList.contains('hidden')) {
                const cancelBtn = el.querySelector('[id^="cancel"], #uxConfirmCancelBtn');
                if (cancelBtn) cancelBtn.click();
                else if (typeof closeModal === 'function') closeModal(el);
                return;
            }
        }
        const sideOverlay = getEl('sideMenuOverlay');
        if (sideOverlay && !sideOverlay.classList.contains('hidden')) {
            sideOverlay.click();
        }
    });
})();