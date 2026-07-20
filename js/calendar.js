// js/calendar.js
// firebaseConfig / auth / db 的初始化已搬到共用檔案 js/firebase-init.js

const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

let selectedDateStr = "";
// 目前月曆頁顯示的月份（0 = 一月 ... 11 = 十二月），一次只顯示一個月，用上一頁/下一頁切換
let currentMonthIndex = 0;
// 記住「今天」的日期字串，切換月份重畫時要用它來標示 is-today
let cachedTodayStr = "";

// getWeekNumberFor2026 / formatDateString 已搬到共用檔案 js/date-utils.js（html 需先載入它）

function getSafeMacaronColor(groupName, fallbackColor) {
    if (groupName === '臨時任務') return '#94a3b8';
    if (globalAppData && globalAppData.template && globalAppData.template[groupName]) {
        const hue = globalAppData.template[groupName].customHue;
        if (hue !== undefined) return `hsl(${hue}, 100%, 85%)`;
    }
    return fallbackColor || '#bae1ff';
}

// 計算「2026-01-01」到某個月份第 1 天之間，累積了幾天，藉此推算出該月 1 號是星期幾
// （週一為索引 0 ...週日為索引 6；2026-01-01 是週四，索引為 3）
function getMonthStartWeekdayIndex(monthIndex) {
    let totalDaysBefore = 0;
    for (let i = 0; i < monthIndex; i++) totalDaysBefore += daysInMonths[i];
    return (3 + totalDaysBefore) % 7;
}

function rateToClass(rate) {
    if (rate === 1) return 'rate-high';
    if (rate >= 0.5) return 'rate-mid';
    if (rate > 0) return 'rate-low';
    return 'rate-zero';
}

// 單一月份的整體達成率：把該月每一天所屬週次的達成率平均起來（簡化計算，不特別切分「屬於這個月的天數比例」）
function getMonthCompletionRate(monthIndex) {
    const days = daysInMonths[monthIndex];
    let sum = 0, count = 0;
    for (let d = 1; d <= days; d++) {
        const weekNum = getWeekNumberFor2026(monthIndex, d);
        const rate = getWeekCompletionRate(`第 ${weekNum} 週`);
        sum += rate;
        count++;
    }
    return count > 0 ? (sum / count) : 0;
}

// 畫出「目前這個月」的月曆格子（一次只會顯示一個月）
function renderMonthsCalendar(monthIndex, todayStr) {
    const container = document.getElementById('months-view-container');
    if (!container) return;
    container.innerHTML = '';

    const monthLabelEl = document.getElementById('current-month-label');
    if (monthLabelEl) monthLabelEl.innerText = monthNames[monthIndex];

    const monthCard = document.createElement('div');
    monthCard.className = 'month-card single-month-card';

    let html = `<div class="days-grid">`;
    weekdays.forEach(d => html += `<div class="weekday-label">${d}</div>`);

    const startWeekdayIdx = getMonthStartWeekdayIndex(monthIndex);
    for (let e = 0; e < startWeekdayIdx; e++) html += `<div class="empty-cell"></div>`;

    const days = daysInMonths[monthIndex];
    for (let d = 1; d <= days; d++) {
        const weekNum = getWeekNumberFor2026(monthIndex, d);
        const dateStr = formatDateString(monthIndex, d);
        const rate = getWeekCompletionRate(`第 ${weekNum} 週`);
        const rateClass = rateToClass(rate);

        const isToday = (dateStr === todayStr) ? 'is-today' : '';
        const isSelected = (dateStr === selectedDateStr) ? 'is-selected' : '';

        html += `
            <div class="day-cell ${rateClass} ${isToday} ${isSelected}" 
                 data-date="${dateStr}" data-week="第 ${weekNum} 週">
                ${d}
            </div>
        `;
    }
    html += `</div>`;
    monthCard.innerHTML = html;
    container.appendChild(monthCard);

    container.querySelectorAll('.day-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            container.querySelectorAll('.day-cell').forEach(c => c.classList.remove('is-selected'));
            selectedDateStr = cell.getAttribute('data-date');
            cell.classList.add('is-selected');
            showDateDetails(selectedDateStr, cell.getAttribute('data-week'));
        });
    });
}

