/* ═══════════════════════════════════════════
   GLOBAL STATE
╚══════════════════════════════════════════ */
let currentTimeframe = '30m';
let trendChart = null;
let timerInterval = null;
let carouselInterval = null;
let currentServerIndex = 0;
let chartCarouselInterval = null;
let currentChartServerIndex = 0;
let maxTimeLeft = 30;
let timeLeft = 30;
let cellTrackData = JSON.parse(localStorage.getItem('zenx_cell_track') || '{}');
let globalTransactionsData = [];
let filteredTransactionsData = [];
let currentPdfPage = 1;
let pdfRowsPerPage = 30;
let selectedRowIds = new Set();
let alarms = JSON.parse(localStorage.getItem('zenx_alarms') || '[]');
let favorites = JSON.parse(localStorage.getItem('zenx_favorites') || '[]');
let soundAlertsEnabled = localStorage.getItem('zenx_sound_alerts') === '1';
const SERVERS = ['ZERO','PANDORA','AGARTHA','FELIS','DRYADS','DESTAN','MINARK','OREADS'];
const SITE_LOGOS = {
    'KNIGHTPIN': { dark: 'knightpin_dark.png', light: 'knightpin_light.png' },
    'KOPAZAR': { dark: 'kopazar_dark.svg', light: 'kopazar_light.svg' },
    'SONTEKLİF': { dark: 'sonteklif_dark.png', light: 'sonteklif_light.png' },
    'BYNOGAME': { dark: 'bynogame_dark.png', light: 'bynogame_light.png' },
    'KABASAKAL': { dark: 'kabasakal_dark.svg', light: 'kabasakal_light.svg' },
    'OYUNEKS': { dark: 'oyuneks_dark.svg', light: 'oyuneks_light.svg' },
    'GAMESATIŞ': { dark: 'gamesatis_dark.svg', light: 'gamesatis_light.svg' },
    'OYUNFOR': { dark: 'oyunfor_dark.png', light: 'oyunfor_light.png' },
};

const columnsConfig = [
    { key: 'id', dropdownId: 'idDropdown', containerId: 'idCheckboxes' },
    { key: 'tarih', dropdownId: 'tarihDropdown', containerId: 'tarihCheckboxes' },
    { key: 'tip', dropdownId: 'tipDropdown', containerId: 'tipCheckboxes' },
    { key: 'tutar', dropdownId: 'tutarDropdown', containerId: 'tutarCheckboxes' },
    { key: 'onceki_b', dropdownId: 'oncekiDropdown', containerId: 'oncekiCheckboxes' },
    { key: 'sonraki_b', dropdownId: 'sonrakiDropdown', containerId: 'sonrakiCheckboxes' },
    { key: 'status', dropdownId: 'durumDropdown', containerId: 'durumCheckboxes' },
    { key: 'description', dropdownId: 'aciklamaDropdown', containerId: 'aciklamaCheckboxes' }
];

/* ═══════════════════════════════════════════
   YARDIMCI
╚══════════════════════════════════════════ */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function showToast(msg, icon, color) {
    icon = icon || 'bi-check-circle-fill';
    color = color || 'var(--accent)';
    const existing = document.querySelector('.zenx-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'zenx-toast';
    t.innerHTML = '<i class="bi ' + icon + '" style="color:' + color + ';font-size:1.1rem;flex-shrink:0;"></i><span>' + msg + '</span>';
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(function(){ t.remove(); }, 400); }, 3000);
}

/* ═══════════════════════════════════════════
   INIT
╚══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", function() {
    const savedTheme = localStorage.getItem('zenx_theme_v2') || 'classic';
    switchTheme(savedTheme);
    initSidebarState();
    initDensity();
    initSoundAlerts();
    initNotifIconState();
    reorderTable();
    applyHighlights();
    applyFavoriteStars();
    updateSidebarSiteCount();
    initChart();
    startCountdown();
    initDropzone();
    startServerCarousel();
    renderAlarmList();
    startLiveClock();

    var footerYearEl = document.getElementById('footerYear');
    if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();

    var initialUpdateTime = document.getElementById('updateTime');
    var sidebarTimeEl = document.getElementById('sidebarUpdateTime');
    if (initialUpdateTime && sidebarTimeEl) {
        var t = initialUpdateTime.innerText.trim();
        sidebarTimeEl.innerText = t.split(' ')[1] || t;
    }

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.excel-th')) {
            document.querySelectorAll('.excel-filter-dropdown').forEach(function(d){ d.classList.remove('show'); });
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) toggleFullscreen();
    });
});

/* ═══════════════════════════════════════════
   SIDEBAR — hover ile açılır, isteğe bağlı sabitlenebilir (pin)
╚══════════════════════════════════════════ */
function toggleSidebarPin() {
    var nav = document.getElementById('appNav');
    if (!nav) return;
    var pinned = nav.classList.toggle('pinned');
    localStorage.setItem('zenx_sidebar_pinned', pinned ? '1' : '0');
    updateSidebarPinIcon(pinned);
}

function updateSidebarPinIcon(pinned) {
    var icon = document.getElementById('sidebarPinIcon');
    if (icon) icon.className = 'bi ' + (pinned ? 'bi-pin-fill' : 'bi-pin-angle-fill');
}

function initSidebarState() {
    var pinned = localStorage.getItem('zenx_sidebar_pinned') === '1';
    var nav = document.getElementById('appNav');
    if (nav) nav.classList.toggle('pinned', pinned);
    updateSidebarPinIcon(pinned);
}

/* ═══════════════════════════════════════════
   TEMA
╚══════════════════════════════════════════ */
function switchTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('zenx_theme_v2', themeName);
    var sel = document.getElementById('themeSelect');
    if (sel) sel.value = themeName;
    var names = { classic: 'Classic', aurora: 'Aurora', cyber: 'Cyber', oled: 'OLED', emerald: 'Emerald', nova: 'Nova', light: 'Light' };
    var aboutTheme = document.getElementById('aboutTheme');
    if (aboutTheme) aboutTheme.textContent = names[themeName] || themeName;
    if (trendChart) updateChartColors();
}

