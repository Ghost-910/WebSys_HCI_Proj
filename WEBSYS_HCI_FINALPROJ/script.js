// --- Configuration ---
let API_KEY = "";
let YT_API_KEY = "";
const MODEL = "gemini-3.8-flash";
const MAX_TEXT_CHARS = 60000;

try {
    if (typeof CONFIG !== 'undefined') {
        API_KEY = CONFIG.GEMINI_API_KEY || "";
        YT_API_KEY = CONFIG.YT_API_KEY || "";
    }
} catch (e) {
    console.error("Error reading config:", e);
}

// --- Application & User State ---
let registeredUsers = [];
try {
    const savedUsers = JSON.parse(localStorage.getItem('edumaxxing_users') || '[]');
    if (Array.isArray(savedUsers)) registeredUsers = savedUsers;
} catch (error) { console.error('Error loading accounts:', error); }

let currentUser = JSON.parse(localStorage.getItem('edumaxxing_current_user') || 'null');

let currentBase64Image = null, currentMimeType = null, currentText = null;
let generatedQuizData = null, userAnswers = {};
let uploadId = 0, currentGeneratedReviewerHTML = "", currentUploadedFileName = "";
let loadingInterval = null, secondsElapsed = 0;

let savedSubjects = JSON.parse(localStorage.getItem(getSubjectsKey()) || '[]');
let savedMaterials = JSON.parse(localStorage.getItem(getMaterialsKey()) || '[]');
let userStats = JSON.parse(localStorage.getItem(getStatsKey()) || '{"uploads":0,"quizzesGraded":0}');

let currentMaterialId = null;
let pendingQuizResult = null;
let pendingQuizAttempts = [];
let savedMaterialReturnView = 'subjects';
let savedMaterialReturnSubject = null;

// --- DOM Helpers ---
function getEl(id) { return document.getElementById(id); }
function show(el, display) { if(el) { el.classList.remove('hidden'); if(display) el.classList.add(display); } }
function hide(el, display) { if(el) { el.classList.add('hidden'); if(display) el.classList.remove(display); } }
function addEvt(id, evt, fn) { const el = getEl(id); if(el) el.addEventListener(evt, fn); }

// File SVG Icons
const iconImage = `<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>`;
const iconPDF = `<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>`;
const iconWord = `<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`;
const iconText = `<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>`;

// --- Init & Theme ---
function initTheme() {
    const isDark = currentUser && localStorage.getItem('theme') === 'dark';
    document.documentElement.classList.toggle('dark', !!isDark);
    document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', !isDark));
    document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', isDark));
}
function toggleTheme() {
    if (!currentUser) return;
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    initTheme();
}
addEvt('themeToggleBtn', 'click', toggleTheme);

if (currentUser) {
    loadUserData();
    showWelcomeScreen();
} else {
    showAuthScreen();
}

// --- Liquid Nav Init (formerly patch.js) ---
(function initBottomNav() {
    const css = ".bnav-wrap{position:fixed;left:0;right:0;bottom:max(16px,env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none;z-index:40}.bnav{pointer-events:auto;position:relative;display:flex;width:min(92vw,380px);padding:5px;border-radius:999px;background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(28px) saturate(200%);backdrop-filter:blur(28px) saturate(200%);border:1px solid rgba(255,255,255,.75);box-shadow:0 10px 36px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.6),inset 0 -1px 0 rgba(255,255,255,.12);animation:bnavIn .8s cubic-bezier(.34,1.56,.64,1) both}.dark .bnav{background:rgba(44,44,48,.55);border-color:rgba(255,255,255,.16)}.bnav-pill{position:absolute;top:5px;bottom:5px;left:5px;width:calc((100% - 10px)/4);border-radius:999px;background:rgba(0,122,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 2px 10px rgba(0,122,255,.2);transform:translateX(calc(var(--i,0)*100%));transition:transform .6s cubic-bezier(.34,1.56,.64,1)}.bnav button{position:relative;z-index:1;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0;color:#6c6c70;transition:color .3s,transform .4s cubic-bezier(.34,1.56,.64,1)}.dark .bnav button{color:#aeaeb2}.bnav button span{font-size:10.5px!important;font-weight:600!important}.bnav button:active{transform:scale(.86)}.bnav button.active{color:#007aff}.dark .bnav button.active{color:#0a84ff}.bnav button.active svg{animation:bnavPop .6s cubic-bezier(.34,1.56,.64,1)}.view-in{animation:viewIn .55s cubic-bezier(.22,1,.36,1) both}@keyframes bnavIn{from{opacity:0;transform:translateY(60px) scale(.9)}to{opacity:1;transform:none}}@keyframes bnavPop{0%{transform:scale(.7)}100%{transform:scale(1)}}@keyframes viewIn{from{opacity:0;transform:translateY(16px) scale(.985);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}@media (prefers-reduced-motion:reduce){.bnav,.bnav-pill,.view-in{animation:none!important;transition:none!important}}";
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    
    const navHome = getEl('navHomeBtn');
    if(navHome) {
        const nav = navHome.parentElement;
        const wrap = nav.parentElement;
        wrap.className = 'bnav-wrap'; nav.className = 'bnav';
        const pill = document.createElement('span'); pill.className = 'bnav-pill'; nav.prepend(pill);
    }
})();

function updateBottomNav(view) {
    const btns = { home: getEl('navHomeBtn'), subjects: getEl('navSubjectsBtn'), reviewers: getEl('navReviewersBtn'), profile: getEl('navProfileBtn') };
    let navKey = view;
    if (view === 'mastery' || view === 'standaloneQuiz') navKey = 'reviewers';
    
    Object.keys(btns).forEach(k => {
        if (btns[k]) btns[k].className = (k === navKey) ? 'active' : '';
    });
    const navHome = getEl('navHomeBtn');
    if(navHome) {
        const nav = navHome.parentElement;
        const pill = nav.querySelector('.bnav-pill');
        if (pill && btns[navKey]) {
            nav.style.setProperty('--i', Object.keys(btns).indexOf(navKey));
            pill.style.opacity = '1';
        } else if (pill) {
            pill.style.opacity = '0';
        }
    }
}

// --- Navigation ---
function switchMainView(view) {
    const views = ['viewHome', 'viewSubjects', 'viewReviewers', 'viewMastery', 'viewProfile', 'viewStandaloneQuiz'];
    views.forEach(v => {
        const el = getEl(v);
        if (el) {
            if (v.toLowerCase() === 'view' + view.toLowerCase()) {
                el.classList.remove('hidden');
                el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
            } else {
                el.classList.add('hidden');
            }
        }
    });
    updateBottomNav(view);

    if (view === 'subjects') { hide(getEl('subjectDetailView')); show(getEl('subjectsMainView')); renderSubjectsGrid(); }
    if (view === 'mastery' || view === 'home') renderMasteryList();
    if (view === 'profile') syncUserUI();
}
window.switchMainView = switchMainView;

addEvt('navHomeBtn', 'click', () => switchMainView('home'));
addEvt('navSubjectsBtn', 'click', () => switchMainView('subjects'));
addEvt('navReviewersBtn', 'click', () => switchMainView('mastery'));
addEvt('navProfileBtn', 'click', () => switchMainView('profile'));
addEvt('headerProfileChip', 'click', () => switchMainView('profile'));
addEvt('startGeneratingBtn', 'click', () => {
    const w = getEl('welcomeScreen'); if(w) { w.classList.add('hidden'); w.classList.remove('flex'); }
    const m = getEl('mainAppWrapper'); if(m) { m.classList.remove('hidden'); m.classList.add('flex'); }
    switchMainView('home');
});

