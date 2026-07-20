// js/app.js
// ================= Firebase 雲端同步 =================
// firebaseConfig / auth / db 的初始化已搬到共用檔案 js/firebase-init.js，
// 這裡只呼叫 initFirebaseAuth() 並傳入「登入完成後要做的事」。
initFirebaseAuth(() => {
    // 使用者已登入：確保登入畫面收起、載入中畫面顯示，然後開始抓資料
    const loginOverlayEl = document.getElementById('login-overlay');
    if (loginOverlayEl) loginOverlayEl.classList.add('hidden');
    const loadingOverlayEl = document.getElementById('loading-overlay');
    if (loadingOverlayEl) loadingOverlayEl.classList.remove('hidden');

    // 在主頁顯示暱稱（註冊時填的暱稱存在 Firebase Auth 的 displayName 裡；
    // 如果是舊帳號沒填過暱稱，就退而顯示 email）
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl && window.auth.currentUser) {
        const displayName = window.auth.currentUser.displayName;
        const email = window.auth.currentUser.email;
        greetingEl.innerText = displayName ? `哈囉，${displayName}` : (email ? `哈囉，${email}` : '');
    }

    // 【自動計算目前週次，並更新新版的週次選擇器（表格式）】
    currentWeek = getTodayWeekKey() || "第 1 週";
    updateWeekPickerLabel();

    // 去雲端把資料抓下來
    loadDataFromStorage();
}, () => {
    // 使用者尚未登入（或剛登出）：收起載入畫面，顯示登入表單，
    // 並重置「資料是否已載入」的狀態，避免登出後還能看到上一位使用者留在畫面/記憶體裡的舊資料。
    const loadingOverlayEl = document.getElementById('loading-overlay');
    if (loadingOverlayEl) loadingOverlayEl.classList.add('hidden');
    const loginOverlayEl = document.getElementById('login-overlay');
    if (loginOverlayEl) loginOverlayEl.classList.remove('hidden');

    window.dataLoaded = false;
    const viewCalendarBtnEl = document.getElementById('view-calendar-btn');
    if (viewCalendarBtnEl) {
        viewCalendarBtnEl.disabled = true;
        viewCalendarBtnEl.title = '請先登入';
    }
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) greetingEl.innerText = '';
    if (typeof switchPage === 'function') switchPage('todo');
});

const openTempEditModalBtn = document.getElementById('open-temp-edit-modal-btn');
if (openTempEditModalBtn) {
    openTempEditModalBtn.addEventListener('click', () => {
        const tempListWrapperEl = document.getElementById('temp-task-list-wrapper');
        if (tempListWrapperEl) tempListWrapperEl.classList.toggle('editing-mode');
    });
}

// 今天的日期字串（2026 年格式），系統年份不是 2026 時退而回傳固定預設值
function getTodayDateStr2026() {
    const systemDate = new Date();
    if (systemDate.getFullYear() === 2026) {
        const mm = String(systemDate.getMonth() + 1).padStart(2, '0');
        const dd = String(systemDate.getDate()).padStart(2, '0');
        return `2026-${mm}-${dd}`;
    }
    return '2026-01-01';
}

// 今天所屬的週次（"第 X 週"），算不出來（系統年份不是 2026）就回傳 null
function getTodayWeekKey() {
    return getWeekNumberByDate(getTodayDateStr2026());
}

// ================= 儲存 / 讀取 =================
// 原本每次改一點點資料，就 userDbRef.set(globalAppData) 把「全部」資料整包蓋掉雲端，
// 缺點：(1) 資料量越大越慢 (2) 兩個分頁/裝置幾乎同時操作時，後寫入的會直接覆蓋先寫入的，容易資料遺失。
// 現在拆成「只寫真正變動的那一小塊」，並且對「打卡計數」這種高頻率動作改用 transaction，
// 讓 Firebase 在伺服器端做「讀取目前值 → 累加 → 寫回」，就算兩處同時點擊也不會互相蓋掉。

// 只有全新使用者第一次建立資料時，才需要整包寫入一次
function saveDataToStorage() {
    if (!userDbRef) return;
    userDbRef.set({
        template: globalAppData.template,
        progress: globalAppData.progress,
        tempTasks: tempTasksArrayToObject(globalAppData.tempTasks)
    })
        .then(() => console.log("資料同步成功"))
        .catch(err => console.error("同步失敗:", err));
}

// 常規任務範本有變動時（新增/改名/改色/封存/刪除大類別或子項）才呼叫
function saveTemplate() {
    if (!userDbRef) return;
    userDbRef.child('template').set(globalAppData.template)
        .then(() => console.log("範本同步成功"))
        .catch(err => console.error("範本同步失敗:", err));
}

// progress 整棵樹有結構性變動時（例如刪除某任務、跨週搬移紀錄）才呼叫
function saveProgressTree() {
    if (!userDbRef) return;
    userDbRef.child('progress').set(globalAppData.progress)
        .then(() => console.log("進度同步成功"))
        .catch(err => console.error("進度同步失敗:", err));
}

// 臨時任務清單有結構性變動時（新增/改名/改色/封存/刪除）才呼叫，寫入時轉成用 id 當 key 的物件
function saveTempTasksTree() {
    if (!userDbRef) return;
    userDbRef.child('tempTasks').set(tempTasksArrayToObject(globalAppData.tempTasks))
        .then(() => console.log("臨時任務同步成功"))
        .catch(err => console.error("臨時任務同步失敗:", err));
}

// 常規任務「打卡 +1 / -1」：只動 progress/{週}/{任務名} 這一個節點，並用 transaction 防止競態覆寫
function syncRegularCounter(weekKey, taskName, delta) {
    if (!userDbRef) return;
    userDbRef.child(`progress/${weekKey}/${taskName}`).transaction((current) => {
        return Math.max((current || 0) + delta, 0);
    }).catch(err => console.error("計數同步失敗:", err));
}

