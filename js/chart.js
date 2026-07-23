// js/chart.js

let currentChartInstance = null;

function renderPieChart(canvasId, chartData, onClickCallback) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // 原地更新數據，阻止每次都觸發進場重長動畫
    if (currentChartInstance) {
        currentChartInstance.data.labels = chartData.labels;
        currentChartInstance.data.datasets[0].data = chartData.dataValues;
        currentChartInstance.data.datasets[0].backgroundColor = chartData.backgroundColors;
        // 重要：圖表實例被重複使用時，也要同步更新 onClick 對應的回呼函式，
        // 否則會殘留「上一次呼叫」時綁定的舊回呼（例如主頁圓餅圖的跳轉邏輯），
        // 造成之後在別的頁面（例如分項圓餅圖）點擊時，還是照舊回呼的邏輯跳轉到錯誤的大類別。
        currentChartInstance.options.onClick = (event, activeElements) => {
            if (activeElements.length > 0 && onClickCallback) {
                const clickedIndex = activeElements[0].index;
                onClickCallback(clickedIndex);
            }
        };
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

function getChartData(dataObj, isSub) {
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];
    let totalRemaining = 0;

    for (let key in dataObj) {
        const item = dataObj[key];
        const completed = item.completed || 0;
        const total = item.total || 0;

        labels.push(key);
        dataValues.push(completed);
        backgroundColors.push(item.color || '#bae1ff');

        totalRemaining += Math.max(total - completed, 0);
    }

    // 加一片「未完成任務」代表這週還沒打卡的部分
    if (totalRemaining > 0) {
        labels.push('未完成任務');
        dataValues.push(totalRemaining);
        backgroundColors.push('#e2e8f0');
    }

    // 如果整週完全沒資料，給一個佔位的灰色圓餅，避免圖表空白報錯
    if (dataValues.length === 0 || dataValues.every(v => v === 0)) {
        labels.push('尚無資料');
        dataValues.push(1);
        backgroundColors.push('#f1f5f9');
    }

    return { labels, dataValues, backgroundColors };
}