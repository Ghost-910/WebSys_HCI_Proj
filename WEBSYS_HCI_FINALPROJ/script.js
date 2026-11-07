// --- Configuration ---
const API_KEY = "";
const YT_API_KEY = "";
const MODEL = "gemini-3.8-flash";
const MAX_TEXT_CHARS = 60000;

// --- Application & User State ---
let registeredUsers = JSON.parse(localStorage.getItem('edumaxxing_users')) || [];
let currentUser = JSON.parse(localStorage.getItem('edumaxxing_current_user')) || null;

let currentBase64Image = null, currentMimeType = null, currentText = null;
let generatedQuizData = null, userAnswers = {};
let uploadId = 0, currentGeneratedReviewerHTML = "", currentUploadedFileName = "";
let loadingInterval = null, secondsElapsed = 0;

let savedSubjects = [];
let savedMaterials = [];
let userStats = { uploads: 0, quizzesGraded: 0 };

// --- DOM Helper ---
const $ = (id) => document.getElementById(id);

// Stage Containers
const authScreen = $('authScreen');
const welcomeScreen = $('welcomeScreen');
const mainAppWrapper = $('mainAppWrapper');

// Auth Elements
const tabSignInBtn = $('tabSignInBtn'), tabSignUpBtn = $('tabSignUpBtn');
const signupExtraFields = $('signupExtraFields'), authForm = $('authForm');
const authNameInput = $('authNameInput'), authProgramInput = $('authProgramInput');
const authEmailInput = $('authEmailInput'), authPasswordInput = $('authPasswordInput');
const authSubmitBtn = $('authSubmitBtn'), googleSignInBtn = $('googleSignInBtn');
const googleModalOverlay = $('googleModalOverlay'), googleSavedAccountsList = $('googleSavedAccountsList');
const googleNameInput = $('googleNameInput'), googleEmailInput = $('googleEmailInput');

// Welcome Screen Elements
const welcomeAvatar = $('welcomeAvatar'), welcomeUserName = $('welcomeUserName'), startGeneratingBtn = $('startGeneratingBtn');

// Main App Views & Navigation
const viewHome = $('viewHome'), viewSubjects = $('viewSubjects'), viewProfile = $('viewProfile');
const navHomeBtn = $('navHomeBtn'), navSubjectsBtn = $('navSubjectsBtn'), navProfileBtn = $('navProfileBtn');
const hamburgerBtn = $('hamburgerBtn'), sideMenuDrawer = $('sideMenuDrawer'), sideMenuOverlay = $('sideMenuOverlay');

// Upload & Generator Elements
const fileInput = $('fileInput'), uploadArea = $('uploadArea'), previewContainer = $('previewContainer');
const imagePreview = $('imagePreview'), clearBtn = $('clearBtn'), fileCard = $('fileCard');
const fileName = $('fileName'), fileMeta = $('fileMeta'), fileIcon = $('fileIcon');

const btnTabReviewer = $('btnTabReviewer'), btnTabQuiz = $('btnTabQuiz'), btnTabVideos = $('btnTabVideos');
const tabReviewerContent = $('tabReviewerContent'), tabQuizContent = $('tabQuizContent'), tabVideosContent = $('tabVideosContent');
const reviewerContainer = $('reviewerContainer'), quizContainer = $('quizContainer'), videosContainer = $('videosContainer');
const generateQuizBtn = $('generateQuizBtn'), submitQuizBtn = $('submitQuizBtn'), generateVideosBtn = $('generateVideosBtn');
const scoreDisplay = $('scoreDisplay'), scoreValue = $('scoreValue');
const saveActionHeader = $('saveActionHeader'), openSaveModalBtn = $('openSaveModalBtn');

// Modals
const saveModalOverlay = $('saveModalOverlay'), saveSubjectSelect = $('saveSubjectSelect'), saveTitleInput = $('saveTitleInput');
const addSubjectModalOverlay = $('addSubjectModalOverlay'), newSubjectInput = $('newSubjectInput');
const editSubjectModalOverlay = $('editSubjectModalOverlay'), editSubjectInput = $('editSubjectInput');
const deleteSubjectModalOverlay = $('deleteSubjectModalOverlay');

let authMode = 'signin';
let subjectToEdit = null, subjectToDelete = null;

// --- Initialize App ---
initTheme();
if (currentUser) {
    loadUserData();
    showWelcomeScreen();
} else {
    showAuthScreen();
}

// ==========================================
// THEME (DARK / LIGHT MODE)
// ==========================================
function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    updateThemeIcons(isDark);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcons(isDark);
}