// 臨時任務「打卡 +1 / -1」：只動 tempTasks/{id}/completed 這一個節點，同樣用 transaction
function syncTempTaskCounter(taskId, delta) {
    if (!userDbRef) return;
    userDbRef.child(`tempTasks/${taskId}/completed`).transaction((current) => {
        return Math.max((current || 0) + delta, 0);
    }).catch(err => console.error("臨時任務計數同步失敗:", err));
}

function loadDataFromStorage() {
    if (!userDbRef) return;
    userDbRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        if (data) {
            globalAppData = data;
            if (!globalAppData.template) globalAppData.template = {};
            if (!globalAppData.progress) globalAppData.progress = {};
            // tempTasks 在雲端可能是舊格式（陣列）或新格式（用 id 當 key 的物件），統一轉回本機用的陣列
            globalAppData.tempTasks = tempTasksObjectToArray(globalAppData.tempTasks);
        } else {
            globalAppData = { template: {}, tempTasks: [], progress: {} };
            saveDataToStorage(); // 全新使用者，第一次整包寫入是合理的
        }
        window.globalAppData = globalAppData;
        updateView();

        // 資料已經抓好了，這時候才把「查看年度年曆總覽」按鈕打開，
        // 避免使用者在資料還沒載入完成前就切過去看到空白畫面。
        window.dataLoaded = true;
        const viewCalendarBtn = document.getElementById('view-calendar-btn');
        if (viewCalendarBtn) {
            viewCalendarBtn.disabled = false;
            viewCalendarBtn.title = '';
        }
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    });
}
// =======================================================
const titleEl = document.getElementById('chart-title');
const backBtn = document.getElementById('back-btn');
const listContainer = document.getElementById('todo-list');
const weekPickerToggleBtn = document.getElementById('week-picker-toggle-btn');
const weekPickerPanel = document.getElementById('week-picker-panel');
const weekPickerGrid = document.getElementById('week-picker-grid');
const weekPickerCurrentLabel = document.getElementById('week-picker-current-label');
const todoListWrapper = document.getElementById('todo-list-wrapper');

const taskTypeSelect = document.getElementById('task-type-select');
const newTaskDateInput = document.getElementById('new-task-date');
const categorySelect = document.getElementById('task-category-select');
const newCategoryInput = document.getElementById('new-category-name');
const newTaskNameInput = document.getElementById('new-task-name');
const newTaskTotalInput = document.getElementById('new-task-total');
const addTaskBtn = document.getElementById('add-task-btn');

const taskModal = document.getElementById('task-modal');
const openAddModalBtn = document.getElementById('open-add-modal-btn');
const openWeightViewBtn = document.getElementById('open-weight-view-btn');
const openEditModalBtn = document.getElementById('open-edit-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalFormTitle = document.getElementById('modal-form-title');

// 10 種固定精選高質感顏色
const fixedPalette = [
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
window.fixedPalette = fixedPalette;


// 目前選取的顏色物件 (預設為第一種藍色)
let selectedPaletteItem = fixedPalette[0];
const paletteContainer = document.getElementById('color-palette-container');

let currentWeek = "第 1 週";
let currentView = 'main'; 
let currentSubKey = null;
let editingContext = null;
// 加權比例頁是從哪個頁面點進來的：'main'（主頁，所有大類別）或 'sub'（某個大類別的分項頁）
// 離開加權比例頁（返回）時要回到原本那一頁，而不是永遠回主頁
let weightViewSourceView = 'main';
let weightViewSourceSubKey = null;
let fullWeekData = {}; // 尚未過濾臨時任務的完整週資料，給「新增任務」下拉選單、顏色繼承用

// 動態渲染 10 色選擇按鈕
function renderColorPalette() {
    if (!paletteContainer) return;
    paletteContainer.innerHTML = '';
    fixedPalette.forEach(item => {
        const btn = document.createElement('div');
        btn.style.width = '28px';
        btn.style.height = '28px';
        btn.style.borderRadius = '50%';
        btn.style.backgroundColor = item.color;
        btn.style.cursor = 'pointer';
        btn.style.boxSizing = 'border-box';
        btn.style.transition = 'all 0.15s ease';
        
        // 選中的顏色加上精緻的雙重黑白高亮外框
        if (selectedPaletteItem.color === item.color) {
            btn.style.border = '3px solid #fff';
            btn.style.boxShadow = '0 0 0 2px #2c3e50';
            btn.style.transform = 'scale(1.15)';
        } else {
            btn.style.border = '1px solid rgba(0,0,0,0.15)';
        }

        btn.addEventListener('click', () => {
            selectedPaletteItem = item;
            renderColorPalette();
        });

        paletteContainer.appendChild(btn);
    });
}

function openModal(title) {
    modalFormTitle.innerText = title;
    taskModal.classList.remove('hidden');
    updateCategorySelectOptions();
    renderColorPalette(); // 開啟時載入調色盤
    toggleColorPickerVisibility();
}

// 臨時任務不用選顏色（統一用固定色，跟項目清單同色調）；
// 常規任務只有「新增全新大類別」或「編輯大類別本身」時才需要挑顏色；
// 幫既有分類新增子項目、或編輯既有子項目時，顏色一律直接沿用該分類本身的顏色，不給使用者自己選。
function toggleColorPickerVisibility() {
    const colorSection = document.getElementById('color-picker-section');
    if (!colorSection) return;
    if (taskTypeSelect.value === 'temporary') {
        colorSection.classList.add('hidden');
        return;
    }
    if (editingContext) {
        colorSection.classList.toggle('hidden', editingContext.type === 'sub-item');
        return;
    }
    const isNewCategory = (categorySelect.value === '__new__');
    colorSection.classList.toggle('hidden', !isNewCategory);
}

// 找出某個分類目前使用的色相：優先看常規範本裡的設定，找不到（例如純臨時分類）就從已存在的臨時任務裡借一個
function findCategoryHue(categoryName) {
    if (globalAppData.template[categoryName] && globalAppData.template[categoryName].customHue !== undefined) {
        return globalAppData.template[categoryName].customHue;
    }
    const existingTemp = globalAppData.tempTasks.find(t => t.category === categoryName && t.customHue !== undefined);
    return existingTemp ? existingTemp.customHue : undefined;
}

function closeModal() {
    taskModal.classList.add('hidden');
    editingContext = null;
    newTaskNameInput.value = '';
    newTaskNameInput.disabled = false;
    newCategoryInput.value = '';
    newTaskTotalInput.value = '1';
    newTaskTotalInput.disabled = false;
    categorySelect.value = '__new__';
    categorySelect.disabled = false;
    taskTypeSelect.value = 'regular';
    taskTypeSelect.disabled = false;
    
    // 重設回第一個預設色
    selectedPaletteItem = fixedPalette[0]; 
    
    newTaskDateInput.disabled = false;
    delete newTaskDateInput.dataset.userEdited;

    toggleTaskTypeView();
    toggleCategoryInput();
    
    todoListWrapper.classList.remove('editing-mode');
    const tempListWrapperEl = document.getElementById('temp-task-list-wrapper');
    if (tempListWrapperEl) tempListWrapperEl.classList.remove('editing-mode');
}

openAddModalBtn.addEventListener('click', () => {
    openModal("新增任務事項");
});

openEditModalBtn.addEventListener('click', () => {
    todoListWrapper.classList.toggle('editing-mode');
});

openWeightViewBtn.addEventListener('click', () => {
    todoListWrapper.classList.remove('editing-mode');
    // 記住目前是從主頁還是分項頁點進來的，這樣加權比例頁才知道要顯示所有大類別、還是只顯示這個大類別底下的分項
    if (currentView !== 'weight') {
        weightViewSourceView = currentView;
        weightViewSourceSubKey = currentSubKey;
    }
    currentView = 'weight';
    resetChartInstance();
    updateView();
});

closeModalBtn.addEventListener('click', closeModal);
taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) closeModal();
});