/* ═══════════════════════════════════════════
   SAYFA GEÇİŞİ
╚══════════════════════════════════════════ */
function switchPage(pageName) {
    var dashboard = document.getElementById('pageDashboard');
    var pdf = document.getElementById('pagePdf');
    var navDash = document.getElementById('navBtnDashboard');
    var navPdf = document.getElementById('navBtnPdf');
    if (pageName === 'dashboard') {
        dashboard.classList.remove('d-none'); pdf.classList.add('d-none');
        navDash.classList.add('active'); navPdf.classList.remove('active');
    } else {
        dashboard.classList.add('d-none'); pdf.classList.remove('d-none');
        navDash.classList.remove('active'); navPdf.classList.add('active');
    }
    window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════
   SUNUCU CAROUSEL (KPI)
╚══════════════════════════════════════════ */
function startServerCarousel() {
    if (carouselInterval) clearInterval(carouselInterval);
    var serverHeaders = document.querySelectorAll('#gbTable thead tr:first-child th.server-header-cell .server-title');
    var servers = Array.from(serverHeaders).map(function(el){ return el.innerText.trim(); });
    if (servers.length === 0) servers = ['ZERO','PANDORA','AGARTHA','FELIS','DRYADS','DESTAN','MINARK','OREADS'];
    var animatedElements = document.querySelectorAll('.soft-fade-text');
    var kpiCards = ['kpiCardServer','kpiCardSell','kpiCardBuy'].map(function(id){ return document.getElementById(id); });

    function updateCarousel() {
        if (!servers.length) return;
        animatedElements.forEach(function(el){ el.classList.add('fade-out'); });
        setTimeout(function() {
            var serverName = servers[currentServerIndex % servers.length];
            var serverIdx = currentServerIndex % servers.length;
            var sellColIndex = serverIdx * 2 + 2;
            var buyColIndex = sellColIndex + 1;
            var rows = document.querySelectorAll('#tableBody tr');
            var maxBuy = 0, minSell = Infinity;
            rows.forEach(function(row) {
                if (row.style.display === 'none') return;
                var sc = row.cells[sellColIndex], bc = row.cells[buyColIndex];
                if (sc && bc) {
                    var sv = parseFloat((sc.querySelector('.price-wrapper') ? sc.querySelector('.price-wrapper').firstChild.textContent.trim() : sc.innerText.trim()).replace('TL','').replace(',','.').trim());
                    var bv = parseFloat((bc.querySelector('.price-wrapper') ? bc.querySelector('.price-wrapper').firstChild.textContent.trim() : bc.innerText.trim()).replace('TL','').replace(',','.').trim());
                    if (!isNaN(bv) && bv > maxBuy) maxBuy = bv;
                    if (!isNaN(sv) && sv < minSell && sv > 0) minSell = sv;
                }
            });
            var el = function(id){ return document.getElementById(id); };
            if (el('currentTrackedServer')) el('currentTrackedServer').innerText = serverName + ' (Canlı)';
            if (el('sellKpiTitle')) el('sellKpiTitle').innerText = 'En Düşük Satış (' + serverName + ')';
            if (el('buyKpiTitle')) el('buyKpiTitle').innerText = 'En Yüksek Alış (' + serverName + ')';
            if (el('topSellPrice')) el('topSellPrice').innerText = minSell < Infinity ? minSell.toFixed(2) + ' TL' : '---';
            if (el('topBuyPrice')) el('topBuyPrice').innerText = maxBuy > 0 ? maxBuy.toFixed(2) + ' TL' : '---';
            animatedElements.forEach(function(el){ el.classList.remove('fade-out'); });
            kpiCards.forEach(function(card) {
                if (card) { card.classList.remove('soft-pulse-card'); void card.offsetWidth; card.classList.add('soft-pulse-card'); }
            });
            currentServerIndex++;
        }, 380);
    }
    updateCarousel();
    carouselInterval = setInterval(updateCarousel, 3500);
}

/* ═══════════════════════════════════════════
   TABLO
╚══════════════════════════════════════════ */
function reorderTable() {
    var tbody = document.getElementById('tableBody');
    if (!tbody) return;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    var kopazarRow = null, otherRows = [];
    rows.forEach(function(row) {
        var name = row.cells[0] ? row.cells[0].innerText.trim().toLowerCase() : '';
        if (name.includes('kopazar')) kopazarRow = row; else otherRows.push(row);
    });
    if (kopazarRow) { otherRows.splice(1, 0, kopazarRow); tbody.innerHTML = ''; otherRows.forEach(function(r){ tbody.appendChild(r); }); }
}

function filterTable() {
    var input = document.getElementById('siteSearchInput').value.toLowerCase();
    document.querySelectorAll('#tableBody tr').forEach(function(row) {
        if (row.cells[0]) row.style.display = row.cells[0].innerText.toLowerCase().includes(input) ? '' : 'none';
    });
}

function updateSidebarSiteCount() {
    var rows = document.querySelectorAll('#tableBody tr');
    var el = document.getElementById('sidebarSiteCount');
    if (el) el.textContent = rows.length || '-';
}

function applyHighlights() {
    var table = document.getElementById('gbTable');
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    if (!rows.length) return;
    var now = new Date().toLocaleTimeString('tr-TR',{ hour:'2-digit', minute:'2-digit', second:'2-digit' });
    var totalColsMax = rows[0].cells.length;
    var colMinVals = {}, colMaxVals = {};

    for (var ci = 2; ci < totalColsMax; ci++) {
        var values = [];
        rows.forEach(function(row) {
            var cell = row.cells[ci];
            if (cell) {
                var raw = cell.querySelector('.price-wrapper') ? cell.querySelector('.price-wrapper').firstChild.textContent.trim() : cell.innerText.trim();
                var num = parseFloat(raw.replace('TL','').replace(',','.').trim());
                if (!isNaN(num) && num > 0) values.push(num);
            }
        });
        var isAlis = ((ci - 2) % 2 === 1);
        if (values.length > 0) {
            if (isAlis) colMaxVals[ci] = Math.max.apply(null, values);
            else colMinVals[ci] = Math.min.apply(null, values);
        }
    }

    rows.forEach(function(row) {
        var siteName = row.cells[0] ? row.cells[0].innerText.trim() : '';
        var totalCols = row.cells.length;
        for (var ci = 2; ci < totalCols; ci++) {
            var cell = row.cells[ci];
            if (!cell) continue;
            if (cell.querySelector('.stock-empty-icon')) continue;
            var raw = cell.querySelector('.price-wrapper') ? cell.querySelector('.price-wrapper').firstChild.textContent.trim() : cell.innerText.trim();
            var clean = raw.replace('TL','').replace(',','.').trim();
            var key = siteName + '_' + ci;
            var num = parseFloat(clean);

            if (!cellTrackData[key]) {
                cellTrackData[key] = { value: clean, lastChangeTime: null, arrow: '' };
            } else {
                var old = parseFloat(cellTrackData[key].value);
                if (!isNaN(num) && !isNaN(old) && num !== old) {
                    cellTrackData[key].value = clean;
                    cellTrackData[key].lastChangeTime = now;
                    cellTrackData[key].arrow = num > old ? ' <span style="color:#10b981;">↑</span>' : ' <span style="color:#ef4444;">↓</span>';
                }
            }

            var arrow = cellTrackData[key].arrow || '';
            var isAlis = ((ci - 2) % 2 === 1);
            var inner;
            if (!isAlis && num === colMinVals[ci]) inner = '<span class="pill-green">' + raw + '</span>' + arrow;
            else if (isAlis && num === colMaxVals[ci]) inner = '<span class="pill-red">' + raw + '</span>' + arrow;
            else inner = raw + arrow;

            var tip = cellTrackData[key].lastChangeTime ? 'Son Değişim: ' + cellTrackData[key].lastChangeTime : 'Henüz Değişmedi';
            cell.innerHTML = '<div class="price-wrapper" title="' + tip + '">' + inner + '</div>';
        }
    });
    localStorage.setItem('zenx_cell_track', JSON.stringify(cellTrackData));
    checkAlarms();
}

/* ═══════════════════════════════════════════
   YENİLEME & SAYAÇ
╚══════════════════════════════════════════ */
// Bir sunucu için stok bilgisi mevcutsa (Kabasakal/Bynogame gibi) ve tükenmişse
// fiyat yerine bir "stokta yok" ikonu döner; stok bilgisi hiç yoksa (çoğu site)
// varsayılan olarak fiyatı gösterir.
function priceCell(site, server, side) {
    var stok = site[server + ' stok'];
    if (stok === false) {
        return '<span class="stock-empty-icon" title="Stokta Yok"><i class="bi bi-slash-circle-fill"></i></span>';
    }
    return escapeHtml(site[server + ' ' + side]);
}

function renderRefreshedData(data) {
    var updateTimeEl = document.getElementById('updateTime');
    if (updateTimeEl) updateTimeEl.innerText = data['Güncelleme zamanı'];
    var sidebarTimeEl = document.getElementById('sidebarUpdateTime');
    if (sidebarTimeEl && data['Güncelleme zamanı']) sidebarTimeEl.innerText = data['Güncelleme zamanı'].split(' ')[1] || data['Güncelleme zamanı'];
    var tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    data['Veriler'].forEach(function(site) {
        var tr = document.createElement('tr');
        var isFav = favorites.indexOf(site['Site adı']) !== -1;
        var dotClass = site['Veri Çekildi'] ? 'ok' : 'fail';
        var dotTitle = site['Veri Çekildi'] ? 'Veri başarıyla çekildi' : 'Veri çekilemedi';
        var logos = SITE_LOGOS[site['Site adı']];
        var logoHtml = logos
            ? '<img src="/static/images/logos/' + logos.dark + '" class="site-logo-img logo-for-dark" alt="">' +
              '<img src="/static/images/logos/' + logos.light + '" class="site-logo-img logo-for-light" alt="">'
            : '';
        tr.innerHTML = '<td style="text-align:left;padding-left:14px;"><a href="' + escapeHtml(site['Site linki']) + '" target="_blank" class="site-link" title="' + escapeHtml(site['Site adı']) + '">' + logoHtml + '<span class="visually-hidden">' + escapeHtml(site['Site adı']) + '</span></a></td>' +
            '<td><span class="fetch-status-dot ' + dotClass + '" title="' + dotTitle + '"></span><span class="fav-star' + (isFav ? ' active' : '') + '" onclick="toggleFavorite(this,\'' + escapeHtml(site['Site adı']).replace(/'/g,"\\'") + '\')"><i class="bi bi-star' + (isFav ? '-fill' : '') + '"></i></span></td>' +
            '<td>' + priceCell(site, 'ZERO', 'satış') + '</td><td>' + priceCell(site, 'ZERO', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'PANDORA', 'satış') + '</td><td>' + priceCell(site, 'PANDORA', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'AGARTHA', 'satış') + '</td><td>' + priceCell(site, 'AGARTHA', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'FELIS', 'satış') + '</td><td>' + priceCell(site, 'FELIS', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'DRYADS', 'satış') + '</td><td>' + priceCell(site, 'DRYADS', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'DESTAN', 'satış') + '</td><td>' + priceCell(site, 'DESTAN', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'MINARK', 'satış') + '</td><td>' + priceCell(site, 'MINARK', 'alış') + '</td>' +
            '<td>' + priceCell(site, 'OREADS', 'satış') + '</td><td>' + priceCell(site, 'OREADS', 'alış') + '</td>';
        tbody.appendChild(tr);
    });
    reorderTable(); filterTable(); applyHighlights(); updateChart(); updateSidebarSiteCount();
}

// Manuel "Yenile" butonu — kullanıcı bilerek tıkladığı için gerçek bir
// tarama tetikler (sunucu tüm siteleri yeniden çeker).
function refreshData() {
    fetch('/api/refresh')
        .then(function(r){ return r.json(); })
        .then(function(result) {
            if (result.status === 'success') {
                renderRefreshedData(result.data);
                showToast('Veriler güncellendi', 'bi-check-circle-fill', 'var(--accent)');
            } else if (result.status === 'cooldown') {
                showToast(result.message, 'bi-hourglass-split', 'var(--text-muted)');
            }
        })
        .catch(function(err){ console.error("Güncelleme hatası:", err); });
}

// Otomatik geri sayım tetiklemesi — YENİ bir tarama BAŞLATMAZ, sadece
// sunucunun zaten (arka planda ~3 dakikada bir) tazelediği veriyi okur.
// Taramanın tek kaynağı sunucudaki otomatik döngü; burası sadece senkronize eder.
function syncData() {
    fetch('/api/data')
        .then(function(r){ return r.json(); })
        .then(function(result) {
            if (result.status === 'success') {
                renderRefreshedData(result.data);
            }
        })
        .catch(function(err){ console.error("Senkronizasyon hatası:", err); });
}

function startLiveClock() {
    var el = document.getElementById('liveClock');
    if (!el) return;
    function tick() {
        el.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);
}

function startCountdown() {
    if (timerInterval) clearInterval(timerInterval);
    var sel = document.getElementById('refreshIntervalSelect');
    maxTimeLeft = parseInt(sel ? sel.value : 30, 10);
    timeLeft = maxTimeLeft;
    var cdEl = document.getElementById('countdown');
    if (cdEl) cdEl.innerText = timeLeft;
    var ar = document.getElementById('aboutRefresh');
    if (ar) ar.textContent = maxTimeLeft + 's';

    timerInterval = setInterval(function() {
        timeLeft--;
        var cdEl = document.getElementById('countdown');
        if (cdEl) cdEl.innerText = timeLeft;
        if (timeLeft <= 0) { syncData(); timeLeft = maxTimeLeft; }
    }, 1000);
}

function changeRefreshInterval() { startCountdown(); }

/* ═══════════════════════════════════════════
   GRAFİK
╚══════════════════════════════════════════ */
function getThemeChartColors() {
    var cs = getComputedStyle(document.documentElement);
    var text = cs.getPropertyValue('--chart-text').trim() || '#8e95a5';
    var grid = cs.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.05)';
    return { text: text, grid: grid };
}

function initChart() {
    var canvas = document.getElementById('trendChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (trendChart) trendChart.destroy();
    var colors = getThemeChartColors();
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { grid: { color: colors.grid }, ticks: { color: colors.text } },
                x: { grid: { color: colors.grid }, ticks: { color: colors.text } }
            },
            plugins: { legend: { labels: { color: colors.text } } }
        }
    });
    updateChart();
    startChartCarousel();
}

