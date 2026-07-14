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
 * 傳入的 onReady(uid) 會在「匿名登入完成且 userDbRef 準備好」時觸發一次。
 * 兩個頁面（app.js / calendar.js）各自傳入自己要做的事，而不必各自重寫一次 onAuthStateChanged。
 */
function initFirebaseAuth(onReady) {
    window.auth.onAuthStateChanged((user) => {
        if (user) {
            window.userDbRef = window.db.ref('users/' + user.uid);
            onReady(user.uid);
        } else {
            window.auth.signInAnonymously().catch((error) => {
                console.error("匿名登入失敗:", error);
            });
        }
    });
}
