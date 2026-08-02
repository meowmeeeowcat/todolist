// js/date-utils.js
// ================= 共用日期 / 週數工具 =================
// 原本 getWeekNumberByDate（data.js）和 getWeekNumberFor2026（calendar.js）
// 是兩套各自實作的週數計算邏輯，容易改一邊忘了改另一邊而產生不一致。
// 現在統一只有一套核心邏輯：getWeekNumberByDate(dateStr)，
// getWeekNumberFor2026(monthIndex, day) 只是轉成日期字串後呼叫它。
//
// 年份不再寫死是 2026：getCurrentAppYear() 會動態抓「現在」對應到的年份（用凌晨4點重置後的有效日期），
// 這樣跨年之後，日期字串、週次計算、年曆格子的星期對齊都會自動換成新的一年，不用改程式碼、也不用手動處理。

const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// 目前應該使用的年份：每次呼叫都重新抓一次系統時間，確保網頁開很久、剛好跨過年也能抓到最新的年份
function getCurrentAppYear() {
    const now = (typeof getEffectiveNow === 'function') ? getEffectiveNow() : new Date();
    return now.getFullYear();
}

// 這一年的 1 月 1 日是星期幾，轉成「週一＝0…週日＝6」的索引，年曆格子排版跟週次計算都要用這個，
// 不能寫死成某一年的固定值，否則跨年之後 1 月 1 日星期幾不一樣，年曆格子就會全部對不齊。
function getJan1WeekdayIndex(year) {
    const jan1 = new Date(year, 0, 1);
    return (jan1.getDay() + 6) % 7;
}

function formatDateString(mIdx, d) {
    const mm = String(mIdx + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${getCurrentAppYear()}-${mm}-${dd}`;
}

// 核心週數計算：輸入 "YYYY-MM-DD"，回傳 "第 X 週"（範圍外回傳 null）
function getWeekNumberByDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    let totalDays = d.getDate();
    for (let i = 0; i < d.getMonth(); i++) {
        totalDays += daysInMonths[i];
    }
    const offset = getJan1WeekdayIndex(d.getFullYear());
    const w = Math.ceil((totalDays + offset) / 7);
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

// ================= 每天/每週的「重置時間」是凌晨 4 點 =================
// 凌晨 0:00～3:59 都還算是「前一天」，滿 4:00 才算真正進入新的一天（連帶影響新的一週從第幾天算起）。
// 全站只要是「現在是哪一天/哪一週」的判斷，都應該透過下面這兩個函式，不要直接用 new Date() 的日曆日期，
// 否則凌晨 0～3 點會被誤判成已經是隔天/下一週。
// - getEffectiveDateForTimestamp(d)：給一個實際時間點，回傳它「有效」對應到的日期（時分秒歸零）
// - getEffectiveNow()：現在這一刻對應到的有效日期，最常用（例如判斷今天是幾號、今天屬於第幾週）
function getEffectiveDateForTimestamp(d) {
    const effective = new Date(d);
    if (effective.getHours() < 4) {
        effective.setDate(effective.getDate() - 1);
    }
    effective.setHours(0, 0, 0, 0);
    return effective;
}

function getEffectiveNow() {
    return getEffectiveDateForTimestamp(new Date());
}