function toggleTaskTypeView() {
    const isTemp = (taskTypeSelect.value === 'temporary');

    if (isTemp) {
        newTaskDateInput.classList.remove('hidden');
        // 預設自動帶入今天日期（使用者自己改過就不再覆蓋掉）
        if (!newTaskDateInput.disabled && !newTaskDateInput.dataset.userEdited) {
            newTaskDateInput.value = getTodayDateStr2026();
        }
    } else {
        newTaskDateInput.classList.add('hidden');
    }

    // 臨時任務不用選大類別、不用填次數，這兩欄直接整個隱藏
    const categoryRowEl = document.getElementById('category-select-row');
    if (categoryRowEl) categoryRowEl.classList.toggle('hidden', isTemp);
    newTaskTotalInput.classList.toggle('hidden', isTemp);

    toggleColorPickerVisibility();
}
newTaskDateInput.addEventListener('input', () => { newTaskDateInput.dataset.userEdited = 'true'; });
taskTypeSelect.addEventListener('change', toggleTaskTypeView);

function updateCategorySelectOptions() {
    const weekData = weeklyDataStore[currentWeek];
    const previousSelectedValue = categorySelect.value;
    
    categorySelect.innerHTML = '<option value="__new__">新增全新大類別</option>';
    
    for (let key in weekData) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = key;
        categorySelect.appendChild(opt);
    }

    if (currentView === 'sub') {
        categorySelect.value = currentSubKey;
        categorySelect.disabled = true;
    } else {
        categorySelect.disabled = false;
        if (previousSelectedValue === '__new__' || !previousSelectedValue || !weekData[previousSelectedValue]) {
            categorySelect.value = '__new__';
        } else {
            categorySelect.value = previousSelectedValue;
        }
    }
    toggleCategoryInput();
}

function toggleCategoryInput() {
    if (currentView === 'main' && categorySelect.value === '__new__') {
        newCategoryInput.classList.remove('hidden');
    } else {
        newCategoryInput.classList.add('hidden');
    }
}
categorySelect.addEventListener('change', () => {
    toggleCategoryInput();
    toggleColorPickerVisibility();
});

