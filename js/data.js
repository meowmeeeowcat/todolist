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
            order: mainItem.order || 0,
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
                order: subItem.order || 0,
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

// ================= 主頁總覽（圖表/項目清單）用：排除臨時任務 =================
// 臨時任務現在改成顯示在旁邊獨立的「臨時待辦」清單，不計入主頁的圖表跟總覽統計，
// 這裡把 weeklyDataStore 裡混在一起的臨時子項目過濾掉，只留下常規任務的部分。
function getRegularOnlyWeekData(weekData) {
    const result = {};
    for (let key in weekData) {
        const group = weekData[key];
        const regularSubItems = {};
        let total = 0, completed = 0;
        for (let subKey in group.subItems) {
            const sub = group.subItems[subKey];
            if (sub.isTemp) continue;
            regularSubItems[subKey] = sub;
            total += sub.total;
            completed += sub.completed;
        }
        // 這個大類別底下如果只有臨時任務、沒有任何常規子項目，主頁總覽就不用顯示這個類別了
        if (Object.keys(regularSubItems).length > 0) {
            result[key] = {
                total, completed,
                color: group.color,
                order: group.order || 0,
                subItems: regularSubItems
            };
        }
    }
    return result;
}

// ================= 通用：依 order 欄位排序 key 陣列 =================
function sortKeysByOrder(dataObj) {
    return Object.keys(dataObj).sort((a, b) => (dataObj[a].order || 0) - (dataObj[b].order || 0));
}

// ================= 通用：交換兩個項目的 order 欄位（用來實作「上移/下移」）=================
// dataStore：真正存放 order 欄位、之後要存回 Firebase 的來源物件（例如 globalAppData.template）
// orderedKeys：目前畫面上顯示的順序（已經排序過的 key 陣列）
// 回傳 true 代表確實有交換（成功上移/下移），false 代表已經是最上面/最下面，沒有動作
function swapOrder(dataStore, orderedKeys, key, direction) {
    // 如果是還沒有 order 欄位的舊資料，先依照目前畫面顯示的順序幫忙補上，才能正確交換
    orderedKeys.forEach((k, i) => {
        if (dataStore[k] && dataStore[k].order === undefined) dataStore[k].order = i;
    });
    const idx = orderedKeys.indexOf(key);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= orderedKeys.length) return false;
    const otherKey = orderedKeys[swapIdx];
    const tmp = dataStore[key].order;
    dataStore[key].order = dataStore[otherKey].order;
    dataStore[otherKey].order = tmp;
    return true;
}

// 陣列版本（給臨時任務清單用，因為 tempTasks 是陣列不是用 key 存取的物件）
function swapArrayOrder(arr, orderedItems, id, direction, idField) {
    orderedItems.forEach((item, i) => {
        if (item.order === undefined) item.order = i;
    });
    const idx = orderedItems.findIndex(item => item[idField] === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= orderedItems.length) return false;
    const tmp = orderedItems[idx].order;
    orderedItems[idx].order = orderedItems[swapIdx].order;
    orderedItems[swapIdx].order = tmp;
    return true;
}

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
    const weekData = window.weeklyDataStore[weekKey] || {};
    let total = 0;
    let completed = 0;
    for (let key in weekData) {
        total += weekData[key].total || 0;
        completed += weekData[key].completed || 0;
    }
    return total > 0 ? (completed / total) : 0;
}