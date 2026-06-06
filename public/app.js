// WMO weather interpretation codes → human-readable label
// Full table: https://open-meteo.com/en/docs#weathervariables
const WMO = {
    '0':'Clear Sky','1':'Mainly Clear','2':'Partly Cloudy','3':'Overcast',
    '45':'Fog','48':'Rime Fog',
    '51':'Light Drizzle','53':'Drizzle','55':'Heavy Drizzle',
    '61':'Light Rain','63':'Rain','65':'Heavy Rain',
    '71':'Light Snow','73':'Snow','75':'Heavy Snow','77':'Snow Grains',
    '80':'Rain Showers','81':'Rain Showers','82':'Violent Showers',
    '85':'Snow Showers','86':'Heavy Snow Showers',
    '95':'Thunderstorm','96':'Thunderstorm + Hail','99':'Severe Thunderstorm'
};
const wmoLabel = code => WMO[String(code)] || 'Unknown';

// Manages the farm list in localStorage.
// Validates coordinates on write so corrupt entries never reach the API.
const LocationManager = (() => {
    const KEY = 'agrimonitor_farms';

    function isValid(f) { return f && isFinite(f.lat) && isFinite(f.lon); }
    function getAll() {
        const stored = localStorage.getItem(KEY);
        if (!stored) return [];
        const farms = JSON.parse(stored).filter(isValid);
        // Persist the cleaned list if anything was removed
        saveAll(farms);
        return farms;
    }
    function saveAll(farms) { localStorage.setItem(KEY, JSON.stringify(farms)); }
    function add(name, lat, lon) {
        const parsedLat = parseFloat(lat);
        const parsedLon = parseFloat(lon);
        if (!isFinite(parsedLat) || !isFinite(parsedLon)) throw new Error('Invalid coordinates');
        const farms = getAll();
        const farm = { id: String(Date.now()), name, lat: parsedLat, lon: parsedLon };
        farms.push(farm);
        saveAll(farms);
        return farm;
    }
    function remove(id) { saveAll(getAll().filter(f => f.id !== id)); }

    return { getAll, add, remove };
})();

// Polls /api/usage and updates the quota fill bars in the header
const UsageMonitor = {
    async refresh() {
        try {
            const data = await apiFetch('/api/usage');
            const used = data.period?.requestCount ?? 0;
            const limit = data.limits?.requests ?? 1000;
            const aiUsed = data.period?.aiRequestCount ?? 0;
            const aiLimit = data.limits?.aiRequests ?? 200;

            document.getElementById('usageFill').style.width = `${Math.min(100, used / limit * 100)}%`;
            document.getElementById('usageText').textContent = `${used}/${limit}`;
            document.getElementById('aiUsageFill').style.width = `${Math.min(100, aiUsed / aiLimit * 100)}%`;
            document.getElementById('aiUsageText').textContent = `${aiUsed}/${aiLimit}`;
        } catch { /* non-critical */ }
    }
};

