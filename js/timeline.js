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

// ================= 手動記錄時間 =================
// 跟番茄鐘計時器分開的另一種記錄方式：不用真的跑計時，直接選項目（或自訂一個項目清單裡沒有的名稱）
// 加上起訖時間就能補記一筆。顏色預設跟著選到的大類別走，但使用者可以自己從馬卡龍色盤挑別的顏色。
let manualLogSelectedColor = (window.fixedPalette && window.fixedPalette[0] && window.fixedPalette[0].color) || '#bae1ff';

function renderManualLogCategorySelector() {
    const catSel = document.getElementById('manual-log-category-select');
    const subSel = document.getElementById('manual-log-subitem-select');
    if (!catSel || !subSel) return;

    const template = (window.globalAppData && window.globalAppData.template) || {};
    const catKeys = Object.keys(template).filter(k => !template[k].archived);

    catSel.innerHTML = `<option value="">— 不選分類，自訂項目 —</option>` + catKeys.map(k => `<option value="${k}">${k}</option>`).join('');

    function fillManualSubSelect() {
        const catKey = catSel.value;
        if (!catKey) {
            subSel.innerHTML = `<option value="">（無）</option>`;
            subSel.disabled = true;
            return;
        }
        subSel.disabled = false;
        const cat = template[catKey];
        const subItems = (cat && cat.subItems) || {};
        const subKeys = Object.keys(subItems).filter(k => !subItems[k].archived);
        subSel.innerHTML = `<option value="">— 選擇分項 —</option>` + subKeys.map(k => `<option value="${k}">${k}</option>`).join('');
    }

    // 選了大類別／分項時，自動幫忙帶入顯示名稱跟顏色（使用者之後還是可以自己改）
    function autoFillFromSelection() {
        const catKey = catSel.value;
        const subKey = subSel.value;
        const nameInput = document.getElementById('manual-log-name');
        if (catKey && subKey && nameInput) {
            nameInput.value = subKey;
            manualLogSelectedColor = getSafeMacaronColor(catKey, '#bae1ff');
            renderManualLogColorPalette();
        }
    }

    fillManualSubSelect();
    catSel.onchange = () => { fillManualSubSelect(); autoFillFromSelection(); };
    subSel.onchange = autoFillFromSelection;
}

// 顏色選擇盤：跟主頁「新增全新類別」用的是同一套馬卡龍色盤（window.fixedPalette），畫法也比照那邊
function renderManualLogColorPalette() {
    const container = document.getElementById('manual-log-color-palette');
    if (!container) return;
    container.innerHTML = '';

    (window.fixedPalette || []).forEach(item => {
        const swatch = document.createElement('div');
        swatch.className = 'timeline-color-swatch';
        swatch.style.backgroundColor = item.color;
        swatch.title = item.name;

        if (item.color === manualLogSelectedColor) {
            swatch.classList.add('is-selected');
        }

        swatch.addEventListener('click', () => {
            manualLogSelectedColor = item.color;
            renderManualLogColorPalette();
        });

        container.appendChild(swatch);
    });
}

function timelineTimeStrToMinutes(hhmm) {
    const parts = (hhmm || '').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

function submitManualLogEntry() {
    const dateInput = document.getElementById('manual-log-date');
    const startInput = document.getElementById('manual-log-start-time');
    const endInput = document.getElementById('manual-log-end-time');
    const nameInput = document.getElementById('manual-log-name');
    const catSel = document.getElementById('manual-log-category-select');
    const subSel = document.getElementById('manual-log-subitem-select');

    const dateStr = dateInput ? dateInput.value : '';
    const startStr = startInput ? startInput.value : '';
    const endStr = endInput ? endInput.value : '';
    const name = (nameInput && nameInput.value || '').trim();

    if (!dateStr || !startStr || !endStr) {
        alert('請填寫日期、開始時間與結束時間');
        return;
    }
    if (!name) {
        alert('請輸入這筆紀錄要顯示的名稱');
        return;
    }

    const startMinutes = timelineTimeStrToMinutes(startStr);
    const endMinutes = timelineTimeStrToMinutes(endStr);
    if (endMinutes <= startMinutes) {
        alert('結束時間必須晚於開始時間（暫不支援跨過午夜的紀錄，請拆成兩筆分別記錄）');
        return;
    }

    const session = {
        id: 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date: dateStr,
        startMinutes: startMinutes,
        durationMinutes: endMinutes - startMinutes,
        categoryKey: (catSel && catSel.value) || '',
        subKey: (subSel && subSel.value) || '',
        name: name,
        color: manualLogSelectedColor
    };

    if (!window.globalAppData.timelineSessions) window.globalAppData.timelineSessions = [];
    window.globalAppData.timelineSessions.push(session);
    saveTimelineSessions();
    renderWeeklyTimeline();

    // 保留日期跟項目選擇，方便使用者連續補記好幾筆同一天的紀錄，只清空時間欄位
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
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

// ================= 累計時間查詢工具（供 app.js 主頁清單、calendar.js 年曆頁使用） =================
// 計算某個大類別（可選：某個分項）在指定週次裡，透過番茄鐘/手動記錄累計了多少分鐘
function getTimelineMinutesForWeek(weekKey, categoryKey, subKey) {
    const sessions = (window.globalAppData && window.globalAppData.timelineSessions) || [];
    let total = 0;
    sessions.forEach(s => {
        if (s.categoryKey !== categoryKey) return;
        if (subKey !== undefined && subKey !== null && s.subKey !== subKey) return;
        if (getWeekNumberByDate(s.date) !== weekKey) return;
        total += s.durationMinutes || 0;
    });
    return total;
}

// 把分鐘數格式化成「1小時23分」/「45分」這種好讀的顯示文字；0 分鐘回傳 null，方便呼叫端判斷要不要顯示這個標籤
function formatTimelineMinutes(totalMinutes) {
    if (!totalMinutes) return null;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h}小時${m}分`;
    if (h > 0) return `${h}小時`;
    return `${m}分`;
}

// ================= 頁面進入點：每次切換到時間線頁都會呼叫一次（見 js/spa.js） =================
function initTimelinePage() {
    if (!timelineWeekStart) timelineWeekStart = timelineGetSunday(new Date());

    renderTimelineItemSelectors();
    renderWeeklyTimeline();

    // 只有在目前「沒有進行中、也沒有暫停中」的計時時，才把倒數重置成輸入框設定的分鐘數；
    // 如果計時正在跑、或是被暫停在中途，切換頁面離開再回來都不應該影響進度，直接顯示目前剩餘的時間就好。
    if (!timerSessionStartedAt) {
        timelineResetTimerToConfigured();
    } else {
        timelineUpdateTimerDisplay();
    }
    timelineSyncTimerButtons();

    // 手動記錄區塊：項目下拉選單、顏色盤每次進頁都重新整理一次（避免主頁那邊新增/刪除過分類後沒同步到）
    renderManualLogCategorySelector();
    renderManualLogColorPalette();
    const manualDateInput = document.getElementById('manual-log-date');
    if (manualDateInput && !manualDateInput.value) {
        manualDateInput.value = timelineFormatDateStr(new Date());
    }
    const manualSubmitBtn = document.getElementById('manual-log-submit-btn');
    if (manualSubmitBtn) manualSubmitBtn.onclick = submitManualLogEntry;

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