// --- Auth ---
let authMode = 'signin';
function setAuthMode(mode) {
    authMode = mode;
    const sIn = getEl('tabSignInBtn'), sUp = getEl('tabSignUpBtn');
    if(sIn) { if(mode === 'signin') sIn.classList.add('active'); else sIn.classList.remove('active'); }
    if(sUp) { if(mode === 'signup') sUp.classList.add('active'); else sUp.classList.remove('active'); }
    const ex = getEl('signupExtraFields'); if(ex) { if(mode==='signin') ex.classList.add('hidden'); else ex.classList.remove('hidden'); }
    const gs = getEl('googleSignInSection'); if(gs) { if(mode==='signup') gs.classList.add('hidden'); else gs.classList.remove('hidden'); }
    const btn = getEl('authSubmitBtn'); if(btn) btn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
}
setAuthMode('signin');
addEvt('tabSignInBtn', 'click', () => setAuthMode('signin'));
addEvt('tabSignUpBtn', 'click', () => setAuthMode('signup'));

addEvt('authForm', 'submit', (e) => {
    e.preventDefault();
    const emEl = getEl('authEmailInput'), pwEl = getEl('authPasswordInput');
    if(!emEl || !pwEl) return;
    const email = emEl.value.trim().toLowerCase(), password = pwEl.value;

    if (authMode === 'signup') {
        const nameEl = getEl('authNameInput'), progEl = getEl('authProgramInput');
        const name = nameEl ? nameEl.value.trim() : '';
        const program = progEl ? (progEl.value.trim() || 'BS Computer Science') : 'BS Computer Science';
        if (!name) return showToast('Please enter your full name.');
        if (registeredUsers.some(u => u.email === email)) return showToast('An account with this email already exists.');
        
        const newUser = { name, email, password, provider: 'Standard Account', university: 'Batangas State University', program, bio: 'Turning notes into mastery.' };
        registeredUsers.push(newUser);
        localStorage.setItem('edumaxxing_users', JSON.stringify(registeredUsers));
        loginSuccess(newUser);
    } else {
        const user = registeredUsers.find(u => u.email === email && u.password === password);
        if (!user) return showToast('Invalid email or password.');
        loginSuccess(user);
    }
});

addEvt('googleSignInBtn', 'click', () => {
    const googleUsers = registeredUsers.filter(u => u.provider === 'Google Account');
    const list = getEl('googleSavedAccountsList');
    if (list) {
        if (googleUsers.length > 0) {
            list.innerHTML = '<p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Saved Google Accounts</p>' +
                googleUsers.map(u => '<button type="button" onclick="quickGoogleLogin(\''+u.email+'\')" class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-[#2c2c2e] border border-gray-200 dark:border-gray-700 text-left transition-colors"><div class="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">'+u.name.charAt(0).toUpperCase()+'</div><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-gray-900 dark:text-white truncate">'+u.name+'</p><p class="text-xs text-gray-500 truncate">'+u.email+'</p></div></button>').join('');
        } else {
            list.innerHTML = '';
        }
    }
    if(getEl('googleNameInput')) getEl('googleNameInput').value = '';
    if(getEl('googleEmailInput')) getEl('googleEmailInput').value = '';
    openModal(getEl('googleModalOverlay'));
});

window.quickGoogleLogin = function(email) {
    const user = registeredUsers.find(u => u.email === email);
    if (user) { closeModal(getEl('googleModalOverlay')); loginSuccess(user); }
};

addEvt('cancelGoogleBtn', 'click', () => closeModal(getEl('googleModalOverlay')));
addEvt('confirmGoogleBtn', 'click', () => {
    const nm = getEl('googleNameInput'), em = getEl('googleEmailInput');
    if(!nm || !em) return;
    const name = nm.value.trim(), email = em.value.trim().toLowerCase();
    if (!name || !email || email.indexOf('@') === -1) return showToast('Please enter a valid name and Google email.');
    let user = registeredUsers.find(u => u.email === email);
    if (!user) {
        user = { name, email, password: '', provider: 'Google Account', university: 'Batangas State University', program: 'BS Computer Science', bio: 'Streamlining study sessions with AI.' };
        registeredUsers.push(user);
        localStorage.setItem('edumaxxing_users', JSON.stringify(registeredUsers));
    }
    closeModal(getEl('googleModalOverlay'));
    loginSuccess(user);
});

function loginSuccess(user) {
    currentUser = user; initTheme();
    localStorage.setItem('edumaxxing_current_user', JSON.stringify(currentUser));
    loadUserData(); showWelcomeScreen(); showToast("Signed in as " + user.name);
}

function showAuthScreen() {
    const a = getEl('authScreen'), w = getEl('welcomeScreen'), m = getEl('mainAppWrapper');
    if(a) a.classList.remove('hidden');
    if(w) { w.classList.add('hidden'); w.classList.remove('flex'); }
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}
function showWelcomeScreen() {
    const a = getEl('authScreen'), w = getEl('welcomeScreen'), m = getEl('mainAppWrapper');
    if(a) a.classList.add('hidden');
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    if(w) { w.classList.remove('hidden'); w.classList.add('flex'); }
    if(getEl('welcomeAvatar') && currentUser) getEl('welcomeAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    if(getEl('welcomeUserName') && currentUser) getEl('welcomeUserName').textContent = currentUser.name.split(' ')[0];
}

function logoutUser() {
    currentUser = null; document.documentElement.classList.remove('dark'); updateThemeIcons(false);
    localStorage.removeItem('edumaxxing_current_user'); closeSideDrawer(); fullReset();
    showAuthScreen(); showToast('Signed out of your account.');
}
addEvt('drawerLogoutBtn', 'click', logoutUser);
addEvt('profileSignOutBtn', 'click', logoutUser);

// --- Data & Profile ---
function getSubjectsKey() { return "edumaxxing_subjects_" + (currentUser ? currentUser.email : ""); }
function getMaterialsKey() { return "edumaxxing_materials_" + (currentUser ? currentUser.email : ""); }
function getStatsKey() { return "edumaxxing_stats_" + (currentUser ? currentUser.email : ""); }

function loadUserData() {
    if (!currentUser) return;
    savedSubjects = JSON.parse(localStorage.getItem(getSubjectsKey()) || '[]');
    savedMaterials = JSON.parse(localStorage.getItem(getMaterialsKey()) || '[]');
    userStats = JSON.parse(localStorage.getItem(getStatsKey()) || '{"uploads":0,"quizzesGraded":0}');
    syncUserUI(); renderSubjectsGrid();
}
function syncUserStorage() {
    if (!currentUser) return;
    localStorage.setItem(getSubjectsKey(), JSON.stringify(savedSubjects));
    localStorage.setItem(getMaterialsKey(), JSON.stringify(savedMaterials));
    localStorage.setItem(getStatsKey(), JSON.stringify(userStats));
    syncUserUI();
}
function syncUserUI() {
    if (!currentUser) return;
    const initial = currentUser.name.charAt(0).toUpperCase();
    const setTxt = (id, text) => { const el = getEl(id); if(el) el.textContent = text; };
    const setVal = (id, val) => { const el = getEl(id); if(el) el.value = val; };

    setTxt('headerAvatar', initial); setTxt('headerUserName', currentUser.name);
    setTxt('drawerAvatar', initial); setTxt('drawerUserName', currentUser.name); setTxt('drawerUserEmail', currentUser.email);

    setTxt('statSubjectsCount', savedSubjects.length);
    const quizCount = savedMaterials.filter(m => m.quizData && m.quizData.length > 0).length;
    setTxt('statQuizzesCount', quizCount);

    setTxt('profileBigAvatar', initial); setTxt('profileHeroName', currentUser.name); setTxt('profileHeroEmail', currentUser.email);
    setTxt('profileAuthBadge', currentUser.provider || 'Standard Account');
    setTxt('profileHeroMeta', (currentUser.university || 'University Student') + " · " + (currentUser.program || 'General Studies'));
    setTxt('profileStatSubjects', savedSubjects.length); setTxt('profileStatReviewers', savedMaterials.length);
    setTxt('profileStatUploads', userStats.uploads || 0); setTxt('profileStatQuizzes', userStats.quizzesGraded || 0);

    setVal('piNameInput', currentUser.name || ''); setVal('piEmailInput', currentUser.email || '');
    setVal('piUniversityInput', currentUser.university || ''); setVal('piProgramInput', currentUser.program || '');
    setVal('piBioInput', currentUser.bio || '');
}

addEvt('personalInfoForm', 'submit', (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const nEl = getEl('piNameInput'), uEl = getEl('piUniversityInput'), pEl = getEl('piProgramInput'), bEl = getEl('piBioInput');
    if(nEl) currentUser.name = nEl.value.trim() || currentUser.name;
    if(uEl) currentUser.university = uEl.value.trim();
    if(pEl) currentUser.program = pEl.value.trim();
    if(bEl) currentUser.bio = bEl.value.trim();

    localStorage.setItem('edumaxxing_current_user', JSON.stringify(currentUser));
    const idx = registeredUsers.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) {
        registeredUsers[idx] = Object.assign({}, registeredUsers[idx], currentUser);
        localStorage.setItem('edumaxxing_users', JSON.stringify(registeredUsers));
    }
    syncUserUI(); showToast('Personal info updated!');
});

