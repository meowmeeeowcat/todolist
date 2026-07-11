// js/data.js

const categoryHues = {
    "運動": 180,
    "學習": 210,
    "家務": 40
};

// 預設安全範本
let defaultTemplate = {
    "運動": {
        customHue: 180,
        subItems: {
            "跑步": { total: 2 },
            "重訓": { total: 3 }
        }
    },
    "學習": {
        customHue: 210,
        subItems: {
            "英文": { total: 4 },
            "程式": { total: 6 }
        }
    },
    "家務": {
        customHue: 40,
        subItems: {
            "掃地": { total: 2 },
            "洗衣服": { total: 2 }
        }
    }
};

// 宣告全域變數
let globalAppData = {
    template: JSON.parse(JSON.stringify(defaultTemplate)),
    progress: {},
    tempTasks: []
};

// 本地暫存相容層（留空以防主程式呼叫報錯，核心已由 app.js/calendar.js 的 Firebase 接管）
function loadDataFromStorage() {
    console.log("Data core synced with cloud infrastructure.");
}
function saveDataToStorage() {
    console.log("Data core requested save via cloud infrastructure.");
}

let weeklyDataStore = {};

// 核心計算整合函數
function calculateMainItems(weekKey) {
    weeklyDataStore[weekKey] = {};
    
    // 【關鍵防禦】：若資料庫尚未載入完成或結構不存在，安全回傳空箱子
    if (!globalAppData) return;
    const template = globalAppData.template || {};
    
    // 呼叫資料組裝
    assembleWeeklyData(weekKey, template);
    assembleTemporaryData(weekKey);
}

// 組裝常規任務進度
function assembleWeeklyData(weekKey, template) {
    // 【關鍵防禦】：防範 progress 尚未從 Firebase 載入完成的崩潰點
    const progress = globalAppData.progress || {};
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

        weeklyDataStore[weekKey][mainKey] = {
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
            
            weeklyDataStore[weekKey][mainKey].subItems[subKey] = {
                total: total,
                completed: completed,
                color: subMatchedPalette.color,
                isTemp: false
            };
        }

        weeklyDataStore[weekKey][mainKey].total = mainTotal;
        weeklyDataStore[weekKey][mainKey].completed = mainCompleted;
        weeklyDataStore[weekKey][mainKey].color = matchedPalette.color;
    }
}

// 組裝臨時任務進度
function assembleTemporaryData(weekKey) {
    const tempTasks = globalAppData.tempTasks || [];
    
    tempTasks.forEach(task => {
        if (task.archived) return;
        
        const computedWeekKey = getWeekNumberByDate(task.date);
        if (computedWeekKey === weekKey) {
            const cat = task.category || "臨時任務";
            if (!weeklyDataStore[weekKey][cat]) {
                weeklyDataStore[weekKey][cat] = {
                    total: 0,
                    completed: 0,
                    color: task.color || '#94a3b8',
                    subItems: {}
                };
            }
            weeklyDataStore[weekKey][cat].total += (task.total || 0);
            weeklyDataStore[weekKey][cat].completed += (task.completed || 0);
            weeklyDataStore[weekKey][cat].subItems[task.name] = {
                total: task.total,
                completed: task.completed,
                color: task.color || '#94a3b8',
                isTemp: true,
                tempId: task.id
            };
        }
    });
}

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

// 圖表數據封裝
function getChartData(dataObject, isSubView = false) {
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];
    
    let totalTodo = 0;
    let totalCompleted = 0;

    for (let key in dataObject) {
        const item = dataObject[key];
        labels.push(`${key} (${item.completed}/${item.total})`);
        dataValues.push(item.completed);
        backgroundColors.push(item.color || "#ffb3ba");

        totalTodo += item.total;
        totalCompleted += item.completed;
    }

    const uncompleted = totalTodo - totalCompleted;
    if (uncompleted > 0) {
        labels.push("未完成任務");
        dataValues.push(uncompleted);
        backgroundColors.push("#e0e0e0");
    }

    return { labels, dataValues, backgroundColors };
}

function getWeekCompletionRate(weekKey) {
    calculateMainItems(weekKey);
    const weekData = weeklyDataStore[weekKey] || {};
    let total = 0;
    let completed = 0;
    for (let key in weekData) {
        total += weekData[key].total || 0;
        completed += weekData[key].completed || 0;
    }
    return total > 0 ? (completed / total) : 0;
}