function setTimeframe(tf, btn) {
    currentTimeframe = tf;
    document.querySelectorAll('.btn-group button').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    updateChart();
}

function resetChart() {
    document.getElementById('serverSelect').value = 'ZERO';
    document.getElementById('siteSelect').value = 'ALL';
    var h = document.getElementById('hoursFilterSelect');
    if (h) h.value = 'all';
    updateChart();
}

/* ═══════════════════════════════════════════
   GRAFİK — SUNUCU OTOMATİK DÖNGÜSÜ (üstteki KPI carousel'iyle aynı fikir)
╚══════════════════════════════════════════ */
function startChartCarousel() {
    if (chartCarouselInterval) clearInterval(chartCarouselInterval);
    chartCarouselInterval = setInterval(function() {
        currentChartServerIndex = (currentChartServerIndex + 1) % SERVERS.length;
        var sel = document.getElementById('serverSelect');
        if (sel) { sel.value = SERVERS[currentChartServerIndex]; updateChart(); }
    }, 4000);
    var icon = document.getElementById('chartCarouselIcon');
    if (icon) icon.className = 'bi bi-pause-fill';
    var btn = document.getElementById('chartCarouselBtn');
    if (btn) btn.title = 'Otomatik değişimi durdur';
}

function stopChartCarousel() {
    if (chartCarouselInterval) { clearInterval(chartCarouselInterval); chartCarouselInterval = null; }
    var icon = document.getElementById('chartCarouselIcon');
    if (icon) icon.className = 'bi bi-play-fill';
    var btn = document.getElementById('chartCarouselBtn');
    if (btn) btn.title = 'Sunucuyu otomatik değiştir';
}

function toggleChartCarousel() {
    if (chartCarouselInterval) stopChartCarousel(); else startChartCarousel();
}

// Kullanıcı sunucuyu elle seçtiğinde otomatik döngü kendi seçimini "ezmesin" diye durur.
function onManualServerSelect() {
    stopChartCarousel();
    updateChart();
}

function updateChartColors() {
    if (!trendChart) return;
    var colors = getThemeChartColors();
    trendChart.options.scales.x.ticks.color = colors.text;
    trendChart.options.scales.y.ticks.color = colors.text;
    trendChart.options.scales.x.grid.color = colors.grid;
    trendChart.options.scales.y.grid.color = colors.grid;
    trendChart.options.plugins.legend.labels.color = colors.text;
    trendChart.update();
}