// --- Menus & Modals ---
addEvt('hamburgerBtn', 'click', () => {
    const ov = getEl('sideMenuOverlay'), dr = getEl('sideMenuDrawer');
    if(ov) ov.classList.remove('hidden');
    setTimeout(() => {
        if(ov) ov.classList.remove('opacity-0');
        if(dr) dr.classList.remove('-translate-x-full');
    }, 10);
});
function closeSideDrawer() {
    const ov = getEl('sideMenuOverlay'), dr = getEl('sideMenuDrawer');
    if(ov) ov.classList.add('opacity-0');
    if(dr) dr.classList.add('-translate-x-full');
    setTimeout(() => { if(ov) ov.classList.add('hidden'); }, 300);
}
addEvt('sideMenuOverlay', 'click', closeSideDrawer);
addEvt('drawerDashboardBtn', 'click', () => { closeSideDrawer(); switchMainView('home'); });
addEvt('drawerSubjectsBtn', 'click', () => { closeSideDrawer(); switchMainView('subjects'); });
addEvt('drawerProfileBtn', 'click', () => { closeSideDrawer(); switchMainView('profile'); });
addEvt('drawerHelpBtn', 'click', () => { closeSideDrawer(); showToast('Upload a file on the Dashboard to generate resources.'); });

function openModal(overlay) {
    if(!overlay) return;
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0'); if(overlay.firstElementChild) overlay.firstElementChild.classList.remove('scale-95'); }, 10);
}
function closeModal(overlay) {
    if(!overlay) return;
    overlay.classList.add('opacity-0');
    if(overlay.firstElementChild) overlay.firstElementChild.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden'), 250);
}

// --- Subject Management ---
addEvt('addNewSubjectBtn', 'click', () => {
    if(getEl('newSubjectInput')) getEl('newSubjectInput').value = '';
    openModal(getEl('addSubjectModalOverlay'));
    setTimeout(() => { if(getEl('newSubjectInput')) getEl('newSubjectInput').focus(); }, 50);
});
addEvt('cancelAddSubjectBtn', 'click', () => closeModal(getEl('addSubjectModalOverlay')));
function submitNewSubject() {
    const inp = getEl('newSubjectInput'); if(!inp) return;
    const sub = inp.value.trim(); if (!sub) return;
    if (savedSubjects.indexOf(sub) > -1) return showToast('Subject already exists.');
    savedSubjects.push(sub); syncUserStorage(); renderSubjectsGrid(); closeModal(getEl('addSubjectModalOverlay'));
    showToast("Created " + sub);
}
addEvt('confirmAddSubjectBtn', 'click', submitNewSubject);
addEvt('newSubjectInput', 'keypress', (e) => { if (e.key === 'Enter') submitNewSubject(); });

window.openEditSubjectModal = function(subject, event) {
    event.stopPropagation(); subjectToEdit = subject;
    if(getEl('editSubjectInput')) getEl('editSubjectInput').value = subject;
    openModal(getEl('editSubjectModalOverlay'));
    setTimeout(() => { if(getEl('editSubjectInput')) getEl('editSubjectInput').focus(); }, 50);
};
addEvt('cancelEditSubjectBtn', 'click', () => closeModal(getEl('editSubjectModalOverlay')));
function submitEditSubject() {
    const inp = getEl('editSubjectInput'); if(!inp) return;
    const newName = inp.value.trim();
    if (!newName || newName === subjectToEdit) return closeModal(getEl('editSubjectModalOverlay'));
    if (savedSubjects.indexOf(newName) > -1) return showToast('Subject already exists.');
    const idx = savedSubjects.indexOf(subjectToEdit);
    if (idx !== -1) savedSubjects[idx] = newName;
    savedMaterials.forEach(m => { if (m.subject === subjectToEdit) m.subject = newName; });
    syncUserStorage(); renderSubjectsGrid(); closeModal(getEl('editSubjectModalOverlay'));
    showToast('Subject renamed.');
}
addEvt('confirmEditSubjectBtn', 'click', submitEditSubject);
addEvt('editSubjectInput', 'keypress', (e) => { if (e.key === 'Enter') submitEditSubject(); });

window.openDeleteSubjectModal = function(subject, event) {
    event.stopPropagation(); subjectToDelete = subject;
    openModal(getEl('deleteSubjectModalOverlay'));
};
addEvt('cancelDeleteSubjectBtn', 'click', () => closeModal(getEl('deleteSubjectModalOverlay')));
addEvt('confirmDeleteSubjectBtn', 'click', () => {
    if (!subjectToDelete) return;
    savedSubjects = savedSubjects.filter(s => s !== subjectToDelete);
    savedMaterials = savedMaterials.filter(m => m.subject !== subjectToDelete);
    syncUserStorage(); renderSubjectsGrid(); closeModal(getEl('deleteSubjectModalOverlay'));
    showToast('Subject deleted.');
});

