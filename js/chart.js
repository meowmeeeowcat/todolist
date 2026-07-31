// js/chart.js

let currentChartInstance = null;

// ================= 三層加碼圖表用的 tooltip =================
// 鼠標移到圓餅圖（不管是哪一圈）上面，顯示的都是該項目「目前的百分比」（用原始未加權次數算出來的真實進度），
// 不受加權影響，也不會因為在哪一層而不同──都是同一個真實進度。
function buildLayeredTooltipLabel(layeredData) {
    return function (context) {
        const idx = context.dataIndex;
        const label = layeredData.labels[idx] || '';
        const percent = (layeredData.percents && layeredData.percents[idx] !== undefined) ? layeredData.percents[idx] : Math.round(context.parsed);
        return `${label}: ${percent}%`;
    };
}

// canvasId：畫布 id
// layeredDataInput：可以是兩種格式 ——
//   1. 新版三層格式：{ labels, backgroundColors, layer1Values, layer2Values, layer3Values, rawLayer1Values, ... }
//      由 getLayeredChartData() 產生，會畫成甜甜圈圖，三個資料集＝三個同心圓（第一層在最外圈，往內疊）
//   2. 舊版單層格式：{ labels, dataValues, backgroundColors, rawValues }，由 getChartData() 產生
//      （目前只有「加權比例調整」預覽頁在用，這個頁面本身用途就是純粹預覽權重，不需要三層加碼機制）
//      這裡會自動包成「只有第一層有資料」的新格式，行為等同以前的單層圓餅圖。
function renderPieChart(canvasId, layeredDataInput, onClickCallback) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    const layeredData = layeredDataInput.layer1Values ? layeredDataInput : {
        labels: layeredDataInput.labels,
        backgroundColors: layeredDataInput.backgroundColors,
        layer1Values: layeredDataInput.dataValues,
        layer2Values: layeredDataInput.labels.map(() => 0),
        layer3Values: layeredDataInput.labels.map(() => 0),
        rawLayer1Values: layeredDataInput.rawValues || layeredDataInput.dataValues,
        rawLayer2Values: layeredDataInput.labels.map(() => 0),
        rawLayer3Values: layeredDataInput.labels.map(() => 0),
        percents: layeredDataInput.labels.map(() => 0)
    };

    const datasetsConfig = [
        { data: layeredData.layer1Values, backgroundColor: layeredData.backgroundColors, borderWidth: 1, borderColor: '#ffffff' },
        { data: layeredData.layer2Values, backgroundColor: layeredData.backgroundColors, borderWidth: 1, borderColor: '#ffffff' },
        { data: layeredData.layer3Values, backgroundColor: layeredData.backgroundColors, borderWidth: 1, borderColor: '#ffffff' }
    ];

    // 原地更新數據，阻止每次都觸發進場重長動畫
    if (currentChartInstance) {
        currentChartInstance.data.labels = layeredData.labels;
        currentChartInstance.data.datasets[0].data = datasetsConfig[0].data;
        currentChartInstance.data.datasets[0].backgroundColor = datasetsConfig[0].backgroundColor;
        currentChartInstance.data.datasets[1].data = datasetsConfig[1].data;
        currentChartInstance.data.datasets[1].backgroundColor = datasetsConfig[1].backgroundColor;
        currentChartInstance.data.datasets[2].data = datasetsConfig[2].data;
        currentChartInstance.data.datasets[2].backgroundColor = datasetsConfig[2].backgroundColor;
        // 重要：圖表實例被重複使用時，也要同步更新 onClick 對應的回呼函式跟 tooltip 的文字邏輯，
        // 否則會殘留「上一次呼叫」時綁定的舊回呼/舊資料，造成之後在別的頁面點擊/滑鼠移上去時邏輯錯亂。
        currentChartInstance.options.onClick = (event, activeElements) => {
            if (activeElements.length > 0 && onClickCallback) {
                const clickedIndex = activeElements[0].index;
                onClickCallback(clickedIndex);
            }
        };
        currentChartInstance.options.plugins.tooltip.callbacks.label = buildLayeredTooltipLabel(layeredData);
        currentChartInstance.update('none');
        return;
    }

    currentChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: layeredData.labels,
            datasets: datasetsConfig
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '30%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: buildLayeredTooltipLabel(layeredData)
                    }
                }
            },
            transitions: {
                active: { animation: { duration: 250 } }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0 && onClickCallback) {
                    const clickedIndex = activeElements[0].index;
                    onClickCallback(clickedIndex);
                }
            }
        }
    });
}