function updateThemeIcons(isDark) {
    document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', !isDark));
    document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', isDark));
}

$('themeToggleBtn').addEventListener('click', toggleTheme);
$('authThemeToggleBtn').addEventListener('click', toggleTheme);

// ==========================================
// STAGE 1 & 2: AUTHENTICATION & ONBOARDING
// ==========================================
function setAuthMode(mode) {
    authMode = mode;
    tabSignInBtn.classList.toggle('active', mode === 'signin');
    tabSignUpBtn.classList.toggle('active', mode === 'signup');
    signupExtraFields.classList.toggle('hidden', mode === 'signin');
    authSubmitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
}

tabSignInBtn.addEventListener('click', () => setAuthMode('signin'));
tabSignUpBtn.addEventListener('click', () => setAuthMode('signup'));

authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = authEmailInput.value.trim().toLowerCase();
    const password = authPasswordInput.value;

    if (authMode === 'signup') {
        const name = authNameInput.value.trim();
        const program = authProgramInput.value.trim() || 'BS Computer Science';
        if (!name) return showToast('Please enter your full name.');
        if (registeredUsers.some(u => u.email === email)) {
            return showToast('An account with this email already exists.');
        }
        const newUser = {
            name,
            email,
            password,
            provider: 'Standard Account',
            university: 'Batangas State University - Alangilan',
            program,
            bio: 'Turning static lecture notes into active recall mastery.'
        };
        registeredUsers.push(newUser);
        localStorage.setItem('edumaxxing_users', JSON.stringify(registeredUsers));
        loginSuccess(newUser);
    } else {
        const user = registeredUsers.find(u => u.email === email && u.password === password);
        if (!user) return showToast('Invalid email or password.');
        loginSuccess(user);
    }
});

// Google Sign-In Flow
googleSignInBtn.addEventListener('click', () => {
    const googleUsers = registeredUsers.filter(u => u.provider === 'Google Account');
    if (googleUsers.length > 0) {
        googleSavedAccountsList.innerHTML = `<p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Saved Google Accounts</p>` +
            googleUsers.map(u => `
                <button type="button" onclick="quickGoogleLogin('${u.email}')" class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-[#2c2c2e] border border-gray-200 dark:border-gray-700 text-left transition-colors">
                    <div class="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">${u.name.charAt(0).toUpperCase()}</div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">${u.name}</p>
                        <p class="text-xs text-gray-500 truncate">${u.email}</p>
                    </div>
                </button>
            `).join('');
    } else {
        googleSavedAccountsList.innerHTML = '';
    }
    googleNameInput.value = '';
    googleEmailInput.value = '';
    openModal(googleModalOverlay);
});

window.quickGoogleLogin = function(email) {
    const user = registeredUsers.find(u => u.email === email);
    if (user) {
        closeModal(googleModalOverlay);
        loginSuccess(user);
    }
};

$('cancelGoogleBtn').addEventListener('click', () => closeModal(googleModalOverlay));
$('confirmGoogleBtn').addEventListener('click', () => {
    const name = googleNameInput.value.trim();
    const email = googleEmailInput.value.trim().toLowerCase();
    if (!name || !email || !email.includes('@')) {
        return showToast('Please enter a valid name and Google email.');
    }
    let user = registeredUsers.find(u => u.email === email);
    if (!user) {
        user = {
            name,
            email,
            password: '',
            provider: 'Google Account',
            university: 'Batangas State University - Alangilan',
            program: 'BS Computer Science',
            bio: 'Streamlining study sessions with AI.'
        };
        registeredUsers.push(user);
        localStorage.setItem('edumaxxing_users', JSON.stringify(registeredUsers));
    }
    closeModal(googleModalOverlay);
    loginSuccess(user);
});

function loginSuccess(user) {
    currentUser = user;
    localStorage.setItem('edumaxxing_current_user', JSON.stringify(currentUser));
    loadUserData();
    showWelcomeScreen();
    showToast(`Signed in as ${user.name}`);
}

function showAuthScreen() {
    authScreen.classList.remove('hidden');
    welcomeScreen.classList.add('hidden');
    welcomeScreen.classList.remove('flex');
    mainAppWrapper.classList.add('hidden');
    mainAppWrapper.classList.remove('flex');
}

function showWelcomeScreen() {
    authScreen.classList.add('hidden');
    mainAppWrapper.classList.add('hidden');
    mainAppWrapper.classList.remove('flex');
    welcomeScreen.classList.remove('hidden');
    welcomeScreen.classList.add('flex');

    welcomeAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
    welcomeUserName.textContent = currentUser.name.split(' ')[0];
}