function updateChart() {
    var server = document.getElementById('serverSelect').value;
    var site = document.getElementById('siteSelect').value;
    var hours = document.getElementById('hoursFilterSelect') ? document.getElementById('hoursFilterSelect').value : 'all';
    fetch('/api/chart-data?server=' + server + '&site=' + site + '&timeframe=' + currentTimeframe + '&hours=' + hours)
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.status === 'success' && trendChart) {
                trendChart.data.labels = data.labels;
                trendChart.data.datasets = [
                    { label: server + ' Alış', data: data.alisPrices, borderColor: '#00f2fe', backgroundColor: 'rgba(0,242,254,0.08)', fill: true, tension: 0.4 },
                    { label: server + ' Satış', data: data.satisPrices, borderColor: '#ff2d78', backgroundColor: 'rgba(255,45,120,0.08)', fill: true, tension: 0.4 }
                ];
                trendChart.update();
            }
        })
        .catch(function(err){ console.error("Grafik hatası:", err); });
}

/* ═══════════════════════════════════════════
   FAVORİLER
╚══════════════════════════════════════════ */
function toggleFavorite(el, siteName) {
    var idx = favorites.indexOf(siteName);
    if (idx === -1) {
        favorites.push(siteName);
        el.classList.add('active');
        el.innerHTML = '<i class="bi bi-star-fill"></i>';
        showToast(siteName + ' favorilere eklendi', 'bi-star-fill', '#fbbf24');
    } else {
        favorites.splice(idx, 1);
        el.classList.remove('active');
        el.innerHTML = '<i class="bi bi-star"></i>';
        showToast(siteName + ' favorilerden çıkarıldı', 'bi-star', '#fbbf24');
    }
    localStorage.setItem('zenx_favorites', JSON.stringify(favorites));
}

function applyFavoriteStars() {
    document.querySelectorAll('#tableBody tr').forEach(function(row) {
        var name = row.cells[0] ? row.cells[0].innerText.trim() : '';
        var star = row.cells[1] ? row.cells[1].querySelector('.fav-star') : null;
        if (star && favorites.indexOf(name) !== -1) {
            star.classList.add('active');
            star.innerHTML = '<i class="bi bi-star-fill"></i>';
        }
    });
}

function openFavoritesModal() {
    var c = document.getElementById('favoritesContent');
    if (!favorites.length) {
        c.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Henüz favori eklenmedi. Tablodaki yıldız ikonuna tıklayarak site ekleyebilirsiniz.</p>';
    } else {
        c.innerHTML = favorites.map(function(f) {
            return '<div class="d-flex align-items-center justify-content-between p-2 mb-2 rounded-3" style="background:var(--input-bg);border:1px solid var(--border);">' +
                '<span style="font-weight:700;color:var(--text-main);font-size:0.85rem;"><i class="bi bi-star-fill me-2" style="color:#fbbf24;"></i>' + escapeHtml(f) + '</span>' +
                '<button class="btn-ghost btn-sm py-0 px-2" onclick="removeFavoriteFromModal(\'' + escapeHtml(f).replace(/'/g,"\\'") + '\')"><i class="bi bi-x"></i></button></div>';
        }).join('');
    }
    new bootstrap.Modal(document.getElementById('favoritesModal')).show();
}

function removeFavoriteFromModal(siteName) {
    var idx = favorites.indexOf(siteName);
    if (idx !== -1) { favorites.splice(idx, 1); localStorage.setItem('zenx_favorites', JSON.stringify(favorites)); }
    document.querySelectorAll('#tableBody tr').forEach(function(row) {
        if (row.cells[0] && row.cells[0].innerText.trim() === siteName) {
            var star = row.cells[1] ? row.cells[1].querySelector('.fav-star') : null;
            if (star) { star.classList.remove('active'); star.innerHTML = '<i class="bi bi-star"></i>'; }
        }
    });
    openFavoritesModal();
}

/* ═══════════════════════════════════════════
   PİYASA ÖZETİ
╚══════════════════════════════════════════ */
function openSummaryModal() {
    buildSummaryTable();
    new bootstrap.Modal(document.getElementById('summaryModal')).show();
}

function buildSummaryTable() {
    var tbody = document.getElementById('summaryTableBody');
    if (!tbody) return;
    tbody.innerHTML = SERVERS.map(function(server) {
        var p = getServerBestPrices(server);
        var spread = (p.minSell !== null && p.maxBuy !== null) ? (p.minSell - p.maxBuy) : null;
        var sc2 = spread !== null && spread > 0 ? 'var(--buy-text)' : 'var(--sell-text)';
        return '<tr><td style="font-weight:800;color:var(--accent);">' + server + '</td>' +
            '<td style="color:var(--buy-text);">' + (p.minSell !== null ? p.minSell.toFixed(2) + ' TL' : '---') + '</td>' +
            '<td style="color:var(--sell-text);">' + (p.maxBuy !== null ? p.maxBuy.toFixed(2) + ' TL' : '---') + '</td>' +
            '<td style="color:' + sc2 + ';font-weight:700;">' + (spread !== null ? spread.toFixed(2) + ' TL' : '---') + '</td></tr>';
    }).join('');
}

/* ═══════════════════════════════════════════
   KARŞILAŞTIRMA
╚══════════════════════════════════════════ */
function openCompareModal() {
    new bootstrap.Modal(document.getElementById('compareModal')).show();
}

function buildCompareTable() {
    var sA = document.getElementById('compareServerA').value;
    var sB = document.getElementById('compareServerB').value;
    document.getElementById('compareHeadA').textContent = sA;
    document.getElementById('compareHeadB').textContent = sB;
    var idxA = SERVERS.indexOf(sA), idxB = SERVERS.indexOf(sB);
    var sellA = idxA * 2 + 2, buyA = sellA + 1;
    var sellB = idxB * 2 + 2, buyB = sellB + 1;
    var rows = document.querySelectorAll('#tableBody tr');
    var tbody = document.getElementById('compareTableBody');
    tbody.innerHTML = '';

    function getVal(row, col) {
        var cell = row.cells[col];
        if (!cell) return null;
        var raw = cell.querySelector('.price-wrapper') ? cell.querySelector('.price-wrapper').firstChild.textContent.trim() : cell.innerText.trim();
        return parseFloat(raw.replace('TL','').replace(',','.').trim());
    }

    rows.forEach(function(row) {
        if (row.style.display === 'none') return;
        var name = row.cells[0] ? row.cells[0].innerText.trim() : '';
        var vA = getVal(row, sellA), vB = getVal(row, sellB);
        var diff = (vA && vB) ? (vA - vB).toFixed(2) : '---';
        var dc = parseFloat(diff) < 0 ? 'var(--buy-text)' : 'var(--sell-text)';
        tbody.innerHTML += '<tr><td style="text-align:left;font-weight:700;color:var(--text-main);">' + escapeHtml(name) + '</td>' +
            '<td>' + (vA ? vA.toFixed(2) + ' TL' : '---') + '</td>' +
            '<td>' + (vB ? vB.toFixed(2) + ' TL' : '---') + '</td>' +
            '<td style="color:' + dc + ';font-weight:700;">' + (diff !== '---' ? diff + ' TL' : '---') + '</td></tr>';
    });
    if (!tbody.innerHTML) tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);padding:20px;text-align:center;">Veri bulunamadı.</td></tr>';
}

/* ═══════════════════════════════════════════
   FİYAT ALARMLARI
╚══════════════════════════════════════════ */
function openAlarmModal() {
    renderAlarmList();
    new bootstrap.Modal(document.getElementById('alarmModal')).show();
}