function resetChartInstance() {
    if (currentChartInstance) {
        currentChartInstance.destroy();
        currentChartInstance = null;
    }
}

// ================= 單層圖表資料（沿用給加權比例調整頁的預覽圖表） =================
// rawDataObj（可省略）：跟 dataObj 用同一組 key，但存的是「未加權」的原始 completed/total，
// 用來讓 tooltip 顯示原始次數，即便 dataObj 本身傳進來的是已經乘過權重的數字。
function getChartData(dataObj, isSub, rawDataObj) {
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];
    const rawValues = [];
    let totalRemaining = 0;
    let totalRemainingRaw = 0;

    for (let key in dataObj) {
        const item = dataObj[key];
        const completed = item.completed || 0;
        const total = item.total || 0;

        labels.push(key);
        dataValues.push(completed);
        backgroundColors.push(item.color || '#bae1ff');

        const rawItem = rawDataObj ? rawDataObj[key] : null;
        const rawCompleted = rawItem ? (rawItem.completed || 0) : completed;
        const rawTotal = rawItem ? (rawItem.total || 0) : total;
        rawValues.push(rawCompleted);

        totalRemaining += Math.max(total - completed, 0);
        totalRemainingRaw += Math.max(rawTotal - rawCompleted, 0);
    }

    // 加一片「未完成任務」代表這週還沒打卡的部分
    if (totalRemaining > 0) {
        labels.push('未完成任務');
        dataValues.push(totalRemaining);
        backgroundColors.push('#e2e8f0');
        rawValues.push(totalRemainingRaw);
    }

    // 如果整週完全沒資料，給一個佔位的灰色圓餅，避免圖表空白報錯
    if (dataValues.length === 0 || dataValues.every(v => v === 0)) {
        labels.push('尚無資料');
        dataValues.push(1);
        backgroundColors.push('#f1f5f9');
        rawValues.push(0);
    }

    return { labels, dataValues, backgroundColors, rawValues };
}

