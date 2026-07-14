// js/data.js

const categoryHues = {
    "運動": 180,
    "學習": 210,
    "家務": 40
};

// 預設範本
let defaultTemplate = {
    "運動": { customHue: 180, subItems: { "跑步": { total: 2 }, "重訓": { total: 3 } } },
    "學習": { customHue: 210, subItems: { "英文": { total: 4 }, "程式": { total: 6 } } },
    "家務": { customHue: 40, subItems: { "掃地": { total: 2 }, "洗衣服": { total: 2 } } }
};

// ❌ 移除 let globalAppData 和 let weeklyDataStore 宣告，改為安全的初始化檢查
if (typeof globalAppData === 'undefined') {
    window.globalAppData = {
        template: JSON.parse(JSON.stringify(defaultTemplate)),
        progress: {},
        tempTasks: []
    };
}
if (typeof weeklyDataStore === 'undefined') {
    window.weeklyDataStore = {};
}

function calculateMainItems(weekKey) {
    if (!window.weeklyDataStore) window.weeklyDataStore = {};
    window.weeklyDataStore[weekKey] = {};
    
    if (!window.globalAppData) return;
    const template = window.globalAppData.template || {};
    
    assembleWeeklyData(weekKey, template);
    assembleTemporaryData(weekKey);
}

function assembleWeeklyData(weekKey, template) {
    const progress = window.globalAppData.progress || {};
    const weekProgress = progress[weekKey] || {}; 

    for (let mainKey in template) {
        const mainItem = template[mainKey];
        if (mainItem.archived && compareWeeks(weekKey, mainItem.archivedFromWeek) >= 0) {
            continue;
        }

        let mainTotal = 0;
        let mainCompleted = 0;
        
        let hueValue = mainItem.customHue !== undefined ? mainItem.customHue : (categoryHues[mainKey] || 0);
        let matchedPalette = (window.fixedPalette && window.fixedPalette.find(p => p.hue === hueValue)) || { color: `hsl(${hueValue}, 100%, 85%)` };

        window.weeklyDataStore[weekKey][mainKey] = {
            total: 0,
            completed: 0,
            color: matchedPalette.color,
            subItems: {}
        };

        const subItems = mainItem.subItems || {};
        for (let subKey in subItems) {
            const subItem = subItems[subKey];
            if (subItem.archived && compareWeeks(weekKey, subItem.archivedFromWeek) >= 0) {
                continue;
            }

            const total = subItem.total || 1;
            const completed = weekProgress[subKey] || 0;

            mainTotal += total;
            mainCompleted += completed;

            let subHue = subItem.customHue !== undefined ? subItem.customHue : hueValue;
            let subMatchedPalette = (window.fixedPalette && window.fixedPalette.find(p => p.hue === subHue)) || matchedPalette;
            
            window.weeklyDataStore[weekKey][mainKey].subItems[subKey] = {
                total: total,
                completed: completed,
                color: subMatchedPalette.color,
                isTemp: false
            };
        }

        window.weeklyDataStore[weekKey][mainKey].total = mainTotal;
        window.weeklyDataStore[weekKey][mainKey].completed = mainCompleted;
        window.weeklyDataStore[weekKey][mainKey].color = matchedPalette.color;
    }
}

function assembleTemporaryData(weekKey) {
    const tempTasks = window.globalAppData.tempTasks || [];
    
    tempTasks.forEach(task => {
        if (task.archived) return;
        
        const computedWeekKey = getWeekNumberByDate(task.date);
        if (computedWeekKey === weekKey) {
            const cat = task.category || "臨時任務";
            if (!window.weeklyDataStore[weekKey][cat]) {
                window.weeklyDataStore[weekKey][cat] = {
                    total: 0, completed: 0, color: task.color || '#94a3b8', subItems: {}
                };
            }
            window.weeklyDataStore[weekKey][cat].total += (task.total || 0);
            window.weeklyDataStore[weekKey][cat].completed += (task.completed || 0);
            window.weeklyDataStore[weekKey][cat].subItems[task.name] = {
                total: task.total,
                completed: task.completed,
                color: task.color || '#94a3b8',
                isTemp: true,
                tempId: task.id
            };
        }
    });
}

<<<<<<< HEAD
// ================= tempTasks 儲存格式轉換 =================
// 本機執行時 globalAppData.tempTasks 仍然是陣列（方便原本 .find/.filter/.forEach 的寫法）。
// 但寫回 Firebase 時改成「用 task.id 當 key 的物件」，這樣才能針對單一臨時任務
// 用 transaction 做局部更新（例如打卡 +1），而不必每次都整包蓋掉 tempTasks。
function tempTasksArrayToObject(arr) {
    const obj = {};
    (arr || []).forEach(t => { obj[t.id] = t; });
    return obj;
}

function tempTasksObjectToArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw; // 相容舊格式（曾經整包用 .set() 存成陣列的資料）
    return Object.values(raw);
}

// daysInMonths / getWeekNumberByDate / compareWeeks 已搬到共用檔案 js/date-utils.js，
// 這裡不再重複定義（html 需要在 data.js 之前載入 date-utils.js）。

// 一次把 53 週的資料都算好放進快取，年曆頁只需要在初始化時呼叫一次，
// 之後畫月曆格子、週視圖、年度統計都直接讀快取，不用每畫一格就重算一次。
function precomputeAllWeeks() {
    for (let w = 1; w <= 53; w++) {
        calculateMainItems(`第 ${w} 週`);
    }
}

// 注意：這個函式現在「不會」主動重新計算，只讀 weeklyDataStore 目前的快取內容。
// 呼叫前請確保該週已經算過（例如先呼叫過 precomputeAllWeeks() 或 calculateMainItems(weekKey)）。
function getWeekCompletionRate(weekKey) {
=======
const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getWeekNumberByDate(dateStr) {
    if(!dateStr) return null;
    const d = new Date(dateStr);
    if (d.getFullYear() !== 2026) return null;
    let totalDays = d.getDate();
    for (let i = 0; i < d.getMonth(); i++) {
        totalDays += daysInMonths[i];
    }
    const w = Math.ceil((totalDays + 3) / 7);
    return (w >= 1 && w <= 53) ? `第 ${w} 週` : null;
}

function compareWeeks(w1, w2) {
    if (!w1 || !w2) return 0;
    const num1 = parseInt(w1.replace(/[^0-9]/g, ''), 10);
    const num2 = parseInt(w2.replace(/[^0-9]/g, ''), 10);
    return num1 - num2;
}

function getWeekCompletionRate(weekKey) {
    calculateMainItems(weekKey);
>>>>>>> 80947b3a2ca44d2a3bdee1a734dde008e55d2d9a
    const weekData = window.weeklyDataStore[weekKey] || {};
    let total = 0;
    let completed = 0;
    for (let key in weekData) {
        total += weekData[key].total || 0;
        completed += weekData[key].completed || 0;
    }
    return total > 0 ? (completed / total) : 0;
}