function addAlarm() {
    var server = document.getElementById('alarmServer').value;
    var type = document.getElementById('alarmType').value;
    var cond = document.getElementById('alarmCondition').value;
    var price = parseFloat(document.getElementById('alarmPrice').value);
    if (isNaN(price) || price <= 0) { showToast('Geçerli bir fiyat girin', 'bi-exclamation-triangle-fill', 'var(--sell-text)'); return; }
    alarms.push({ id: Date.now(), server: server, type: type, condition: cond, price: price, triggered: false });
    localStorage.setItem('zenx_alarms', JSON.stringify(alarms));
    document.getElementById('alarmPrice').value = '';
    renderAlarmList();
    showToast('Alarm eklendi: ' + server + ' ' + (type === 'sell' ? 'Satış' : 'Alış') + ' ' + (cond === 'below' ? '<' : '>') + ' ' + price + ' TL', 'bi-bell-fill', 'var(--accent)');
}

function removeAlarm(id) {
    alarms = alarms.filter(function(a){ return a.id !== id; });
    localStorage.setItem('zenx_alarms', JSON.stringify(alarms));
    renderAlarmList();
}

function updateAlarmBadge() {
    var badge = document.getElementById('alarmBadgeCount');
    if (!badge) return;
    var activeCount = alarms.filter(function(a){ return !a.triggered; }).length;
    badge.textContent = activeCount;
    badge.classList.toggle('d-none', activeCount === 0);
}

function renderAlarmList() {
    updateAlarmBadge();
    var c = document.getElementById('alarmList');
    if (!c) return;
    if (!alarms.length) { c.innerHTML = '<p style="color:var(--text-dim);font-size:0.78rem;text-align:center;margin-top:12px;">Henüz alarm yok.</p>'; return; }
    c.innerHTML = '<p style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:8px;">Aktif Alarmlar</p>' +
        alarms.map(function(a) {
            return '<div class="d-flex align-items-center justify-content-between p-2 mb-2 rounded-3" style="background:var(--input-bg);border:1px solid ' + (a.triggered ? 'var(--sell-border)' : 'var(--border)') + ';">' +
                '<div style="font-size:0.78rem;"><span style="font-weight:800;color:var(--accent);">' + a.server + '</span>' +
                '<span style="color:var(--text-muted);"> · ' + (a.type === 'sell' ? 'Satış' : 'Alış') + ' ' + (a.condition === 'below' ? '↓' : '↑') + ' </span>' +
                '<span style="font-weight:700;color:var(--text-main);">' + a.price + ' TL</span>' +
                (a.triggered ? '<span class="ms-1" style="color:var(--sell-text);font-size:0.68rem;"> ✓ Tetiklendi</span>' : '') + '</div>' +
                '<button class="btn-ghost btn-sm py-0 px-2" onclick="removeAlarm(' + a.id + ')"><i class="bi bi-x"></i></button></div>';
        }).join('');
}

function checkAlarms() {
    if (!alarms.length) return;
    SERVERS.forEach(function(server) {
        var p = getServerBestPrices(server);
        var minSell = p.minSell !== null ? p.minSell : Infinity;
        var maxBuy = p.maxBuy !== null ? p.maxBuy : 0;
        alarms.forEach(function(alarm) {
            if (alarm.triggered || alarm.server !== server) return;
            var val = alarm.type === 'sell' ? minSell : maxBuy;
            var hit = alarm.condition === 'below' ? val <= alarm.price : val >= alarm.price;
            if (hit) {
                alarm.triggered = true;
                showToast('🔔 Alarm: ' + server + ' ' + (alarm.type === 'sell' ? 'Satış' : 'Alış') + ' = ' + val.toFixed(2) + ' TL', 'bi-bell-fill', 'var(--accent)');
                if (soundAlertsEnabled) playAlarmBeep();
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('ZenX Fiyat Alarmı', { body: server + ' ' + (alarm.type === 'sell' ? 'Satış' : 'Alış') + ' fiyatı ' + val.toFixed(2) + ' TL oldu!' });
                }
            }
        });
    });
    localStorage.setItem('zenx_alarms', JSON.stringify(alarms));
    updateAlarmBadge();
}

/* ═══════════════════════════════════════════
   DIŞA AKTARMA (Canlı Fiyatlar Tablosu)
╚══════════════════════════════════════════ */
function openExportModal() {
    new bootstrap.Modal(document.getElementById('exportModal')).show();
}

function exportMainTableExcel() {
    if (typeof XLSX === 'undefined') { showToast('XLSX kütüphanesi yüklenmedi', 'bi-exclamation-triangle-fill', 'var(--sell-text)'); return; }
    var table = document.getElementById('gbTable');
    if (!table) return;
    var wb = XLSX.utils.table_to_book(table, { sheet: 'Canlı Fiyatlar' });
    XLSX.writeFile(wb, 'ZenX_Canli_Fiyatlar.xlsx');
    showToast('Excel dosyası indiriliyor...', 'bi-file-earmark-excel-fill', '#22c55e');
}