startGeneratingBtn.addEventListener('click', () => {
    welcomeScreen.classList.add('hidden');
    welcomeScreen.classList.remove('flex');
    mainAppWrapper.classList.remove('hidden');
    mainAppWrapper.classList.add('flex');
    switchMainView('home');
});

function logoutUser() {
    currentUser = null;
    localStorage.removeItem('edumaxxing_current_user');
    closeSideDrawer();
    fullReset();
    showAuthScreen();
    showToast('Signed out of your account.');
}

$('drawerLogoutBtn').addEventListener('click', logoutUser);
$('profileSignOutBtn').addEventListener('click', logoutUser);

// ==========================================
// PER-USER LOCALSTORAGE SYNC & STATS
// ==========================================
function getSubjectsKey() { return `edumaxxing_subjects_${currentUser.email}`; }
function getMaterialsKey() { return `edumaxxing_materials_${currentUser.email}`; }
function getStatsKey() { return `edumaxxing_stats_${currentUser.email}`; }

function loadUserData() {
    if (!currentUser) return;
    savedSubjects = JSON.parse(localStorage.getItem(getSubjectsKey())) || ["Computer Science 101", "Data Structures"];
    savedMaterials = JSON.parse(localStorage.getItem(getMaterialsKey())) || [];
    userStats = JSON.parse(localStorage.getItem(getStatsKey())) || { uploads: 0, quizzesGraded: 0 };
    syncUserUI();
    renderSubjectsGrid();
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

    // Header & Drawer
    $('headerAvatar').textContent = initial;
    $('headerUserName').textContent = currentUser.name;
    $('drawerAvatar').textContent = initial;
    $('drawerUserName').textContent = currentUser.name;
    $('drawerUserEmail').textContent = currentUser.email;

    // Dashboard Stats Row
    $('statSubjectsCount').textContent = savedSubjects.length;
    $('statReviewersCount').textContent = savedMaterials.length;
    $('statUploadsCount').textContent = userStats.uploads;

    // Personal Info Dashboard
    $('profileBigAvatar').textContent = initial;
    $('profileHeroName').textContent = currentUser.name;
    $('profileHeroEmail').textContent = currentUser.email;
    $('profileAuthBadge').textContent = currentUser.provider || 'Standard Account';
    $('profileHeroMeta').textContent = `${currentUser.university || 'University Student'} · ${currentUser.program || 'General Studies'}`;

    $('profileStatSubjects').textContent = savedSubjects.length;
    $('profileStatReviewers').textContent = savedMaterials.length;
    $('profileStatUploads').textContent = userStats.uploads;
    $('profileStatQuizzes').textContent = userStats.quizzesGraded;

    $('piNameInput').value = currentUser.name || '';
    $('piEmailInput').value = currentUser.email || '';
    $('piUniversityInput').value = currentUser.university || '';
    $('piProgramInput').value = currentUser.program || '';
    $('piBioInput').value = currentUser.bio || '';
}

// Save Personal Info Changes
$('personalInfoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentUser) return;
    currentUser.name = $('piNameInput').value.trim() || currentUser.name;
    currentUser.university = $('piUniversityInput').value.trim();
    currentUser.program = $('piProgramInput').value.trim();
    currentUser.bio = $('piBioInput').value.trim();

    localStorage.setItem('edumaxxing_current_user', JSON.stringify(currentUser));
    const idx = registeredUsers.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) {
        registeredUsers[idx] = { ...registeredUsers[idx], ...currentUser };
        localStorage.setItem('edumaxxing_users', JSON.stringify(registeredUsers));
    }
    syncUserUI();
    showToast('Personal info updated!');
});

// ==========================================
// NAVIGATION (BOTTOM PILL & SIDE DRAWER)
// ==========================================
function switchMainView(view) {
    viewHome.classList.toggle('hidden', view !== 'home');
    viewSubjects.classList.toggle('hidden', view !== 'subjects');
    viewProfile.classList.toggle('hidden', view !== 'profile');

    const navMap = {
        home: navHomeBtn,
        subjects: navSubjectsBtn,
        profile: navProfileBtn
    };

    Object.entries(navMap).forEach(([key, btn]) => {
        if (key === view) {
            btn.classList.remove('text-gray-400', 'dark:text-gray-500');
            btn.classList.add('text-blue-500');
        } else {
            btn.classList.remove('text-blue-500');
            btn.classList.add('text-gray-400', 'dark:text-gray-500');
        }
    });

    if (view === 'subjects') renderSubjectsGrid();
    if (view === 'profile') syncUserUI();
}