function renderTodoList(weekData) {
    listContainer.innerHTML = '';

    if (currentView === 'main') {
        const orderedKeys = sortKeysByOrder(weekData);
        orderedKeys.forEach((key, index) => {
            const item = weekData[key];
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.style.borderLeft = `5px solid ${item.color || '#36a2eb'}`;
            
            li.innerHTML = `
                <div class="todo-item-clickable-area">
                    <span class="todo-item-progress-tag">${item.completed} / ${item.total}</span>
                    <b>${key}</b>
                </div>
                <span class="actions">
                    <button class="move-btn move-up-btn" title="往上移" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="move-btn move-down-btn" title="往下移" ${index === orderedKeys.length - 1 ? 'disabled' : ''}>▼</button>
                    <button class="archive-btn">完成</button>
                    <button class="edit-btn">編輯</button>
                    <button class="delete-btn">刪除</button>
                </span>
            `;

            li.addEventListener('click', () => {
                if (todoListWrapper.classList.contains('editing-mode')) return;
                todoListWrapper.classList.remove('editing-mode');
                currentView = 'sub';
                currentSubKey = key;
                updateView();
            });

            li.querySelector('.move-up-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (swapOrder(globalAppData.template, orderedKeys, key, -1)) {
                    saveTemplate();
                    updateView();
                }
            });

            li.querySelector('.move-down-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (swapOrder(globalAppData.template, orderedKeys, key, 1)) {
                    saveTemplate();
                    updateView();
                }
            });

            li.querySelector('.archive-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm(`確定將常規大類別「${key}」結案嗎？\n此操作將從【${currentWeek}】起往後的週次隱藏此項目，但之前的週次打卡紀錄仍會完整保留！`)) return;
                
                if (globalAppData.template[key]) {
                    globalAppData.template[key].archived = true;
                    globalAppData.template[key].archivedFromWeek = currentWeek;
                }
                saveTemplate();
                updateView();
            });

            li.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                editingContext = { type: 'main-category', key: key };
                
                openModal("編輯大類別：" + key);
                
                categorySelect.value = key;
                categorySelect.disabled = true;
                toggleCategoryInput();
                
                newCategoryInput.value = key;
                newCategoryInput.classList.remove('hidden'); 
                
                newTaskNameInput.value = "(免填，此處僅修改大類別)";
                newTaskNameInput.disabled = true;
                newTaskTotalInput.disabled = true;
                taskTypeSelect.disabled = true;
                
                if (globalAppData.template[key] && globalAppData.template[key].customHue !== undefined) {
                    const hue = globalAppData.template[key].customHue;
                    const foundColor = fixedPalette.find(p => p.hue === hue);
                    if (foundColor) {
                        selectedPaletteItem = foundColor; // 確保全域變數同步更新
                    }
                } else {
                    selectedPaletteItem = fixedPalette[0]; // 若無自訂色，歸類到預設
                }
                renderColorPalette(); // 統一在最後渲染
            });

            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (globalAppData.template[key]) {
                    if (!confirm(`【常規大類別】刪除「${key}」將會連動刪除全年度所有週次的此任務！確定嗎？`)) return;
                    delete globalAppData.template[key];
                } else {
                    if (!confirm(`【臨時大類別】確定要刪除本週的「${key}」類別與其內的所有臨時任務嗎？`)) return;
                }
                
                globalAppData.tempTasks = globalAppData.tempTasks.filter(t => !(t.category === key && getWeekNumberByDate(t.date) === currentWeek));

                saveTemplate();
                saveTempTasksTree();
                resetChartInstance();
                updateView();
            });

            listContainer.appendChild(li);
        });
    } else {
        const subItems = weekData[currentSubKey] ? weekData[currentSubKey].subItems : {};
        const orderedSubKeys = sortKeysByOrder(subItems);
        orderedSubKeys.forEach((originalKey, index) => {
            const subItem = subItems[originalKey];
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.style.cursor = 'default';
            li.style.borderLeft = `5px solid ${subItem.color}`;
            
            li.innerHTML = `
                <div class="todo-item-clickable-area">
                    <b>${originalKey}</b>
                </div>
                <span class="sub-counter">
                    <button class="counter-btn minus-btn">-</button>
                    <span>${subItem.completed} / ${subItem.total}</span>
                    <button class="counter-btn plus-btn">+</button>
                </span>
                <span class="actions">
                    <button class="move-btn move-up-btn" title="往上移" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="move-btn move-down-btn" title="往下移" ${index === orderedSubKeys.length - 1 ? 'disabled' : ''}>▼</button>
                    <button class="archive-btn">完成</button>
                    <button class="edit-btn">編輯</button>
                    <button class="delete-btn">刪除</button>
                </span>
            `;

            li.querySelector('.move-up-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const subItemsSource = globalAppData.template[currentSubKey].subItems;
                if (swapOrder(subItemsSource, orderedSubKeys, originalKey, -1)) {
                    saveTemplate();
                    updateView();
                }
            });

            li.querySelector('.move-down-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const subItemsSource = globalAppData.template[currentSubKey].subItems;
                if (swapOrder(subItemsSource, orderedSubKeys, originalKey, 1)) {
                    saveTemplate();
                    updateView();
                }
            });

            li.querySelector('.archive-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm(`確定將常規子任務「${originalKey}」完結嗎？\n此項目將從【${currentWeek}】起往後的週次消失，但歷史完成數據均會安全保留。`)) return;
                if (globalAppData.template[currentSubKey] && globalAppData.template[currentSubKey].subItems[originalKey]) {
                    globalAppData.template[currentSubKey].subItems[originalKey].archived = true;
                    globalAppData.template[currentSubKey].subItems[originalKey].archivedFromWeek = currentWeek;
                }
                saveTemplate();
                updateView();
            });

            li.querySelector('.plus-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (subItem.completed < subItem.total) {
                    if (!globalAppData.progress[currentWeek]) globalAppData.progress[currentWeek] = {};
                    if (!globalAppData.progress[currentWeek][originalKey]) globalAppData.progress[currentWeek][originalKey] = 0;
                    globalAppData.progress[currentWeek][originalKey]++;
                    syncRegularCounter(currentWeek, originalKey, 1);
                    updateView();
                }
            });

            li.querySelector('.minus-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (subItem.completed > 0) {
                    if (!globalAppData.progress[currentWeek]) globalAppData.progress[currentWeek] = {};
                    if (!globalAppData.progress[currentWeek][originalKey]) globalAppData.progress[currentWeek][originalKey] = 0;
                    globalAppData.progress[currentWeek][originalKey]--;
                    syncRegularCounter(currentWeek, originalKey, -1);
                    updateView();
                }
            });

            li.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                editingContext = { type: 'sub-item', originalKey: originalKey, subItem: subItem };
                
                openModal("編輯任務：" + originalKey);
                
                taskTypeSelect.value = 'regular';
                taskTypeSelect.disabled = true;
                toggleTaskTypeView();
                newTaskDateInput.disabled = true;

                newTaskNameInput.value = originalKey;
                newTaskTotalInput.value = subItem.total;
                
                if (subItem.customHue !== undefined) {
                    const foundColor = fixedPalette.find(p => p.hue === subItem.customHue);
                    if (foundColor) {
                        selectedPaletteItem = foundColor; // 修正：同步更新全域變數
                    }
                } else {
                    selectedPaletteItem = fixedPalette[0];
                }
                renderColorPalette();
            });

            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm("【全週同步刪除】這會將全年度所有週次的此任務刪除！確定嗎？")) return;
                delete globalAppData.template[currentSubKey].subItems[originalKey];
                for (let w in globalAppData.progress) { delete globalAppData.progress[w][originalKey]; }
                saveTemplate();
                saveProgressTree();
                updateView();
            });

            listContainer.appendChild(li);
        });
    }
}

function deleteTempTaskFilter(tempId) {
    return globalAppData.tempTasks.filter(t => t.id !== tempId);
}

// 取得本週還沒封存的臨時任務（依 order 排序）
function getTempTasksForWeek(weekKey) {
    const tasks = (globalAppData.tempTasks || []).filter(t => !t.archived && getWeekNumberByDate(t.date) === weekKey);
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    return tasks;
}

