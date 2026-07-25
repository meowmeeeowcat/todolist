// js/timeline.js
// ================= 每日時間線（含番茄鐘計時器） =================
// 左側：選擇要計時的項目（常規任務的大類別＋分項）+ 番茄鐘計時器。
// 右側：仿 Google 日曆的週視圖，從早上 6 點畫到晚上 12 點，計時完成的紀錄會變成一個個色塊畫在對應的時間格上。
// 資料存在 globalAppData.timelineSessions（陣列），寫回 Firebase 時轉成用 id 當 key 的物件（跟 tempTasks 做法一致，
// 相關的轉換函式 timelineSessionsArrayToObject / timelineSessionsObjectToArray 寫在 js/data.js）。
//
// 這裡沿用了其他檔案已經有的東西，沒有重複定義：
// - getSafeMacaronColor()：來自 js/calendar.js，用來取得大類別目前的顏色
// - window.globalAppData：來自 js/data.js
// - saveTimelineSessions()：來自 js/app.js

const TIMELINE_START_HOUR = 6;   // 時間線最早顯示到早上 6 點
const TIMELINE_END_HOUR = 24;    // 顯示到晚上 12 點（24:00）
const TIMELINE_HOUR_HEIGHT = 48; // 每小時的格子高度（px）
const timelineWeekdayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

let timelineWeekStart = null;      // 目前顯示的那一週，週日當天 00:00 的 Date
let timerTotalSeconds = 25 * 60;   // 這次計時總共設定幾秒
let timerRemainingSeconds = 25 * 60; // 倒數剩餘秒數
let timerIntervalId = null;        // setInterval 的 id，用來停止倒數
let timerRunning = false;          // 目前是不是正在倒數中（暫停中是 false）
let timerSessionStartedAt = null;  // 這一段計時「第一次按下開始」的真實時間，用來記錄到時間線上；null 代表目前沒有進行中的計時

// ================= 日期工具（只給時間線頁用，避免跟 date-utils.js 的 2026 專用邏輯混在一起） =================
function timelineFormatDateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function timelineGetSunday(d) {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
}

function timelineAddDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
}

// ================= 項目選擇（大類別／分項下拉選單） =================
function renderTimelineItemSelectors() {
    const catSel = document.getElementById('timeline-category-select');
    const subSel = document.getElementById('timeline-subitem-select');
    const hintEl = document.getElementById('timeline-session-hint');
    if (!catSel || !subSel) return;

    const template = (window.globalAppData && window.globalAppData.template) || {};
    const catKeys = Object.keys(template).filter(k => !template[k].archived);

    if (catKeys.length === 0) {
        catSel.innerHTML = '';
        subSel.innerHTML = '';
        if (hintEl) hintEl.innerText = '目前沒有可以計時的常規任務，請先到主頁新增大類別與分項。';
        return;
    }
    if (hintEl) hintEl.innerText = '';

    const prevCatValue = catSel.value;
    catSel.innerHTML = catKeys.map(k => `<option value="${k}">${k}</option>`).join('');
    if (catKeys.includes(prevCatValue)) catSel.value = prevCatValue;

    function fillSubSelect() {
        const catKey = catSel.value;
        const cat = template[catKey];
        const subItems = (cat && cat.subItems) || {};
        const subKeys = Object.keys(subItems).filter(k => !subItems[k].archived);
        subSel.innerHTML = subKeys.map(k => `<option value="${k}">${k}</option>`).join('');
    }

    fillSubSelect();
    catSel.onchange = fillSubSelect;
}

// ================= 番茄鐘計時器 =================
function timelineGetConfiguredMinutes() {
    const minutesInput = document.getElementById('timeline-timer-minutes');
    return Math.max(1, parseInt(minutesInput && minutesInput.value, 10) || 25);
}