navHomeBtn.addEventListener('click', () => switchMainView('home'));
navSubjectsBtn.addEventListener('click', () => switchMainView('subjects'));
navProfileBtn.addEventListener('click', () => switchMainView('profile'));
$('headerProfileChip').addEventListener('click', () => switchMainView('profile'));
$('quickJumpSubjects').addEventListener('click', () => switchMainView('subjects'));

// Side Drawer
hamburgerBtn.addEventListener('click', () => {
    sideMenuOverlay.classList.remove('hidden');
    setTimeout(() => {
        sideMenuOverlay.classList.remove('opacity-0');
        sideMenuDrawer.classList.remove('-translate-x-full');
    }, 10);
});

function closeSideDrawer() {
    sideMenuOverlay.classList.add('opacity-0');
    sideMenuDrawer.classList.add('-translate-x-full');
    setTimeout(() => sideMenuOverlay.classList.add('hidden'), 300);
}

sideMenuOverlay.addEventListener('click', closeSideDrawer);
$('drawerDashboardBtn').addEventListener('click', () => { closeSideDrawer(); switchMainView('home'); });
$('drawerSubjectsBtn').addEventListener('click', () => { closeSideDrawer(); switchMainView('subjects'); });
$('drawerProfileBtn').addEventListener('click', () => { closeSideDrawer(); switchMainView('profile'); });
$('drawerHelpBtn').addEventListener('click', () => {
    closeSideDrawer();
    showToast('Upload a file on the Dashboard to generate an AI Reviewer, Quiz, and Videos.');
});

// ==========================================
// SUBJECTS CRUD & SAVING SESSIONS
// ==========================================
function openModal(overlay) {
    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        overlay.firstElementChild.classList.remove('scale-95');
    }, 10);
}

function closeModal(overlay) {
    overlay.classList.add('opacity-0');
    overlay.firstElementChild.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden'), 250);
}

// Add Subject
$('addNewSubjectBtn').addEventListener('click', () => {
    newSubjectInput.value = '';
    openModal(addSubjectModalOverlay);
    setTimeout(() => newSubjectInput.focus(), 50);
});
$('cancelAddSubjectBtn').addEventListener('click', () => closeModal(addSubjectModalOverlay));
$('confirmAddSubjectBtn').addEventListener('click', submitNewSubject);
newSubjectInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitNewSubject(); });

function submitNewSubject() {
    const sub = newSubjectInput.value.trim();
    if (!sub) return;
    if (savedSubjects.includes(sub)) return showToast('Subject already exists.');
    savedSubjects.push(sub);
    syncUserStorage();
    renderSubjectsGrid();
    closeModal(addSubjectModalOverlay);
    showToast(`Created "${sub}"`);
}

// Edit Subject
window.openEditSubjectModal = function(subject, event) {
    event.stopPropagation();
    subjectToEdit = subject;
    editSubjectInput.value = subject;
    openModal(editSubjectModalOverlay);
    setTimeout(() => editSubjectInput.focus(), 50);
};
$('cancelEditSubjectBtn').addEventListener('click', () => closeModal(editSubjectModalOverlay));
$('confirmEditSubjectBtn').addEventListener('click', submitEditSubject);
editSubjectInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitEditSubject(); });

function submitEditSubject() {
    const newName = editSubjectInput.value.trim();
    if (!newName || newName === subjectToEdit) return closeModal(editSubjectModalOverlay);
    if (savedSubjects.includes(newName)) return showToast('Subject already exists.');

    const idx = savedSubjects.indexOf(subjectToEdit);
    if (idx !== -1) savedSubjects[idx] = newName;
    savedMaterials.forEach(m => { if (m.subject === subjectToEdit) m.subject = newName; });

    syncUserStorage();
    renderSubjectsGrid();
    closeModal(editSubjectModalOverlay);
    showToast('Subject renamed.');
}

// Delete Subject
window.openDeleteSubjectModal = function(subject, event) {
    event.stopPropagation();
    subjectToDelete = subject;
    openModal(deleteSubjectModalOverlay);
};
$('cancelDeleteSubjectBtn').addEventListener('click', () => closeModal(deleteSubjectModalOverlay));
$('confirmDeleteSubjectBtn').addEventListener('click', () => {
    if (!subjectToDelete) return;
    savedSubjects = savedSubjects.filter(s => s !== subjectToDelete);
    savedMaterials = savedMaterials.filter(m => m.subject !== subjectToDelete);
    syncUserStorage();
    renderSubjectsGrid();
    closeModal(deleteSubjectModalOverlay);
    showToast('Subject deleted.');
});

