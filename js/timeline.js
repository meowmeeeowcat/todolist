// js/timeline.js
// ================= 每日時間線（含番茄鐘計時器） =================
// 左側：選擇要計時的項目（常規任務的大類別＋分項）+ 番茄鐘計時器 + 手動記錄時間。
// 右側：一週 7 天（週一為第一天）並排顯示，每天欄位裡把當天做過的事情依開始時間先後依序堆疊成一張張色塊卡片，
// 不畫小時格線，每張卡片直接顯示「開始～結束」時間，卡片高度依內容自然撐開，不是照時長比例畫的時間軸。
// 資料存在 globalAppData.timelineSessions（陣列），寫回 Firebase 時轉成用 id 當 key 的物件（跟 tempTasks 做法一致，
// 相關的轉換函式 timelineSessionsArrayToObject / timelineSessionsObjectToArray 寫在 js/data.js）。
//
// 這裡沿用了其他檔案已經有的東西，沒有重複定義：
// - getSafeMacaronColor()：來自 js/calendar.js，用來取得大類別目前的顏色
// - window.globalAppData：來自 js/data.js
// - saveTimelineSessions()：來自 js/app.js

const timelineWeekdayNames = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];

// 一天從凌晨 4 點開始算起（配合全站凌晨 4 點重置的規則），時間線的小時分隔格線也是從這個時間點畫起，
// 最後一格是凌晨 3 點～3:59（緊接著就是下一個有效日凌晨 4 點的開始）。
const TIMELINE_DAY_START_MINUTES = 4 * 60;

let timelineWeekStart = null;      // 目前顯示的那一週，週一當天 00:00 的 Date
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

// 取得「這一週的週一」：JS 的 getDay() 是週日=0～週六=6，這裡換算成週一為一週的開始
function timelineGetMonday(d) {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    const day = copy.getDay();
    const diffToMonday = (day === 0) ? -6 : (1 - day);
    copy.setDate(copy.getDate() + diffToMonday);
    return copy;
}

function timelineAddDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
}

// ================= 舊資料修正：凌晨 4 點重置規則上線之前的紀錄 =================
// 這個規則上線之前，凌晨 0:00~3:59 記錄的時間線紀錄，日期是用「記錄當下的日曆日期」存的，
// startMinutes 也是單純的 0~239（0:00~3:59），不是現在的「歸屬到前一天＋延伸分鐘數 1440~1679」規則。
// 這裡統一修正一次：只要 startMinutes < 240（代表還是舊格式，新格式的紀錄不可能是這個範圍），
// 就把日期往前推一天、startMinutes 加上 1440，改成跟新紀錄一致的規則。
// 修正過的紀錄 startMinutes 一定會 >= 240，之後重複執行這個函式也不會再重複修正到，可以放心每次讀取資料都跑一次。
function migrateOldTimelineSessionsFor4amReset() {
    const sessions = (window.globalAppData && window.globalAppData.timelineSessions) || [];
    let changed = false;

    sessions.forEach(s => {
        if (typeof s.startMinutes === 'number' && s.startMinutes < 4 * 60 && s.date) {
            const d = new Date(s.date + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                d.setDate(d.getDate() - 1);
                s.date = timelineFormatDateStr(d);
                s.startMinutes += 24 * 60;
                changed = true;
            }
        }
    });

    if (changed && typeof saveTimelineSessions === 'function') {
        saveTimelineSessions();
    }
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
    updatePomodoroFabState();

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
    updatePomodoroFabState();
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
    updatePomodoroFabState();
}

