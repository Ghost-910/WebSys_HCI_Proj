// auth.js: real sign-in for EduMaxxing (Firebase Authentication: email + password, and Google).
// Load AFTER script.js:  <script src="auth.js"></script>
(async function () {
    const IDLE_MINUTES = 30;                               
    const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

    // Remove the old, unsafe login data right away
    localStorage.removeItem('edumaxxing_users');           
    localStorage.removeItem('edumaxxing_current_user');    
    registeredUsers.length = 0; currentUser = null; showAuthScreen();

    //UI helpers
    const st = document.createElement('style');
    st.textContent = `.auth-msg{margin-top:12px;padding:10px 12px;border-radius:10px;font-size:14px;font-weight:600}
        .auth-msg.err{background:rgba(255,59,48,.12);color:#c70f1d}.dark .auth-msg.err{color:#ff6b61}
        .auth-msg.ok{background:rgba(52,199,89,.16);color:#1b7f37}.dark .auth-msg.ok{color:#30d158}`;
    document.head.appendChild(st);

    const form = getEl('authForm'), submit = getEl('authSubmitBtn');
    const msg = document.createElement('div'); msg.className = 'auth-msg hidden'; msg.setAttribute('role', 'alert'); form.after(msg);
    const showMsg = (t, kind) => { msg.textContent = t; msg.className = 'auth-msg ' + (kind || 'err'); };
    const clearMsg = () => { msg.className = 'auth-msg hidden'; };

    const row = document.createElement('div');             // "keep me signed in" + "forgot password"
    row.className = 'flex items-center justify-between gap-3 text-sm';
    row.innerHTML = `<label class="flex items-center gap-2 text-gray-600 dark:text-gray-300"><input type="checkbox" id="authRemember" checked class="h-4 w-4"> Keep me signed in</label>
        <button type="button" id="forgotPwBtn" class="font-semibold text-blue-500">Forgot password?</button>`;
    const hint = document.createElement('p');
    hint.className = 'hidden text-xs text-gray-500'; hint.textContent = 'Use at least 10 characters, with letters and numbers.';
    submit.before(hint); submit.before(row);
    const syncMode = () => { const up = authMode === 'signup'; hint.classList.toggle('hidden', !up); getEl('forgotPwBtn').classList.toggle('hidden', up); clearMsg(); };
    getEl('tabSignInBtn').addEventListener('click', syncMode); getEl('tabSignUpBtn').addEventListener('click', syncMode); syncMode();

    const setBusy = (b, label) => { submit.disabled = b; submit.textContent = b ? label : (authMode === 'signup' ? 'Create Account' : 'Sign In'); };
    setBusy(true, 'Checking session…');

    // Start the sign-in service
    const cfg = typeof CONFIG === 'object' && CONFIG.FIREBASE;
    if (!cfg || !cfg.apiKey) { showMsg('Sign-in is not set up yet. Add your FIREBASE settings to config.js.'); setBusy(true, 'Sign-in unavailable'); return; }
    const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(); document.head.appendChild(s); });
    try { await load(SDK + 'firebase-app-compat.js'); await load(SDK + 'firebase-auth-compat.js'); }
    catch (_) { showMsg('Could not load the sign-in service. Check your internet connection and reload.'); setBusy(true, 'Sign-in unavailable'); return; }
    firebase.initializeApp(cfg);
    const auth = firebase.auth();

    // Rules and messages
    const COMMON = ['password', 'password1', 'password123', '1234567890', '12345678', 'qwertyuiop', 'qwerty123', 'iloveyou', 'letmein123', 'admin12345', 'welcome123'];
    function passwordProblem(pw, email) {
        if (pw.length < 10) return 'Your password needs at least 10 characters.';
        if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Your password needs both letters and numbers.';
        if (COMMON.includes(pw.toLowerCase())) return 'That password is too common. Choose something harder to guess.';
        const local = email.split('@')[0];
        if (local.length >= 4 && pw.toLowerCase().includes(local)) return 'Your password should not contain your email name.';
        return '';
    }
    const ERR = {
        'auth/invalid-credential': 'Incorrect email or password.', 'auth/wrong-password': 'Incorrect email or password.', 'auth/user-not-found': 'Incorrect email or password.',
        'auth/invalid-email': 'That email address does not look right.', 'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
        'auth/weak-password': 'Choose a stronger password.', 'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
        'auth/network-request-failed': 'Network problem. Check your connection and try again.',
        'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
        'auth/unauthorized-domain': 'This address is not allowed for sign-in. In Firebase, add it under Authentication > Settings > Authorized domains.',
        'auth/operation-not-allowed': 'This sign-in method is not turned on in Firebase yet.'
    };
    const friendly = (e) => ERR[e && e.code] || ('Something went wrong' + (e && e.code ? ' (' + e.code + ')' : '') + '. Please try again.');

    // Profile details (not secret) live on this device, per account
    const pKey = (uid) => 'edumaxxing_profile_' + uid;
    const loadProfile = (uid) => { try { return JSON.parse(localStorage.getItem(pKey(uid))) || {}; } catch (_) { return {}; } };
    getEl('personalInfoForm').addEventListener('submit', () => {          // runs after the app has updated currentUser
        if (currentUser && currentUser.uid) localStorage.setItem(pKey(currentUser.uid), JSON.stringify({ name: currentUser.name, university: currentUser.university, program: currentUser.program, bio: currentUser.bio }));
    });

    // Sign in / create account (replaces the old handler)
    let suppress = 0, activeUid = null;
    getEl('authScreen').addEventListener('submit', async (e) => {
        if (e.target !== form) return;
        e.preventDefault(); e.stopPropagation(); clearMsg();
        const email = getEl('authEmailInput').value.trim().toLowerCase(), pw = getEl('authPasswordInput').value;
        const fail = (t) => { showMsg(t); };
        setBusy(true, 'Please wait…');
        try {
            await auth.setPersistence(getEl('authRemember').checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
            if (authMode === 'signup') {
                const name = getEl('authNameInput').value.trim();
                if (!name) return fail('Please enter your full name.');
                const problem = passwordProblem(pw, email); if (problem) return fail(problem);
                suppress++;
                try {
                    const cred = await auth.createUserWithEmailAndPassword(email, pw);
                    await cred.user.updateProfile({ displayName: name });
                    localStorage.setItem(pKey(cred.user.uid), JSON.stringify({ name, program: getEl('authProgramInput').value.trim() || 'BS Computer Science' }));
                    await cred.user.sendEmailVerification();
                    await auth.signOut();
                } finally { suppress--; }
                getEl('tabSignInBtn').click(); getEl('authPasswordInput').value = '';
                showMsg(`Account created. We sent a verification link to ${email}. Open it, then sign in.`, 'ok');
            } else {
                await auth.signInWithEmailAndPassword(email, pw);   // the listener below finishes the sign-in
            }
        } catch (err) { fail(friendly(err)); }
        finally { setBusy(false); }
    }, true);

    getEl('forgotPwBtn').addEventListener('click', async () => {
        const email = getEl('authEmailInput').value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return showMsg('Type your email above first, then press "Forgot password?".');
        try { await auth.sendPasswordResetEmail(email); }
        catch (e) { if (e.code !== 'auth/user-not-found' && e.code !== 'auth/invalid-email') return showMsg(friendly(e)); }
        showMsg(`If an account exists for ${email}, a reset link is on its way.`, 'ok');   // same answer either way, so nobody can probe for accounts
    });

    // Real Google sign-in
    getEl('googleSignInSection').addEventListener('click', async (e) => {
        if (!e.target.closest('#googleSignInBtn')) return;
        e.stopPropagation(); clearMsg();
        try {
            await auth.setPersistence(getEl('authRemember').checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        } catch (err) { if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') showMsg(friendly(err)); }
    }, true);

    // The one place that decides who is signed in
    auth.onAuthStateChanged(async (user) => {
        if (suppress) return;
        if (!user) {
            activeUid = null; currentUser = null; localStorage.removeItem('edumaxxing_current_user');
            if (!mainAppWrapper.classList.contains('hidden') || !welcomeScreen.classList.contains('hidden')) showAuthScreen();
            setBusy(false);
            if (sessionStorage.getItem('edu_idle')) { sessionStorage.removeItem('edu_idle'); showMsg(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`, 'ok'); }
            return;
        }
        if (!user.emailVerified) {                          // email accounts must confirm their address first
            let note = `Please verify your email first. Check ${user.email} for the link.`;
            try { await user.sendEmailVerification(); note = `Please verify your email first. We just sent a new link to ${user.email}.`; } catch (_) { }
            suppress++; try { await auth.signOut(); } finally { suppress--; }
            setBusy(false); showMsg(note); return;
        }
        if (activeUid === user.uid) return;
        activeUid = user.uid;
        const p = loadProfile(user.uid), google = user.providerData.some(d => d.providerId === 'google.com');
        setBusy(false); clearMsg(); getEl('authPasswordInput').value = '';
        loginSuccess({
            uid: user.uid, email: (user.email || '').toLowerCase(),
            name: p.name || user.displayName || (user.email || 'Student').split('@')[0],
            provider: google ? 'Google Account' : 'Standard Account',
            university: p.university || 'Batangas State University', program: p.program || 'BS Computer Science',
            bio: p.bio || 'Turning notes into mastery.'
        });
        bump();
    });

    // Sign out (really signs out, not just a page reload) 
    async function doLogout() { try { await auth.signOut(); } catch (_) { } localStorage.removeItem('edumaxxing_current_user'); location.reload(); }
    ['drawerLogoutBtn', 'profileSignOutBtn'].forEach(id => {
        const old = getEl(id), nb = old.cloneNode(true);    // a fresh button, without the old reload-only handler
        nb.removeAttribute('onclick'); old.replaceWith(nb); nb.addEventListener('click', doLogout);
    });

    // Automatic sign-out when you walk away 
    let idleTimer;
    function bump() {
        clearTimeout(idleTimer); if (!activeUid) return;
        idleTimer = setTimeout(() => {
            if (currentGeneratedReviewerHTML && currentMaterialId === null) return bump();   // never throw away unsaved work
            sessionStorage.setItem('edu_idle', '1'); doLogout();
        }, IDLE_MINUTES * 60 * 1000);
    }
    ['click', 'keydown', 'pointerdown', 'scroll'].forEach(ev => addEventListener(ev, bump, { passive: true, capture: true }));
})();