// 渲染主頁旁邊的「臨時待辦」清單：這些任務不計入主頁的圖表/總覽統計
function renderTempTaskList() {
    const container = document.getElementById('temp-task-list');
    if (!container) return;
    container.innerHTML = '';

    const tasks = getTempTasksForWeek(currentWeek);

    if (tasks.length === 0) {
        container.innerHTML = `<li class="no-data-hint" style="list-style:none; padding:10px 0;">本週尚無臨時任務，點「新增項目」並選擇「按特定日期臨時任務」即可加入，不用選分類也不用填次數。</li>`;
        return;
    }

    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = 'todo-item';
        li.style.cursor = 'default';
        li.style.borderLeft = `5px solid ${task.color || '#94a3b8'}`;

        li.innerHTML = `
            <div class="todo-item-clickable-area">
                <span class="todo-item-progress-tag">${task.date || ''}</span>
                <b>${task.name}</b>
            </div>
            <span class="sub-counter temp-complete-wrap">
                <label class="temp-complete-label">
                    <input type="checkbox" class="temp-complete-checkbox">
                    完成
                </label>
            </span>
            <span class="actions">
                <button class="move-btn move-up-btn" title="往上移" ${index === 0 ? 'disabled' : ''}>▲</button>
                <button class="move-btn move-down-btn" title="往下移" ${index === tasks.length - 1 ? 'disabled' : ''}>▼</button>
                <button class="edit-btn">編輯</button>
                <button class="delete-btn">刪除</button>
            </span>
        `;

        li.querySelector('.move-up-btn').addEventListener('click', () => {
            if (swapArrayOrder(globalAppData.tempTasks, tasks, task.id, -1, 'id')) {
                saveTempTasksTree();
                updateView();
            }
        });
        li.querySelector('.move-down-btn').addEventListener('click', () => {
            if (swapArrayOrder(globalAppData.tempTasks, tasks, task.id, 1, 'id')) {
                saveTempTasksTree();
                updateView();
            }
        });

        // 勾選「完成」：直接完結並移入歷史紀錄，之後可以在歷史紀錄裡隨時加回來
        li.querySelector('.temp-complete-checkbox').addEventListener('change', (e) => {
            if (!e.target.checked) return;
            if (!confirm(`確定「${task.name}」已經完成了嗎？完成後會移到歷史紀錄，之後可以隨時從歷史紀錄加回來。`)) {
                e.target.checked = false;
                return;
            }
            task.completed = 1;
            task.archived = true;
            saveTempTasksTree();
            updateView();
        });

        li.querySelector('.edit-btn').addEventListener('click', () => {
            editingContext = { type: 'sub-item', originalKey: task.name, subItem: { isTemp: true, tempId: task.id, total: task.total, customHue: task.customHue } };

            openModal("編輯臨時任務：" + task.name);

            taskTypeSelect.value = 'temporary';
            taskTypeSelect.disabled = true;
            toggleTaskTypeView();

            newTaskDateInput.value = task.date;
            newTaskDateInput.disabled = true;

            newTaskNameInput.value = task.name;
        });

        li.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm("確定要刪除此臨時任務嗎？（這會直接刪除，不會進入歷史紀錄）")) {
                globalAppData.tempTasks = deleteTempTaskFilter(task.id);
                saveTempTasksTree();
                updateView();
            }
        });

        container.appendChild(li);
    });
}

// ================= 臨時任務歷史紀錄（已完成的） =================
function getArchivedTempTasks() {
    return (globalAppData.tempTasks || [])
        .filter(t => t.archived)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function renderTempHistoryList() {
    const historyList = document.getElementById('temp-history-list');
    if (!historyList) return;
    historyList.innerHTML = '';

    const archivedTasks = getArchivedTempTasks();
    if (archivedTasks.length === 0) {
        historyList.innerHTML = `<li class="no-data-hint" style="list-style:none; padding:10px 0;">目前沒有已完成的臨時任務紀錄。</li>`;
        return;
    }

    archivedTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'todo-item';
        li.style.cursor = 'default';
        li.style.borderLeft = `5px solid ${task.color || '#94a3b8'}`;

        li.innerHTML = `
            <div class="todo-item-clickable-area">
                <span class="todo-item-progress-tag">${task.date || ''}</span>
                <b>${task.name}</b>
            </div>
            <span class="history-actions">
                <button class="edit-btn restore-btn">加回來</button>
                <button class="delete-btn delete-history-btn">刪除</button>
            </span>
        `;

        li.querySelector('.restore-btn').addEventListener('click', () => {
            task.archived = false;
            task.completed = 0;
            saveTempTasksTree();
            renderTempHistoryList();
            updateView();
        });

        li.querySelector('.delete-history-btn').addEventListener('click', () => {
            if (!confirm(`確定要永久刪除「${task.name}」這筆歷史紀錄嗎？此操作無法復原。`)) return;
            globalAppData.tempTasks = deleteTempTaskFilter(task.id);
            saveTempTasksTree();
            renderTempHistoryList();
        });

        historyList.appendChild(li);
    });
}

const openTempHistoryBtn = document.getElementById('open-temp-history-btn');
const tempHistoryModal = document.getElementById('temp-history-modal');
const closeTempHistoryModalBtn = document.getElementById('close-temp-history-modal-btn');

if (openTempHistoryBtn) {
    openTempHistoryBtn.addEventListener('click', () => {
        renderTempHistoryList();
        if (tempHistoryModal) tempHistoryModal.classList.remove('hidden');
    });
}
if (closeTempHistoryModalBtn) {
    closeTempHistoryModalBtn.addEventListener('click', () => {
        if (tempHistoryModal) tempHistoryModal.classList.add('hidden');
    });
}
if (tempHistoryModal) {
    tempHistoryModal.addEventListener('click', (e) => {
        if (e.target === tempHistoryModal) tempHistoryModal.classList.add('hidden');
    });
}

