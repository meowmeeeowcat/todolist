// js/app.js

const titleEl = document.getElementById('chart-title');
const backBtn = document.getElementById('back-btn');
const listContainer = document.getElementById('todo-list');
const weekSelect = document.getElementById('week-select');
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
    
    toggleTaskTypeView();
    toggleCategoryInput();
    
    todoListWrapper.classList.remove('editing-mode');
}

openAddModalBtn.addEventListener('click', () => {
    openModal("新增任務事項");
});

openEditModalBtn.addEventListener('click', () => {
    todoListWrapper.classList.toggle('editing-mode');
});

closeModalBtn.addEventListener('click', closeModal);
taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) closeModal();
});

function toggleTaskTypeView() {
    if (taskTypeSelect.value === 'temporary') {
        newTaskDateInput.classList.remove('hidden');
    } else {
        newTaskDateInput.classList.add('hidden');
    }
}
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
categorySelect.addEventListener('change', toggleCategoryInput);

function renderTodoList() {
    listContainer.innerHTML = '';
    const weekData = weeklyDataStore[currentWeek];

    if (currentView === 'main') {
        for (let key in weekData) {
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
                    <button class="archive-btn">完成</button>
                    <button class="edit-btn">編輯</button>
                    <button class="delete-btn">刪除</button>
                </span>
            `;

            li.querySelector('.todo-item-clickable-area').addEventListener('click', () => {
                if (todoListWrapper.classList.contains('editing-mode')) return;
                todoListWrapper.classList.remove('editing-mode');
                currentView = 'sub';
                currentSubKey = key;
                updateView();
            });

            li.querySelector('.archive-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm(`確定將常規大類別「${key}」結案嗎？\n此操作將從【${currentWeek}】起往後的週次隱藏此項目，但之前的週次打卡紀錄仍會完整保留！`)) return;
                
                if (globalAppData.template[key]) {
                    globalAppData.template[key].archived = true;
                    globalAppData.template[key].archivedFromWeek = currentWeek;
                }
                saveDataToStorage();
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

                saveDataToStorage();
                resetChartInstance();
                updateView();
            });

            listContainer.appendChild(li);
        }
    } else {
        const subItems = weekData[currentSubKey].subItems;
        for (let originalKey in subItems) {
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
                    <button class="archive-btn">完成</button>
                    <button class="edit-btn">編輯</button>
                    <button class="delete-btn">刪除</button>
                </span>
            `;

            li.querySelector('.archive-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (subItem.isTemp) {
                    if (!confirm("確定將此臨時任務標記為完結並在列表上隱藏嗎？")) return;
                    const task = globalAppData.tempTasks.find(t => t.id === subItem.tempId);
                    if (task) task.archived = true;
                } else {
                    if (!confirm(`確定將常規子任務「${originalKey}」完結嗎？\n此項目將從【${currentWeek}】起往後的週次消失，但歷史完成數據均會安全保留。`)) return;
                    if (globalAppData.template[currentSubKey] && globalAppData.template[currentSubKey].subItems[originalKey]) {
                        globalAppData.template[currentSubKey].subItems[originalKey].archived = true;
                        globalAppData.template[currentSubKey].subItems[originalKey].archivedFromWeek = currentWeek;
                    }
                }
                saveDataToStorage();
                updateView();
            });

            li.querySelector('.plus-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (subItem.completed < subItem.total) {
                    if (subItem.isTemp) {
                        const task = globalAppData.tempTasks.find(t => t.id === subItem.tempId);
                        if (task) task.completed++;
                    } else {
                        if (!globalAppData.progress[currentWeek][originalKey]) globalAppData.progress[currentWeek][originalKey] = 0;
                        globalAppData.progress[currentWeek][originalKey]++;
                    }
                    saveDataToStorage();
                    updateView();
                }
            });

            li.querySelector('.minus-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (subItem.completed > 0) {
                    if (subItem.isTemp) {
                        const task = globalAppData.tempTasks.find(t => t.id === subItem.tempId);
                        if (task) task.completed--;
                    } else {
                        if (!globalAppData.progress[currentWeek][originalKey]) globalAppData.progress[currentWeek][originalKey] = 0;
                        globalAppData.progress[currentWeek][originalKey]--;
                    }
                    saveDataToStorage();
                    updateView();
                }
            });

            li.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                editingContext = { type: 'sub-item', originalKey: originalKey, subItem: subItem };
                
                openModal("編輯任務：" + originalKey);
                
                taskTypeSelect.value = subItem.isTemp ? 'temporary' : 'regular';
                taskTypeSelect.disabled = true;
                toggleTaskTypeView();
                
                if(subItem.isTemp) {
                    const task = globalAppData.tempTasks.find(t => t.id === subItem.tempId);
                    if(task) newTaskDateInput.value = task.date;
                }
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
                if (subItem.isTemp) {
                    if (confirm(`確定要刪除此臨時任務嗎？`)) {
                        globalAppData.tempTasks = deleteTempTaskFilter(subItem.tempId);
                    }
                } else {
                    if (!confirm("【全週同步刪除】這會將全年度所有週次的此任務刪除！確定嗎？")) return;
                    delete globalAppData.template[currentSubKey].subItems[originalKey];
                    for (let w in globalAppData.progress) { delete globalAppData.progress[w][originalKey]; }
                }
                saveDataToStorage();
                updateView();
            });

            listContainer.appendChild(li);
        }
    }
}

function deleteTempTaskFilter(tempId) {
    return globalAppData.tempTasks.filter(t => t.id !== tempId);
}

