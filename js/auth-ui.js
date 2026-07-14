// js/auth-ui.js
// ================= 登入 / 註冊畫面互動邏輯 =================
// 只負責畫面上的登入表單怎麼運作（切換登入/註冊模式、送出、顯示錯誤、登出按鈕、記住帳號）。
// 實際呼叫 Firebase Auth 的函式（loginWithEmail / registerWithEmail / logoutUser / setAuthPersistence）
// 都定義在 js/firebase-init.js。

let authMode = 'login'; // 'login' 或 'register'
const REMEMBERED_EMAIL_KEY = 'rememberedLoginEmail';

const loginNicknameInput = document.getElementById('login-nickname');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const rememberMeCheckbox = document.getElementById('remember-me-checkbox');
const loginErrorEl = document.getElementById('login-error');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginTitleEl = document.getElementById('login-title');
const loginSwitchHint = document.getElementById('login-switch-hint');
const loginSwitchLink = document.getElementById('login-switch-mode');
const logoutBtn = document.getElementById('logout-btn');

// 頁面載入時，如果之前有「記住我」過的電子郵件，先幫使用者填好
// （只記電子郵件，密碼一律交給瀏覽器自己的密碼管理員記，不會存在網站的程式碼或資料庫裡）
(function prefillRememberedEmail() {
    const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (remembered && loginEmailInput) {
        loginEmailInput.value = remembered;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
    }
})();

function setAuthMode(mode) {
    authMode = mode;
    if (loginErrorEl) loginErrorEl.classList.add('hidden');

    if (mode === 'register') {
        if (loginTitleEl) loginTitleEl.innerText = '註冊新帳號';
        if (loginSubmitBtn) loginSubmitBtn.innerText = '註冊';
        if (loginSwitchHint) loginSwitchHint.innerText = '已經有帳號了？';
        if (loginSwitchLink) loginSwitchLink.innerText = '直接登入';
        if (loginNicknameInput) loginNicknameInput.classList.remove('hidden');
    } else {
        if (loginTitleEl) loginTitleEl.innerText = '登入';
        if (loginSubmitBtn) loginSubmitBtn.innerText = '登入';
        if (loginSwitchHint) loginSwitchHint.innerText = '還沒有帳號？';
        if (loginSwitchLink) loginSwitchLink.innerText = '註冊新帳號';
        if (loginNicknameInput) loginNicknameInput.classList.add('hidden');
    }
}

function submitAuthForm() {
    const nickname = (loginNicknameInput && loginNicknameInput.value || '').trim();
    const email = (loginEmailInput.value || '').trim();
    const password = loginPasswordInput.value || '';
    const remember = !rememberMeCheckbox || rememberMeCheckbox.checked;

    if (!email || !password) {
        loginErrorEl.innerText = '請輸入電子郵件與密碼。';
        loginErrorEl.classList.remove('hidden');
        return;
    }
    if (authMode === 'register' && !nickname) {
        loginErrorEl.innerText = '請輸入暱稱。';
        loginErrorEl.classList.remove('hidden');
        return;
    }

    loginSubmitBtn.disabled = true;

    // 先設定好這次登入要不要「記住」，再送出登入/註冊
    setAuthPersistence(remember)
        .then(() => {
            return (authMode === 'register')
                ? registerWithEmail(email, password, nickname)
                : loginWithEmail(email, password);
        })
        .then(() => {
            // 成功後 firebase-init.js 的 onAuthStateChanged 會自動觸發 onReady，
            // app.js 會負責把 login-overlay 隱藏、loading-overlay 顯示、開始抓資料。
            loginErrorEl.classList.add('hidden');

            if (remember) {
                localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
            } else {
                localStorage.removeItem(REMEMBERED_EMAIL_KEY);
            }
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