function renderSubjectsGrid() {
    const grid = getEl('subjectsGrid'); if(!grid) return;
    grid.innerHTML = savedSubjects.map(sub => {
        const count = savedMaterials.filter(m => m.subject === sub).length;
        const safeSub = sub.replace(/'/g, "\\'");
        return '<div onclick="openSubjectDetail(\''+safeSub+'\')" class="ios-card p-6 cursor-pointer hover:border-blue-500 border border-transparent transition-all relative group"><div class="absolute top-4 right-4 flex gap-1 z-10"><button onclick="openEditSubjectModal(\''+safeSub+'\', event)" class="p-2 text-gray-400 hover:text-blue-500 bg-gray-100/80 dark:bg-[#2c2c2e] rounded-full transition-colors" title="Rename"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button><button onclick="openDeleteSubjectModal(\''+safeSub+'\', event)" class="p-2 text-gray-400 hover:text-red-500 bg-gray-100/80 dark:bg-[#2c2c2e] rounded-full transition-colors" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div><div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div><h3 class="text-lg font-bold text-gray-900 dark:text-white pr-16 truncate">'+sub+'</h3><p class="text-sm text-gray-500 mt-1">'+count+' Saved '+(count === 1 ? 'Session' : 'Sessions')+'</p></div>';
    }).join('');
}
function escapeHTML(value) { return String(value || "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

window.openSubjectDetail = function(subject) {
    hide(getEl('subjectsMainView')); show(getEl('subjectDetailView'));
    if(getEl('subjectDetailTitle')) getEl('subjectDetailTitle').textContent = subject;
    const items = savedMaterials.filter(m => m.subject === subject);
    const lst = getEl('savedItemsList');
    if(lst) {
        lst.innerHTML = items.length === 0
            ? '<p class="text-gray-500 text-sm">No materials saved inside this subject yet.</p>'
            : items.map(m => '<div class="ios-card p-5 flex justify-between items-center border border-gray-100 dark:border-gray-800"><div><p class="font-bold text-gray-900 dark:text-white">'+escapeHTML(m.title || 'Study Session')+'</p><p class="text-xs text-gray-500 mt-0.5">'+m.date+' · '+(m.quizData ? 'Reviewer + 5-Item Quiz' : 'Reviewer Only')+'</p></div><button onclick="loadSavedMaterial('+m.id+', \'subjects\', \''+escapeHTML(subject)+'\')" class="ios-btn ios-btn-sm ios-btn-blue">Open</button></div>').join('');
    }
};

addEvt('backToSubjectsBtn', 'click', () => {
    hide(getEl('subjectDetailView')); show(getEl('subjectsMainView')); renderSubjectsGrid();
});

// --- Save Modal Enhancements ---
const sel = getEl('saveSubjectSelect');
if (sel) {
    const wrap = document.createElement('div'); wrap.id = 'saveNewSubjectWrap'; wrap.className = 'hidden mb-6';
    wrap.innerHTML = '<label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">New subject name</label><input type="text" id="saveNewSubjectInput" maxlength="60" placeholder="e.g., Data Structures" class="ios-input">';
    sel.insertAdjacentElement('afterend', wrap);
    const input = wrap.querySelector('input');
    const sync = () => { if(sel.value === '__new__') wrap.classList.remove('hidden'); else wrap.classList.add('hidden'); };

    addEvt('openSaveModalBtn', 'click', () => {
        sel.innerHTML = savedSubjects.map(s => '<option value="'+s+'">'+s+'</option>').join('');
        sel.appendChild(new Option('+ Create new subject...', '__new__'));
        if (!savedSubjects.length) sel.value = '__new__';
        input.value = ''; sync();
        if(getEl('saveTitleInput')) getEl('saveTitleInput').value = currentUploadedFileName ? currentUploadedFileName.replace(/\.[^/.]+$/, '') : 'Study Session';
        openModal(getEl('saveModalOverlay'));
        if (sel.value === '__new__') setTimeout(() => input.focus(), 300);
    });
    sel.addEventListener('change', () => { sync(); if (sel.value === '__new__') input.focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const cb = getEl('confirmSaveBtn'); if(cb) cb.click(); } });
    
    const smo = getEl('saveModalOverlay');
    if(smo) {
        smo.addEventListener('click', (e) => {
            if (!e.target.closest('#confirmSaveBtn') || sel.value !== '__new__') return;
            const name = input.value.trim();
            if (!name) { e.stopPropagation(); showToast('Type a name for your new subject.'); input.focus(); return; }
            const existing = savedSubjects.find(s => s.toLowerCase() === name.toLowerCase());
            const finalName = existing || name;
            if (!existing) savedSubjects.push(finalName);
            sel.insertBefore(new Option(finalName, finalName), sel.firstChild);
            sel.value = finalName;
        }, true);
    }
}
addEvt('cancelSaveBtn', 'click', () => closeModal(getEl('saveModalOverlay')));
addEvt('confirmSaveBtn', 'click', () => {
    const targetSubject = getEl('saveSubjectSelect') ? getEl('saveSubjectSelect').value : '';
    const tEl = getEl('saveTitleInput');
    const title = tEl ? (tEl.value.trim() || 'Study Session') : 'Study Session';
    const newMaterial = { id: Date.now(), title, subject: targetSubject, date: new Date().toLocaleDateString(), reviewerHTML: currentGeneratedReviewerHTML, quizData: generatedQuizData, quizResult: pendingQuizResult, quizAttempts: pendingQuizAttempts.slice() };
    savedMaterials.push(newMaterial);
    currentMaterialId = newMaterial.id; pendingQuizResult = null; pendingQuizAttempts = [];
    syncUserStorage(); closeModal(getEl('saveModalOverlay')); showToast("Saved to " + targetSubject + "!");
});

// --- Quizzes ---
function renderMasteryList() {
    const items = savedMaterials.filter(material => material.quizData && material.quizData.length > 0);
    const masteryList = getEl('masteryPageList');
    if (!masteryList) return;
    if (items.length === 0) {
        masteryList.innerHTML = '<div class="col-span-full ios-card p-8 text-center text-gray-500">No quizzes available yet. Generate and save a quiz to practice it here.</div>';
        return;
    }
    masteryList.innerHTML = items.map(material => {
        const hasAttempts = material.quizAttempts && material.quizAttempts.length > 0;
        const bestScore = hasAttempts ? Math.max.apply(Math, material.quizAttempts.map(a => a.correctCount)) : (material.quizResult ? material.quizResult.correctCount : 0);
        return '<div class="ios-card p-5 flex flex-col justify-between shadow-sm"><div><h3 class="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1 truncate">'+escapeHTML(material.title || 'Saved Reviewer')+'</h3><p class="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3">'+escapeHTML(material.subject || 'Uncategorized')+'</p><p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Highest Score: <span class="font-bold text-gray-900 dark:text-white">'+bestScore+'/'+material.quizData.length+'</span></p></div><div class="flex gap-2 w-full mt-auto pt-4 border-t border-gray-100 dark:border-gray-800"><button onclick="localSavedMaterial('+Number(material.id)+', \'mastery\')" class="ios-btn ios-btn-blue flex-1 text-sm">'+(hasAttempts ? 'Retake' : 'Take Quiz')+'</button><button onclick="removeMaterial('+Number(material.id)+')" class="ios-btn ios-btn-tint flex-1 text-sm">Remove</button></div></div>';
    }).join('');
}

window.removeMaterial = function(id) {
    if (confirm("Are you sure you want to delete this study session completely?")) {
        savedMaterials = savedMaterials.filter(m => m.id !== id);
        syncUserStorage(); renderMasteryList(); renderSubjectsGrid(); showToast('Study session removed.');
    }
};

function renderSavedQuizAttempts(item) {
    const container = getEl('savedQuizAttempts'); if(!container) return;
    if (!item.quizData || !item.quizAttempts || item.quizAttempts.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">No answered quiz attempts available yet.</p>'; return;
    }
    container.innerHTML = item.quizAttempts.map((attempt, attemptIndex) => {
        let html = '<div class="ios-card p-5 space-y-4 mb-4"><div class="flex justify-between items-center"><h4 class="font-bold">Attempt '+(attemptIndex + 1)+'</h4><span class="text-sm font-semibold text-blue-500">'+attempt.correctCount+'/'+attempt.totalQuestions+'</span></div><p class="text-xs text-gray-500">'+escapeHTML(attempt.gradedAt)+'</p>';
        html += item.quizData.map((q, qIndex) => {
            const selected = attempt.answers[qIndex], correct = q.correctAnswerIndex;
            return '<div class="border-t border-gray-200 dark:border-gray-700 pt-4"><p class="font-semibold mb-3">'+(qIndex + 1)+'. '+escapeHTML(q.question)+'</p><p class="text-sm text-red-500">Your answer: '+(selected === undefined ? 'No answer' : escapeHTML(q.options[selected]))+'</p><p class="text-sm text-green-600 mt-1">Correct answer: '+escapeHTML(q.options[correct])+'</p><p class="text-sm text-gray-500 mt-1">'+escapeHTML(q.explanation || '')+'</p></div>';
        }).join('');
        return html + '</div>';
    }).join('');
}

window.loadSavedMaterial = function(id, returnView, subject) {
    if(!returnView) returnView = 'subjects';
    const item = savedMaterials.find(m => m.id === id); if (!item) return;
    currentMaterialId = item.id; pendingQuizResult = item.quizResult || null;
    savedMaterialReturnView = returnView; savedMaterialReturnSubject = subject || null;

    if(getEl('savedReviewerTitle')) getEl('savedReviewerTitle').textContent = item.title || 'Saved Reviewer';
    if(getEl('savedReviewerSubject')) getEl('savedReviewerSubject').textContent = item.subject || 'Uncategorized';
    if(getEl('savedReviewerContent')) getEl('savedReviewerContent').innerHTML = item.reviewerHTML || '<p>No reviewer available.</p>';
    
    generatedQuizData = item.quizData || [];
    renderSavedQuizAttempts(item);

    const retakeBtn = getEl('retakeQuizFromReviewerBtn');
    if (retakeBtn) {
        const hasAttempts = item.quizAttempts && item.quizAttempts.length > 0;
        retakeBtn.textContent = hasAttempts ? 'Retake Quiz' : 'Take Quiz';
        if(item.quizData && item.quizData.length > 0) retakeBtn.classList.remove('hidden'); else retakeBtn.classList.add('hidden');
    }
    switchMainView('reviewers'); show(getEl('savedReviewerReader'));
};

addEvt('backToSubjectsFromReaderBtn', 'click', () => {
    switchMainView(savedMaterialReturnView);
    if (savedMaterialReturnView === 'subjects' && savedMaterialReturnSubject) {
        hide(getEl('subjectsMainView')); show(getEl('subjectDetailView'));
        if(getEl('subjectDetailTitle')) getEl('subjectDetailTitle').textContent = savedMaterialReturnSubject;
    }
});

window.localSavedMaterial = function(id, returnView) {
    if(!returnView) returnView = 'reviewers';
    const item = savedMaterials.find(material => material.id === id);
    if (!item || !item.quizData || item.quizData.length === 0) return showToast('Quiz not available.');
    currentMaterialId = item.id; generatedQuizData = item.quizData; savedMaterialReturnView = returnView;
    switchMainView('standaloneQuiz'); renderStandaloneQuizUI();
};

addEvt('retakeQuizFromReviewerBtn', 'click', () => { localSavedMaterial(currentMaterialId, 'reviewers'); });
addEvt('backToReviewerFromQuizBtn', 'click', () => {
    switchMainView('reviewers');
    const item = savedMaterials.find(m => m.id === currentMaterialId);
    if (item) renderSavedQuizAttempts(item); 
});

function renderStandaloneQuizUI() {
    const w = getEl('standaloneQuestionsWrapper'), b = getEl('standaloneSubmitQuizBtn');
    if(!w) return;
    w.innerHTML = ''; userAnswers = {};
    show(b); if(b) b.disabled = true; hide(getEl('standaloneScoreDisplay'), 'flex');

    generatedQuizData.forEach((qData, qIndex) => {
        const block = document.createElement('div'); block.className = 'bg-white dark:bg-[#2c2c2e] border border-gray-100 dark:border-gray-700 rounded-xl p-5 shadow-sm ios-card';
        block.innerHTML = '<h3 class="text-base font-semibold mb-4"><span class="text-blue-500 mr-2">'+(qIndex + 1)+'.</span> '+qData.question+'</h3>';
        const optionsDiv = document.createElement('div'); optionsDiv.className = 'space-y-3';
        qData.options.forEach((optText, optIndex) => {
            const label = document.createElement('label'); label.className = 'quiz-option flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-black';
            label.innerHTML = '<input type="radio" name="sq_'+qIndex+'" value="'+optIndex+'" class="h-4 w-4 text-blue-600"><span class="ml-3 text-sm">'+optText+'</span>';
            label.querySelector('input').addEventListener('change', (e) => {
                optionsDiv.querySelectorAll('label').forEach(l => l.classList.remove('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-400', 'ring-1', 'ring-blue-400'));
                label.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-400', 'ring-1', 'ring-blue-400');
                userAnswers[qIndex] = parseInt(e.target.value, 10);
                if (Object.keys(userAnswers).length === generatedQuizData.length && b) b.disabled = false;
            });
            optionsDiv.appendChild(label);
        });
        block.appendChild(optionsDiv);
        const expDiv = document.createElement('div'); expDiv.id = 'sexp_' + qIndex; expDiv.className = 'hidden mt-4 p-3 bg-gray-50 dark:bg-black border-l-4 rounded-r-lg text-sm';
        expDiv.innerHTML = '<span class="font-semibold block mb-1">Explanation:</span> <span class="text-gray-600 dark:text-gray-400">'+qData.explanation+'</span>';
        block.appendChild(expDiv); w.appendChild(block);
    });
}

addEvt('standaloneSubmitQuizBtn', 'click', () => {
    let correctCount = 0;
    const w = getEl('standaloneQuestionsWrapper');
    generatedQuizData.forEach((qData, qIndex) => {
        const isCorrect = userAnswers[qIndex] === qData.correctAnswerIndex;
        if (isCorrect) correctCount++;
        const block = w ? w.children[qIndex] : null;
        if(block) {
            block.querySelectorAll('input').forEach(r => r.disabled = true);
            block.querySelectorAll('label').forEach((label, optIndex) => {
                label.className = 'flex items-center p-3 rounded-lg border opacity-70 cursor-default quiz-option';
                if (optIndex === qData.correctAnswerIndex) label.classList.add('bg-green-50', 'dark:bg-green-900/20', 'border-green-500', 'text-green-800', 'dark:text-green-400', 'opacity-100');
                else if (optIndex === userAnswers[qIndex] && !isCorrect) label.classList.add('bg-red-50', 'dark:bg-red-900/20', 'border-red-400', 'text-red-700', 'dark:text-red-400', 'opacity-100');
                else label.classList.add('border-gray-200', 'dark:border-gray-700');
            });
        }
        const exp = getEl('sexp_' + qIndex); if(exp) { exp.classList.remove('hidden'); exp.classList.add(isCorrect ? 'border-green-500' : 'border-red-400'); }
    });

    if(getEl('standaloneScoreValue')) getEl('standaloneScoreValue').textContent = correctCount;
    hide(getEl('standaloneSubmitQuizBtn')); show(getEl('standaloneScoreDisplay'), 'flex');

    const incorrectCount = generatedQuizData.length - correctCount;
    const quizAttempt = { answers: Object.assign({}, userAnswers), correctCount, incorrectCount, totalQuestions: generatedQuizData.length, gradedAt: new Date().toLocaleString() };

    const savedItem = savedMaterials.find(m => m.id === currentMaterialId);
    if (savedItem) {
        if(!savedItem.quizAttempts) savedItem.quizAttempts = [];
        savedItem.quizAttempts.push(quizAttempt);
        if (!savedItem.quizResult || correctCount > savedItem.quizResult.correctCount) {
            savedItem.quizResult = { correctCount, incorrectCount, totalQuestions: generatedQuizData.length, gradedAt: quizAttempt.gradedAt };
        }
        syncUserStorage();
    }
    userStats.quizzesGraded++; syncUserStorage(); showToast('Quiz results saved!');
});

// --- API Engine ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAX_PARALLEL = 3; let activeReqs = 0; const reqQueue = [];
const acquireReq = () => new Promise(res => { const go = () => { activeReqs++; res(); }; activeReqs < MAX_PARALLEL ? go() : reqQueue.push(go); });
const releaseReq = () => { activeReqs--; const n = reqQueue.shift(); if (n) n(); };

async function fetchRetry(url, payload) {
    if (!API_KEY) throw new Error('Gemini key missing. Add it to config.js.');
    for (let attempt = 1; ; attempt++) {
        let r;
        try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
        catch (e) { if (attempt < 3) { await sleep(2000 * attempt); continue; } throw new Error('Network error.'); }
        if (r.ok) return r;
        let msg = '', delayMs = null;
        try {
            const err = (await r.json()).error || {};
            msg = (err.message || '').split('\n')[0].slice(0, 160);
            const info = (err.details || []).find(d => String(d['@type']).indexOf('RetryInfo') > -1);
            if (info && info.retryDelay) delayMs = parseFloat(info.retryDelay) * 1000;
        } catch (_) {}
        if (r.status === 429) {
            if (/limit:\s*0/i.test(msg)) throw new Error('429: No free quota.');
            if (attempt < 3) { const w = Math.min(Math.max(delayMs || 15000, 5000), 45000); showToast("Rate limit reached. Retrying..."); await sleep(w); continue; }
            throw new Error('429 rate limit.');
        }
        if ([500, 503, 504].indexOf(r.status) > -1 && attempt < 4) { await sleep(2000 * attempt); continue; }
        throw new Error("API error " + r.status);
    }
}

async function callGemini(payload) {
    await acquireReq();
    try {
        const j = await (await fetchRetry("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + API_KEY, payload)).json();
        if(!j.candidates || !j.candidates[0].content.parts[0].text) throw new Error("Empty response");
        return j.candidates[0].content.parts[0].text;
    } finally { releaseReq(); }
}

async function gemStream(payload, onChunk) {
    await acquireReq();
    try {
        const r = await fetchRetry("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":streamGenerateContent?alt=sse&key=" + API_KEY, payload);
        const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', any = false;
        for (;;) {
            const res = await reader.read(); if (res.done) break;
            buf += dec.decode(res.value, { stream: true }); let i;
            while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
                if (!line.startsWith('data:')) continue;
                try { const t = (JSON.parse(line.slice(5)).candidates[0].content.parts || []).map(p => p.text || '').join(''); if (t) { any = true; onChunk(t); } } catch (_) { }
            }
        }
        if (!any) throw new Error('Empty response');
    } finally { releaseReq(); }
}

function cleanHtml(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const nodes = d.querySelectorAll('script,iframe,object,embed,style,link,meta');
    for(let i=0; i<nodes.length; i++) nodes[i].remove();
    const all = d.body.querySelectorAll('*');
    for(let i=0; i<all.length; i++) {
        const attrs = all[i].attributes;
        for(let j=attrs.length-1; j>=0; j--) { if (/^on/i.test(attrs[j].name) || /^\s*javascript:/i.test(attrs[j].value)) all[i].removeAttribute(attrs[j].name); }
    }
    return d.body.innerHTML;
}

function switchTab(tab) {
    const tabs = { reviewer: [getEl('btnTabReviewer'), getEl('tabReviewerContent')], quiz: [getEl('btnTabQuiz'), getEl('tabQuizContent')], videos: [getEl('btnTabVideos'), getEl('tabVideosContent')] };
    Object.keys(tabs).forEach(name => {
        const btn = tabs[name][0], content = tabs[name][1];
        if(btn) { if(name === tab) btn.classList.add('active'); else btn.classList.remove('active'); }
        if(name === tab) show(content, 'flex'); else hide(content, 'flex');
    });
}
addEvt('btnTabReviewer', 'click', () => switchTab('reviewer'));
addEvt('btnTabQuiz', 'click', () => switchTab('quiz'));
addEvt('btnTabVideos', 'click', () => switchTab('videos'));

const startedTimers = {}; let timerTick = null;
function tickTimers() {
    Object.keys(startedTimers).forEach(id => {
        const el = getEl(id), secs = Math.floor((Date.now() - startedTimers[id]) / 1000);
        const box = el ? el.closest('[id$="LoadingState"]') : null;
        if (!el || (box && box.classList.contains('hidden'))) {
            try { localStorage.setItem('edu_avg_' + id, String(Math.round((+(localStorage.getItem('edu_avg_' + id)||0) || secs) * 0.5 + secs * 0.5))); } catch (_) { }
            delete startedTimers[id]; return;
        }
        el.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    });
    if (!Object.keys(startedTimers).length) { clearInterval(timerTick); timerTick = null; }
}
function startLoadingTimer(id) {
    startedTimers[id] = Date.now();
    const el = getEl(id), avg = +(localStorage.getItem('edu_avg_' + id)||0);
    if (el) { el.textContent = '00:00'; if (avg && el.previousElementSibling) el.previousElementSibling.textContent = "Usually about " + avg + " seconds"; }
    if (!timerTick) timerTick = setInterval(tickTimers, 500);
}

function hasSource() { return currentText !== null || !!currentBase64Image; }
function sourceParts() {
    if (currentText !== null) return [{ text: 'STUDY MATERIAL:\n' + currentText }];
    return [{ inlineData: { mimeType: currentMimeType, data: currentBase64Image } }];
}

addEvt('fileInput', 'change', (e) => { if(e.target.files.length) handleFileSelect(e.target.files[0]); });
addEvt('uploadArea', 'dragenter', e => { e.preventDefault(); e.stopPropagation(); });
addEvt('uploadArea', 'dragover', e => { e.preventDefault(); e.stopPropagation(); });
addEvt('uploadArea', 'dragleave', e => { e.preventDefault(); e.stopPropagation(); });
addEvt('uploadArea', 'drop', e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length > 0) { const f = getEl('fileInput'); if(f) f.files = e.dataTransfer.files; handleFileSelect(e.dataTransfer.files[0]); } });
addEvt('clearBtn', 'click', fullReset);
addEvt('generateQuizBtn', 'click', generateQuizFromNotes);
addEvt('submitQuizBtn', 'click', gradeQuizDash);
addEvt('generateVideosBtn', 'click', smartVideos);

async function handleFileSelect(file) {
    if (!file) return;
    uploadId++; currentMaterialId = null; pendingQuizResult = null; pendingQuizAttempts = [];
    currentUploadedFileName = file.name; hide(getEl('saveActionHeader'));
    currentBase64Image = null; currentMimeType = null; currentText = null; currentGeneratedReviewerHTML = ""; generatedQuizData = null;
    userStats.uploads++; syncUserStorage();

    if (file.type.indexOf('image/') === 0) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height; const MAX = 1200;
                if (w > h && w > MAX) { h *= MAX / w; w = MAX; } else if (h > MAX) { w *= MAX / h; h = MAX; }
                canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                if(getEl('imagePreview')) getEl('imagePreview').src = dataUrl;
                show(getEl('imagePreview')); hide(getEl('fileCard'), 'flex');
                currentMimeType = 'image/jpeg'; currentBase64Image = dataUrl.split(',')[1];
                finalizeUpload(file.name, 'Compressed Image', iconImage, true);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (e) => { currentBase64Image = e.target.result.split(',')[1]; currentMimeType = 'application/pdf'; finalizeUpload(file.name, 'PDF Document', iconPDF, false); };
        reader.readAsDataURL(file);
    } else if (file.name.indexOf('.docx') > -1) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        currentText = result.value.slice(0, MAX_TEXT_CHARS); finalizeUpload(file.name, 'Word Document', iconWord, false);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => { currentText = e.target.result.slice(0, MAX_TEXT_CHARS); finalizeUpload(file.name, 'Text Document', iconText, false); };
        reader.readAsText(file);
    }
}