function goToPrevMonth() {
    currentMonthIndex = (currentMonthIndex + 11) % 12;
    renderMonthsCalendar(currentMonthIndex, cachedTodayStr);
}

function goToNextMonth() {
    currentMonthIndex = (currentMonthIndex + 1) % 12;
    renderMonthsCalendar(currentMonthIndex, cachedTodayStr);
}

// 年度總覽彈窗：4x3 排列 12 個月，只顯示每個月的達成率，不可點擊互動
function renderAnnualOverviewGrid() {
    const grid = document.getElementById('annual-overview-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let m = 0; m < 12; m++) {
        const rate = getMonthCompletionRate(m);
        const rateClass = rateToClass(rate);
        const percentText = Math.round(rate * 100) + '%';

        const cell = document.createElement('div');
        cell.className = `annual-overview-cell ${rateClass}`;
        cell.innerHTML = `
            <div class="annual-overview-month-name">${monthNames[m]}</div>
            <div class="annual-overview-rate">${percentText}</div>
        `;
        grid.appendChild(cell);
    }
}

function openAnnualOverviewModal() {
    renderAnnualOverviewGrid();
    const modal = document.getElementById('annual-overview-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeAnnualOverviewModal() {
    const modal = document.getElementById('annual-overview-modal');
    if (modal) modal.classList.add('hidden');
}

function showDateDetails(dateStr, weekKey) {
    const titleEl = document.getElementById('focus-date-title');
    const hintEl = document.getElementById('focus-date-week-hint');
    const detailsEl = document.getElementById('focus-date-details');
    
    if (titleEl) titleEl.innerText = `檢視日期：${dateStr}`;
    if (hintEl) hintEl.innerText = `所屬週次：${weekKey}`;
    
    // 該週資料已由 precomputeAllWeeks() 預先算好並存在 weeklyDataStore 快取中，這裡直接讀取即可
    const weekData = weeklyDataStore[weekKey] || {};
    let html = "";

    html += `<h4 style="margin: 5px 0; color: #1a4d6c;">當天專屬臨時任務：</h4>`;
    const tempTasksList = globalAppData.tempTasks || [];
    const specificTempTasks = tempTasksList.filter(t => t.date === dateStr);
    
    if (specificTempTasks.length === 0) {
        html += `<div class="detail-item" style="color:#777; font-style:italic;">本日無排定臨時指派任務。</div>`;
    } else {
        specificTempTasks.forEach(task => {
            html += `
                <div class="detail-item detail-item-box" style="border-left:3px solid ${task.color || '#64748b'}">
                    <b>${task.name}</b> <br>
                    狀態：${task.completed >= task.total ? '已完成' : '進行中'} (${task.completed}/${task.total}次)
                </div>
            `;
        });
    }

    html += `<h4 style="margin: 15px 0 5px 0; color: #1a4d6c;">所屬週次各大項累積進度：</h4>`;
    let hasRegular = false;
    for (let mainKey in weekData) {
        hasRegular = true;
        const mainItem = weekData[mainKey];
        const percent = mainItem.total > 0 ? Math.round((mainItem.completed / mainItem.total) * 100) : 0;
        const displayColor = getSafeMacaronColor(mainKey, '#bae1ff');

        html += `
            <div class="regular-progress-item">
                <span class="regular-progress-dot" style="background:${displayColor};"></span>
                <b>${mainKey}</b>: ${mainItem.completed}/${mainItem.total} 次 (${percent}%)
            </div>
        `;
    }
    if(!hasRegular) html += `<div style="color:#999; font-size:14px;">本週無任何常規任務。</div>`;
    if (detailsEl) detailsEl.innerHTML = html;
}

function calculateAnnualSummaryStats() {
    const container = document.getElementById('annual-stats-classified-container');
    if (!container) return;
    container.innerHTML = '';
    const classifiedCounters = {};

    for (let w = 1; w <= 53; w++) {
        const weekKey = `第 ${w} 週`;
        // 資料已由 precomputeAllWeeks() 算過，這裡不再重算
        const weekData = weeklyDataStore[weekKey] || {};
        for (let mainKey in weekData) {
            if (!classifiedCounters[mainKey]) classifiedCounters[mainKey] = {};
            const subItems = weekData[mainKey].subItems || {};
            for (let subKey in subItems) {
                const subItem = subItems[subKey];
                if (subItem.completed > 0) {
                    if (!classifiedCounters[mainKey][subKey]) classifiedCounters[mainKey][subKey] = 0;
                    classifiedCounters[mainKey][subKey] += subItem.completed;
                }
            }
        }
    }

    let hasAnyData = false;
    for (let groupName in classifiedCounters) {
        const items = classifiedCounters[groupName];
        const itemKeys = Object.keys(items);
        if (itemKeys.length > 0) {
            hasAnyData = true;
            const groupCard = document.createElement('div');
            groupCard.className = 'category-group-card';
            groupCard.style.borderTop = `4px solid ${getSafeMacaronColor(groupName, '#bae1ff')}`;

            let html = `<div class="category-group-title">${groupName}</div>`;
            itemKeys.forEach(itemName => {
                html += `<div class="stat-item-row"><span class="name">${itemName}</span><span class="count">${items[itemName]} 次</span></div>`;
            });
            groupCard.innerHTML = html;
            container.appendChild(groupCard);
        }
    }
    if (!hasAnyData) container.innerHTML = `<div class="no-data-hint">目前全年度尚無任何打卡執行紀錄。</div>`;
}

// window.onload 的 Firebase 登入與資料讀取已統一交給 js/app.js 處理
// （SPA 架構下整個網站只登入一次、只抓一次資料）。
// initCalendarGrid() 現在改由 js/spa.js 的 switchPage('calendar') 呼叫，
// 每次切換到年曆頁時執行，讀取當下已經在記憶體裡的 globalAppData。

function initCalendarGrid() {
    const systemDate = new Date();
    let todayStr = "2026-07-11"; 
    let systemWeekKey = "第 28 週";
    let todayMonthIndex = 6; // 對應預設的 2026-07-11（7月，索引 6）

    if (systemDate.getFullYear() === 2026) {
        const mm = String(systemDate.getMonth() + 1).padStart(2, '0');
        const dd = String(systemDate.getDate()).padStart(2, '0');
        todayStr = `2026-${mm}-${dd}`;
        const wNum = getWeekNumberFor2026(systemDate.getMonth(), systemDate.getDate());
        systemWeekKey = `第 ${wNum} 週`;
        todayMonthIndex = systemDate.getMonth();
    }

    selectedDateStr = todayStr;
    cachedTodayStr = todayStr;
    currentMonthIndex = todayMonthIndex;

    // 先把 53 週的資料一次算好放進快取，後面畫月曆格子/年度統計都直接讀快取，
    // 不會每畫一格、每點一次都重算一次整週資料。
    precomputeAllWeeks();

    renderMonthsCalendar(currentMonthIndex, todayStr);
    try { calculateAnnualSummaryStats(); } catch (e) {}
    showDateDetails(todayStr, systemWeekKey);

    // 月份導覽按鈕、年度總覽彈窗的事件綁定：用 onclick 覆蓋而不是 addEventListener 疊加，
    // 這樣即使每次切換到年曆頁都重新呼叫一次 initCalendarGrid()，也不會重複綁定造成
    // 「點一次上一頁/下一頁結果跳了兩個月」這種情況。
    const prevBtn = document.getElementById('prev-month-btn');
    if (prevBtn) prevBtn.onclick = goToPrevMonth;

    const nextBtn = document.getElementById('next-month-btn');
    if (nextBtn) nextBtn.onclick = goToNextMonth;

    const openOverviewBtn = document.getElementById('open-annual-overview-btn');
    if (openOverviewBtn) openOverviewBtn.onclick = openAnnualOverviewModal;

    const closeOverviewBtn = document.getElementById('close-annual-overview-btn');
    if (closeOverviewBtn) closeOverviewBtn.onclick = closeAnnualOverviewModal;

    const overviewModal = document.getElementById('annual-overview-modal');
    if (overviewModal) {
        overviewModal.onclick = (e) => {
            if (e.target === overviewModal) closeAnnualOverviewModal();
        };
    }
}