// Save Material Modal
openSaveModalBtn.addEventListener('click', () => {
    saveSubjectSelect.innerHTML = savedSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
    saveTitleInput.value = currentUploadedFileName ? currentUploadedFileName.replace(/\.[^/.]+$/, '') : 'Study Session';
    openModal(saveModalOverlay);
});
$('cancelSaveBtn').addEventListener('click', () => closeModal(saveModalOverlay));
$('confirmSaveBtn').addEventListener('click', () => {
    const targetSubject = saveSubjectSelect.value;
    const title = saveTitleInput.value.trim() || 'Study Session';
    const newMaterial = {
        id: Date.now(),
        title,
        subject: targetSubject,
        date: new Date().toLocaleDateString(),
        reviewerHTML: currentGeneratedReviewerHTML,
        quizData: generatedQuizData
    };
    savedMaterials.push(newMaterial);
    syncUserStorage();
    closeModal(saveModalOverlay);
    showToast(`Saved to ${targetSubject}!`);
});

function renderSubjectsGrid() {
    const grid = $('subjectsGrid');
    grid.innerHTML = savedSubjects.map(sub => {
        const count = savedMaterials.filter(m => m.subject === sub).length;
        const safeSub = sub.replace(/'/g, "\\'");
        return `
        <div onclick="openSubjectDetail('${safeSub}')" class="ios-card p-6 cursor-pointer hover:border-blue-500 border border-transparent transition-all relative group">
            <div class="absolute top-4 right-4 flex gap-1 z-10">
                <button onclick="openEditSubjectModal('${safeSub}', event)" class="p-2 text-gray-400 hover:text-blue-500 bg-gray-100/80 dark:bg-[#2c2c2e] rounded-full transition-colors" title="Rename">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onclick="openDeleteSubjectModal('${safeSub}', event)" class="p-2 text-gray-400 hover:text-red-500 bg-gray-100/80 dark:bg-[#2c2c2e] rounded-full transition-colors" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white pr-16 truncate">${sub}</h3>
            <p class="text-sm text-gray-500 mt-1">${count} Saved ${count === 1 ? 'Session' : 'Sessions'}</p>
        </div>`;
    }).join('');
    $('subjectDetailView').classList.add('hidden');
    grid.classList.remove('hidden');
}

window.openSubjectDetail = function(subject) {
    $('subjectsGrid').classList.add('hidden');
    $('subjectDetailView').classList.remove('hidden');
    $('subjectDetailTitle').textContent = subject;

    const items = savedMaterials.filter(m => m.subject === subject);
    $('savedItemsList').innerHTML = items.length === 0
        ? `<p class="text-gray-500 text-sm">No materials saved inside this subject yet.</p>`
        : items.map(m => `
        <div class="ios-card p-5 flex justify-between items-center border border-gray-100 dark:border-gray-800">
            <div>
                <p class="font-bold text-gray-900 dark:text-white">${m.title || 'Study Session'}</p>
                <p class="text-xs text-gray-500 mt-0.5">${m.date} · ${m.quizData ? 'Reviewer + 5-Item Quiz' : 'Reviewer Only'}</p>
            </div>
            <button onclick="loadSavedMaterial(${m.id})" class="ios-btn ios-btn-sm ios-btn-blue">Open Session</button>
        </div>`).join('');
};

window.loadSavedMaterial = function(id) {
    const item = savedMaterials.find(m => m.id === id);
    if (!item) return;

    currentGeneratedReviewerHTML = item.reviewerHTML;
    reviewerContainer.innerHTML = item.reviewerHTML;
    hide($('reviewerEmptyState'));
    show(reviewerContainer);
    saveActionHeader.classList.remove('hidden');
    $('currentSessionLabel').textContent = `${item.subject} · ${item.title || 'Saved Session'}`;
    generateVideosBtn.disabled = false;

    if (item.quizData) {
        generatedQuizData = item.quizData;
        renderQuizUI();
    }
    switchMainView('home');
    switchTab('reviewer');
    showToast(`Loaded "${item.title || 'Study Session'}"`);
};

$('backToSubjectsBtn').addEventListener('click', () => {
    $('subjectDetailView').classList.add('hidden');
    $('subjectsGrid').classList.remove('hidden');
});

// ==========================================
// FILE HANDLING, COMPRESSION & GEMINI API
// ==========================================
function show(el, display = null) { el.classList.remove('hidden'); if (display) el.classList.add(display); }
function hide(el, display = null) { el.classList.add('hidden'); if (display) el.classList.remove(display); }

function switchTab(tab) {
    const tabs = { reviewer: [btnTabReviewer, tabReviewerContent], quiz: [btnTabQuiz, tabQuizContent], videos: [btnTabVideos, tabVideosContent] };
    Object.entries(tabs).forEach(([name, [btn, content]]) => {
        btn.classList.toggle('active', name === tab);
        if (name === tab) show(content, 'flex'); else hide(content, 'flex');
    });
}

btnTabReviewer.addEventListener('click', () => switchTab('reviewer'));
btnTabQuiz.addEventListener('click', () => switchTab('quiz'));
btnTabVideos.addEventListener('click', () => switchTab('videos'));
generateVideosBtn.addEventListener('click', generateVideoSuggestions);
fileInput.addEventListener('change', handleFileSelect);
clearBtn.addEventListener('click', fullReset);
generateQuizBtn.addEventListener('click', generateQuizFromNotes);
submitQuizBtn.addEventListener('click', gradeQuiz);

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
    uploadArea.addEventListener(name, e => { e.preventDefault(); e.stopPropagation(); });
});
uploadArea.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect({ target: fileInput });
    }
});