async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// Builds an inline SVG temperature line + precipitation bars (no chart library).
function buildHourlySVG(hourly) {
    const hours = hourly.slice(0, 24);
    if (!hours.length) return '<p class="empty-state">No hourly data.</p>';

    const W = 560, H = 110;
    const pad = { t: 18, r: 8, b: 26, l: 8 };
    const iW = W - pad.l - pad.r;
    const iH = H - pad.t - pad.b;

    const temps = hours.map(h => h.temperature);
    const minT = Math.min(...temps), maxT = Math.max(...temps);
    const range = maxT - minT || 1;

    const x = i => pad.l + (i / (hours.length - 1)) * iW;
    const y = t => pad.t + (1 - (t - minT) / range) * iH;

    const bW = iW / hours.length - 1;
    const bars = hours.map((h, i) => {
        const bH = (h.precipitation_probability / 100) * iH;
        return `<rect x="${(x(i) - bW / 2).toFixed(1)}" y="${(pad.t + iH - bH).toFixed(1)}" width="${bW.toFixed(1)}" height="${bH.toFixed(1)}" fill="rgba(59,130,246,0.18)" rx="1"/>`;
    }).join('');

    const pts = hours.map((h, i) => `${x(i).toFixed(1)},${y(h.temperature).toFixed(1)}`).join(' ');
    const areaPts = `${x(0).toFixed(1)},${(pad.t + iH).toFixed(1)} ${pts} ${x(hours.length - 1).toFixed(1)},${(pad.t + iH).toFixed(1)}`;

    // Label every 6th hour
    const labels = hours.filter((_, i) => i % 6 === 0).map((h, idx) => {
        const i = idx * 6;
        const timeStr = (h.time.split('T')[1] || h.time.split(' ')[1] || '').slice(0, 5);
        const cx = x(i).toFixed(1), cy = y(h.temperature).toFixed(1);
        return `<circle cx="${cx}" cy="${cy}" r="3" class="chart-dot"/>
<text x="${cx}" y="${(parseFloat(cy) - 5).toFixed(1)}" class="chart-temp" text-anchor="middle">${h.temperature.toFixed(0)}°</text>
<text x="${cx}" y="${(H - 4).toFixed(1)}" class="chart-label" text-anchor="middle">${timeStr}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="hourly-svg" preserveAspectRatio="none">
  ${bars}
  <polygon points="${areaPts}" class="temp-area"/>
  <polyline points="${pts}" class="temp-line"/>
  ${labels}
</svg>
<div class="chart-legend">
  <span class="legend-item"><span class="legend-swatch" style="background:var(--accent)"></span>Temperature (°C)</span>
  <span class="legend-item"><span class="legend-swatch" style="background:rgba(59,130,246,0.4)"></span>Precip. probability (%)</span>
</div>`;
}

function buildDailyStrip(daily) {
    return daily.map((d, i) => {
        const dateObj = (() => { const [y,m,day] = d.date.split('-').map(Number); return new Date(y, m-1, day); })();
        const dayLabel = i === 0 ? 'Today' : dateObj.toLocaleDateString('en', { weekday: 'short' });
        return `<div class="daily-card" title="${d.date}">
  <span class="daily-day">${dayLabel}</span>
  <img class="daily-icon" src="${d.icon}" alt="${wmoLabel(d.condition_code)}" loading="lazy">
  <span class="daily-range">${Math.round(d.temp_max)}° <span>${Math.round(d.temp_min)}°</span></span>
  ${d.precipitation_probability > 0 ? `<span class="daily-precip">${d.precipitation_probability}%</span>` : ''}
</div>`;
    }).join('');
}

function buildFarmCard(farm, data) {
    const { current, hourly, daily, alerts, anomalies } = data;

    const alertsHtml = alerts.length
        ? `<div class="alerts-container">${alerts.map(a =>
            `<div class="alert-badge ${a.startsWith('CRITICAL') ? 'critical' : ''}">${a}</div>`
          ).join('')}</div>`
        : '';

    const anomaliesHtml = anomalies.length
        ? `<div class="anomalies-section">
    <div class="anomalies-title">Upcoming Anomalies</div>
    ${anomalies.map(a => {
        const timeStr = (a.time.split('T')[1] || '').slice(0,5);
        return `<div class="anomaly-row"><span>${a.issue} @ ${timeStr || a.time}</span><span class="anomaly-val">${typeof a.value === 'number' ? a.value.toFixed(1) : a.value}</span></div>`;
    }).join('')}
  </div>`
        : '';

    const card = document.createElement('div');
    card.className = 'farm-card';
    card.dataset.id = farm.id;
    card.innerHTML = `
<div class="card-header">
  <img class="card-icon" src="${current.icon}" alt="${wmoLabel(current.condition_code)}" loading="lazy">
  <div class="card-title-group">
    <div class="farm-name">${escHtml(farm.name)}</div>
    <div class="farm-coords">${farm.lat.toFixed(4)}, ${farm.lon.toFixed(4)}</div>
  </div>
  <div class="card-header-right">
    <span class="condition-label">${wmoLabel(current.condition_code)}</span>
    <button class="remove-btn" title="Remove farm">×</button>
  </div>
</div>

<div class="card-current">
  <div class="temp-row">
    <span class="big-temp">${current.temperature.toFixed(1)}°C</span>
    <span class="feels-like">Feels like ${current.feels_like.toFixed(1)}°C</span>
  </div>
  <div class="metric-grid">
    <div class="metric"><span class="metric-label">Humidity</span><span class="metric-val">${current.humidity}%</span></div>
    <div class="metric"><span class="metric-label">Wind</span><span class="metric-val">${current.wind_speed.toFixed(1)} km/h</span></div>
    <div class="metric"><span class="metric-label">Gust</span><span class="metric-val">${current.wind_gust.toFixed(1)} km/h</span></div>
    <div class="metric"><span class="metric-label">UV Index</span><span class="metric-val">${current.uv_index.toFixed(1)}</span></div>
  </div>
</div>

${alertsHtml}
${anomaliesHtml}

<div class="daily-strip">${buildDailyStrip(daily)}</div>

<button class="hourly-toggle-btn" aria-expanded="false">
  <span>Hourly Forecast (24h)</span>
  <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
</button>
<div class="hourly-panel">
  ${buildHourlySVG(hourly)}
</div>`;

    const toggleBtn = card.querySelector('.hourly-toggle-btn');
    const panel = card.querySelector('.hourly-panel');
    toggleBtn.addEventListener('click', () => {
        const open = panel.classList.toggle('open');
        toggleBtn.classList.toggle('open', open);
        toggleBtn.setAttribute('aria-expanded', open);
    });

    card.querySelector('.remove-btn').addEventListener('click', () => {
        LocationManager.remove(farm.id);
        card.remove();
        if (!document.querySelector('.farm-card')) {
            document.getElementById('farmGrid').innerHTML = '<p class="empty-state">No farms added. Use "+ Add Farm" or "Auto-Detect".</p>';
        }
    });

    return card;
}

const DashboardRenderer = {
    async renderAll(aiEnabled) {
        const farms = LocationManager.getAll();
        const grid = document.getElementById('farmGrid');
        grid.innerHTML = '';

        if (!farms.length) {
            grid.innerHTML = '<p class="empty-state">No farms added yet. Use "+ Add Farm" to add your first farm, or click "Auto-Detect" to use your current location.</p>';
            return;
        }

        const locationsParam = farms.map(f => `${f.lat},${f.lon}`).join('|');
        const results = await apiFetch(`/api/locations/weather?locations=${locationsParam}&ai=${aiEnabled}`);

        farms.forEach((farm, i) => {
            grid.appendChild(buildFarmCard(farm, results[i]));
        });

        UsageMonitor.refresh();
    }
};

const TreeAnalyserRenderer = {
    async loadQuota() {
        try {
            const q = await apiFetch('/api/trees/quota');
            const badge = document.getElementById('quotaBadge');
            if (q.unlimited) {
                badge.textContent = 'Unlimited analyses';
            } else {
                badge.textContent = `${q.remaining}/${q.limit} analyses left`;
                if (q.remaining === 0) badge.classList.add('exhausted');
            }
        } catch {
            document.getElementById('quotaBadge').textContent = 'Quota unavailable';
        }
    },

    async loadHistory() {
        const list = document.getElementById('historyList');
        try {
            const data = await apiFetch('/api/trees/history');
            const items = Array.isArray(data) ? data : (data.analyses ?? data.history ?? []);
            if (!items.length) {
                list.innerHTML = '<p class="empty-state">No analyses yet.</p>';
                return;
            }
            list.innerHTML = items.map(item => `
<div class="history-item">
  <img class="history-thumb" src="${item.original_image_url || ''}" alt="analysis" loading="lazy">
  <div class="history-meta">
    <span class="history-date">${new Date(item.timestamp).toLocaleString()}</span>
    <span><strong>${item.total_tree_count ?? '-'}</strong> trees · ${item.canopy_coverage_pct ?? '-'}% canopy</span>
    <span class="history-stat">${item.county || item.location || ''}</span>
  </div>
  <span style="font-size:0.7rem;color:var(--text-muted)">${Math.round((item.confidence_score ?? 0) * 100)}% conf.</span>
</div>`).join('');
        } catch {
            list.innerHTML = '<p class="empty-state">Failed to load history.</p>';
        }
    },

    renderResults(data) {
        const panel = document.getElementById('resultsPanel');
        panel.classList.remove('hidden');

        document.getElementById('originalImg').src = data.original_image_url || '';
        document.getElementById('overlayImg').src = data.overlay_image_url || '';

        const healthColors = { healthy: '#10b981', needs_care: '#f59e0b', needs_replacement: '#ef4444' };
        const health = data.tree_health || {};
        const healthPct = (key) => {
            const total = (health.healthy||0) + (health.needs_care||0) + (health.needs_replacement||0);
            return total ? Math.round((health[key]||0) / total * 100) : 0;
        };

        document.getElementById('statsGrid').innerHTML = `
<div class="stat-card"><div class="stat-label">Tree Count</div><div class="stat-value">${data.total_tree_count ?? '-'}</div></div>
<div class="stat-card"><div class="stat-label">Density / acre</div><div class="stat-value">${data.tree_density_per_acre ?? '-'}</div></div>
<div class="stat-card"><div class="stat-label">Canopy Cover</div><div class="stat-value">${data.canopy_coverage_pct ?? '-'}<span class="stat-unit">%</span></div></div>
<div class="stat-card"><div class="stat-label">Confidence</div><div class="stat-value">${Math.round((data.confidence_score ?? 0) * 100)}<span class="stat-unit">%</span></div></div>
<div class="stat-card" style="grid-column:span 2">
  <div class="stat-label">Tree Health</div>
  <div class="health-bar" style="margin-top:0.4rem">
    ${Object.entries(healthColors).map(([k,c]) => healthPct(k) > 0
        ? `<div class="health-seg" style="background:${c};width:${healthPct(k)}%;flex:none" title="${k.replace('_',' ')}: ${healthPct(k)}%"></div>`
        : '').join('')}
  </div>
  <div style="display:flex;gap:0.75rem;margin-top:0.3rem;font-size:0.65rem;color:var(--text-muted)">
    ${Object.entries(healthColors).map(([k,c]) => `<span><span style="color:${c}">■</span> ${k.replace(/_/g,' ')} ${healthPct(k)}%</span>`).join('')}
  </div>
</div>`;

        const obs = data.observations || [];
        const recs = data.recommendations || [];
        document.getElementById('obsRecs').innerHTML = `
${obs.length ? `<h4>Observations</h4><ul>${obs.map(o => `<li>${escHtml(o)}</li>`).join('')}</ul>` : ''}
${recs.length ? `<h4 style="margin-top:0.75rem">Recommendations</h4><ul>${recs.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>` : ''}`;

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.loadQuota();
        this.loadHistory();
    }
};

// Handles the Add Farm modal: GPS button, place-name search, and the confirm chip.
const LocationPicker = {
    lat: null,
    lon: null,
    _searchTimer: null,

    reset() {
        this.lat = null;
        this.lon = null;
        document.getElementById('locationSearch').value = '';
        document.getElementById('searchResults').classList.add('hidden');
        document.getElementById('selectedLoc').classList.add('hidden');
        document.getElementById('addFarmSubmit').disabled = true;
    },

    confirm(lat, lon, label) {
        this.lat = lat;
        this.lon = lon;
        const short = label.split(',').slice(0, 2).join(',').trim();
        document.getElementById('selectedLocText').textContent =
            `${short} (${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)})`;
        document.getElementById('selectedLoc').classList.remove('hidden');
        document.getElementById('searchResults').classList.add('hidden');
        document.getElementById('locationSearch').value = '';
        document.getElementById('addFarmSubmit').disabled = false;

        // Auto-fill name if still blank
        const nameEl = document.getElementById('farmName');
        if (!nameEl.value.trim()) nameEl.value = label.split(',')[0].trim();
    },

    async useGPS() {
        if (!navigator.geolocation) {
            alert('GPS is not supported in this browser. Please search for your location instead.');
            return;
        }
        const btn = document.getElementById('gpsPickBtn');
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Getting location…';

        try {
            const pos = await new Promise((ok, fail) =>
                navigator.geolocation.getCurrentPosition(ok, fail, { timeout: 12000, enableHighAccuracy: true })
            );
            const { latitude: lat, longitude: lon } = pos.coords;

            // Reverse-geocode to get a human label
            let label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            try {
                const r = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const d = await r.json();
                if (d.display_name) label = d.display_name;
            } catch { /* keep coords as fallback */ }

            this.confirm(lat, lon, label);
        } catch (err) {
            const msg = err.code === 1
                ? 'Location permission denied. Please allow access in your browser settings, or search manually.'
                : 'Could not get your GPS position. Please try searching instead.';
            alert(msg);
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    },

    scheduleSearch(query) {
        clearTimeout(this._searchTimer);
        const results = document.getElementById('searchResults');
        if (query.length < 3) { results.classList.add('hidden'); return; }
        this._searchTimer = setTimeout(() => this._doSearch(query), 420);
    },

    async _doSearch(query) {
        const results = document.getElementById('searchResults');
        results.innerHTML = '<div class="search-result-item" style="cursor:default">Searching…</div>';
        results.classList.remove('hidden');
        try {
            const r = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=0`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const items = await r.json();
            if (!items.length) {
                results.innerHTML = '<div class="search-result-item no-results">No results-try a broader search</div>';
                return;
            }
            results.innerHTML = items.map(item =>
                `<div class="search-result-item" data-lat="${item.lat}" data-lon="${item.lon}" data-name="${escHtml(item.display_name)}">${escHtml(item.display_name)}</div>`
            ).join('');
            results.querySelectorAll('[data-lat]').forEach(el => {
                el.addEventListener('click', () =>
                    this.confirm(parseFloat(el.dataset.lat), parseFloat(el.dataset.lon), el.dataset.name)
                );
            });
        } catch {
            results.innerHTML = '<div class="search-result-item no-results">Search failed-check your connection</div>';
        }
    }
};

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showLoading(text = 'Loading…') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

document.addEventListener('DOMContentLoaded', () => {
    let aiEnabled = false;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

            if (btn.dataset.tab === 'trees') {
                TreeAnalyserRenderer.loadQuota();
                TreeAnalyserRenderer.loadHistory();
            }
        });
    });

    document.getElementById('aiToggle').addEventListener('change', async (e) => {
        aiEnabled = e.target.checked;
        if (document.querySelector('#tab-dashboard.active')) {
            try {
                showLoading('Refreshing with AI Insights…');
                await DashboardRenderer.renderAll(aiEnabled);
            } catch (err) {
                console.error(err);
            } finally { hideLoading(); }
        }
    });

    function showModal() {
        LocationPicker.reset();
        document.getElementById('farmName').value = '';
        document.getElementById('modalOverlay').classList.remove('hidden');
        document.getElementById('farmName').focus();
    }
    function hideModal() {
        document.getElementById('modalOverlay').classList.add('hidden');
        LocationPicker.reset();
    }

    document.getElementById('addFarmBtn').addEventListener('click', showModal);
    document.getElementById('cancelModal').addEventListener('click', hideModal);
    document.getElementById('modalClose').addEventListener('click', hideModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideModal();
    });

    document.getElementById('gpsPickBtn').addEventListener('click', () => LocationPicker.useGPS());

    document.getElementById('locationSearch').addEventListener('input', (e) =>
        LocationPicker.scheduleSearch(e.target.value.trim())
    );

    document.getElementById('clearLoc').addEventListener('click', () => {
        LocationPicker.reset();
        document.getElementById('locationSearch').focus();
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrap') && !e.target.closest('#selectedLoc')) {
            document.getElementById('searchResults').classList.add('hidden');
        }
    });

    document.getElementById('addFarmForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('farmName').value.trim();
        if (!name || LocationPicker.lat === null || isNaN(LocationPicker.lat)) return;

        // Capture before hideModal() resets LocationPicker
        const lat = LocationPicker.lat;
        const lon = LocationPicker.lon;
        hideModal();

        LocationManager.add(name, lat, lon);
        try {
            showLoading('Loading new farm…');
            await DashboardRenderer.renderAll(aiEnabled);
        } catch (err) {
            console.error(err);
        } finally { hideLoading(); }
    });

    document.getElementById('geoDetectBtn').addEventListener('click', async () => {
        try {
            showLoading('Detecting your location…');
            const result = await apiFetch('/api/geo-detect');
            hideLoading();

            const { weather, geo } = result;
            const lat = weather.location.lat;
            const lon = weather.location.lon;
            const cityParts = [geo.city, geo.region, geo.country].filter(Boolean);
            const label = cityParts.length ? cityParts.join(', ') : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

            const name = prompt(`Auto-detected: ${label}\n\nEnter a name for this farm:`, label);
            if (!name) return;

            LocationManager.add(name, lat, lon);
            showLoading('Loading farm data…');
            await DashboardRenderer.renderAll(aiEnabled);
        } catch (err) {
            hideLoading();
            alert(`Auto-detect failed: ${err.message}`);
        } finally { hideLoading(); }
    });

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('treeImageInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const preview = document.getElementById('uploadPreview');
    const previewImg = document.getElementById('previewImg');
    let selectedFile = null;

    function setFile(file) {
        if (!file) return;
        selectedFile = file;
        const url = URL.createObjectURL(file);
        previewImg.src = url;
        preview.classList.remove('hidden');
        dropzone.classList.add('hidden');
        analyzeBtn.disabled = false;
    }

    dropzone.addEventListener('click', (e) => {
        if (e.target !== fileInput) fileInput.click();
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    document.getElementById('clearPreview').addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        previewImg.src = '';
        preview.classList.add('hidden');
        dropzone.classList.remove('hidden');
        analyzeBtn.disabled = true;
    });

    analyzeBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        const formData = new FormData();
        formData.append('image', selectedFile, selectedFile.name);

        const county = document.getElementById('analysisCounty').value.trim();
        const acres  = document.getElementById('analysisAcres').value.trim();
        const notes  = document.getElementById('analysisNotes').value.trim();
        if (county) formData.append('county', county);
        if (acres)  formData.append('landAcres', acres);
        if (notes)  formData.append('notes', notes);

        try {
            showLoading('Analysing trees-this may take 20–30 seconds…');
            const res = await fetch('/api/trees/analyze', { method: 'POST', body: formData });
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
            const data = await res.json();
            hideLoading();
            TreeAnalyserRenderer.renderResults(data);
            UsageMonitor.refresh();
        } catch (err) {
            hideLoading();
            alert(`Analysis failed: ${err.message}`);
        }
    });

    document.getElementById('refreshHistoryBtn').addEventListener('click', () => TreeAnalyserRenderer.loadHistory());

    (async () => {
        try {
            showLoading('Syncing farm telemetry…');
            await DashboardRenderer.renderAll(aiEnabled);
        } catch (err) {
            hideLoading();
            document.getElementById('farmGrid').innerHTML =
                `<p class="empty-state" style="color:var(--danger)">Failed to load: ${escHtml(err.message)}</p>`;
        } finally { hideLoading(); }

        UsageMonitor.refresh();
    })();
});
