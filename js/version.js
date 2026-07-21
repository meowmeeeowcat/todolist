// js/version.js
// ================= 版本管理 =================
// 每次要上傳新版本前，只要在下面的 VERSION_HISTORY 陣列「最上面」新增一筆新紀錄即可
// （陣列第一筆＝目前最新版本），右下角的版本按鈕會自動顯示最新版本號，
// 使用者點擊按鈕就能看到完整的歷史更新內容，不用再像以前一樣自己記文字有沒有換過。
//
// 每筆紀錄格式：
// {
//     version: "顯示在按鈕上的版本號，例如 v2026-07-21",
//     date: "給使用者看的日期文字，例如 2026-07-21",
//     changes: ["這個版本改了什麼1", "這個版本改了什麼2", ...]
// }

const VERSION_HISTORY = [
    {
        version: "v2026-07-21",
        date: "2026-07-21",
        changes: [
            "修正：進入「加權」比例調整或分項頁後，返回鍵消失的問題",
            "調整：年曆頁「檢視日期」的詳情區塊改為白色系底色，風格更統一",
            "新增：右下角版本按鈕，點擊可查看每個版本更新了哪些內容",
            "調整：「按特定日期新增」的臨時任務改到臨時待辦清單自己的「新增」按鈕，跟常規任務的新增分開"
        ]
    },
    {
        version: "v2026-07-14",
        date: "2026-07-14",
        changes: [
            "先前版本"
        ]
    }
];

// 右下角按鈕永遠顯示陣列裡的第一筆（也就是最新版本）版本號
function renderVersionBadge() {
    const badgeBtn = document.getElementById('site-version-badge');
    if (!badgeBtn) return;
    const latest = VERSION_HISTORY[0];
    if (latest) badgeBtn.innerText = latest.version;
}

// 版本紀錄彈窗：由新到舊列出每個版本，最上面那筆額外標示「最新」
function renderVersionHistoryList() {
    const listEl = document.getElementById('version-history-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    VERSION_HISTORY.forEach((entry, idx) => {
        const block = document.createElement('div');
        block.className = 'version-entry';

        let html = `
            <div class="version-entry-header">
                <span class="version-entry-number">${entry.version}</span>
                ${idx === 0 ? '<span class="version-entry-latest-tag">最新</span>' : ''}
                <span class="version-entry-date">${entry.date || ''}</span>
            </div>
        `;

        html += '<ul class="version-entry-changes">';
        (entry.changes || []).forEach(change => {
            html += `<li>${change}</li>`;
        });
        html += '</ul>';

        block.innerHTML = html;
        listEl.appendChild(block);
    });
}

function openVersionHistoryModal() {
    renderVersionHistoryList();
    const modal = document.getElementById('version-history-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeVersionHistoryModal() {
    const modal = document.getElementById('version-history-modal');
    if (modal) modal.classList.add('hidden');
}

renderVersionBadge();

const versionBadgeBtn = document.getElementById('site-version-badge');
if (versionBadgeBtn) versionBadgeBtn.addEventListener('click', openVersionHistoryModal);

const closeVersionHistoryBtn = document.getElementById('close-version-history-btn');
if (closeVersionHistoryBtn) closeVersionHistoryBtn.addEventListener('click', closeVersionHistoryModal);

const versionHistoryModalEl = document.getElementById('version-history-modal');
if (versionHistoryModalEl) {
    versionHistoryModalEl.addEventListener('click', (e) => {
        if (e.target === versionHistoryModalEl) closeVersionHistoryModal();
    });
}
