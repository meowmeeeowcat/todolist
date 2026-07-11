// js/data.js

const categoryHues = {
    "運動": 180,
    "學習": 210,
    "家務": 40
};

// 預設範本
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

// 資料庫存取核心邏輯
function loadDataFromStorage() {
    const localData = localStorage.getItem('weekly_todo_app_data');
    if (localData) {
        globalAppData = JSON.parse(localData);
    } else {
        for (let w = 1; w <= 53; w++) {
            globalAppData.progress[`第 ${w} 週`] = {};
        }
        saveDataToStorage();
    }
}

function saveDataToStorage() {
    localStorage.setItem('weekly_todo_app_data', JSON.stringify(globalAppData));
}

function getWeekNumberByDate(dateString) {
    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) return null;
    
    const startOfYear = new Date(targetDate.getFullYear(), 0, 1);
    const pastDaysOfYear = (targetDate - startOfYear) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    
    return weekNum >= 1 && weekNum <= 53 ? `第 ${weekNum} 週` : null;
}

function parseWeekNum(weekKey) {
    return parseInt(weekKey.replace(/[^0-9]/g, ""), 10) || 0;
}

let weeklyDataStore = {}; 

// 週資料結構組裝
function assembleWeeklyData(weekKey) {
    const template = globalAppData.template;
    const progress = globalAppData.progress[weekKey] || {};
    const currentWeekIdx = parseWeekNum(weekKey);
    
    let currentWeekStructure = {};
    
    for (let mainKey in template) {
        let hasActiveSubItem = false;
        let subStructure = {};
        
        for (let subKey in template[mainKey].subItems) {
            const itemConfig = template[mainKey].subItems[subKey];
            
            if (itemConfig.archived && currentWeekIdx >= parseWeekNum(itemConfig.archivedFromWeek)) {
                continue; 
            }
            
            hasActiveSubItem = true;
            const targetTotal = itemConfig.total;
            const targetComp = progress[subKey] !== undefined ? progress[subKey] : 0;
            
            subStructure[subKey] = {
                total: targetTotal,
                completed: targetComp > targetTotal ? targetTotal : targetComp,
                customHue: itemConfig.customHue
            };
        }
        
        const mainConfig = template[mainKey];
        const isMainArchived = mainConfig.archived && currentWeekIdx >= parseWeekNum(mainConfig.archivedFromWeek);
        
        if (!isMainArchived && (hasActiveSubItem || Object.keys(template[mainKey].subItems).length === 0)) {
            currentWeekStructure[mainKey] = {
                customHue: template[mainKey].customHue,
                subItems: subStructure
            };
        }
    }
    
    globalAppData.tempTasks.forEach(task => {
        const taskWeek = getWeekNumberByDate(task.date);
        if (taskWeek === weekKey) {
            if (task.archived) return;

            if (!currentWeekStructure[task.category]) {
                currentWeekStructure[task.category] = { 
                    customHue: task.customHue !== undefined ? task.customHue : 0, 
                    subItems: {} 
                };
            }
            const displayTaskName = `📌 [${task.date.slice(5)}] ${task.name}`;
            currentWeekStructure[task.category].subItems[displayTaskName] = {
                total: task.total,
                completed: task.completed,
                color: task.color,
                customHue: task.customHue,
                isTemp: true, 
                tempId: task.id 
            };
        }
    });
    
    weeklyDataStore[weekKey] = currentWeekStructure;
}

// 計算大類別並精確渲染馬卡龍色卡
function calculateMainItems(weekKey) {
    assembleWeeklyData(weekKey); 
    const weekData = weeklyDataStore[weekKey];
    if (!weekData) return;

    // 💡 修正點：若全域環境已有 window.fixedPalette 則直接採用，免去重複宣告的崩潰風險
    const currentPalette = window.fixedPalette || [
        { name: "馬卡龍櫻桃紅", color: "#ffb3ba", hue: 355 },
        { name: "馬卡龍活力橙", color: "#ffdfba", hue: 32 },
        { name: "馬卡龍香蕉黃", color: "#ffffba", hue: 60 },
        { name: "馬卡龍薄荷綠", color: "#baffc9", hue: 133 },
        { name: "馬卡龍湖水綠", color: "#aefff5", hue: 172 },
        { name: "馬卡龍晴空藍", color: "#bae1ff", hue: 206 },
        { name: "馬卡龍風信子靛", color: "#c5cbff", hue: 233 },
        { name: "馬卡龍薰衣草紫", color: "#e8bfff", hue: 279 },
        { name: "馬卡龍迷霧粉紫", color: "#fbcfff", hue: 296 },
        { name: "馬卡龍玫瑰豆沙", color: "#ffc6ff", hue: 300 }
    ];

    for (let mainKey in weekData) {
        let mainTotal = 0;
        let mainCompleted = 0;
        const subItemsObj = weekData[mainKey].subItems || {};
        const subKeys = Object.keys(subItemsObj);
        
        const currentHue = weekData[mainKey].customHue;
        const matchedPalette = currentPalette.find(p => p.hue === currentHue) || currentPalette[0];

        if (subKeys.length === 0) {
            weekData[mainKey].total = 1; 
            weekData[mainKey].completed = 0;
            weekData[mainKey].color = matchedPalette.color;
            continue; 
        }

        subKeys.forEach((subKey) => {
            const subItem = subItemsObj[subKey];
            mainTotal += subItem.total;
            mainCompleted += subItem.completed;
            
            const subHue = subItem.customHue !== undefined ? subItem.customHue : currentHue;
            const subMatchedPalette = currentPalette.find(p => p.hue === subHue) || matchedPalette;
            
            subItem.color = subItem.color || subMatchedPalette.color;
        });

        weekData[mainKey].total = mainTotal;
        weekData[mainKey].completed = mainCompleted;
        weekData[mainKey].color = matchedPalette.color;
    }
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
    const weekData = weeklyDataStore[weekKey];
    let total = 0;
    let completed = 0;
    for (let key in weekData) {
        total += weekData[key].total;
        completed += weekData[key].completed;
    }
    return total > 0 ? (completed / total) : 0;
}

// 執行初始化載入
loadDataFromStorage();