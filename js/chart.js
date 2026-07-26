// js/chart.js

let currentChartInstance = null;

// 共用的 tooltip 文字邏輯：優先顯示 rawValues（原始未加權次數），沒有的話才退回用切片本身的數值
function buildTimelineTooltipLabel(chartData) {
    return function (context) {
        const idx = context.dataIndex;
        const label = context.label || '';
        const raw = (chartData.rawValues && chartData.rawValues[idx] !== undefined)
            ? chartData.rawValues[idx]
            : context.parsed;
        return `${label}: ${raw}`;
    };
}

function renderPieChart(canvasId, chartData, onClickCallback) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // 原地更新數據，阻止每次都觸發進場重長動畫
    if (currentChartInstance) {
        currentChartInstance.data.labels = chartData.labels;
        currentChartInstance.data.datasets[0].data = chartData.dataValues;
        currentChartInstance.data.datasets[0].backgroundColor = chartData.backgroundColors;
        // 重要：圖表實例被重複使用時，也要同步更新 onClick 對應的回呼函式跟 tooltip 的文字邏輯，
        // 否則會殘留「上一次呼叫」時綁定的舊回呼/舊資料（例如主頁圓餅圖的跳轉邏輯或加權後的次數），
        // 造成之後在別的頁面（例如分項圓餅圖）點擊/滑鼠移上去時，還是照舊回呼/舊資料的邏輯顯示。
        currentChartInstance.options.onClick = (event, activeElements) => {
            if (activeElements.length > 0 && onClickCallback) {
                const clickedIndex = activeElements[0].index;
                onClickCallback(clickedIndex);
            }
        };
        currentChartInstance.options.plugins.tooltip.callbacks.label = buildTimelineTooltipLabel(chartData);
        currentChartInstance.update('none'); 
        return;
    }

    currentChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: chartData.labels,
            datasets: [{
                data: chartData.dataValues,
                backgroundColor: chartData.backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        // 圓餅圖的切片大小可能因為「加權」而被放大/縮小，但滑鼠移上去看到的次數，
                        // 一律要顯示使用者實際打卡的原始次數，不要顯示加權後的數字，避免混淆。
                        label: buildTimelineTooltipLabel(chartData)
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