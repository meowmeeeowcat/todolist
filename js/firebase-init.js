// js/firebase-init.js
// ================= Firebase 共用初始化（原本 app.js / calendar.js 各貼一份，現在只有這一份） =================
const firebaseConfig = {
    apiKey: "AIzaSyA4gMYuA7BjykCeXQP7N5AOkUSJPzw8qI8",
    authDomain: "todolist-f37a5.firebaseapp.com",
    databaseURL: "https://todolist-f37a5-default-rtdb.firebaseio.com",
    projectId: "todolist-f37a5",
    storageBucket: "todolist-f37a5.firebasestorage.app",
    messagingSenderId: "784814496491",
    appId: "1:784814496491:web:330a8ccf2c312e224fbcae"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

window.auth = firebase.auth();
window.db = firebase.database();
window.userDbRef = null;

/**
 * 統一的登入狀態監聽器。
 * 傳入的 onReady(uid) 會在「使用者已用帳號密碼登入且 userDbRef 準備好」時觸發一次。
 * 傳入的 onLoggedOut() 會在「目前沒有登入中的使用者」時觸發（用來顯示登入畫面）。
 *
 * 註：原本這裡是 signInAnonymously() 自動幫每個訪客建立一個匿名帳號，
 * 現在改成帳號密碼登入，所以「沒有登入」不再自動嘗試登入，而是交給 onLoggedOut
 * 顯示登入表單，等使用者自己輸入帳密。
 */
function initFirebaseAuth(onReady, onLoggedOut) {
    window.auth.onAuthStateChanged((user) => {
        if (user) {
            window.userDbRef = window.db.ref('users/' + user.uid);
            onReady(user.uid);
        } else {
            window.userDbRef = null;
            if (onLoggedOut) onLoggedOut();
        }
    });
}

// 註冊新帳號（email + password），回傳 Promise
function registerWithEmail(email, password) {
    return window.auth.createUserWithEmailAndPassword(email, password);
}

// 用已存在的帳號登入，回傳 Promise
function loginWithEmail(email, password) {
    return window.auth.signInWithEmailAndPassword(email, password);
}

// 登出
function logoutUser() {
    return window.auth.signOut();
}

// Firebase 常見錯誤代碼轉成中文提示
function translateAuthError(error) {
    const map = {
        'auth/invalid-email': '電子郵件格式不正確。',
        'auth/missing-password': '請輸入密碼。',
        'auth/weak-password': '密碼強度不足，請至少輸入 6 個字元。',
        'auth/email-already-in-use': '這個電子郵件已經被註冊過了，請直接登入。',
        'auth/invalid-credential': '帳號或密碼不正確。',
        'auth/wrong-password': '帳號或密碼不正確。',
        'auth/user-not-found': '找不到這個帳號，請確認電子郵件或先註冊。',
        'auth/too-many-requests': '嘗試次數過多，請稍後再試。'
    };
    return map[error.code] || ('登入失敗：' + error.message);
}
