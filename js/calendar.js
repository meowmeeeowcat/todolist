// js/calendar.js
// ================= Firebase 初始化配置 =================
const firebaseConfig = {
    apiKey: "AIzaSyA4gMYuA7BjykCeXQP7N5AOkUSJPzw8qI8",
    authDomain: "todolist-f37a5.firebaseapp.com",
    databaseURL: "https://todolist-f37a5-default-rtdb.firebaseio.com",
    projectId: "todolist-f37a5",
    storageBucket: "todolist-f37a5.firebasestorage.app",
    messagingSenderId: "784814496491",
    appId: "1:784814496491:web:330a8ccf2c312e224fbcae"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let globalAppData = { template: {}, tempTasks: [] };
let userDbRef = null;
// =======================================================
const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

let currentActiveView = 'months'; 
let selectedDateStr = "";

function getWeekNumberFor2026(monthIndex, day) {
    let totalDays = day;
    for (let i = 0; i < monthIndex; i++) {
        totalDays += daysInMonths[i];
    }
    return Math.ceil((totalDays + 3) / 7);
}

function formatDateString(mIdx, d) {
    const mm = String(mIdx + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `2026-${mm}-${dd}`;
}

function switchView(viewType) {
    currentActiveView = viewType;
    document.getElementById('tab-months').classList.toggle('active', viewType === 'months');
    document.getElementById('tab-weeks').classList.toggle('active', viewType === 'weeks');
    document.getElementById('months-view-container').classList.toggle('hidden', viewType !== 'months');
    document.getElementById('weeks-view-container').classList.toggle('hidden', viewType !== 'weeks');
}

// 輔助函數：安全取得與主頁完全一致的馬卡龍色彩
function getSafeMacaronColor(groupName, fallbackColor) {
    // 預設灰色給臨時任務
    if (groupName === '臨時任務') return '#94a3b8';

    // 1. 嘗試從 app.js 的全域調色盤 fixedPalette 尋找匹配
    const palette = window.fixedPalette || [];
    
    if (globalAppData && globalAppData.template && globalAppData.template[groupName]) {
        const hue = globalAppData.template[groupName].customHue;
        if (hue !== undefined) {
            const matched = palette.find(p => p.hue === hue);
            if (matched) return matched.color;
            // 2. 如果是自訂色相，使用馬卡龍專屬的高明度與柔和飽和度公式 (Lightness: 85%) 確保風格統一
            return `hsl(${hue}, 100%, 85%)`;
        }
    }

    // 3. 備用方案：如果 template 找不到 (可能是歷史被刪除的分類)，檢查寫死名稱或原色彩
    if (groupName === '學習') return '#bae1ff'; // 馬卡龍晴空藍
    if (groupName === '運動') return '#aefff5'; // 馬卡龍湖水綠
    if (groupName === '家務') return '#ffdfba'; // 馬卡龍活力橙
    
    return fallbackColor || '#e8bfff'; // 預設馬卡龍薰衣草紫
}

function renderMonthsCalendar(todayStr) {
    const container = document.getElementById('months-view-container');
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
                     data-date="${dateStr}" data-week="第 ${weekNum} 週" 
                     title="${dateStr} ${isToday ? '(今天)' : ''}\n屬於：第 ${weekNum} 週\n該週進度: ${Math.round(rate*100)}%">
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
            document.getElementById('weeks-view-container').querySelectorAll('.week-box-btn').forEach(c => c.classList.remove('is-selected'));
            
            selectedDateStr = cell.getAttribute('data-date');
            cell.classList.add('is-selected');
            
            showDateDetails(selectedDateStr, cell.getAttribute('data-week'));
        });
    });
}

function renderWeeksCalendar() {
    const container = document.getElementById('weeks-view-container');
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
            document.getElementById('months-view-container').querySelectorAll('.day-cell').forEach(c => c.classList.remove('is-selected'));
            
            weekCard.classList.add('is-selected');
            showWeekWholeDetails(weekKey);
        });

        container.appendChild(weekCard);
    }
}

