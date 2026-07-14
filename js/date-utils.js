// js/date-utils.js
// ================= 共用日期 / 週數工具 =================
// 原本 getWeekNumberByDate（data.js）和 getWeekNumberFor2026（calendar.js）
// 是兩套各自實作的週數計算邏輯，容易改一邊忘了改另一邊而產生不一致。
// 現在統一只有一套核心邏輯：getWeekNumberByDate(dateStr)，
// getWeekNumberFor2026(monthIndex, day) 只是轉成日期字串後呼叫它。

const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function formatDateString(mIdx, d) {
    const mm = String(mIdx + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `2026-${mm}-${dd}`;
}

// 核心週數計算：輸入 "2026-MM-DD"，回傳 "第 X 週"（超出 2026 或範圍外回傳 null）
function getWeekNumberByDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (d.getFullYear() !== 2026) return null;
    let totalDays = d.getDate();
    for (let i = 0; i < d.getMonth(); i++) {
        totalDays += daysInMonths[i];
    }
    const w = Math.ceil((totalDays + 3) / 7);
    return (w >= 1 && w <= 53) ? `第 ${w} 週` : null;
}

// 給年曆頁用的版本（輸入月份 index + 日），回傳「純數字」週次（例如 29），
// 呼叫端（calendar.js）自己會包成 "第 29 週" 這種顯示文字，所以這裡不能再包一次，
// 否則會變成「第 第 29 週 週」這種重複顯示的 bug。
function getWeekNumberFor2026(monthIndex, day) {
    const dateStr = formatDateString(monthIndex, day);
    const weekStr = getWeekNumberByDate(dateStr); // 回傳 "第 X 週" 或 null
    if (!weekStr) return 53; // 理論上不會發生，保底回傳第53週避免出錯
    return parseInt(weekStr.replace(/[^0-9]/g, ''), 10);
}

function compareWeeks(w1, w2) {
    if (!w1 || !w2) return 0;
    const num1 = parseInt(w1.replace(/[^0-9]/g, ''), 10);
    const num2 = parseInt(w2.replace(/[^0-9]/g, ''), 10);
    return num1 - num2;
}
