// js/calendar.js
// firebaseConfig / auth / db 的初始化已搬到共用檔案 js/firebase-init.js

const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

let currentActiveView = 'months'; 
let selectedDateStr = "";


// getWeekNumberFor2026 / formatDateString 已搬到共用檔案 js/date-utils.js（html 需先載入它）

function switchView(viewType) {
    currentActiveView = viewType;
    document.getElementById('tab-months').classList.toggle('active', viewType === 'months');
    document.getElementById('tab-weeks').classList.toggle('active', viewType === 'weeks');
    document.getElementById('months-view-container').classList.toggle('hidden', viewType !== 'months');
    document.getElementById('weeks-view-container').classList.toggle('hidden', viewType !== 'weeks');
}

function getSafeMacaronColor(groupName, fallbackColor) {
    if (groupName === '臨時任務') return '#94a3b8';
    if (globalAppData && globalAppData.template && globalAppData.template[groupName]) {
        const hue = globalAppData.template[groupName].customHue;
        if (hue !== undefined) return `hsl(${hue}, 100%, 85%)`;
    }
    return fallbackColor || '#bae1ff';
}

function renderMonthsCalendar(todayStr) {
    const container = document.getElementById('months-view-container');
    if (!container) return;
    container.innerHTML = '';
    let currentFirstDayOfWeek = 4; // 2026-01-01 是週四

    for (let m = 0; m < 12; m++) {
        const monthCard = document.createElement('div');
        monthCard.className = 'month-card';
        
        let html = `<div class="month-title">${monthNames[m]}</div>`;
        html += `<div class="days-grid">`;
        weekdays.forEach(d => html += `<div class="weekday-label">${d}</div>`);
        
        for (let e = 0; e < currentFirstDayOfWeek; e++) html += `<div class="empty-cell"></div>`;

        const days = daysInMonths[m];
        for (let d = 1; d <= days; d++) {
            const weekNum = getWeekNumberFor2026(m, d);
            const dateStr = formatDateString(m, d);
            const rate = getWeekCompletionRate(`第 ${weekNum} 週`);
            
            let rateClass = 'rate-zero';
            if (rate === 1) rateClass = 'rate-high';
            else if (rate >= 0.5) rateClass = 'rate-mid';
            else if (rate > 0) rateClass = 'rate-low';

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
        currentFirstDayOfWeek = (currentFirstDayOfWeek + days) % 7;
    }

    container.querySelectorAll('.day-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            container.querySelectorAll('.day-cell').forEach(c => c.classList.remove('is-selected'));
            selectedDateStr = cell.getAttribute('data-date');
            cell.classList.add('is-selected');
            showDateDetails(selectedDateStr, cell.getAttribute('data-week'));
        });
    });
}

function renderWeeksCalendar() {
    const container = document.getElementById('weeks-view-container');
    if (!container) return;
    container.innerHTML = '';

    for (let w = 1; w <= 53; w++) {
        const weekKey = `第 ${w} 週`;
        const rate = getWeekCompletionRate(weekKey);
        
        let rateClass = 'rate-zero';
        if (rate === 1) rateClass = 'rate-high';
        else if (rate >= 0.5) rateClass = 'rate-mid';
        else if (rate > 0) rateClass = 'rate-low';

        const weekCard = document.createElement('div');
        weekCard.className = `week-box-btn ${rateClass}`;
        weekCard.setAttribute('data-week', weekKey);
        weekCard.innerText = `W${w}`;

        weekCard.addEventListener('click', () => {
            container.querySelectorAll('.week-box-btn').forEach(c => c.classList.remove('is-selected'));
            weekCard.classList.add('is-selected');
            showWeekWholeDetails(weekKey);
        });

        container.appendChild(weekCard);
    }
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

function showWeekWholeDetails(weekKey) {
    const titleEl = document.getElementById('focus-date-title');
    const hintEl = document.getElementById('focus-date-week-hint');
    const detailsEl = document.getElementById('focus-date-details');

    if (titleEl) titleEl.innerText = `檢視：${weekKey}`;
    if (hintEl) hintEl.innerText = `整個禮拜的任務分布總覽`;
    
    // 同樣直接讀 precomputeAllWeeks() 算好的快取
    const weekData = weeklyDataStore[weekKey] || {};
    let html = `<h4 style="margin:5px 0; color:#1a1a1a;">本週全部清單項目一覽：</h4>`;

    for (let mainKey in weekData) {
        html += `<div style="margin-top:10px; font-weight:bold; color:#1a4d6c;">大類別：${mainKey}</div>`;
        const subItems = weekData[mainKey].subItems || {};
        for(let subKey in subItems) {
            const sub = subItems[subKey];
            html += `
                <div style="padding-left:12px; font-size:14px; margin:3px 0; color:${sub.isTemp?'#d35400':'#475569'}">
                    ${sub.isTemp ? '臨時: ' : '- '}${subKey} (${sub.completed}/${sub.total})
                </div>
            `;
        }
    }
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

    if (systemDate.getFullYear() === 2026) {
        const mm = String(systemDate.getMonth() + 1).padStart(2, '0');
        const dd = String(systemDate.getDate()).padStart(2, '0');
        todayStr = `2026-${mm}-${dd}`;
        const wNum = getWeekNumberFor2026(systemDate.getMonth(), systemDate.getDate());
        systemWeekKey = `第 ${wNum} 週`;
    }

    selectedDateStr = todayStr;

    // 先把 53 週的資料一次算好放進快取，後面畫月曆格子/週視圖/年度統計都直接讀快取，
    // 不會像以前一樣每畫一格、每點一次都重算一次整週資料。
    precomputeAllWeeks();

    renderMonthsCalendar(todayStr);
    renderWeeksCalendar();
    try { calculateAnnualSummaryStats(); } catch (e) {}
    showDateDetails(todayStr, systemWeekKey);
}