function startLoadingTimer(elementId) {
    clearInterval(loadingInterval);
    secondsElapsed = 0;
    const timerEl = $(elementId);
    if (timerEl) timerEl.textContent = "00:00";
    loadingInterval = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopLoadingTimer() { clearInterval(loadingInterval); }

function hasSource() { return currentText !== null || !!currentBase64Image; }
function sourceParts() {
    if (currentText !== null) return [{ text: 'STUDY MATERIAL:\n' + currentText }];
    return [{ inlineData: { mimeType: currentMimeType, data: currentBase64Image } }];
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    uploadId++;
    currentUploadedFileName = file.name;
    saveActionHeader.classList.add('hidden');
    currentBase64Image = null; currentMimeType = null; currentText = null;
    currentGeneratedReviewerHTML = ""; generatedQuizData = null;

    userStats.uploads++;
    syncUserStorage();

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const MAX_SIZE = 1200;
                if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65);

                imagePreview.src = compressedDataUrl;
                show(imagePreview); hide(fileCard, 'flex');
                currentMimeType = 'image/jpeg';
                currentBase64Image = compressedDataUrl.split(',')[1];
                finalizeUpload(file.name, 'Compressed Image', '🖼️', true);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentBase64Image = e.target.result.split(',')[1];
            currentMimeType = 'application/pdf';
            finalizeUpload(file.name, 'PDF Document', '📕', false);
        };
        reader.readAsDataURL(file);
    } else if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        currentText = result.value.slice(0, MAX_TEXT_CHARS);
        finalizeUpload(file.name, 'Word Document', '📘', false);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentText = e.target.result.slice(0, MAX_TEXT_CHARS);
            finalizeUpload(file.name, 'Text Document', '📄', false);
        };
        reader.readAsText(file);
    }
}

function finalizeUpload(name, type, icon, isImg) {
    hide(uploadArea); show(previewContainer, 'flex');
    if (!isImg) {
        hide(imagePreview); show(fileCard, 'flex');
        fileName.textContent = name; fileMeta.textContent = type; fileIcon.textContent = icon;
    }
    generateQuizBtn.disabled = false;
    switchTab('reviewer');
    generateReviewerFromNotes();
}

function fullReset() {
    fileInput.value = ''; currentBase64Image = null; currentText = null; currentGeneratedReviewerHTML = "";
    hide(previewContainer, 'flex'); show(uploadArea);
    reviewerContainer.innerHTML = ''; hide(reviewerContainer); show($('reviewerEmptyState'));
    hide(quizContainer, 'flex'); show($('quizEmptyState'));
    hide(videosContainer, 'flex'); show($('videosEmptyState'));
    saveActionHeader.classList.add('hidden');
    switchTab('reviewer');
}

async function callGemini(payload) {
    if (!API_KEY || API_KEY.startsWith('PASTE_')) {
        throw new Error('Paste your Gemini API key at the top of script.js.');
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

async function generateReviewerFromNotes() {
    if (!hasSource()) return;
    hide($('reviewerEmptyState')); hide(reviewerContainer); show($('reviewerLoadingState'), 'flex');
    startLoadingTimer('reviewerTimer');

    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: "Analyze the study material. Extract key academic concepts and definitions. Explicitly ignore metadata like course codes, student names, or syllabus headers. Format as an HTML study guide using <h3>, <ul>, <li>, <p>, <strong>. Do not use markdown code blocks." },
                ...sourceParts()
            ]
        }]
    };

    try {
        let html = await callGemini(payload);
        html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
        currentGeneratedReviewerHTML = html;
        reviewerContainer.innerHTML = html;

        stopLoadingTimer();
        hide($('reviewerLoadingState'), 'flex'); show(reviewerContainer);
        $('currentSessionLabel').textContent = currentUploadedFileName || 'Generated Session';
        saveActionHeader.classList.remove('hidden');
        generateVideosBtn.disabled = false;
    } catch (error) {
        stopLoadingTimer();
        showToast(error.message || 'Failed to generate reviewer.');
        hide($('reviewerLoadingState'), 'flex'); show($('reviewerEmptyState'));
    }
}

