// js/spa.js
// ================= 單頁應用（SPA）切換邏輯 =================
// 原本「主頁」跟「年曆頁」是兩個獨立的 .html 檔案，切換時瀏覽器會整頁重新載入
// （重新初始化 Firebase、重新從資料庫抓一次全部資料），感覺很慢。
// 現在都在同一份 index.html 裡，只是幾個 <div>，切換時單純顯示/隱藏其中一個，
// Firebase 的登入與資料只在使用者打開網站時抓「一次」，之後切換是瞬間完成的。
// 目前有三個頁面：'todo'（主頁）、'calendar'（年度總覽年曆）、'timeline'（每日時間線）。

function switchPage(page) {
    const todoView = document.getElementById('view-todo');
    const calendarView = document.getElementById('view-calendar');
    const timelineView = document.getElementById('view-timeline');
    if (!todoView || !calendarView) return;

    // 先把所有頁面都藏起來，再依 page 顯示對應的那一個，避免多個頁面同時出現
    todoView.classList.add('hidden');
    calendarView.classList.add('hidden');
    if (timelineView) timelineView.classList.add('hidden');

    if (page === 'calendar') {
        if (!window.dataLoaded) { todoView.classList.remove('hidden'); return; } // 資料還沒載入完成前，按鈕本身也是 disabled 狀態
        calendarView.classList.remove('hidden');
        // 每次切到年曆頁都重新整理一次：因為使用者可能剛在主頁打過卡，
        // 這裡重新跑一次 precomputeAllWeeks() 只需要算 53 週，很快，用來確保年曆頁看到的是最新資料。
        try {
            initCalendarGrid();
        } catch (e) {
            console.error("年曆頁渲染失敗:", e);
        }
    } else if (page === 'timeline') {
        if (!window.dataLoaded || !timelineView) { todoView.classList.remove('hidden'); return; }
        timelineView.classList.remove('hidden');
        try {
            initTimelinePage();
        } catch (e) {
            console.error("時間線頁渲染失敗:", e);
        }
    } else {
        todoView.classList.remove('hidden');
    }
}