// 手機版：在「項目清單」跟「代辦清單（臨時任務）」之間切換
function switchMobileListTab(tab) {
    const leftColumnEl = document.querySelector('.left-column');
    const todoWrapperEl = document.getElementById('todo-list-wrapper');
    const tempWrapperEl = document.getElementById('temp-task-list-wrapper');
    const mainTabBtn = document.getElementById('mobile-tab-main');
    const tempTabBtn = document.getElementById('mobile-tab-temp');
    if (!leftColumnEl || !todoWrapperEl || !tempWrapperEl) return;

    const showTemp = (tab === 'temp');
    leftColumnEl.classList.toggle('mobile-tab-hidden', showTemp);
    todoWrapperEl.classList.toggle('mobile-tab-hidden', showTemp);
    tempWrapperEl.classList.toggle('mobile-tab-hidden', !showTemp);
    if (mainTabBtn) mainTabBtn.classList.toggle('active', !showTemp);
    if (tempTabBtn) tempTabBtn.classList.toggle('active', showTemp);
}

// ================= 加權比例 =================
// 大類別的權重：預設 1（沒設定過就是原本的比例）
function getCategoryWeight(categoryKey) {
    const cat = globalAppData.template[categoryKey];
    return (cat && cat.weight) ? cat.weight : 1;
}

// 分項的權重：預設 1
function getSubItemWeight(categoryKey, subKey) {
    const cat = globalAppData.template[categoryKey];
    const sub = cat && cat.subItems ? cat.subItems[subKey] : null;
    return (sub && sub.weight) ? sub.weight : 1;
}

// 主頁圓餅圖（大類別）：completed/total 都乘上該大類別的權重，再拿去畫圖
function applyMainWeights(weekData) {
    const result = {};
    for (let key in weekData) {
        const item = weekData[key];
        const weight = getCategoryWeight(key);
        result[key] = {
            ...item,
            completed: (item.completed || 0) * weight,
            total: (item.total || 0) * weight
        };
    }
    return result;
}

// 分項圓餅圖：completed/total 都乘上該分項的權重，再拿去畫圖
function applySubWeights(subItems, categoryKey) {
    const result = {};
    for (let subKey in subItems) {
        const item = subItems[subKey];
        const weight = getSubItemWeight(categoryKey, subKey);
        result[subKey] = {
            ...item,
            completed: (item.completed || 0) * weight,
            total: (item.total || 0) * weight
        };
    }
    return result;
}

// 加權比例調整頁專用：把每個大類別都當作「全部完成」，只用 total * 權重 來看比例，
// 這樣圓餅圖不會有灰色的「未完成」區塊，使用者可以更直觀地比較各項目間的相對大小。
function getFullCompletionChartData(weekData) {
    const fakeData = {};
    for (let key in weekData) {
        const item = weekData[key];
        const weight = getCategoryWeight(key);
        const weightedTotal = (item.total || 0) * weight;
        fakeData[key] = { ...item, completed: weightedTotal, total: weightedTotal };
    }
    return getChartData(fakeData, false);
}

// 分項版的加權比例調整頁專用：邏輯同上，但只針對「某一個大類別底下的分項」，
// 這樣使用者在分項頁點加權比例時，看到的圓餅圖跟可調整的清單都只會是這個大類別的分項，不會混進其他大類別。
function getFullCompletionChartDataForSub(subItems, categoryKey) {
    const fakeData = {};
    for (let subKey in subItems) {
        const item = subItems[subKey];
        const weight = getSubItemWeight(categoryKey, subKey);
        const weightedTotal = (item.total || 0) * weight;
        fakeData[subKey] = { ...item, completed: weightedTotal, total: weightedTotal };
    }
    return getChartData(fakeData, true);
}

// 加權比例調整頁：輸入數字當下只重畫圓餅圖預覽（不重繪整份清單，避免每打一個字輸入框就失焦），
// 離開該欄位（change事件，通常是切到下一格或點掉）時才真正存進 Firebase。
function refreshWeightChartPreview() {
    calculateMainItems(currentWeek);
    const weekData = getRegularOnlyWeekData(weeklyDataStore[currentWeek]);
    const fullChartData = getFullCompletionChartData(weekData);
    renderPieChart('todoChart', fullChartData, null);
}

// 分項版的加權比例調整頁：同上，但只重畫「某個大類別底下分項」的圓餅圖預覽
function refreshSubWeightChartPreview(categoryKey) {
    calculateMainItems(currentWeek);
    const weekData = getRegularOnlyWeekData(weeklyDataStore[currentWeek]);
    const subItems = weekData[categoryKey] ? weekData[categoryKey].subItems : {};
    const fullSubChartData = getFullCompletionChartDataForSub(subItems, categoryKey);
    renderPieChart('todoChart', fullSubChartData, null);
}

// 渲染「加權比例」調整頁（主頁版）：只列出所有大類別，不顯示底下的分項
// （分項的權重要進到該大類別的分項頁再點加權才會看到，跟主頁分開）
function renderWeightEditor(weekData) {
    listContainer.innerHTML = '';
    const orderedKeys = sortKeysByOrder(weekData);

    if (orderedKeys.length === 0) {
        listContainer.innerHTML = `<li class="no-data-hint" style="list-style:none; padding:10px 0;">目前沒有常規項目可以調整加權比例。</li>`;
        return;
    }

    orderedKeys.forEach(key => {
        const item = weekData[key];
        const catLi = document.createElement('li');
        catLi.className = 'todo-item weight-editor-row';
        catLi.style.cursor = 'default';
        catLi.style.borderLeft = `5px solid ${item.color || '#36a2eb'}`;
        catLi.innerHTML = `
            <div class="todo-item-clickable-area"><b>${key}</b></div>
            <span class="weight-input-wrap">
                倍數
                <input type="number" class="weight-input" min="1" step="1" value="${getCategoryWeight(key)}">
            </span>
        `;
        const catInput = catLi.querySelector('.weight-input');
        catInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (globalAppData.template[key]) {
                globalAppData.template[key].weight = (!isNaN(val) && val > 0) ? val : 1;
                refreshWeightChartPreview();
            }
        });
        catInput.addEventListener('change', () => saveTemplate());
        listContainer.appendChild(catLi);
    });
}

