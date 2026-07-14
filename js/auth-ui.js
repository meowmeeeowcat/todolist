// js/auth-ui.js
// ================= 登入 / 註冊畫面互動邏輯 =================
// 只負責畫面上的登入表單怎麼運作（切換登入/註冊模式、送出、顯示錯誤、登出按鈕）。
// 實際呼叫 Firebase Auth 的函式（loginWithEmail / registerWithEmail / logoutUser）
// 都定義在 js/firebase-init.js。

let authMode = 'login'; // 'login' 或 'register'

const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginErrorEl = document.getElementById('login-error');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginTitleEl = document.getElementById('login-title');
const loginSwitchHint = document.getElementById('login-switch-hint');
const loginSwitchLink = document.getElementById('login-switch-mode');
const logoutBtn = document.getElementById('logout-btn');

function setAuthMode(mode) {
    authMode = mode;
    if (loginErrorEl) loginErrorEl.classList.add('hidden');

    if (mode === 'register') {
        if (loginTitleEl) loginTitleEl.innerText = '註冊新帳號';
        if (loginSubmitBtn) loginSubmitBtn.innerText = '註冊';
        if (loginSwitchHint) loginSwitchHint.innerText = '已經有帳號了？';
        if (loginSwitchLink) loginSwitchLink.innerText = '直接登入';
    } else {
        if (loginTitleEl) loginTitleEl.innerText = '登入';
        if (loginSubmitBtn) loginSubmitBtn.innerText = '登入';
        if (loginSwitchHint) loginSwitchHint.innerText = '還沒有帳號？';
        if (loginSwitchLink) loginSwitchLink.innerText = '註冊新帳號';
    }
}

function submitAuthForm() {
    const email = (loginEmailInput.value || '').trim();
    const password = loginPasswordInput.value || '';

    if (!email || !password) {
        loginErrorEl.innerText = '請輸入電子郵件與密碼。';
        loginErrorEl.classList.remove('hidden');
        return;
    }

    loginSubmitBtn.disabled = true;
    const action = (authMode === 'register')
        ? registerWithEmail(email, password)
        : loginWithEmail(email, password);

    action
        .then(() => {
            // 成功後 firebase-init.js 的 onAuthStateChanged 會自動觸發 onReady，
            // app.js 會負責把 login-overlay 隱藏、loading-overlay 顯示、開始抓資料。
            loginErrorEl.classList.add('hidden');
        })
        .catch((error) => {
            loginErrorEl.innerText = translateAuthError(error);
            loginErrorEl.classList.remove('hidden');
        })
        .finally(() => {
            loginSubmitBtn.disabled = false;
        });
}

if (loginSwitchLink) {
    loginSwitchLink.addEventListener('click', (e) => {
        e.preventDefault();
        setAuthMode(authMode === 'login' ? 'register' : 'login');
    });
}

if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', submitAuthForm);
}

// 讓使用者在密碼欄按 Enter 也能直接送出
if (loginPasswordInput) {
    loginPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAuthForm();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm('確定要登出嗎？')) {
            logoutUser();
        }
    });
}