async function generateQuizFromNotes() {
    if (!hasSource()) return;
    hide($('quizEmptyState')); hide(quizContainer, 'flex'); show($('quizLoadingState'), 'flex');
    startLoadingTimer('quizTimer');

    const payload = {
        contents: [{
            role: "user",
            parts: [
                { text: "Analyze the material and generate exactly 5 multiple-choice questions based ONLY on the core academic concepts, definitions, and theories presented. Explicitly IGNORE metadata such as course codes, syllabus titles, student names, dates, university names, or page numbers." },
                ...sourceParts()
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        question: { type: "STRING" },
                        options: { type: "ARRAY", items: { type: "STRING" } },
                        correctAnswerIndex: { type: "INTEGER" },
                        explanation: { type: "STRING" }
                    },
                    required: ["question", "options", "correctAnswerIndex", "explanation"]
                }
            }
        }
    };

    try {
        const text = await callGemini(payload);
        generatedQuizData = JSON.parse(text.replace(/```json|```/gi, '').trim()).slice(0, 5);
        stopLoadingTimer();
        renderQuizUI();
    } catch (error) {
        stopLoadingTimer();
        showToast(error.message || 'Failed to generate quiz.');
        hide($('quizLoadingState'), 'flex'); show($('quizEmptyState'));
    }
}

function renderQuizUI() {
    hide($('quizLoadingState'), 'flex'); show(quizContainer, 'flex');
    $('questionsWrapper').innerHTML = ''; userAnswers = {};
    show(submitQuizBtn); submitQuizBtn.disabled = true;
    hide(scoreDisplay, 'flex');

    generatedQuizData.forEach((qData, qIndex) => {
        const block = document.createElement('div');
        block.className = 'bg-white dark:bg-[#2c2c2e] border border-gray-100 dark:border-gray-700 rounded-xl p-5 shadow-sm ios-card';
        block.innerHTML = `<h3 class="text-base font-semibold mb-4"><span class="text-blue-500 mr-2">${qIndex + 1}.</span> ${qData.question}</h3>`;

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'space-y-3';
        qData.options.forEach((optText, optIndex) => {
            const label = document.createElement('label');
            label.className = 'quiz-option flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-black';
            label.innerHTML = `<input type="radio" name="q_${qIndex}" value="${optIndex}" class="h-4 w-4 text-blue-600"><span class="ml-3 text-sm">${optText}</span>`;

            label.querySelector('input').addEventListener('change', (e) => {
                optionsDiv.querySelectorAll('label').forEach(l => l.classList.remove('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-400', 'ring-1', 'ring-blue-400'));
                label.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-400', 'ring-1', 'ring-blue-400');
                userAnswers[qIndex] = parseInt(e.target.value, 10);
                if (Object.keys(userAnswers).length === generatedQuizData.length) {
                    submitQuizBtn.disabled = false;
                }
            });
            optionsDiv.appendChild(label);
        });
        block.appendChild(optionsDiv);

        const expDiv = document.createElement('div');
        expDiv.id = `exp_${qIndex}`;
        expDiv.className = 'hidden mt-4 p-3 bg-gray-50 dark:bg-black border-l-4 rounded-r-lg text-sm';
        expDiv.innerHTML = `<span class="font-semibold block mb-1">Explanation:</span> <span class="text-gray-600 dark:text-gray-400">${qData.explanation}</span>`;
        block.appendChild(expDiv);

        $('questionsWrapper').appendChild(block);
    });
}