// ================= 三層加碼圖表資料（主頁/分項頁用） =================
// dataObj：可能已經套用過「加權」倍數的 completed/total（用來決定畫面上切片的視覺比例）
// rawDataObj：對應的原始（未加權）completed/total（用來判斷有沒有解鎖下一層、以及 tooltip 顯示的次數）
//
// 機制：
// dataObj：可能已經套用過「加權」倍數的 completed/total（用來決定畫面上切片的視覺比例）
// rawDataObj：對應的原始（未加權）completed/total（用來判斷有沒有解鎖下一層、以及 tooltip 顯示的百分比）
//
// 機制：
// - 第一層＝原本規定的次數（0～1 倍），跟以前一樣的 0-100%。
// - 第二層：要整體（所有項目加總）把第一層完全填滿，才會開始出現；出現後不是直接填滿，
//   而是跟第一層一樣，依照實際累積的量（1～2 倍區間）逐步填滿。
// - 第三層：要整體把第二層也完全填滿，才會開始出現，邏輯同上（2～3 倍區間）。
// - 解鎖判斷一律用「原始（未加權）次數」計算，確保不會因為加權而變得比較容易或比較難解鎖。
function getLayeredChartData(dataObj, rawDataObj) {
    const labels = [];
    const colors = [];
    const l1Vals = [], l2Vals = [], l3Vals = [];
    const rawL1 = [], rawL2 = [], rawL3 = [];
    let totalAllWeighted = 0, totalAllRaw = 0;
    let layer1SumRaw = 0, layer2SumRaw = 0;

    for (let key in dataObj) {
        const item = dataObj[key];
        const total = item.total || 0;
        const completed = item.completed || 0;
        const rawItem = (rawDataObj && rawDataObj[key]) || item;
        const rawTotal = rawItem.total || 0;
        const rawCompleted = rawItem.completed || 0;

        labels.push(key);
        colors.push(item.color || '#bae1ff');

        l1Vals.push(Math.min(completed, total));
        l2Vals.push(Math.min(Math.max(completed - total, 0), total));
        l3Vals.push(Math.min(Math.max(completed - total * 2, 0), total));

        const rl1 = Math.min(rawCompleted, rawTotal);
        const rl2 = Math.min(Math.max(rawCompleted - rawTotal, 0), rawTotal);
        const rl3 = Math.min(Math.max(rawCompleted - rawTotal * 2, 0), rawTotal);
        rawL1.push(rl1);
        rawL2.push(rl2);
        rawL3.push(rl3);

        totalAllWeighted += total;
        totalAllRaw += rawTotal;
        layer1SumRaw += rl1;
        layer2SumRaw += rl2;
    }

    const layer1Complete = totalAllRaw > 0 && layer1SumRaw >= totalAllRaw;
    const layer2Complete = totalAllRaw > 0 && layer2SumRaw >= totalAllRaw;

    const finalLabels = [...labels];
    const finalColors = [...colors];
    const finalL1 = [...l1Vals];
    const finalL2 = layer1Complete ? [...l2Vals] : labels.map(() => 0);
    const finalL3 = layer2Complete ? [...l3Vals] : labels.map(() => 0);
    const finalRawL1 = [...rawL1];
    const finalRawL2 = layer1Complete ? [...rawL2] : labels.map(() => 0);
    const finalRawL3 = layer2Complete ? [...rawL3] : labels.map(() => 0);

    // 每個項目「目前的百分比」：一律用原始次數計算，跟目前是第幾層無關，讓使用者看到的是真實進度
    // （超過 100% 也照實顯示，例如做到 2.3 倍就顯示 230%）
    const percents = labels.map((key, idx) => {
        const rawItem = (rawDataObj && rawDataObj[key]) || dataObj[key];
        const rawTotal = rawItem.total || 0;
        const rawCompleted = rawItem.completed || 0;
        return rawTotal > 0 ? Math.round((rawCompleted / rawTotal) * 100) : 0;
    });

    // 第一層補上跟原本單層圖表一樣的「未完成任務」灰色區塊／「尚無資料」佔位
    const layer1SumWeighted = finalL1.reduce((a, b) => a + b, 0);
    const remainingWeighted = Math.max(totalAllWeighted - layer1SumWeighted, 0);
    const remainingRaw = Math.max(totalAllRaw - layer1SumRaw, 0);
    const remainingPercent = totalAllRaw > 0 ? Math.round((remainingRaw / totalAllRaw) * 100) : 0;
    const finalPercents = [...percents];

    if (remainingWeighted > 0) {
        finalLabels.push('未完成任務');
        finalColors.push('#e2e8f0');
        finalL1.push(remainingWeighted);
        finalL2.push(0);
        finalL3.push(0);
        finalRawL1.push(remainingRaw);
        finalRawL2.push(0);
        finalRawL3.push(0);
        finalPercents.push(remainingPercent);
    }
    if (finalL1.length === 0 || finalL1.every(v => v === 0)) {
        finalLabels.push('尚無資料');
        finalColors.push('#f1f5f9');
        finalL1.push(1);
        finalL2.push(0);
        finalL3.push(0);
        finalRawL1.push(0);
        finalRawL2.push(0);
        finalRawL3.push(0);
        finalPercents.push(0);
    }

    return {
        labels: finalLabels,
        backgroundColors: finalColors,
        layer1Values: finalL1,
        layer2Values: finalL2,
        layer3Values: finalL3,
        rawLayer1Values: finalRawL1,
        rawLayer2Values: finalRawL2,
        rawLayer3Values: finalRawL3,
        percents: finalPercents,
        layer1Complete,
        layer2Complete
    };
}