function finalizeUpload(name, type, icon, isImg) {
    hide(getEl('uploadArea')); show(getEl('previewContainer'), 'flex');
    if (!isImg) { hide(getEl('imagePreview')); show(getEl('fileCard'), 'flex'); if(getEl('fileName')) getEl('fileName').textContent = name; if(getEl('fileMeta')) getEl('fileMeta').textContent = type; if(getEl('fileIcon')) getEl('fileIcon').innerHTML = icon; }
    hide(getEl('quizContainer'), 'flex'); show(getEl('quizEmptyState')); hide(getEl('scoreDisplay'), 'flex');
    hide(getEl('videosContainer'), 'flex'); show(getEl('videosEmptyState'));
    if(getEl('generateQuizBtn')) getEl('generateQuizBtn').disabled = false; if(getEl('generateVideosBtn')) getEl('generateVideosBtn').disabled = false;
    switchTab('reviewer'); streamReviewer(); generateQuizFromNotes(); smartVideos();
}

function fullReset() {
    if(getEl('fileInput')) getEl('fileInput').value = ''; 
    currentBase64Image = null; currentText = null; currentGeneratedReviewerHTML = "";
    hide(getEl('previewContainer'), 'flex'); show(getEl('uploadArea'));
    if(getEl('reviewerContainer')) getEl('reviewerContainer').innerHTML = ''; 
    hide(getEl('reviewerContainer')); show(getEl('reviewerEmptyState'));
    hide(getEl('quizContainer'), 'flex'); show(getEl('quizEmptyState'));
    hide(getEl('videosContainer'), 'flex'); show(getEl('videosEmptyState'));
    hide(getEl('saveActionHeader')); switchTab('reviewer');
}