// 把一段「開始時間～結束時間」記錄成一筆時間線紀錄，存進 globalAppData 並同步到 Firebase
function logTimelineSession(startDate, endDate) {
    const catSel = document.getElementById('timeline-category-select');
    const subSel = document.getElementById('timeline-subitem-select');
    const categoryKey = catSel ? catSel.value : '';
    const subKey = subSel ? subSel.value : '';
    if (!categoryKey || !subKey) return;

    const durationMinutes = Math.max(1, Math.round((endDate - startDate) / 60000));

    // 凌晨 4 點才算新的一天：凌晨 0:00~3:59 開始的紀錄，實際上要算在「前一天」的延伸時段
    // （用 24:00~27:59 表示，這樣才能跟同一個有效日裡其他紀錄正確依照真實發生的先後順序排序、堆疊）
    const effectiveDate = getEffectiveDateForTimestamp(startDate);
    let startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    if (startDate.getHours() < 4) startMinutes += 24 * 60;

    const session = {
        id: 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date: timelineFormatDateStr(effectiveDate),
        startMinutes: startMinutes,
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

// 取得一筆時間線紀錄「現在」該顯示的顏色：有連結到大類別的話，一律用該大類別目前的顏色（就算後來改過顏色，
// 舊紀錄也會自動校正過來，不會停留在記錄當下的舊顏色）；沒有連結大類別（自訂項目）的話，才使用紀錄自己存的顏色。
function getTimelineSessionColor(s) {
    if (s.categoryKey) return getSafeMacaronColor(s.categoryKey, s.color || '#bae1ff');
    return s.color || '#bae1ff';
}

// ================= 手動記錄時間 =================
// 跟番茄鐘計時器分開的另一種記錄方式：不用真的跑計時，直接選項目（或自訂一個項目清單裡沒有的名稱）
// 加上起訖時間就能補記一筆。顏色預設跟著選到的大類別走，但使用者可以自己從馬卡龍色盤挑別的顏色。
let manualLogSelectedColor = (window.fixedPalette && window.fixedPalette[0] && window.fixedPalette[0].color) || '#bae1ff';

let manualLogColorLocked = false;   // 選了現有大類別時，顏色要鎖定跟著該類別走，不開放使用者自己改
let editingTimelineSessionId = null; // 目前是不是正在編輯某一筆既有的時間線紀錄（null＝新增模式）

function renderManualLogCategorySelector() {
    const catSel = document.getElementById('manual-log-category-select');
    const subSel = document.getElementById('manual-log-subitem-select');
    if (!catSel || !subSel) return;

    const template = (window.globalAppData && window.globalAppData.template) || {};
    const catKeys = Object.keys(template).filter(k => !template[k].archived);

    const prevValue = catSel.value;
    catSel.innerHTML = `<option value="">— 不選分類，自訂項目 —</option>` + catKeys.map(k => `<option value="${k}">${k}</option>`).join('');
    if (catKeys.includes(prevValue)) catSel.value = prevValue;

    manualLogFillSubSelect();
    catSel.onchange = () => {
        manualLogFillSubSelect(); // 大類別變了，分項選單要重新產生
        manualLogSyncFromCategory();
    };
    subSel.onchange = manualLogSyncFromCategory; // 只是選分項，不用重建選單
}

function manualLogFillSubSelect() {
    const catSel = document.getElementById('manual-log-category-select');
    const subSel = document.getElementById('manual-log-subitem-select');
    if (!catSel || !subSel) return;

    const catKey = catSel.value;
    if (!catKey) {
        subSel.innerHTML = `<option value="">（無）</option>`;
        subSel.disabled = true;
        return;
    }
    subSel.disabled = false;
    const template = (window.globalAppData && window.globalAppData.template) || {};
    const cat = template[catKey];
    const subItems = (cat && cat.subItems) || {};
    const subKeys = Object.keys(subItems).filter(k => !subItems[k].archived);
    subSel.innerHTML = `<option value="">— 選擇分項 —</option>` + subKeys.map(k => `<option value="${k}">${k}</option>`).join('');
}

// 選了大類別／分項時：只要選了「現有大類別」，顏色就鎖定跟著該類別走（不開放自己改）；
// 沒選大類別（自訂項目）的話，顏色恢復成可以自由挑選。分項名稱有選到的話，也會自動幫忙帶入顯示名稱。
// 注意：這裡「不會」重建分項選單（不呼叫 manualLogFillSubSelect），
// 因為選分項本身也會觸發這個函式，如果在這裡重建分項選單，會把使用者剛選好的分項洗掉、變成選不了分項。
// 分項選單只有在「大類別改變」的時候才需要重建，呼叫端要自己在那個時機呼叫 manualLogFillSubSelect()。
function manualLogSyncFromCategory() {
    const catSel = document.getElementById('manual-log-category-select');
    const subSel = document.getElementById('manual-log-subitem-select');
    const nameInput = document.getElementById('manual-log-name');
    const catKey = catSel ? catSel.value : '';
    const subKey = subSel ? subSel.value : '';

    if (catKey) {
        manualLogColorLocked = true;
        manualLogSelectedColor = getSafeMacaronColor(catKey, '#bae1ff');
        if (subKey && nameInput) nameInput.value = subKey;
    } else {
        manualLogColorLocked = false;
    }
    renderManualLogColorPalette();
}

// 顏色選擇盤：跟主頁「新增全新類別」用的是同一套馬卡龍色盤（window.fixedPalette），畫法也比照那邊。
// manualLogColorLocked 為 true 時（選了現有大類別），色盤只顯示目前顏色，不能點選其他顏色。
function renderManualLogColorPalette() {
    const container = document.getElementById('manual-log-color-palette');
    if (!container) return;
    container.innerHTML = '';

    (window.fixedPalette || []).forEach(item => {
        const swatch = document.createElement('div');
        swatch.className = 'timeline-color-swatch' + (manualLogColorLocked ? ' is-locked' : '');
        swatch.style.backgroundColor = item.color;
        swatch.title = manualLogColorLocked ? '已選擇大類別，顏色固定跟著該類別' : item.name;

        if (item.color === manualLogSelectedColor) {
            swatch.classList.add('is-selected');
        }

        if (!manualLogColorLocked) {
            swatch.addEventListener('click', () => {
                manualLogSelectedColor = item.color;
                renderManualLogColorPalette();
            });
        }

        container.appendChild(swatch);
    });
}

function timelineTimeStrToMinutes(hhmm) {
    const parts = (hhmm || '').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

// 把延伸分鐘數（可能是 0~1679，包含凌晨 0~3 點的 24:00~27:59 延伸時段）轉成 <input type="time"> 看得懂的正常時間字串
function timelineMinutesToTimeInputValue(mins) {
    const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// 點擊時間線上的某一筆紀錄時呼叫：把手動記錄表單填成那一筆紀錄的內容，切換成「編輯模式」
function openManualLogEditor(sessionId) {
    const session = (window.globalAppData.timelineSessions || []).find(s => s.id === sessionId);
    if (!session) return;

    editingTimelineSessionId = sessionId;

    const catSel = document.getElementById('manual-log-category-select');
    const subSel = document.getElementById('manual-log-subitem-select');
    const nameInput = document.getElementById('manual-log-name');
    const dateInput = document.getElementById('manual-log-date');
    const startInput = document.getElementById('manual-log-start-time');
    const endInput = document.getElementById('manual-log-end-time');
    const submitBtn = document.getElementById('manual-log-submit-btn');
    const cancelBtn = document.getElementById('manual-log-cancel-btn');

    if (catSel) catSel.value = session.categoryKey || '';
    manualLogFillSubSelect(); // 根據大類別重建分項選單
    if (subSel) subSel.value = session.subKey || '';
    manualLogSyncFromCategory(); // 分項已經選好了，這裡只更新顏色鎖定狀態，不會重建選單、不會洗掉分項
    if (nameInput) nameInput.value = session.name || '';
    if (dateInput) dateInput.value = session.date || '';
    if (startInput) startInput.value = timelineMinutesToTimeInputValue(session.startMinutes || 0);
    if (endInput) endInput.value = timelineMinutesToTimeInputValue((session.startMinutes || 0) + (session.durationMinutes || 0));

    // 沒有選大類別（自訂項目）時，顏色照原本存的紀錄還原；有大類別的話，顏色本來就會鎖定跟著類別走
    if (!session.categoryKey) {
        manualLogSelectedColor = session.color || manualLogSelectedColor;
        manualLogColorLocked = false;
    }
    renderManualLogColorPalette();

    if (submitBtn) submitBtn.innerText = '更新紀錄';
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    const formSection = document.querySelector('.timeline-left');
    if (formSection && formSection.scrollIntoView) formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 取消編輯：清空編輯狀態，表單的名稱跟時間欄位一併清掉（日期/分類保留，方便繼續輸入下一筆）
function cancelManualLogEdit() {
    editingTimelineSessionId = null;
    const submitBtn = document.getElementById('manual-log-submit-btn');
    const cancelBtn = document.getElementById('manual-log-cancel-btn');
    const nameInput = document.getElementById('manual-log-name');
    const startInput = document.getElementById('manual-log-start-time');
    const endInput = document.getElementById('manual-log-end-time');
    if (submitBtn) submitBtn.innerText = '新增紀錄';
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (nameInput) nameInput.value = '';
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
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

    // 凌晨 0:00~3:59 的時間，視為前一個「有效日」的延伸時段（用 24:00~27:59 表示），
    // 這樣同一天（使用者選的那個日期）裡，跨過凌晨的紀錄還是能依照真實先後順序正確排序、堆疊
    let startMinutes = timelineTimeStrToMinutes(startStr);
    let endMinutes = timelineTimeStrToMinutes(endStr);
    if (startMinutes < 4 * 60) startMinutes += 24 * 60;
    if (endMinutes < 4 * 60) endMinutes += 24 * 60;
    if (endMinutes <= startMinutes) {
        alert('結束時間必須晚於開始時間（暫不支援跨過午夜的紀錄，請拆成兩筆分別記錄）');
        return;
    }

    if (!window.globalAppData.timelineSessions) window.globalAppData.timelineSessions = [];

    if (editingTimelineSessionId) {
        // 編輯模式：更新既有那一筆，不新增
        const idx = window.globalAppData.timelineSessions.findIndex(s => s.id === editingTimelineSessionId);
        if (idx !== -1) {
            window.globalAppData.timelineSessions[idx] = {
                ...window.globalAppData.timelineSessions[idx],
                date: dateStr,
                startMinutes: startMinutes,
                durationMinutes: endMinutes - startMinutes,
                categoryKey: (catSel && catSel.value) || '',
                subKey: (subSel && subSel.value) || '',
                name: name,
                color: manualLogSelectedColor
            };
        }
        cancelManualLogEdit(); // 更新完自動退出編輯模式，按鈕文字改回「新增紀錄」
    } else {
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
        window.globalAppData.timelineSessions.push(session);
        // 保留日期跟項目選擇，方便使用者連續補記好幾筆同一天的紀錄，只清空時間欄位
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
    }

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
    timelineWeekStart = timelineGetMonday(getEffectiveNow());
    renderWeeklyTimeline();
}

function renderWeeklyTimeline() {
    const headerEl = document.getElementById('timeline-grid-header');
    const bodyEl = document.getElementById('timeline-grid-body');
    const labelEl = document.getElementById('timeline-week-label');
    if (!headerEl || !bodyEl) return;

    const todayStr = timelineFormatDateStr(getEffectiveNow());
    const weekDates = [];
    for (let i = 0; i < 7; i++) weekDates.push(timelineAddDays(timelineWeekStart, i));

    if (labelEl) {
        const first = weekDates[0], last = weekDates[6];
        const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        labelEl.innerText = `${fmt(first)} - ${fmt(last)}`;
    }

    // 表頭：左側先留一格對齊小時標籤欄，接著是週一～週日的日期
    headerEl.innerHTML = `<div class="timeline-gutter-spacer"></div>` + weekDates.map(d => {
        const dStr = timelineFormatDateStr(d);
        const isToday = dStr === todayStr;
        return `
            <div class="timeline-day-header ${isToday ? 'is-today' : ''}">
                <div class="timeline-day-name">${timelineWeekdayNames[(d.getDay() + 6) % 7]}</div>
                <div class="timeline-day-num">${d.getDate()}</div>
            </div>
        `;
    }).join('');

    const allSessions = window.globalAppData.timelineSessions || [];
    const toClock = (mins) => {
        const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
        return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
    };

    const sessionsByDate = {};
    weekDates.forEach(d => {
        const dStr = timelineFormatDateStr(d);
        sessionsByDate[dStr] = allSessions
            .filter(s => s.date === dStr)
            .sort((a, b) => (a.startMinutes || 0) - (b.startMinutes || 0));
    });

    // 整份表格用同一套 24 個小時分隔（凌晨 4 點開始、凌晨 3 點結束），小時標籤只在最左邊寫一次，
    // 一整排（跨 7 天）用 CSS Grid 排版，只要這一排裡「任何一天」有紀錄，整排（包含其他沒紀錄的天）
    // 就會自動一起被撐高，不需要另外寫程式去算高度，是 CSS Grid 同一列高度自動一致的特性。
    let bodyHtml = '';
    for (let slot = 0; slot < 24; slot++) {
        const slotStartMinutes = TIMELINE_DAY_START_MINUTES + slot * 60;
        const slotEndMinutes = slotStartMinutes + 60;
        const hourLabel = toClock(slotStartMinutes);
        let hasAnyContentThisHour = false;

        let rowCellsHtml = '';
        weekDates.forEach(d => {
            const dStr = timelineFormatDateStr(d);
            const isToday = dStr === todayStr;
            const daySessions = sessionsByDate[dStr] || [];
            // 只要紀錄的時間區段跟這個小時有重疊，這個小時就算被這筆紀錄佔用（不是只看開始時間落在哪一格），
            // 這樣「4點做到6點」才會讓4點、5點兩格都顯示這件事，把中間經過的每個小時都填滿。
            const overlapping = daySessions.filter(s => {
                const start = s.startMinutes || 0;
                const end = start + (s.durationMinutes || 0);
                return start < slotEndMinutes && end > slotStartMinutes;
            });

            let cellContent = '';
            let continuesBelow = false;
            let continuedFromAbove = false;

            overlapping.forEach(s => {
                hasAnyContentThisHour = true;
                const startTotal = s.startMinutes || 0;
                const endTotal = startTotal + (s.durationMinutes || 0);
                const isStartSlot = startTotal >= slotStartMinutes && startTotal < slotEndMinutes;
                const isEndSlot = endTotal > slotStartMinutes && endTotal <= slotEndMinutes;
                if (!isStartSlot) continuedFromAbove = true;
                if (!isEndSlot) continuesBelow = true;
                // 顏色一律用「這個項目目前」的大類別顏色即時計算，不是用紀錄當初存的舊顏色，
                // 這樣就算之後改了大類別的顏色，之前記錄的時間線也會自動跟著校正，不會顯示過時的顏色。
                const displayColor = getTimelineSessionColor(s);

                if (isStartSlot) {
                    // 紀錄從這一格開始：完整顯示卡片內容（時間範圍＋名稱＋刪除鈕）；
                    // 如果還會延續到下一小時，底部先不畫圓角，讓下面的延續色條可以無縫接上去。
                    const extraClass = isEndSlot ? '' : ' segment-start-continues';
                    cellContent += `
                        <div class="timeline-block${extraClass}" data-id="${s.id}" style="background-color:${displayColor};" title="${s.name}（${s.durationMinutes} 分鐘，點擊可在左側編輯）">
                            <div class="timeline-block-time">${toClock(startTotal)} - ${toClock(endTotal)}</div>
                            <div class="timeline-block-text">${s.name}</div>
                            <button class="timeline-block-delete" data-id="${s.id}" title="刪除這筆紀錄">&times;</button>
                        </div>
                    `;
                } else {
                    // 紀錄從更早的小時就開始了，這一格只是延續，用同色的延續色條把整格填滿，不重複顯示文字；
                    // 如果這一格剛好是這筆紀錄的最後一段，底部畫圓角收尾，其餘中間段落維持方形無縫銜接。
                    const extraClass = isEndSlot ? ' segment-end' : '';
                    cellContent += `
                        <div class="timeline-block timeline-block-continued${extraClass}" data-id="${s.id}" style="background-color:${displayColor};" title="${s.name}（${toClock(startTotal)} - ${toClock(endTotal)}，點擊可在左側編輯）"></div>
                    `;
                }
            });

            const cellClasses = [
                'timeline-day-cell',
                isToday ? 'is-today' : '',
                overlapping.length > 0 ? 'has-content' : 'is-empty',
                continuesBelow ? 'continues-below' : '',
                continuedFromAbove ? 'continued-from-above' : ''
            ].filter(Boolean).join(' ');

            rowCellsHtml += `<div class="${cellClasses}">${cellContent}</div>`;
        });

        bodyHtml += `
            <div class="timeline-hour-label-cell ${hasAnyContentThisHour ? 'has-content' : 'is-empty'}">${hourLabel}</div>
            ${rowCellsHtml}
        `;
    }

    bodyEl.innerHTML = bodyHtml;

    bodyEl.querySelectorAll('.timeline-block-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('確定要刪除這筆時間紀錄嗎？')) {
                deleteTimelineSession(btn.getAttribute('data-id'));
            }
        });
    });

    bodyEl.querySelectorAll('.timeline-block').forEach(block => {
        block.addEventListener('click', (e) => {
            if (e.target.closest('.timeline-block-delete')) return;
            const id = block.getAttribute('data-id');
            if (id) openManualLogEditor(id);
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
    if (!timelineWeekStart) timelineWeekStart = timelineGetMonday(getEffectiveNow());

    renderWeeklyTimeline();

    // 手動記錄區塊：項目下拉選單、顏色盤每次進頁都重新整理一次（避免主頁那邊新增/刪除過分類後沒同步到）
    renderManualLogCategorySelector();
    renderManualLogColorPalette();
    const manualDateInput = document.getElementById('manual-log-date');
    if (manualDateInput && !manualDateInput.value) {
        manualDateInput.value = timelineFormatDateStr(getEffectiveNow());
    }
    const manualSubmitBtn = document.getElementById('manual-log-submit-btn');
    if (manualSubmitBtn) manualSubmitBtn.onclick = submitManualLogEntry;

    const manualCancelBtn = document.getElementById('manual-log-cancel-btn');
    if (manualCancelBtn) manualCancelBtn.onclick = cancelManualLogEdit;

    // 用 onclick 覆蓋而不是 addEventListener 疊加，避免每次切回這一頁都重複綁定
    const prevBtn = document.getElementById('timeline-prev-week-btn');
    if (prevBtn) prevBtn.onclick = goToPrevTimelineWeek;

    const nextBtn = document.getElementById('timeline-next-week-btn');
    if (nextBtn) nextBtn.onclick = goToNextTimelineWeek;

    const todayBtn = document.getElementById('timeline-today-btn');
    if (todayBtn) todayBtn.onclick = goToTodayTimelineWeek;
}

// ================= 番茄鐘浮動按鈕與彈出面板（獨立於時間線頁，主頁右下角就能用） =================
// 每次打開彈出面板都重新整理一次：項目下拉選單（避免主頁新增/刪除過分類後沒同步到）＋目前的計時狀態
// （進行中或暫停中的計時，時間要正確保留，不能因為關掉再打開面板就被重置）。
function initPomodoroWidget() {
    renderTimelineItemSelectors();

    if (!timerSessionStartedAt) {
        timelineResetTimerToConfigured();
    } else {
        timelineUpdateTimerDisplay();
    }
    timelineSyncTimerButtons();
    updatePomodoroFabState();

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

// 圓形按鈕上做個簡單的狀態提示：計時中會有脈動效果，暫停中則是靜態的提醒色
function updatePomodoroFabState() {
    const fabBtn = document.getElementById('pomodoro-fab-btn');
    if (!fabBtn) return;
    fabBtn.classList.toggle('is-running', timerRunning);
    fabBtn.classList.toggle('is-paused', !timerRunning && !!timerSessionStartedAt);
}

function openPomodoroPopup() {
    const popup = document.getElementById('pomodoro-popup');
    if (!popup) return;
    initPomodoroWidget();
    popup.classList.remove('hidden');
}

function closePomodoroPopup() {
    const popup = document.getElementById('pomodoro-popup');
    if (popup) popup.classList.add('hidden');
}

function togglePomodoroPopup() {
    const popup = document.getElementById('pomodoro-popup');
    if (!popup) return;
    if (popup.classList.contains('hidden')) {
        openPomodoroPopup();
    } else {
        closePomodoroPopup();
    }
}

// 圓形按鈕跟關閉鈕的事件綁定只需要做一次（不像分頁切換那樣會重複呼叫），直接在腳本載入時綁定
const pomodoroFabBtn = document.getElementById('pomodoro-fab-btn');
if (pomodoroFabBtn) pomodoroFabBtn.addEventListener('click', togglePomodoroPopup);

const closePomodoroPopupBtn = document.getElementById('close-pomodoro-popup-btn');
if (closePomodoroPopupBtn) closePomodoroPopupBtn.addEventListener('click', closePomodoroPopup);