function gradeQuiz() {
    let correctCount = 0;
    generatedQuizData.forEach((qData, qIndex) => {
        const isCorrect = userAnswers[qIndex] === qData.correctAnswerIndex;
        if (isCorrect) correctCount++;
        const block = $('questionsWrapper').children[qIndex];
        block.querySelectorAll('input').forEach(r => r.disabled = true);
        block.querySelectorAll('label').forEach((label, optIndex) => {
            label.className = 'flex items-center p-3 rounded-lg border opacity-70 cursor-default quiz-option';
            if (optIndex === qData.correctAnswerIndex) label.classList.add('bg-green-50', 'dark:bg-green-900/20', 'border-green-500', 'text-green-800', 'dark:text-green-400', 'opacity-100');
            else if (optIndex === userAnswers[qIndex] && !isCorrect) label.classList.add('bg-red-50', 'dark:bg-red-900/20', 'border-red-400', 'text-red-700', 'dark:text-red-400', 'opacity-100');
            else label.classList.add('border-gray-200', 'dark:border-gray-700');
        });
        const exp = $(`exp_${qIndex}`);
        exp.classList.remove('hidden');
        exp.classList.add(isCorrect ? 'border-green-500' : 'border-red-400');
    });

    scoreValue.textContent = correctCount;
    hide(submitQuizBtn);
    show(scoreDisplay, 'flex');

    userStats.quizzesGraded++;
    syncUserStorage();
}

// ==========================================
// YOUTUBE VIDEO SUGGESTIONS
// ==========================================
async function generateVideoSuggestions() {
    const notesText = (reviewerContainer.innerText || '').trim().slice(0, 6000);
    if (!notesText) return showToast('Generate a reviewer first before finding videos.');

    hide($('videosEmptyState')); hide(videosContainer, 'flex'); show($('videosLoadingState'), 'flex');

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: "Identify the main topic of this study guide and suggest 4 specific YouTube search queries (3-8 words each) that would help a student learn more.\n\n" + notesText }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    topic: { type: "STRING" },
                    suggestions: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: { title: { type: "STRING" }, query: { type: "STRING" }, reason: { type: "STRING" } },
                            required: ["title", "query", "reason"]
                        }
                    }
                },
                required: ["topic", "suggestions"]
            }
        }
    };

    try {
        const text = await callGemini(payload);
        const data = JSON.parse(text.replace(/```json|```/gi, '').trim());
        await attachVideos(data);
        renderVideos(data);
    } catch (error) {
        showToast(error.message || 'Failed to suggest videos.');
        hide($('videosLoadingState'), 'flex'); show($('videosEmptyState'));
    }
}

async function attachVideos(data) {
    if (!YT_API_KEY || YT_API_KEY.startsWith('PASTE_')) return;
    const results = await Promise.all(data.suggestions.map(async (item) => {
        try {
            const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '1', q: item.query, safeSearch: 'strict', key: YT_API_KEY });
            const response = await fetch('https://www.googleapis.com/youtube/v3/search?' + params);
            const json = await response.json();
            const vid = json.items && json.items[0];
            if (!vid) return null;
            return { id: vid.id.videoId, title: vid.snippet.title, channel: vid.snippet.channelTitle, thumb: vid.snippet.thumbnails?.medium?.url || '' };
        } catch (_) { return null; }
    }));
    data.suggestions.forEach((item, i) => { if (results[i]) item.video = results[i]; });
}

function renderVideos(data) {
    videosContainer.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'pb-4 border-b border-gray-100 dark:border-gray-800';
    heading.innerHTML = `<h2 class="text-xl font-bold text-gray-900 dark:text-white">Recommended Lectures</h2><p class="text-sm text-gray-500 mt-1">Topic: ${data.topic}</p>`;
    videosContainer.appendChild(heading);

    data.suggestions.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 bg-white dark:bg-[#2c2c2e]';
        const hasVideo = !!item.video;
        const href = hasVideo ? `https://www.youtube.com/watch?v=${item.video.id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(item.query)}`;

        if (hasVideo && item.video.thumb) {
            card.innerHTML += `<a href="${href}" target="_blank" class="shrink-0 block sm:w-48"><img src="${item.video.thumb}" class="w-full aspect-video object-cover rounded-xl bg-gray-100"></a>`;
        }

        card.innerHTML += `
            <div class="flex flex-col flex-grow min-w-0">
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">${hasVideo ? item.video.title : item.title}</h3>
                ${hasVideo ? `<p class="text-xs text-gray-500 mt-0.5">${item.video.channel}</p>` : ''}
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">${item.reason}</p>
                <a href="${href}" target="_blank" class="mt-3 self-start ios-btn ios-btn-red ios-btn-sm">${hasVideo ? 'Watch on YouTube' : 'Search on YouTube'}</a>
            </div>
        `;
        videosContainer.appendChild(card);
    });

    hide($('videosLoadingState'), 'flex'); show(videosContainer, 'flex');
}

// Toast Notification
let toastTimer = null;
function showToast(msg) {
    $('errorMessage').textContent = msg;
    $('errorToast').classList.remove('-translate-y-20', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('errorToast').classList.add('-translate-y-20', 'opacity-0'), 3200);
}