async function streamReviewer() {
    if (!hasSource()) return;
    const myId = uploadId; const rc = getEl('reviewerContainer'), ls = getEl('reviewerLoadingState');
    hide(getEl('reviewerEmptyState')); hide(rc); show(ls, 'flex'); startLoadingTimer('reviewerTimer');
    const payload = { contents: [{ role: 'user', parts: [{ text: 'Analyze the study material. Extract key academic concepts and definitions. Explicitly ignore metadata like course codes, student names, or syllabus headers. Be concise. Format as an HTML study guide using <h3>, <ul>, <li>, <p>, <strong>. Do not use markdown code blocks.' }].concat(sourceParts()) }] };
    let full = '';
    try {
        await gemStream(payload, (chunk) => {
            if (myId !== uploadId) return; full += chunk;
            if (rc) { rc.innerHTML = cleanHtml(full.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '')); hide(ls, 'flex'); show(rc); }
        });
        if (myId !== uploadId) return;
        if(rc) currentGeneratedReviewerHTML = rc.innerHTML;
        if(getEl('currentSessionLabel')) getEl('currentSessionLabel').textContent = currentUploadedFileName || 'Generated Session';
        show(getEl('saveActionHeader'));
    } catch (e) {
        if (myId !== uploadId) return; showToast(e.message || 'Failed to generate reviewer.'); hide(ls, 'flex'); if (!full) show(getEl('reviewerEmptyState'));
    }
}