function showDateDetails(dateStr, weekKey) {
    document.getElementById('focus-date-title').innerText = `檢視日期：${dateStr}`;
    document.getElementById('focus-date-week-hint').innerText = `所屬週次：${weekKey}`;
    
    calculateMainItems(weekKey);
    const weekData = weeklyDataStore[weekKey] || {};
    let html = "";

    html += `<h4 style="margin: 5px 0; color: #1a4d6c;">當天專屬臨時任務：</h4>`;
    const specificTempTasks = globalAppData.tempTasks.filter(t => t.date === dateStr);
    
    if (specificTempTasks.length === 0) {
        html += `<div class="detail-item" style="color:#777; font-style:italic;">本日無排定臨時指派任務。</div>`;
    } else {
        specificTempTasks.forEach(task => {
            html += `
                <div class="detail-item detail-item-box" style="border-left:5px solid ${task.color || '#64748b'}">
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
        
        // 安全引入對齊函數
        const displayColor = getSafeMacaronColor(mainKey, mainItem.color);

        html += `
            <div class="regular-progress-item">
                <span class="regular-progress-dot" style="background:${displayColor};"></span>
                <b>${mainKey}</b>: ${mainItem.completed}/${mainItem.total} 次 (${percent}%)
            </div>
        `;
    }
    if(!hasRegular) html += `<div style="color:#999; font-size:14px;">本週無任何常規任務範本。</div>`;

    document.getElementById('focus-date-details').innerHTML = html;
}

function showWeekWholeDetails(weekKey) {
    document.getElementById('focus-date-title').innerText = `檢視：${weekKey}`;
    document.getElementById('focus-date-week-hint').innerText = `整個禮拜的任務分布總覽`;
    
    calculateMainItems(weekKey);
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
    document.getElementById('focus-date-details').innerHTML = html;
}

function calculateAnnualSummaryStats() {
    const container = document.getElementById('annual-stats-classified-container');
    if (!container) return;
    container.innerHTML = '';

    const classifiedCounters = {};

    for (let w = 1; w <= 53; w++) {
        const weekKey = `第 ${w} 週`;
        
        if (typeof calculateMainItems === "function") {
            calculateMainItems(weekKey);
        }
        
        const weekData = weeklyDataStore[weekKey] || {};
        
        for (let mainKey in weekData) {
            if (!classifiedCounters[mainKey]) {
                classifiedCounters[mainKey] = {};
            }
            
            const targetGroup = classifiedCounters[mainKey];
            const subItems = weekData[mainKey].subItems || {};
            
            for (let subKey in subItems) {
                const subItem = subItems[subKey];
                if (subItem.completed > 0) {
                    if (!targetGroup[subKey]) targetGroup[subKey] = 0;
                    targetGroup[subKey] += subItem.completed;
                }
            }
        }
    }

    const tempTaskList = (typeof globalAppData !== 'undefined' && globalAppData.tempTasks) ? globalAppData.tempTasks : [];
    tempTaskList.forEach(task => {
        if (task.completed > 0) {
            if (!classifiedCounters["臨時任務"]) {
                classifiedCounters["臨時任務"] = {};
            }
            if (!classifiedCounters["臨時任務"][task.name]) {
                classifiedCounters["臨時任務"][task.name] = 0;
            }
            classifiedCounters["臨時任務"][task.name] += task.completed;
        }
    });

    let hasAnyData = false;

    for (let groupName in classifiedCounters) {
        const items = classifiedCounters[groupName];
        const itemKeys = Object.keys(items);
        
        if (itemKeys.length > 0) {
            hasAnyData = true;
            const groupCard = document.createElement('div');
            groupCard.className = 'category-group-card';
            
            // 安全防禦調用：絕不因為 template[groupName] 為空而拋錯斷掉
            const borderStyleColor = getSafeMacaronColor(groupName, '#bae1ff');
            
            groupCard.style.borderTop = `4px solid ${borderStyleColor}`;

            let html = `<div class="category-group-title">${groupName}</div>`;
            itemKeys.forEach(itemName => {
                html += `
                    <div class="stat-item-row">
                        <span class="name">${itemName}</span>
                        <span class="count">${items[itemName]} 次</span>
                    </div>
                `;
            });
            
            groupCard.innerHTML = html;
            container.appendChild(groupCard);
        }
    }

    if (!hasAnyData) {
        container.innerHTML = `<div class="no-data-hint">目前全年度尚無任何打卡執行紀錄。</div>`;
    }
}

window.onload = () => {
    // 監聽登入狀態並由 Firebase 自動同步下載數據
    auth.onAuthStateChanged((user) => {
        if (user) {
            userDbRef = db.ref('users/' + user.uid);
            userDbRef.once('value').then((snapshot) => {
                const data = snapshot.val();
                if (data) {
                    globalAppData = data;
                }
                
                // 雲端資料到齊後，開始安全渲染年曆
                initCalendarGrid();
            });
        } else {
            auth.signInAnonymously();
        }
    });
};

// 封裝原本年曆載入後的初始化執行流程
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

    renderMonthsCalendar(todayStr);
    renderWeeksCalendar();
    
    try {
        calculateAnnualSummaryStats();
    } catch (e) {
        console.error("年度統計計算中斷防禦觸發:", e);
    }

    showDateDetails(todayStr, systemWeekKey);
}