function exportMainTableCSV() {
    var table = document.getElementById('gbTable');
    if (!table) return;
    var rows = Array.from(table.querySelectorAll('tr'));
    var csv = rows.map(function(row) {
        return Array.from(row.querySelectorAll('th,td')).map(function(cell) {
            var text = cell.innerText.replace(/\s+/g, ' ').trim();
            return '"' + text.replace(/"/g, '""') + '"';
        }).join(',');
    }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'ZenX_Canli_Fiyatlar.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('CSV dosyası indiriliyor...', 'bi-filetype-csv', '#22c55e');
}

function copyMainTableToClipboard() {
    var rows = document.querySelectorAll('#tableBody tr');
    var tsv = Array.from(rows).filter(function(r){ return r.style.display !== 'none'; }).map(function(row) {
        return Array.from(row.querySelectorAll('td')).map(function(cell){ return cell.innerText.replace(/\s+/g,' ').trim(); }).join('\t');
    }).join('\n');
    navigator.clipboard.writeText(tsv).then(function(){ showToast('Tablo panoya kopyalandı!', 'bi-clipboard-check-fill', 'var(--accent)'); });
}

/* ═══════════════════════════════════════════
   KÂR HESAPLAYICI
╚══════════════════════════════════════════ */
function getServerBestPrices(server) {
    var idx = SERVERS.indexOf(server);
    if (idx === -1) return { minSell: null, maxBuy: null };
    var sellCol = idx * 2 + 2, buyCol = sellCol + 1;
    var rows = document.querySelectorAll('#tableBody tr');
    var minSell = Infinity, maxBuy = 0;
    rows.forEach(function(row) {
        if (row.style.display === 'none') return;
        var sc = row.cells[sellCol], bc = row.cells[buyCol];
        if (sc) {
            var sv = parseFloat((sc.querySelector('.price-wrapper') ? sc.querySelector('.price-wrapper').firstChild.textContent.trim() : sc.innerText.trim()).replace('TL','').replace(',','.').trim());
            if (!isNaN(sv) && sv > 0 && sv < minSell) minSell = sv;
        }
        if (bc) {
            var bv = parseFloat((bc.querySelector('.price-wrapper') ? bc.querySelector('.price-wrapper').firstChild.textContent.trim() : bc.innerText.trim()).replace('TL','').replace(',','.').trim());
            if (!isNaN(bv) && bv > maxBuy) maxBuy = bv;
        }
    });
    return { minSell: minSell < Infinity ? minSell : null, maxBuy: maxBuy > 0 ? maxBuy : null };
}

/* ═══════════════════════════════════════════
   GB HESAPLAYICI — sunucu + miktar seçilince tüm sitelerin toplam
   alış/satış tutarını anlık karşılaştırır
╚══════════════════════════════════════════ */
function openGbCalcModal() {
    calculateGbAmounts();
    new bootstrap.Modal(document.getElementById('gbCalcModal')).show();
}

function calculateGbAmounts() {
    var serverEl = document.getElementById('gbCalcServer');
    var tbody = document.getElementById('gbCalcTableBody');
    if (!serverEl || !tbody) return;
    var server = serverEl.value;
    var mode = document.getElementById('gbCalcMode').value; // 'amount' = GB gir, 'total' = TL gir
    var amount = parseFloat(document.getElementById('gbCalcAmount').value) || 0;
    var idx = SERVERS.indexOf(server);
    var sellCol = idx * 2 + 2, buyCol = sellCol + 1;
    var rows = document.querySelectorAll('#tableBody tr');

    var amountLabel = document.getElementById('gbCalcAmountLabel');
    var col4Head = document.getElementById('gbCalcCol4');
    var col5Head = document.getElementById('gbCalcCol5');
    var col6Head = document.getElementById('gbCalcCol6');
    if (mode === 'amount') {
        if (amountLabel) amountLabel.innerText = 'GB Miktarı';
        if (col4Head) col4Head.innerText = 'Toplam Alış';
        if (col5Head) col5Head.innerText = 'Toplam Satış';
        if (col6Head) col6Head.innerText = 'Makas (Fark)';
    } else {
        if (amountLabel) amountLabel.innerText = 'TL Tutarı';
        if (col4Head) col4Head.innerText = 'Satılacak GB';
        if (col5Head) col5Head.innerText = 'Alınacak GB';
        if (col6Head) col6Head.innerText = 'Makas (Fark)';
    }

    function getVal(cell) {
        if (!cell || cell.querySelector('.stock-empty-icon')) return null;
        var raw = cell.querySelector('.price-wrapper') ? cell.querySelector('.price-wrapper').firstChild.textContent.trim() : cell.innerText.trim();
        var num = parseFloat(raw.replace('TL','').replace(',','.').trim());
        return (isNaN(num) || num <= 0) ? null : num;
    }

    var entries = [];
    rows.forEach(function(row) {
        var nameEl = row.cells[0] ? row.cells[0].querySelector('.visually-hidden') : null;
        var name = nameEl ? nameEl.innerText.trim() : (row.cells[0] ? row.cells[0].innerText.trim() : '');
        var sell = getVal(row.cells[sellCol]);
        var buy = getVal(row.cells[buyCol]);
        if (sell === null && buy === null) return;
        var col4, col5;
        if (mode === 'amount') {
            col4 = buy !== null ? buy * amount : null;    // Toplam Alış (TL)
            col5 = sell !== null ? sell * amount : null;   // Toplam Satış (TL)
        } else {
            col4 = (buy !== null && buy > 0) ? amount / buy : null;    // Satılacak GB
            col5 = (sell !== null && sell > 0) ? amount / sell : null; // Alınacak GB
        }
        var diff = (col4 !== null && col5 !== null) ? Math.abs(col5 - col4) : null;
        entries.push({ name: name, sell: sell, buy: buy, col4: col4, col5: col5, diff: diff });
    });

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);padding:20px;text-align:center;">Veri bulunamadı.</td></tr>';
        return;
    }

    var col5Vals = entries.map(function(e){ return e.col5; }).filter(function(v){ return v !== null; });
    var col4Vals = entries.map(function(e){ return e.col4; }).filter(function(v){ return v !== null; });
    var diffVals = entries.map(function(e){ return e.diff; }).filter(function(v){ return v !== null; });
    // amount modu: Toplam Alış max = kırmızı (en iyi satım), Toplam Satış min = yeşil (en ucuz alım).
    // total modu:  Satılacak GB min = kırmızı (en az GB satıp kazanmak iyi), Alınacak GB max = yeşil (en çok GB almak iyi).
    var col4Best = mode === 'amount' ? (col4Vals.length ? Math.max.apply(null, col4Vals) : null) : (col4Vals.length ? Math.min.apply(null, col4Vals) : null);
    var col5Best = mode === 'amount' ? (col5Vals.length ? Math.min.apply(null, col5Vals) : null) : (col5Vals.length ? Math.max.apply(null, col5Vals) : null);
    // Makas: en düşük fark = kullanıcı için en avantajlı (alış/satış arası en dar aralık) — yeşil ile vurgulanır.
    var minDiff = diffVals.length ? Math.min.apply(null, diffVals) : null;

    var unit = mode === 'amount' ? ' TL' : ' GB';

    tbody.innerHTML = entries.map(function(e) {
        var buyUnitTxt = e.buy !== null ? e.buy.toFixed(2) + ' TL' : '---';
        var sellUnitTxt = e.sell !== null ? e.sell.toFixed(2) + ' TL' : '---';
        var col4Txt = e.col4 !== null ? e.col4.toFixed(2) + unit : '---';
        var col5Txt = e.col5 !== null ? e.col5.toFixed(2) + unit : '---';
        var diffTxt = e.diff !== null ? e.diff.toFixed(2) + unit : '---';
        var col4Html = (e.col4 !== null && e.col4 === col4Best) ? '<span class="pill-red">' + col4Txt + '</span>' : col4Txt;
        var col5Html = (e.col5 !== null && e.col5 === col5Best) ? '<span class="pill-green">' + col5Txt + '</span>' : col5Txt;
        var diffHtml = (e.diff !== null && e.diff === minDiff) ? '<span class="pill-green">' + diffTxt + '</span>' : diffTxt;
        return '<tr><td style="text-align:left;font-weight:700;color:var(--text-main);">' + escapeHtml(e.name) + '</td>' +
            '<td>' + buyUnitTxt + '</td><td>' + sellUnitTxt + '</td>' +
            '<td>' + col4Html + '</td><td>' + col5Html + '</td><td>' + diffHtml + '</td></tr>';
    }).join('');

    // Alt özet: tüm sitelerdeki en yüksek Alış ile en yüksek Satış tutarı arasındaki fark.
    var maxBuyLabelEl = document.getElementById('gbCalcMaxBuyLabel');
    var maxSellLabelEl = document.getElementById('gbCalcMaxSellLabel');
    var maxBuyEl = document.getElementById('gbCalcMaxBuy');
    var maxSellEl = document.getElementById('gbCalcMaxSell');
    var maxDiffEl = document.getElementById('gbCalcMaxDiff');
    if (mode === 'amount') {
        if (maxBuyLabelEl) maxBuyLabelEl.innerText = 'En Yüksek Alış';
        if (maxSellLabelEl) maxSellLabelEl.innerText = 'En Düşük Satış';
    } else {
        if (maxBuyLabelEl) maxBuyLabelEl.innerText = 'En Çok Satılacak GB';
        if (maxSellLabelEl) maxSellLabelEl.innerText = 'En Az Alınacak GB';
    }
    // En iyi arbitraj fırsatı: en yüksek Alış (en çok kazandıran satım) ile en düşük Satış (en ucuz alım) arasındaki fark.
    var maxCol4Entry = entries.filter(function(e){ return e.col4 !== null; })
        .reduce(function(best, e){ return (!best || e.col4 > best.col4) ? e : best; }, null);
    var minCol5Entry = entries.filter(function(e){ return e.col5 !== null; })
        .reduce(function(best, e){ return (!best || e.col5 < best.col5) ? e : best; }, null);
    if (maxBuyEl) maxBuyEl.innerText = maxCol4Entry ? (maxCol4Entry.col4.toFixed(2) + unit + ' (' + maxCol4Entry.name + ')') : '---';
    if (maxSellEl) maxSellEl.innerText = minCol5Entry ? (minCol5Entry.col5.toFixed(2) + unit + ' (' + minCol5Entry.name + ')') : '---';
    if (maxDiffEl) maxDiffEl.innerText = (maxCol4Entry && minCol5Entry) ? (Math.abs(maxCol4Entry.col4 - minCol5Entry.col5).toFixed(2) + unit) : '---';
}

function openProfitCalcModal() {
    autoFillProfitFromTable();
    new bootstrap.Modal(document.getElementById('profitModal')).show();
}