async function generateQuizFromNotes() {
    if (!hasSource()) return;
    hide(getEl('quizEmptyState')); hide(getEl('quizContainer'), 'flex'); show(getEl('quizLoadingState'), 'flex'); startLoadingTimer('quizTimer');
    const payload = { contents: [{ role: "user", parts: [ { text: "Analyze the material and generate exactly 5 multiple-choice questions based ONLY on the core academic concepts, definitions, and theories presented. Explicitly IGNORE metadata such as course codes, syllabus titles, student names, dates, university names, or page numbers." }].concat(sourceParts()) }], generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { question: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correctAnswerIndex: { type: "INTEGER" }, explanation: { type: "STRING" } }, required: ["question", "options", "correctAnswerIndex", "explanation"] } } } };
    try {
        const text = await callGemini(payload); generatedQuizData = JSON.parse(text.replace(/```json|```/gi, '').trim()).slice(0, 5);
        const ls = getEl('quizLoadingState'); if(ls) { ls.classList.add('hidden'); ls.classList.remove('flex'); }
        renderQuizUI();
    } catch (error) { const ls = getEl('quizLoadingState'); if(ls) { ls.classList.add('hidden'); ls.classList.remove('flex'); } showToast(error.message || 'Failed to generate quiz.'); show(getEl('quizEmptyState')); }
}

function renderQuizUI() {
    show(getEl('quizContainer'), 'flex'); const w = getEl('questionsWrapper'); if(!w) return; w.innerHTML = ''; userAnswers = {};
    show(getEl('submitQuizBtn')); if(getEl('submitQuizBtn')) getEl('submitQuizBtn').disabled = true; hide(getEl('scoreDisplay'), 'flex');
    generatedQuizData.forEach((qData, qIndex) => {
        const block = document.createElement('div'); block.className = 'bg-white dark:bg-[#2c2c2e] border border-gray-100 dark:border-gray-700 rounded-xl p-5 shadow-sm ios-card';
        block.innerHTML = '<h3 class="text-base font-semibold mb-4"><span class="text-blue-500 mr-2">'+(qIndex + 1)+'.</span> '+escapeHTML(qData.question)+'</h3>';
        const optionsDiv = document.createElement('div'); optionsDiv.className = 'space-y-3';
        qData.options.forEach((optText, optIndex) => {
            const label = document.createElement('label'); label.className = 'quiz-option flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-black';
            label.innerHTML = '<input type="radio" name="q_'+qIndex+'" value="'+optIndex+'" class="h-4 w-4 text-blue-600"><span class="ml-3 text-sm">'+escapeHTML(optText)+'</span>';
            label.querySelector('input').addEventListener('change', (e) => {
                optionsDiv.querySelectorAll('label').forEach(l => { l.classList.remove('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-400', 'ring-1', 'ring-blue-400'); });
                label.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-400', 'ring-1', 'ring-blue-400');
                userAnswers[qIndex] = parseInt(e.target.value, 10);
                if (Object.keys(userAnswers).length === generatedQuizData.length && getEl('submitQuizBtn')) getEl('submitQuizBtn').disabled = false;
            });
            optionsDiv.appendChild(label);
        });
        block.appendChild(optionsDiv);
        const expDiv = document.createElement('div'); expDiv.id = 'exp_' + qIndex; expDiv.className = 'hidden mt-4 p-3 bg-gray-50 dark:bg-black border-l-4 rounded-r-lg text-sm';
        expDiv.innerHTML = '<span class="font-semibold block mb-1">Explanation:</span> <span class="text-gray-600 dark:text-gray-400">'+escapeHTML(qData.explanation)+'</span>';
        block.appendChild(expDiv); w.appendChild(block);
    });
}

