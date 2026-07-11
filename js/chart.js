// js/chart.js

let currentChartInstance = null;

function renderPieChart(canvasId, chartData, onClickCallback) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // 原地更新數據，阻止每次都觸發進場重長動畫
    if (currentChartInstance) {
        currentChartInstance.data.labels = chartData.labels;
        currentChartInstance.data.datasets[0].data = chartData.dataValues;
        currentChartInstance.data.datasets[0].backgroundColor = chartData.backgroundColors;
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