function autoFillProfitFromTable() {
    var serverEl = document.getElementById('profitServer');
    if (!serverEl) return;
    var prices = getServerBestPrices(serverEl.value);
    if (prices.minSell !== null) document.getElementById('profitBuyPrice').value = prices.minSell.toFixed(2);
    if (prices.maxBuy !== null) document.getElementById('profitSellPrice').value = prices.maxBuy.toFixed(2);
    calculateProfit();
}

function calculateProfit() {
    var qty = parseFloat(document.getElementById('profitQty').value) || 0;
    var buy = parseFloat(document.getElementById('profitBuyPrice').value) || 0;
    var sell = parseFloat(document.getElementById('profitSellPrice').value) || 0;
    var cost = qty * buy;
    var revenue = qty * sell;
    var net = revenue - cost;
    var pct = cost > 0 ? (net / cost * 100) : 0;
    document.getElementById('profitCost').textContent = cost.toFixed(2) + ' TL';
    document.getElementById('profitRevenue').textContent = revenue.toFixed(2) + ' TL';
    var netEl = document.getElementById('profitNet');
    netEl.textContent = (net >= 0 ? '+' : '') + net.toFixed(2) + ' TL (' + (net >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
    netEl.style.color = net >= 0 ? 'var(--buy-text)' : 'var(--sell-text)';
}

/* ═══════════════════════════════════════════
   EN İYİ FIRSATLAR
╚══════════════════════════════════════════ */
function openBestDealsModal() {
    buildBestDeals();
    new bootstrap.Modal(document.getElementById('bestDealsModal')).show();
}

function buildBestDeals() {
    var tbody = document.getElementById('bestDealsTableBody');
    if (!tbody) return;
    var results = SERVERS.map(function(server) {
        var p = getServerBestPrices(server);
        var spread = (p.minSell !== null && p.maxBuy !== null) ? (p.minSell - p.maxBuy) : null;
        return { server: server, minSell: p.minSell, maxBuy: p.maxBuy, spread: spread };
    });
    results.sort(function(a, b) {
        if (a.spread === null) return 1;
        if (b.spread === null) return -1;
        return b.spread - a.spread;
    });
    var medals = ['🥇','🥈','🥉'];
    tbody.innerHTML = results.map(function(r, i) {
        var spreadTxt = r.spread !== null ? (r.spread >= 0 ? '+' : '') + r.spread.toFixed(2) + ' TL' : '---';
        var color = r.spread !== null ? (r.spread >= 0 ? 'var(--buy-text)' : 'var(--sell-text)') : 'var(--text-muted)';
        return '<tr><td style="font-weight:800;">' + (medals[i] || (i + 1)) + '</td>' +
            '<td style="font-weight:800;color:var(--accent);">' + r.server + '</td>' +
            '<td>' + (r.minSell !== null ? r.minSell.toFixed(2) + ' TL' : '---') + '</td>' +
            '<td>' + (r.maxBuy !== null ? r.maxBuy.toFixed(2) + ' TL' : '---') + '</td>' +
            '<td style="color:' + color + ';font-weight:800;">' + spreadTxt + '</td></tr>';
    }).join('');
}

/* ═══════════════════════════════════════════
   GÖRÜNÜM YOĞUNLUĞU
╚══════════════════════════════════════════ */
function toggleDensity() {
    var enabled = document.body.classList.toggle('compact-mode');
    localStorage.setItem('zenx_density', enabled ? '1' : '0');
    updateDensityIcons(enabled);
    showToast(enabled ? 'Kompakt görünüm aktif' : 'Standart görünüme dönüldü', 'bi-arrows-collapse', 'var(--accent)');
}

function updateDensityIcons(enabled) {
    document.querySelectorAll('.density-icon').forEach(function(icon) {
        icon.className = (enabled ? 'bi bi-arrows-expand' : 'bi bi-arrows-collapse') + ' density-icon';
    });
}

function initDensity() {
    var enabled = localStorage.getItem('zenx_density') === '1';
    document.body.classList.toggle('compact-mode', enabled);
    updateDensityIcons(enabled);
}

/* ═══════════════════════════════════════════
   SES UYARISI (Alarm Tetiklenince)
╚══════════════════════════════════════════ */
function toggleSoundAlerts() {
    soundAlertsEnabled = !soundAlertsEnabled;
    localStorage.setItem('zenx_sound_alerts', soundAlertsEnabled ? '1' : '0');
    updateSoundIcons();
    showToast(soundAlertsEnabled ? 'Alarm ses uyarısı açıldı' : 'Alarm ses uyarısı kapatıldı', 'bi-volume-up-fill', 'var(--accent)');
    if (soundAlertsEnabled) playAlarmBeep();
}

function updateSoundIcons() {
    document.querySelectorAll('.sound-icon').forEach(function(icon) {
        icon.className = (soundAlertsEnabled ? 'bi bi-volume-up-fill' : 'bi bi-volume-mute-fill') + ' sound-icon';
    });
}

function initSoundAlerts() { updateSoundIcons(); }

function playAlarmBeep() {
    try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        var ctx = new Ctx();
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.55);
    } catch (e) { /* sessiz geç - ses API'si desteklenmiyor olabilir */ }
}

/* ═══════════════════════════════════════════
   MOBİL ARAÇLAR SHEET
╚══════════════════════════════════════════ */
function openMobileTools() {
    new bootstrap.Modal(document.getElementById('mobileToolsModal')).show();
}

function launchToolFromMobile(fnName) {
    var sheetEl = document.getElementById('mobileToolsModal');
    var modal = bootstrap.Modal.getInstance(sheetEl) || new bootstrap.Modal(sheetEl);
    sheetEl.addEventListener('hidden.bs.modal', function handler() {
        sheetEl.removeEventListener('hidden.bs.modal', handler);
        if (typeof window[fnName] === 'function') window[fnName]();
    });
    modal.hide();
}

/* ═══════════════════════════════════════════
   TAM EKRAN
╚══════════════════════════════════════════ */
function toggleFullscreen() {
    var body = document.body;
    var icons = document.querySelectorAll('.fs-icon');
    if (body.classList.contains('fullscreen-mode')) {
        body.classList.remove('fullscreen-mode');
        icons.forEach(function(icon){ icon.className = 'bi bi-fullscreen fs-icon'; });
        showToast('Tam ekran kapatıldı', 'bi-fullscreen-exit');
    } else {
        body.classList.add('fullscreen-mode');
        icons.forEach(function(icon){ icon.className = 'bi bi-fullscreen-exit fs-icon'; });
        showToast('Tam ekran modu aktif', 'bi-fullscreen', 'var(--accent)');
    }
}

/* ═══════════════════════════════════════════
   BİLDİRİMLER
╚══════════════════════════════════════════ */
function requestNotifPerm() {
    if (!('Notification' in window)) { showToast('Tarayıcınız bildirimleri desteklemiyor', 'bi-exclamation-triangle-fill', 'var(--sell-text)'); return; }
    var icons = document.querySelectorAll('.notif-icon');
    if (Notification.permission === 'granted') {
        showToast('Bildirimler zaten aktif ✓', 'bi-bell-fill', 'var(--accent)');
        icons.forEach(function(icon){ icon.className = 'bi bi-bell-fill notif-icon'; });
    } else {
        Notification.requestPermission().then(function(perm) {
            if (perm === 'granted') {
                showToast('Bildirimler etkinleştirildi!', 'bi-bell-fill', 'var(--accent)');
                icons.forEach(function(icon){ icon.className = 'bi bi-bell-fill notif-icon'; });
            } else {
                showToast('Bildirim izni reddedildi', 'bi-bell-slash-fill', 'var(--sell-text)');
            }
        });
    }
}

function initNotifIconState() {
    if ('Notification' in window && Notification.permission === 'granted') {
        document.querySelectorAll('.notif-icon').forEach(function(icon){ icon.className = 'bi bi-bell-fill notif-icon'; });
    }
}