// 渲染「分項版加權比例」調整頁：只列出某一個大類別底下的分項，不顯示大類別本身、也不顯示其他大類別
function renderSubWeightEditor(categoryKey, subItems) {
    listContainer.innerHTML = '';
    const orderedSubKeys = sortKeysByOrder(subItems);

    if (orderedSubKeys.length === 0) {
        listContainer.innerHTML = `<li class="no-data-hint" style="list-style:none; padding:10px 0;">這個大類別底下目前沒有分項可以調整加權比例。</li>`;
        return;
    }

    orderedSubKeys.forEach(subKey => {
        const subItem = subItems[subKey];
        const subLi = document.createElement('li');
        subLi.className = 'todo-item weight-editor-row';
        subLi.style.cursor = 'default';
        subLi.style.borderLeft = `5px solid ${subItem.color}`;
        subLi.innerHTML = `
            <div class="todo-item-clickable-area"><b>${subKey}</b></div>
            <span class="weight-input-wrap">
                倍數
                <input type="number" class="weight-input" min="1" step="1" value="${getSubItemWeight(categoryKey, subKey)}">
            </span>
        `;
        const subInput = subLi.querySelector('.weight-input');
        subInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (globalAppData.template[categoryKey] && globalAppData.template[categoryKey].subItems[subKey]) {
                globalAppData.template[categoryKey].subItems[subKey].weight = (!isNaN(val) && val > 0) ? val : 1;
                refreshSubWeightChartPreview(categoryKey);
            }
        });
        subInput.addEventListener('change', () => saveTemplate());
        listContainer.appendChild(subLi);
    });
}

function updateView() {
    calculateMainItems(currentWeek);
    fullWeekData = weeklyDataStore[currentWeek];
    const weekData = getRegularOnlyWeekData(fullWeekData); // 主頁圖表/項目清單只看常規任務，臨時任務不計入總覽

    if (currentView === 'weight') {
        // 加權比例調整頁：圓餅圖顯示「全部當作已完成」的樣子（沒有灰色未完成區塊），
        // 這樣使用者可以直接看出調整倍數後、各項目在圖上實際佔的比例。
        // 根據是從哪個頁面點進來的做拆分：主頁點進來 → 顯示所有大類別；分項頁點進來 → 只顯示該大類別底下的分項。
        backBtn.classList.remove('hidden');

        if (weightViewSourceView === 'sub' && weightViewSourceSubKey) {
            titleEl.innerText = weightViewSourceSubKey + " - 分項加權比例調整";
            const subItems = weekData[weightViewSourceSubKey] ? weekData[weightViewSourceSubKey].subItems : {};
            const fullSubChartData = getFullCompletionChartDataForSub(subItems, weightViewSourceSubKey);
            renderPieChart('todoChart', fullSubChartData, null);
            renderSubWeightEditor(weightViewSourceSubKey, subItems);
        } else {
            titleEl.innerText = "加權比例調整";
            const fullChartData = getFullCompletionChartData(weekData);
            renderPieChart('todoChart', fullChartData, null);
            renderWeightEditor(weekData);
        }
    } else if (currentView === 'main') {
        titleEl.innerText = currentWeek + " - 必做事項總覽";
        backBtn.classList.add('hidden');

        const mainChartData = getChartData(applyMainWeights(weekData), false);
        renderPieChart('todoChart', mainChartData, (clickedIndex) => {
            if (todoListWrapper.classList.contains('editing-mode')) return;
            const label = mainChartData.labels[clickedIndex];
            if (label.includes("未完成任務")) return;

            const itemKey = Object.keys(weekData)[clickedIndex];
            if (itemKey) {
                todoListWrapper.classList.remove('editing-mode');
                currentView = 'sub';
                currentSubKey = itemKey;
                updateView();
            }
        });
        renderTodoList(weekData);
    } else {
        titleEl.innerText = currentSubKey + " - 分項進度";
        backBtn.classList.remove('hidden');

        const subItems = weekData[currentSubKey] ? weekData[currentSubKey].subItems : {};
        const subChartData = getChartData(applySubWeights(subItems, currentSubKey), true);
        renderPieChart('todoChart', subChartData, null);
        renderTodoList(weekData);
    }

    renderTempTaskList();
    if (!taskModal.classList.contains('hidden')) {
        updateCategorySelectOptions();
    }
}