function timelineFormatTimer(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function timelineUpdateTimerDisplay() {
    const el = document.getElementById('timeline-timer-display');
    if (el) el.innerText = timelineFormatTimer(timerRemainingSeconds);
}

function timelineResetTimerToConfigured() {
    timerTotalSeconds = timelineGetConfiguredMinutes() * 60;
    timerRemainingSeconds = timerTotalSeconds;
    timelineUpdateTimerDisplay();
}

// 依目前狀態（沒開始／進行中／暫停中）切換三顆按鈕要顯示哪些
function timelineSyncTimerButtons() {
    const startBtn = document.getElementById('timeline-timer-start-btn');
    const pauseBtn = document.getElementById('timeline-timer-pause-btn');
    const stopBtn = document.getElementById('timeline-timer-stop-btn');
    const minutesInput = document.getElementById('timeline-timer-minutes');
    if (!startBtn || !pauseBtn || !stopBtn) return;

    if (timerRunning) {
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        if (minutesInput) minutesInput.disabled = true;
    } else if (timerSessionStartedAt) {
        // 暫停中：已經開始過、目前停著，按鈕文字改成「繼續」
        startBtn.classList.remove('hidden');
        startBtn.innerText = '繼續';
        pauseBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        startBtn.classList.remove('hidden');
        startBtn.innerText = '開始';
        pauseBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
        if (minutesInput) minutesInput.disabled = false;
    }
}

function startTimelineTimer() {
    const catSel = document.getElementById('timeline-category-select');
    const subSel = document.getElementById('timeline-subitem-select');
    if (!catSel || !catSel.value || !subSel || !subSel.value) {
        alert('請先選擇要計時的項目（大類別＋分項）');
        return;
    }
    if (timerRunning) return;

    if (!timerSessionStartedAt) {
        // 全新開始（不是從暫停恢復）：用目前輸入框的分鐘數重新設定倒數總秒數
        timerTotalSeconds = timelineGetConfiguredMinutes() * 60;
        timerRemainingSeconds = timerTotalSeconds;
        timerSessionStartedAt = new Date();
    }

    timerRunning = true;
    timelineSyncTimerButtons();

    timerIntervalId = setInterval(() => {
        timerRemainingSeconds--;
        timelineUpdateTimerDisplay();
        if (timerRemainingSeconds <= 0) {
            finishTimelineSession(); // 時間到，自動記錄整段
        }
    }, 1000);
}

function pauseTimelineTimer() {
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = null;
    timerRunning = false;
    timelineSyncTimerButtons();
}

// 結束目前這段計時並記錄到時間線上（不論是倒數自然結束、還是使用者提早按「結束並記錄」）
function finishTimelineSession() {
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = null;
    timerRunning = false;

    if (timerSessionStartedAt) {
        const endedAt = new Date();
        const elapsedMs = endedAt - timerSessionStartedAt;
        if (elapsedMs >= 60000) { // 不滿 1 分鐘不記錄，避免手殘誤觸留下一堆雜訊
            logTimelineSession(timerSessionStartedAt, endedAt);
        }
    }

    timerSessionStartedAt = null;
    timelineResetTimerToConfigured();
    timelineSyncTimerButtons();
}

// 把一段「開始時間～結束時間」記錄成一筆時間線紀錄，存進 globalAppData 並同步到 Firebase
function logTimelineSession(startDate, endDate) {
    const catSel = document.getElementById('timeline-category-select');
    const subSel = document.getElementById('timeline-subitem-select');
    const categoryKey = catSel ? catSel.value : '';
    const subKey = subSel ? subSel.value : '';
    if (!categoryKey || !subKey) return;

    const durationMinutes = Math.max(1, Math.round((endDate - startDate) / 60000));

    const session = {
        id: 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date: timelineFormatDateStr(startDate),
        startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
        durationMinutes: durationMinutes,
        categoryKey: categoryKey,
        subKey: subKey,
        name: subKey,
        color: getSafeMacaronColor(categoryKey, '#bae1ff')
    };

    if (!window.globalAppData.timelineSessions) window.globalAppData.timelineSessions = [];
    window.globalAppData.timelineSessions.push(session);
    saveTimelineSessions();
    renderWeeklyTimeline();
}

function deleteTimelineSession(id) {
    window.globalAppData.timelineSessions = (window.globalAppData.timelineSessions || []).filter(s => s.id !== id);
    saveTimelineSessions();
    renderWeeklyTimeline();
}

// ================= 每週時間線格線渲染 =================
function goToPrevTimelineWeek() {
    timelineWeekStart = timelineAddDays(timelineWeekStart, -7);
    renderWeeklyTimeline();
}

function goToNextTimelineWeek() {
    timelineWeekStart = timelineAddDays(timelineWeekStart, 7);
    renderWeeklyTimeline();
}

function goToTodayTimelineWeek() {
    timelineWeekStart = timelineGetSunday(new Date());
    renderWeeklyTimeline();
}

function renderWeeklyTimeline() {
    const headerEl = document.getElementById('timeline-grid-header');
    const bodyEl = document.getElementById('timeline-grid-body');
    const labelEl = document.getElementById('timeline-week-label');
    if (!headerEl || !bodyEl) return;

    const todayStr = timelineFormatDateStr(new Date());
    const weekDates = [];
    for (let i = 0; i < 7; i++) weekDates.push(timelineAddDays(timelineWeekStart, i));

    if (labelEl) {
        const first = weekDates[0], last = weekDates[6];
        const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        labelEl.innerText = `${fmt(first)} - ${fmt(last)}`;
    }

    // 表頭：週日～週六的日期
    headerEl.innerHTML = `<div class="timeline-gutter-spacer"></div>` + weekDates.map(d => {
        const dStr = timelineFormatDateStr(d);
        const isToday = dStr === todayStr;
        return `
            <div class="timeline-day-header ${isToday ? 'is-today' : ''}">
                <div class="timeline-day-name">${timelineWeekdayNames[d.getDay()]}</div>
                <div class="timeline-day-num">${d.getDate()}</div>
            </div>
        `;
    }).join('');

    // 左側時間刻度
    let gutterHtml = '<div class="timeline-time-gutter">';
    for (let h = TIMELINE_START_HOUR; h < TIMELINE_END_HOUR; h++) {
        gutterHtml += `<div class="timeline-hour-label" style="height:${TIMELINE_HOUR_HEIGHT}px;">${h}:00</div>`;
    }
    gutterHtml += '</div>';

    const totalHeight = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT;
    const allSessions = window.globalAppData.timelineSessions || [];

    let daysHtml = '';
    weekDates.forEach(d => {
        const dStr = timelineFormatDateStr(d);
        const isToday = dStr === todayStr;
        const daySessions = allSessions.filter(s => s.date === dStr);

        let blocksHtml = '';
        daySessions.forEach(s => {
            const startOffsetMin = (s.startMinutes || 0) - TIMELINE_START_HOUR * 60;
            const top = (startOffsetMin / 60) * TIMELINE_HOUR_HEIGHT;
            if (top >= totalHeight) return; // 超出顯示範圍（例如半夜的紀錄）就不畫，避免跑版
            const height = Math.max((s.durationMinutes / 60) * TIMELINE_HOUR_HEIGHT, 16);

            blocksHtml += `
                <div class="timeline-block" title="${s.name}（${s.durationMinutes} 分鐘）"
                     style="top:${Math.max(top, 0)}px; height:${height}px; background-color:${s.color};">
                    <span class="timeline-block-text">${s.name}・${s.durationMinutes}分</span>
                    <button class="timeline-block-delete" data-id="${s.id}" title="刪除這筆紀錄">&times;</button>
                </div>
            `;
        });

        daysHtml += `
            <div class="timeline-day-column ${isToday ? 'is-today' : ''}"
                 style="height:${totalHeight}px; background-size: 100% ${TIMELINE_HOUR_HEIGHT}px;">
                ${blocksHtml}
            </div>
        `;
    });

    bodyEl.innerHTML = gutterHtml + daysHtml;
    bodyEl.style.height = totalHeight + 'px';

    bodyEl.querySelectorAll('.timeline-block-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('確定要刪除這筆時間紀錄嗎？')) {
                deleteTimelineSession(btn.getAttribute('data-id'));
            }
        });
    });
}

