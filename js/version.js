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
        version: "v2026-08-01",
        date: "2026-08-01",
        changes: [
            "修正：手機版時間線的橫向滑動改成表頭（日期）跟表身（格子）綁在同一個捲動容器，滑動時不會各滑各的；小時標籤欄改到最右邊並用 sticky 釘住，橫向滑到哪天都看得到現在幾點",
            "調整：手機版的「返回主頁」箭頭改成指向右邊",
            "調整：全站顏色統一——所有「編輯」類按鈕（含臨時清單的編輯模式）都改成同一個馬卡龍深藍；「完成」按鈕改用馬卡龍薄荷綠；番茄鐘浮動按鈕底色改成白色（用邊框顏色表示計時中/暫停中的狀態）",
            "調整：網站標籤名稱改為「Todolist」，並換成馬卡龍三色圓餅圖造型的圖示",
            "新增：年份不再寫死是 2026——日期字串、週次計算、年曆格子的星期對齊（原本寫死用「2026年1月1日是星期四」去算，跨年後會全部對不齊，這次一併修正成動態計算）、年曆頁標題文字都改成自動抓目前的年份",
            "調整：年度總覽「檢視日期」區塊的標題改成「臨時任務」「計時紀錄」「累積進度」，三個區塊底下的項目都改成依照馬卡龍色盤順序排列"
        ]
    },
    {
        version: "v2026-07-31",
        date: "2026-07-31",
        changes: [
            "修正：時間線的紀錄一律用「目前」的大類別顏色即時顯示，不會再停留在記錄當下的舊顏色，之前記錄的紀錄也會自動校正",
            "調整：時間線裡同一件事情跨小時的色塊，中間不再有明顯間隙，開始段跟延續段會無縫接在一起",
            "調整：年曆頁的「任務總次數」統計卡片改成依照馬卡龍色盤順序排列",
            "調整：手機版項目清單改成跟著整個頁面一起捲動，不再有清單自己的內部捲軸（不用再分兩段滑）；年曆頁/時間線頁的「返回主頁」按鈕在手機版縮成右上角的圓形圖示鍵",
            "大改：時間線的小時標籤改成整週共用一份，寫在最左邊；同一個小時只要「任何一天」有紀錄，那一整排（跨7天）就會一起展開，不再是每天各自獨立的高度"
        ]
    },
    {
        version: "v2026-07-30",
        date: "2026-07-30",
        changes: [
            "修正：時間線的紀錄現在會把「開始～結束」中間經過的每個小時都填滿（例如4點做到6點，4點跟5點兩格都會顯示這件事），不再只標示開始的那一格",
            "新增：點擊時間線上的色塊，會自動帶入手動記錄表單並切換成編輯模式，可以直接調整後更新，不用刪掉重記",
            "調整：手動記錄裡選到現有的大類別時，顏色會鎖定跟著該類別走，不能再自己改；沒選大類別（自訂項目）時顏色還是可以自由挑選"
        ]
    },
    {
        version: "v2026-07-29",
        date: "2026-07-29",
        changes: [
            "調整：三層圓餅圖加回「整體必須把上一層完全填滿才會出現下一層」的規則，出現後跟第一層一樣是逐步累積、不是直接填滿；鼠標移到圓餅圖上會顯示該項目目前的百分比，不再顯示次數",
            "修正：舊資料自動遷移——凌晨4點重置規則上線前，凌晨0~3點記錄的時間線紀錄，日期跟排序位置已修正到正確的地方",
            "大改：番茄鐘計時器獨立成主頁右下角的圓形浮動按鈕，點一下展開面板就能設定計時、選項目、開始/暫停/結束，不用再特地切到時間線頁；計時中按鈕會有脈動提示，暫停中則變成灰色",
            "調整：時間線的小時分隔加回來了（凌晨4點開始、凌晨3點結束共24格），有紀錄的小時完整顯示卡片內容，沒有紀錄的小時縮成一條細線"
        ]
    },
    {
        version: "v2026-07-28",
        date: "2026-07-28",
        changes: [
            "調整：拿掉打卡三層機制的第二/三層提示文字，也拿掉「整體必須做滿才解鎖下一層」的限制",
            "調整：分項打卡不再限制次數，可以無限打卡；超過規定次數的部分依倍率自動累積成第二層（1~2倍，視覺上限90%不會整圈填滿）、第三層（2~3倍，做到3倍時剛好整圈填滿）",
            "大改：每天／每週的重置時間改成凌晨 4 點——凌晨 0:00~3:59 都還算「前一天」，滿 4:00 才算新的一天（連帶影響新的一週），主頁「今天」的判斷、年曆頁「今天」的判斷、時間線的「今天」欄位與預設週次都改用這個規則",
            "調整：時間線的計時紀錄與手動記錄，凌晨 0~3 點的紀錄會歸屬到前一個有效日，並用延伸時段（24:00~27:59）確保同一天的紀錄排序正確，畫面上顯示時間仍會顯示回正常的 0~23 點格式"
        ]
    },
    {
        version: "v2026-07-27",
        date: "2026-07-27",
        changes: [
            "新增大功能：超額打卡三層圓餅圖——分項打卡上限從「等於規定次數」放寬到「規定次數 ×3」；主頁與分項的圓餅圖改成甜甜圈圖，最外圈是原本規定次數的第一層，整體做滿後才會開始畫出第二層（超額加碼），第二層也整體做滿才會畫出第三層",
            "新增：圖表標題下方會顯示目前解鎖狀態的提示文字（例如「原定項目都做完了，開始累積第二層！」）",
            "說明：解鎖第二/三層的判斷一律用原始（未加權）次數計算，不受「加權」功能影響，確保解鎖條件公平"
        ]
    },
    {
        version: "v2026-07-26",
        date: "2026-07-26",
        changes: [
            "調整：加權/編輯按鈕文字改回白色",
            "調整：主頁大類別/分項旁的累計時間標籤移到最右邊對齊",
            "大改：每日時間線改成以週一為第一天；取消小時格線的時間軸畫法，改成每天欄位依開始時間把紀錄依序堆疊成卡片，每張卡片直接顯示開始～結束時間",
            "修正：圓餅圖的滑鼠提示（tooltip）次數一律顯示原始未加權次數，不受加權影響；切片大小仍會反映加權比例",
            "修正：手機版切換「項目清單／代辦清單」分頁時，圓餅圖被誤藏起來的問題——圓餅圖現在固定用 sticky 定位釘在畫面最上方，不受清單分頁切換影響"
        ]
    },
    {
        version: "v2026-07-25",
        date: "2026-07-25",
        changes: [
            "調整：加權/編輯按鈕改回固定色（加權＝馬卡龍紅、編輯＝馬卡龍深藍），不再跟著大類別變色",
            "修正：切換離開時間線頁不會暫停計時；重新進入時間線頁時，進行中或暫停中的計時時間會正確保留（原本會被誤重置）",
            "新增：番茄鐘下方新增「手動記錄時間」區塊，可選現有項目或自訂名稱、自訂顏色、自行輸入起訖時間來補記錄",
            "新增：主頁大類別/分項旁邊顯示本週累計計時標籤，切回主頁時會自動同步剛在時間線頁的紀錄",
            "新增：年曆頁的日期詳情加上「當天計時紀錄」清單與當天累計時間"
        ]
    },
    {
        version: "v2026-07-24",
        date: "2026-07-24",
        changes: [
            "調整：「加權」「編輯」按鈕在分項頁時會變成該大類別本身的顏色，主頁時維持預設色",
            "調整：臨時待辦的完成勾選框，移除旁邊的「完成」文字與跳出的系統確認框，勾了就直接算數",
            "調整：手機版排版——圓餅圖移到最上方、清單切換鍵在圖表下方、清單本身在最下面；使用者/登出鍵搬到週次上方；年曆頁的年度總覽按鈕搬到月份切換上方；修正項目清單寬度超出手機螢幕的問題",
            "新增：全新「每日時間線」功能（時間線按鈕在年度總覽旁邊）——仿 Google 日曆的週視圖，結合番茄鐘計時器，可以針對項目清單裡的分項計時，計時完成會自動記錄成時間線上的色塊，新增 js/timeline.js、css/timeline.css 兩個新檔案"
        ]
    },
    {
        version: "v2026-07-23",
        date: "2026-07-23",
        changes: [
            "調整：「編輯」按鈕比照「加權」按鈕，進入編輯模式後文字會變成「返回」，再按一次即可離開",
            "修正：點擊分項頁的圓餅圖會誤跳到其他大類別的問題（圖表重複使用時沒有同步更新點擊邏輯）",
            "調整：臨時待辦清單不再只顯示本週，過去、現在、未來週次的臨時任務都會一直顯示，直到完成或刪除",
            "新增：這週已達標的大類別／分項，清單項目底色會自動變成灰色以做出區別"
        ]
    },
    {
        version: "v2026-07-22",
        date: "2026-07-22",
        changes: [
            "調整：移除返回鍵，改用點擊「項目清單」標題返回主頁，或再按一次「加權」按鈕返回原本那一頁",
            "修正：分項自己的加權比例，現在會往上影響大類別在主頁圓餅圖裡的佔比",
            "新增：年度總覽彈窗裡點擊任一月份，可直接切換月曆頁到該月",
            "修正：分項顏色強制對齊大類別本身的顏色，舊帳號先前建立、改不掉顏色的分項也會一併統一"
        ]
    },
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