/* ═══════════════════════════════════════════
   HAKKINDA
╚══════════════════════════════════════════ */
function openAboutModal() {
    var ar = document.getElementById('aboutRefresh');
    if (ar) ar.textContent = maxTimeLeft + 's';
    new bootstrap.Modal(document.getElementById('aboutModal')).show();
}

/* ═══════════════════════════════════════════
   PDF SÜRÜKLE BIRAK
╚══════════════════════════════════════════ */
function initDropzone() {
    var dz = document.getElementById('dropZone');
    var inp = document.getElementById('pdfFileInput');
    if (!dz || !inp) return;
    ['dragenter','dragover'].forEach(function(n) { dz.addEventListener(n, function(e){ e.preventDefault(); dz.style.borderColor = 'var(--accent)'; }, false); });
    ['dragleave','drop'].forEach(function(n) { dz.addEventListener(n, function(e){ e.preventDefault(); dz.style.borderColor = 'var(--border)'; }, false); });
    dz.addEventListener('drop', function(e){ if (e.dataTransfer.files.length > 0) handlePdfFile(e.dataTransfer.files[0]); });
    inp.addEventListener('change', function(e){ if (e.target.files.length > 0) handlePdfFile(e.target.files[0]); });
}

function handlePdfFile(file) {
    if (file.type !== 'application/pdf') { showToast('Lütfen geçerli bir PDF yükleyin!', 'bi-exclamation-triangle-fill', 'var(--sell-text)'); return; }
    var fd = new FormData();
    fd.append('file', file);
    fetch('/api/parse-pdf', { method: 'POST', body: fd })
        .then(function(r){ return r.json(); })
        .then(function(data) {
            if (data.status === 'success') {
                document.getElementById('fileNameDisplay').innerText = data.filename;
                document.getElementById('dropZone').classList.add('d-none');
                document.getElementById('pdfResultContainer').classList.remove('d-none');
                globalTransactionsData = data.transactions || [];
                selectedRowIds.clear();
                buildExcelFilterCheckboxes();
                applyPdfFilters(true);
                showToast('PDF başarıyla yüklendi', 'bi-file-check', '#22c55e');
            } else { showToast('Hata: ' + data.message, 'bi-exclamation-triangle-fill', 'var(--sell-text)'); }
        });
}

function resetPdfUpload() {
    document.getElementById('dropZone').classList.remove('d-none');
    document.getElementById('pdfResultContainer').classList.add('d-none');
    document.getElementById('pdfFileInput').value = '';
    globalTransactionsData = []; filteredTransactionsData = [];
}

function toggleExcelFilter(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.excel-filter-dropdown').forEach(function(d){ if (d.id !== id) d.classList.remove('show'); });
    document.getElementById(id).classList.toggle('show');
}

function toggleSelectAll(event, id, sel) {
    event.preventDefault();
    document.getElementById(id).querySelectorAll('input[type="checkbox"]').forEach(function(cb){ cb.checked = sel; });
    applyPdfFilters();
}

function buildExcelFilterCheckboxes() {
    if (!globalTransactionsData.length) return;
    columnsConfig.forEach(function(col) {
        var unique = [...new Set(globalTransactionsData.map(function(tx){ return tx[col.key]; }))];
        var c = document.getElementById(col.containerId);
        if (!c) return;
        c.innerHTML = '';
        unique.forEach(function(val, idx) {
            var sv = escapeHtml(val);
            c.innerHTML += '<div class="form-check mb-1"><input class="form-check-input excel-filter-cb-' + col.key + '" type="checkbox" value="' + sv + '" id="' + col.key + '_cb_' + idx + '" checked onchange="applyPdfFilters()"><label class="form-check-label text-truncate" for="' + col.key + '_cb_' + idx + '" style="color:var(--text-main);">' + sv + '</label></div>';
        });
    });
}

function applyPdfFilters(resetPage) {
    if (resetPage) currentPdfPage = 1;
    var sf = document.getElementById('pdfTableSearch') ? document.getElementById('pdfTableSearch').value.toLowerCase() : '';
    filteredTransactionsData = globalTransactionsData.filter(function(tx) {
        return Object.values(tx).join(' ').toLowerCase().indexOf(sf) !== -1;
    });
    renderPagedTable(filteredTransactionsData);
}

function clearDateFilter() {
    document.getElementById('startDateFilter').value = '';
    document.getElementById('endDateFilter').value = '';
    applyPdfFilters();
}

function renderPagedTable(data) {
    var tbody = document.getElementById('parsedPdfTableBody');
    tbody.innerHTML = '';
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="9" class="text-center py-3" style="color:var(--text-muted);">Veri bulunamadı.</td></tr>'; return; }
    var tp = Math.ceil(data.length / pdfRowsPerPage);
    var si = (currentPdfPage - 1) * pdfRowsPerPage;
    var pd = data.slice(si, si + pdfRowsPerPage);
    pd.forEach(function(tx) {
        var green = tx.status && tx.status.toLowerCase().indexOf('onay') !== -1;
        var sb = '<span class="' + (green ? 'pill-green' : 'pill-red') + '">' + escapeHtml(tx.status) + '</span>';
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><input type="checkbox" class="form-check-input" style="border-color:var(--border-active);"></td>' +
            '<td class="fw-bold" style="color:var(--text-main);">' + escapeHtml(tx.id) + '</td>' +
            '<td style="color:var(--text-main);">' + escapeHtml(tx.tarih) + '</td>' +
            '<td style="color:var(--text-main);">' + escapeHtml(tx.tip) + '</td>' +
            '<td><span class="' + (green ? 'pill-green' : 'pill-red') + '">' + escapeHtml(tx.tutar) + '</span></td>' +
            '<td style="color:var(--text-main);">' + escapeHtml(tx.onceki_b) + '</td>' +
            '<td style="color:var(--text-main);">' + escapeHtml(tx.sonraki_b) + '</td>' +
            '<td>' + sb + '</td>' +
            '<td class="text-start" style="color:var(--text-muted);font-size:0.78rem;">' + escapeHtml(tx.description) + '</td>';
        tbody.appendChild(tr);
    });
    renderPaginationControls(tp, data.length);
}

function renderPaginationControls(tp, total) {
    var c = document.getElementById('pdfPaginationContainer');
    if (tp <= 1) { c.innerHTML = '<small style="color:var(--text-muted);">Toplam ' + total + ' kayıt</small>'; return; }
    c.innerHTML = '<button class="btn-ghost btn-sm' + (currentPdfPage === 1 ? ' disabled' : '') + '" onclick="changePdfPage(' + (currentPdfPage - 1) + ')"><i class="bi bi-chevron-left me-1"></i>Önceki</button>' +
        '<small style="color:var(--text-muted);">Sayfa ' + currentPdfPage + ' / ' + tp + ' · ' + total + ' kayıt</small>' +
        '<button class="btn-ghost btn-sm' + (currentPdfPage === tp ? ' disabled' : '') + '" onclick="changePdfPage(' + (currentPdfPage + 1) + ')">Sonraki<i class="bi bi-chevron-right ms-1"></i></button>';
}

function changePdfPage(p) { currentPdfPage = p; applyPdfFilters(false); }

function copyTableToClipboard() {
    var tsv = filteredTransactionsData.map(function(tx){ return Object.values(tx).join("\t"); }).join("\n");
    navigator.clipboard.writeText(tsv).then(function(){ showToast('Tablo panoya kopyalandı!', 'bi-clipboard-check-fill', 'var(--accent)'); });
}

function exportFilteredData() {
    if (typeof XLSX === 'undefined') return;
    var ws = XLSX.utils.json_to_sheet(filteredTransactionsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bakiye");
    XLSX.writeFile(wb, "Bakiye_Hareketleri.xlsx");
    showToast('Excel dosyası indiriliyor...', 'bi-file-earmark-excel-fill', '#22c55e');
}
