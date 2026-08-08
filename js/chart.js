// js/chart.js

let currentChartInstance = null;

// ================= 三層加碼圖表用的 tooltip =================
// 滑鼠移到圓餅圖上時，要看哪一圈（context.datasetIndex：0=第一圈 1=第二圈 2=第三圈），
// 顯示的是「那一圈自己」的填滿百分比（0~100%，那一圈本身還沒填滿就是還沒到100%），
// 不是整體倍率的百分比，這樣滑到第二圈才會看到第二圈實際累積了多少、還差多少。
function buildLayeredTooltipLabel(layeredData) {
    return function (context) {
        const idx = context.dataIndex;
        const datasetIdx = context.datasetIndex;
        const label = layeredData.labels[idx] || '';
        const percentsArr = (layeredData.percentsByLayer && layeredData.percentsByLayer[datasetIdx]) || [];
        const percent = (percentsArr[idx] !== undefined) ? percentsArr[idx] : Math.round(context.parsed);
        return `${label}: ${percent}%`;
    };
}

// canvasId：畫布 id
// layeredDataInput：可以是兩種格式 ——
//   1. 新版三層格式：{ labels, backgroundColors, layer1Values, layer2Values, layer3Values, rawLayerNValues, percentsByLayer }
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
        percentsByLayer: [
            layeredDataInput.labels.map(() => 0),
            layeredDataInput.labels.map(() => 0),
            layeredDataInput.labels.map(() => 0)
        ]
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
// rawDataObj：對應的原始（未加權）completed/total（用來計算每一圈自己的填滿百分比，不受加權影響）
//
// 機制：三層都是「每個項目自己」連續累積的，不需要等其他項目、也不需要等整體到達某個門檻才會出現，
// 這樣才不會在某個時間點突然跳出一大塊，而是跟第一層一樣隨著實際完成次數慢慢長出來：
// - 第一層：0～1 倍（0-100%）。
// - 第二層：1～2 倍區間的累積量（該項目自己超過規定次數之後，繼續累積到 2 倍為止）。
// - 第三層：2～3 倍區間的累積量（繼續累積到 3 倍時剛好整圈填滿）。
function getLayeredChartData(dataObj, rawDataObj) {
    const labels = [];
    const colors = [];
    const l1Vals = [], l2Vals = [], l3Vals = [];
    const rawL1 = [], rawL2 = [], rawL3 = [];
    const pct1 = [], pct2 = [], pct3 = [];
    let totalAllWeighted = 0, totalAllRaw = 0;

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

        // 每一圈「自己」的填滿百分比（0~100%），滑鼠移上去要顯示的是這個，不是整體倍率
        pct1.push(rawTotal > 0 ? Math.round((rl1 / rawTotal) * 100) : 0);
        pct2.push(rawTotal > 0 ? Math.round((rl2 / rawTotal) * 100) : 0);
        pct3.push(rawTotal > 0 ? Math.round((rl3 / rawTotal) * 100) : 0);

        totalAllWeighted += total;
        totalAllRaw += rawTotal;
    }

    const finalLabels = [...labels];
    const finalColors = [...colors];
    const finalL1 = [...l1Vals];
    const finalL2 = [...l2Vals];
    const finalL3 = [...l3Vals];
    const finalRawL1 = [...rawL1];
    const finalRawL2 = [...rawL2];
    const finalRawL3 = [...rawL3];
    const finalPct1 = [...pct1];
    const finalPct2 = [...pct2];
    const finalPct3 = [...pct3];

    // 第一層補上跟原本單層圖表一樣的「未完成任務」灰色區塊／「尚無資料」佔位
    const layer1SumWeighted = finalL1.reduce((a, b) => a + b, 0);
    const layer1SumRaw = finalRawL1.reduce((a, b) => a + b, 0);
    const remainingWeighted = Math.max(totalAllWeighted - layer1SumWeighted, 0);
    const remainingRaw = Math.max(totalAllRaw - layer1SumRaw, 0);

    if (remainingWeighted > 0) {
        finalLabels.push('未完成任務');
        finalColors.push('#e2e8f0');
        finalL1.push(remainingWeighted);
        finalL2.push(0);
        finalL3.push(0);
        finalRawL1.push(remainingRaw);
        finalRawL2.push(0);
        finalRawL3.push(0);
        finalPct1.push(totalAllRaw > 0 ? Math.round((remainingRaw / totalAllRaw) * 100) : 0);
        finalPct2.push(0);
        finalPct3.push(0);
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
        finalPct1.push(0);
        finalPct2.push(0);
        finalPct3.push(0);
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
        percentsByLayer: [finalPct1, finalPct2, finalPct3]
    };
}