addTaskBtn.addEventListener('click', () => {
    let chosenColor = selectedPaletteItem.color;
    let chosenHue = selectedPaletteItem.hue;
    
    if (editingContext) {
        if (editingContext.type === 'main-category') {
            const key = editingContext.key;
            const newName = newCategoryInput.value.trim();
            if (!newName) return;

            if (globalAppData.template[key]) {
                if (newName !== key) {
                    globalAppData.template[newName] = globalAppData.template[key];
                    delete globalAppData.template[key];
                }
                // 直接套用目前選定的顏色，不用再跳一次確認框
                globalAppData.template[newName].customHue = selectedPaletteItem.hue;
            }
            
            globalAppData.tempTasks.forEach(t => { 
                if(t.category === key) {
                    t.category = newName;
                    t.customHue = chosenHue;
                    t.color = chosenColor;
                }
            });

            saveTemplate();
            saveTempTasksTree();
        } 
        else if (editingContext.type === 'sub-item') {
            const originalKey = editingContext.originalKey;
            const subItem = editingContext.subItem;
            const newName = newTaskNameInput.value.trim();
            const newTotal = parseInt(newTaskTotalInput.value, 10) || 1;
            if (!newName) { alert("請輸入任務名稱！"); return; }

            if (subItem.isTemp) {
                const task = globalAppData.tempTasks.find(t => t.id === subItem.tempId);
                if (task) {
                    task.name = newName;
                }
                saveTempTasksTree();
            } else {
                const template = globalAppData.template[currentSubKey].subItems;
                if (newName !== originalKey) {
                    template[newName] = template[originalKey];
                    delete template[originalKey];
                    
                    for (let w in globalAppData.progress) {
                        if (globalAppData.progress[w][originalKey] !== undefined) {
                            globalAppData.progress[w][newName] = globalAppData.progress[w][originalKey];
                            delete globalAppData.progress[w][originalKey];
                        }
                    }
                }
                template[newName].total = newTotal;
                // 分項顏色一律跟隨大類別，不開放使用者自己選色
                const parentHue = findCategoryHue(currentSubKey);
                if (parentHue !== undefined) {
                    template[newName].customHue = parentHue;
                } else {
                    delete template[newName].customHue;
                }
                saveTemplate();
                saveProgressTree();
            }
        }
        
        closeModal();
        updateView();
        return;
    }

    const taskName = newTaskNameInput.value.trim();
    if (!taskName) { alert("請輸入任務名稱！"); return; }

    const isTemporary = (taskTypeSelect.value === 'temporary');

    // ===== 臨時任務：不用選分類、不用填次數，日期預設今天，新項目排在清單最上面 =====
    if (isTemporary) {
        const selectedDate = newTaskDateInput.value;
        if (!selectedDate) { alert("請選擇日期！"); return; }

        const computedWeek = getWeekNumberByDate(selectedDate);
        if (!computedWeek) { alert("選擇的日期超出範圍！"); return; }

        const weekTasks = getTempTasksForWeek(computedWeek);
        const minOrder = weekTasks.length > 0 ? Math.min(...weekTasks.map(t => t.order || 0)) : 0;

        globalAppData.tempTasks.push({
            id: Date.now(),
            date: selectedDate,
            category: '臨時任務',
            name: taskName,
            total: 1,
            completed: 0,
            color: '#94a3b8',
            order: minOrder - 1 // 排在最上面
        });
        saveTempTasksTree();
        closeModal();
        updateView();
        return;
    }

    // ===== 常規任務：維持原本要選分類的流程 =====
    let targetCategory = categorySelect.value;
    const wasNewCategory = (targetCategory === '__new__');
    const taskTotal = parseInt(newTaskTotalInput.value, 10) || 1;

    if (targetCategory === '__new__') {
        const catName = newCategoryInput.value.trim();
        if (!catName) { alert("請輸入新大類別的名稱！"); return; }
        
        if (!globalAppData.template[catName]) {
            const existingCategoryCount = Object.keys(globalAppData.template).length;
            globalAppData.template[catName] = { subItems: {}, customHue: selectedPaletteItem.hue, order: existingCategoryCount };
        }
        targetCategory = catName;
    }

    // 幫既有分類新增子項目時（不是新建大類別），顏色直接沿用該分類本身的顏色，
    // 不使用調色盤目前選到的顏色——因為這種情況下畫面上本來就不給選顏色了。
    if (!wasNewCategory) {
        const existingHue = findCategoryHue(targetCategory);
        if (existingHue !== undefined) {
            chosenHue = existingHue;
            const found = fixedPalette.find(p => p.hue === existingHue);
            chosenColor = found ? found.color : `hsl(${existingHue}, 100%, 85%)`;
        }
    }

    const existingSubCount = Object.keys(globalAppData.template[targetCategory].subItems).length;
    globalAppData.template[targetCategory].subItems[taskName] = { total: taskTotal, customHue: chosenHue, order: existingSubCount };
    saveTemplate();

    closeModal();
    updateView();
});

backBtn.addEventListener('click', () => {
    todoListWrapper.classList.remove('editing-mode');
    if (currentView === 'weight') {
        // 從加權比例頁返回：回到原本點進來的那一頁（主頁或某個大類別的分項頁）
        currentView = weightViewSourceView;
        currentSubKey = (weightViewSourceView === 'sub') ? weightViewSourceSubKey : null;
    } else {
        currentView = 'main';
        currentSubKey = null;
    }
    resetChartInstance();
    updateView();
});

// ================= 表格式週次選擇器 =================
function updateWeekPickerLabel() {
    if (weekPickerCurrentLabel) weekPickerCurrentLabel.innerText = currentWeek.replace(/[^0-9]/g, '');
}

function renderWeekPickerGrid() {
    if (!weekPickerGrid) return;
    weekPickerGrid.innerHTML = '';
    const todayWeekKey = getTodayWeekKey();
    // 已經過去的週次（今天所在週次之前）不再顯示在選單裡，只留下本週跟之後的週次
    const todayWeekNum = todayWeekKey ? parseInt(todayWeekKey.replace(/[^0-9]/g, ''), 10) : 1;

    for (let w = todayWeekNum; w <= 53; w++) {
        const weekKeyStr = `第 ${w} 週`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'week-picker-cell';
        btn.innerText = w;
        if (weekKeyStr === currentWeek) btn.classList.add('is-selected');
        if (weekKeyStr === todayWeekKey) btn.classList.add('is-today');
        btn.addEventListener('click', () => selectWeek(weekKeyStr));
        weekPickerGrid.appendChild(btn);
    }
}

function selectWeek(weekKeyStr) {
    todoListWrapper.classList.remove('editing-mode');
    const tempListWrapperForWeek = document.getElementById('temp-task-list-wrapper');
    if (tempListWrapperForWeek) tempListWrapperForWeek.classList.remove('editing-mode');

    currentWeek = weekKeyStr;
    currentView = 'main'; currentSubKey = null;
    resetChartInstance();
    updateWeekPickerLabel();
    closeWeekPicker();
    updateView();
}

function openWeekPicker() {
    renderWeekPickerGrid();
    if (weekPickerPanel) weekPickerPanel.classList.remove('hidden');
}

function closeWeekPicker() {
    if (weekPickerPanel) weekPickerPanel.classList.add('hidden');
}

if (weekPickerToggleBtn) {
    weekPickerToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (weekPickerPanel && weekPickerPanel.classList.contains('hidden')) {
            openWeekPicker();
        } else {
            closeWeekPicker();
        }
    });
}

// 點擊選單以外的地方就自動收起
document.addEventListener('click', (e) => {
    if (!weekPickerPanel || weekPickerPanel.classList.contains('hidden')) return;
    if (weekPickerPanel.contains(e.target) || e.target === weekPickerToggleBtn) return;
    closeWeekPicker();
});