// ================= 頁面進入點：每次切換到時間線頁都會呼叫一次（見 js/spa.js） =================
function initTimelinePage() {
    if (!timelineWeekStart) timelineWeekStart = timelineGetSunday(new Date());

    renderTimelineItemSelectors();
    renderWeeklyTimeline();
    timelineResetTimerToConfigured();
    timelineSyncTimerButtons();

    // 用 onclick 覆蓋而不是 addEventListener 疊加，避免每次切回這一頁都重複綁定
    const prevBtn = document.getElementById('timeline-prev-week-btn');
    if (prevBtn) prevBtn.onclick = goToPrevTimelineWeek;

    const nextBtn = document.getElementById('timeline-next-week-btn');
    if (nextBtn) nextBtn.onclick = goToNextTimelineWeek;

    const todayBtn = document.getElementById('timeline-today-btn');
    if (todayBtn) todayBtn.onclick = goToTodayTimelineWeek;

    const startBtn = document.getElementById('timeline-timer-start-btn');
    if (startBtn) startBtn.onclick = startTimelineTimer;

    const pauseBtn = document.getElementById('timeline-timer-pause-btn');
    if (pauseBtn) pauseBtn.onclick = pauseTimelineTimer;

    const stopBtn = document.getElementById('timeline-timer-stop-btn');
    if (stopBtn) {
        stopBtn.onclick = () => {
            if (confirm('確定要結束目前的計時，並把這段時間記錄下來嗎？')) {
                finishTimelineSession();
            }
        };
    }

    const minutesInput = document.getElementById('timeline-timer-minutes');
    if (minutesInput) {
        minutesInput.onchange = () => {
            if (!timerRunning && !timerSessionStartedAt) {
                timelineResetTimerToConfigured();
            }
        };
    }
}