function gradeQuizDash() {
    let correctCount = 0; const w = getEl('questionsWrapper');
    generatedQuizData.forEach((qData, qIndex) => {
        const isCorrect = userAnswers[qIndex] === qData.correctAnswerIndex;
        if (isCorrect) correctCount++;
        const block = w ? w.children[qIndex] : null;
        if(block) {
            block.querySelectorAll('input').forEach(r => r.disabled = true);
            block.querySelectorAll('label').forEach((label, optIndex) => {
                label.className = 'flex items-center p-3 rounded-lg border opacity-70 cursor-default quiz-option';
                if (optIndex === qData.correctAnswerIndex) label.classList.add('bg-green-50', 'dark:bg-green-900/20', 'border-green-500', 'text-green-800', 'dark:text-green-400', 'opacity-100');
                else if (optIndex === userAnswers[qIndex] && !isCorrect) label.classList.add('bg-red-50', 'dark:bg-red-900/20', 'border-red-400', 'text-red-700', 'dark:text-red-400', 'opacity-100');
                else label.classList.add('border-gray-200', 'dark:border-gray-700');
            });
        }
        const exp = getEl('exp_' + qIndex); if(exp){ exp.classList.remove('hidden'); exp.classList.add(isCorrect ? 'border-green-500' : 'border-red-400'); }
    });

    if(getEl('scoreValue')) getEl('scoreValue').textContent = correctCount;
    hide(getEl('submitQuizBtn')); show(getEl('scoreDisplay'), 'flex');
    const incorrectCount = generatedQuizData.length - correctCount;
    const quizResult = { correctCount, incorrectCount, totalQuestions: generatedQuizData.length, gradedAt: new Date().toLocaleString() };
    const quizAttempt = { answers: Object.assign({}, userAnswers), correctCount, incorrectCount, totalQuestions: generatedQuizData.length, gradedAt: quizResult.gradedAt };
    if (currentMaterialId !== null) {
        const savedItem = savedMaterials.find(m => m.id === currentMaterialId);
        if (savedItem) { savedItem.quizResult = quizResult; if(!savedItem.quizAttempts) savedItem.quizAttempts = []; savedItem.quizAttempts.push(quizAttempt); }
    } else { pendingQuizResult = quizResult; pendingQuizAttempts.push(quizAttempt); }
    userStats.quizzesGraded++; syncUserStorage();
}

const VID_SCHEMA = { type: 'OBJECT', properties: { topic: { type: 'STRING' }, suggestions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, query: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['title', 'query', 'reason'] } } }, required: ['topic', 'suggestions'] };
async function smartVideos() {
    if (!hasSource()) return; const myId = uploadId;
    hide(getEl('videosEmptyState')); hide(getEl('videosContainer'), 'flex'); show(getEl('videosLoadingState'), 'flex');
    const payload = { contents: [{ role: 'user', parts: [{ text: 'Identify the main topic of the study material and suggest 4 specific YouTube search queries (3-8 words each) that would help a student learn more. Give each a short title and one sentence on why it helps.' }].concat(sourceParts()) }], generationConfig: { responseMimeType: 'application/json', responseSchema: VID_SCHEMA } };
    try {
        const data = JSON.parse((await callGemini(payload)).replace(/```json|```/gi, '').trim());
        if (myId !== uploadId) return;
        
        const key = YT_API_KEY || ''; let reason = key ? '' : 'No YouTube key found. Add YT_API_KEY to config.js.';
        const results = await Promise.all(data.suggestions.map(async (item) => {
            if (key) {
                try {
                    const p = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '1', q: item.query, safeSearch: 'strict', videoEmbeddable: 'true', key });
                    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p), j = await r.json();
                    if (r.ok && j.items && j.items[0] && j.items[0].id && j.items[0].id.videoId) return { id: j.items[0].id.videoId, title: j.items[0].snippet.title, channel: j.items[0].snippet.channelTitle, thumb: j.items[0].snippet.thumbnails?.medium?.url || '' };
                } catch (e) { reason = reason || 'YouTube lookup failed.'; }
            }
            const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
            for (let i=0; i<PIPED.length; i++) {
                try {
                    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
                    const r = await fetch(PIPED[i] + '/search?q=' + encodeURIComponent(item.query) + '&filter=videos', { signal: ctl.signal }); clearTimeout(t);
                    if (r.ok) {
                        const v = ((await r.json()).items || []).find(x => x.url && x.url.indexOf('watch?v=') > -1);
                        const vId = v ? new URL(v.url, 'https://x').searchParams.get('v') : null;
                        if (vId) return { id: vId, title: escapeHTML(v.title), channel: escapeHTML(v.uploaderName), thumb: v.thumbnail || '' };
                    }
                } catch (_) { }
            }
            return null;
        }));
        data.suggestions.forEach((it, i) => { if (results[i]) it.video = results[i]; });
        data._note = data.suggestions.some(it => !it.video) ? (reason || 'No matching video was found for some topics.') : '';
        
        if (myId !== uploadId) return;
        
        const vc = getEl('videosContainer'); if(!vc) return;
        vc.innerHTML = '<div class="pb-4 border-b border-gray-100 dark:border-gray-800"><h2 class="text-xl font-bold text-gray-900 dark:text-white">Recommended Lectures</h2><p class="text-sm text-gray-500 mt-1">Topic: '+escapeHTML(data.topic)+'</p></div>';
        if(data._note) vc.innerHTML += '<div class="text-sm p-3 rounded-xl border border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"><b>Showing search links for some topics.</b> '+escapeHTML(data._note)+'</div>';
        
        data.suggestions.forEach((item) => {
            const hasVideo = !!item.video; const href = hasVideo ? "https://www.youtube.com/watch?v=" + item.video.id : "https://www.youtube.com/results?search_query=" + encodeURIComponent(item.query);
            let html = '<div class="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 bg-white dark:bg-[#2c2c2e]">';
            if (hasVideo && item.video.thumb) html += '<a href="'+href+'" target="_blank" class="shrink-0 block sm:w-48"><img src="'+item.video.thumb+'" class="w-full aspect-video object-cover rounded-xl bg-gray-100"></a>';
            html += '<div class="flex flex-col flex-grow min-w-0"><h3 class="text-base font-semibold text-gray-900 dark:text-white">'+(hasVideo ? escapeHTML(item.video.title) : escapeHTML(item.title))+'</h3>'+(hasVideo ? '<p class="text-xs text-gray-500 mt-0.5">'+escapeHTML(item.video.channel)+'</p>' : '')+'<p class="text-sm text-gray-600 dark:text-gray-400 mt-2">'+escapeHTML(item.reason)+'</p><a href="'+href+'" target="_blank" class="mt-3 self-start ios-btn ios-btn-red ios-btn-sm">'+(hasVideo ? 'Watch on YouTube' : 'Search on YouTube')+'</a></div></div>';
            vc.innerHTML += html;
        });
        
        const ls = getEl('videosLoadingState'); if(ls) { ls.classList.add('hidden'); ls.classList.remove('flex'); }
        show(vc, 'flex');
    } catch (e) {
        if (myId !== uploadId) return;
        showToast(e.message || 'Failed to suggest videos.');
        const ls = getEl('videosLoadingState'); if(ls) { ls.classList.add('hidden'); ls.classList.remove('flex'); }
        show(getEl('videosEmptyState'));
    }
}

let toastTimer = null;
function showToast(msg) {
    if(getEl('errorMessage')) getEl('errorMessage').textContent = msg;
    if(getEl('errorToast')) getEl('errorToast').classList.remove('-translate-y-20', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if(getEl('errorToast')) getEl('errorToast').classList.add('-translate-y-20', 'opacity-0'); }, 3200);
}

const hovCss = "#subjectsGrid > div button, #clearBtn, #openSaveModalBtn { transition: background-color .18s ease, color .18s ease, border-color .18s ease, transform .1s ease; } #subjectsGrid > div button[title=\"Rename\"]:hover, #subjectsGrid > div button[title=\"Rename\"]:focus-visible { background: var(--btn-blue) !important; color: #fff !important; border-color: var(--btn-blue) !important; } #subjectsGrid > div button[title=\"Delete\"]:hover, #subjectsGrid > div button[title=\"Delete\"]:focus-visible { background: var(--btn-red) !important; color: #fff !important; border-color: var(--btn-red) !important; } #clearBtn:hover, .dark #clearBtn:hover { background: var(--btn-red); color: #fff; border-color: var(--btn-red); filter: none; } #openSaveModalBtn:hover { background: var(--btn-blue) !important; color: #fff !important; filter: none; }";
const hovSt = document.createElement('style'); hovSt.textContent = hovCss; document.head.appendChild(hovSt);