function updateView() {
    calculateMainItems(currentWeek);
    const weekData = weeklyDataStore[currentWeek];

    if (currentView === 'main') {
        titleEl.innerText = currentWeek + " - 必做事項總覽";
        backBtn.classList.add('hidden');

        const mainChartData = getChartData(weekData, false);
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
    } else {
        titleEl.innerText = currentSubKey + " - 分項進度";
        backBtn.classList.remove('hidden');

        const subItems = weekData[currentSubKey].subItems;
        const subChartData = getChartData(subItems, true);
        renderPieChart('todoChart', subChartData, null);
    }

    renderTodoList();
    if (!taskModal.classList.contains('hidden')) {
        updateCategorySelectOptions();
    }
}

addTaskBtn.addEventListener('click', () => {
    const chosenColor = selectedPaletteItem.color;
    const chosenHue = selectedPaletteItem.hue;
    
    if (editingContext) {
        if (editingContext.type === 'main-category') {
            const key = editingContext.key;
            const newName = newCategoryInput.value.trim();
            if (!newName) return;

            const changeColor = confirm(`是否將此大類別的基礎色調更新為目前選定的顏色？`);

            if (globalAppData.template[key]) {
                if (newName !== key) {
                    globalAppData.template[newName] = globalAppData.template[key];
                    delete globalAppData.template[key];
                }
                if (changeColor) {
                    // 確保精確儲存當前選中項目的 hue
                    globalAppData.template[newName].customHue = selectedPaletteItem.hue;
                }
            }
            
            globalAppData.tempTasks.forEach(t => { 
                if(t.category === key) {
                    t.category = newName;
                    if (changeColor) {
                        t.customHue = chosenHue;
                        t.color = chosenColor;
                    }
                }
            });
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
                    task.total = newTotal;
                    if (confirm("是否將此臨時任務套用目前選擇的顏色？")) {
                        task.color = chosenColor;
                        task.customHue = chosenHue;
                    }
                }
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
                if (confirm("是否將此任務套用目前選擇的顏色？")) {
                    // 修正：明確指向選中物件的 hue，避免變數因閉包或非同步產生對齊落差
                    template[newName].customHue = selectedPaletteItem.hue;
               }
            }
        }
        
        saveDataToStorage();
        closeModal();
        updateView();
        return;
    }

    let targetCategory = categorySelect.value;
    const taskName = newTaskNameInput.value.trim();
    const taskTotal = parseInt(newTaskTotalInput.value, 10) || 1;

    if (!taskName) { alert("請輸入任務名稱！"); return; }

    const isTemporary = (taskTypeSelect.value === 'temporary');

    if (targetCategory === '__new__') {
        const catName = newCategoryInput.value.trim();
        if (!catName) { alert("請輸入新大類別的名稱！"); return; }
        
        if (isTemporary) {
            targetCategory = catName;
        } else {
            if (!globalAppData.template[catName]) {
                globalAppData.template[catName] = { subItems: {}, customHue: selectedPaletteItem.hue };
            }
            targetCategory = catName;
        }
    }

    if (isTemporary) {
        const selectedDate = newTaskDateInput.value;
        if (!selectedDate) { alert("請選擇日期！"); return; }
        
        const computedWeek = getWeekNumberByDate(selectedDate);
        if (!computedWeek) { alert("選擇的日期超出範圍！"); return; }

        globalAppData.tempTasks.push({
            id: Date.now(),
            date: selectedDate,
            category: targetCategory,
            name: taskName,
            total: taskTotal,
            completed: 0,
            color: chosenColor,
            customHue: chosenHue
        });
        alert(`新增成功！臨時任務已排入：${computedWeek}`);
    } else {
        globalAppData.template[targetCategory].subItems[taskName] = { total: taskTotal, customHue: chosenHue };
    }

    saveDataToStorage();
    closeModal();
    updateView();
});

backBtn.addEventListener('click', () => {
    todoListWrapper.classList.remove('editing-mode');
    currentView = 'main'; currentSubKey = null; resetChartInstance(); updateView();
});

weekSelect.addEventListener('change', (e) => {
    todoListWrapper.classList.remove('editing-mode');
    currentWeek = e.target.value; currentView = 'main'; currentSubKey = null; resetChartInstance(); updateView();
});

window.onload = () => {
    // 1. 建立 1 到 53 週的下拉選單選項
    weekSelect.innerHTML = '';
    for(let w = 1; w <= 53; w++) {
        const opt = document.createElement('option');
        opt.value = `第 ${w} 週`; opt.innerText = `第 ${w} 週`;
        weekSelect.appendChild(opt);
    }

    // 2. 讀取本地實際系統日期並計算當前週次
    const systemDate = new Date();
    let computedWeekStr = "第 1 週"; // 預設安全值

    // 判定是否為 2026 年度（若是則精確計算，若非則預設第 1 週防止溢出）
    if (systemDate.getFullYear() === 2026) {
        // 複用 app.js 內部的 getWeekNumberByDate 函數計算當前週次
        const mm = String(systemDate.getMonth() + 1).padStart(2, '0');
        const dd = String(systemDate.getDate()).padStart(2, '0');
        const todayStr = `2026-${mm}-${dd}`;
        
        const wNum = getWeekNumberByDate(todayStr);
        if (wNum) {
            computedWeekStr = wNum;
        }
    }

    // 3. 將全域變數 currentWeek 設為計算出來的週次
    currentWeek = computedWeekStr;

    // 4. 同步讓下拉選單（Select）顯示正確的選取項
    weekSelect.value = computedWeekStr;

};