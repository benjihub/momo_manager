// Minimal SPA router
const routes = {
  '#/dashboard': renderDashboard,
  '#/transactions': renderTransactions,
  '#/reports': renderReports,
  '#/integrations': renderIntegrations,
  '#/devices': renderDevices,
  '#/settings': renderSettings
};

function setActiveNav() {
  const current = location.hash || '#/dashboard';
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === current);
  });
}

async function render() {
  const hash = location.hash || '#/dashboard';
  setActiveNav();
  const fn = routes[hash] || renderDashboard;
  await fn();
}

window.addEventListener('hashchange', render);
window.addEventListener('load', () => {
  setupSSE();
  if (!location.hash) location.hash = '#/dashboard';
  removeHeaderStatus();
  hideDevicesNav();
  removeLeftEmptyBoxes();
  render();
});

// Utils
function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts };
  const response = await fetch(path, init);
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  if (response.status === 204) return {};
  return response.json();
}
function fmtDate(input) {
  if (!input) return '—';
  if (input.seconds) return new Date(input.seconds * 1000).toLocaleString();
  try { return new Date(input).toLocaleString(); } catch { return '—'; }
}

function removeHeaderStatus() {
  const right = document.querySelector('.header .header-content-wrapper > div:last-child');
  if (right) right.remove();
}

function hideDevicesNav() {
  try {
    const devicesLink = document.querySelector('a.nav-link[href="#/devices"]');
    if (devicesLink) devicesLink.remove();
    if (routes['#/devices']) delete routes['#/devices'];
  } catch {}
}

function removeLeftEmptyBoxes() {
  try {
    // Remove gradient logo tile if undesired/appears as empty box
    const logoTile = document.querySelector('.sidebar-header .w-11.h-11');
    if (logoTile) logoTile.remove();
    // Remove the mobile-only close button that can appear as a small empty box
    const closeBtn = document.getElementById('sidebar-close');
    if (closeBtn) closeBtn.remove();
  } catch {}
}

// Views
async function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const kpiGrid = el(`<div class="grid-container grid-kpi">
    <div class="kpi-card" id="kpi-deposit">
      <div class="kpi-label">Deposits Today</div>
      <div class="kpi-value text-green-600">0</div>
      <div class="kpi-change positive">+0% from yesterday</div>
    </div>
    <div class="kpi-card" id="kpi-withdrawal">
      <div class="kpi-label">Withdrawals Today</div>
      <div class="kpi-value text-blue-600">0</div>
      <div class="kpi-change positive">+0% from yesterday</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Live Updates</div>
      <div class="kpi-value text-sm" id="live-status">Disconnected</div>
      <div class="kpi-change"><span class="stat-badge stat-badge-green">Active</span></div>
    </div>
  </div>`);

  // chart removed\r\n
  const recentCard = el(`<div class="card" style="margin-top: 1.5rem;">
    <div class="card-header">
      <h3 class="card-title">Recent Transactions</h3>
      <a href="#/transactions" class="text-sm text-blue-600 hover:text-blue-700 font-medium">View all</a>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table tx-table"><thead><tr><th>ID</th><th>Provider</th><th>Type</th><th>Amount</th><th>Time</th></tr></thead><tbody id="recent-body"></tbody></table>
    </div>
  </div>`);

  app.append(kpiGrid, recentCard);
  await loadDashboardData();
}

async function loadDashboardData() {
  const now = new Date();
  const from = new Date(now); from.setHours(0,0,0,0);
  const to = new Date(now); to.setHours(23,59,59,999);
  const stats = await api(`/api/reports/summary?granularity=daily&from=${from.toISOString()}&to=${to.toISOString()}`);
  const today = stats.find(s => true) || { depositCount:0, withdrawalCount:0 };
  const dep = document.querySelector('#kpi-deposit .kpi-value'); if (dep) dep.textContent = today.depositCount;
  const wdr = document.querySelector('#kpi-withdrawal .kpi-value'); if (wdr) wdr.textContent = today.withdrawalCount;

  const txs = await api('/api/transactions?limit=10');
  const body = document.getElementById('recent-body');
  body.innerHTML = '';
  for (const t of txs.items) {
    const tr = document.createElement('tr');
    const cells = [
      { html: `<span class="font-mono text-xs" style="white-space: nowrap;">${t.idKey || '—'}</span>` },
      { text: t.provider || '—', className: 'font-medium' },
      { html: `<span class="stat-badge stat-badge-${t.type === 'deposit' ? 'green' : 'blue'}">${t.type || '—'}</span>`, style: 'text-align:center' },
      { text: `${(t.amount || 0).toLocaleString('en-US')} ${t.currency || 'TZS'}`, className: 'font-semibold', style: 'text-align:right' },
      { text: fmtDate(t.occurredAt), className: 'text-gray-500 text-sm', style: 'white-space: nowrap;' }
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      if (c.text != null) td.textContent = c.text;
      if (c.html != null) td.innerHTML = c.html;
      if (c.className) td.className = c.className;
      if (c.style) td.setAttribute('style', c.style);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }

  // Build 24h labels and counts from demo data
  // chart removed: no canvas lookup
  const nowH = new Date(); nowH.setMinutes(0,0,0);
  const startH = new Date(nowH.getTime() - 23 * 3600000);
  const hours = Array.from({length:24}, (_,i)=> new Date(startH.getTime() + i*3600000));
  const labels = hours.map(h => `${String(h.getHours()).padStart(2,'0')}:00`);
  const counts = Array(24).fill(0);
  try {
    const txMany = await api('/api/transactions?limit=500');
    for (const t of txMany.items || []) {
      const d = t.occurredAt?.seconds ? new Date(t.occurredAt.seconds * 1000) : new Date(t.occurredAt);
      if (!isFinite(d)) continue;
      if (d < startH || d > nowH) continue;
      const idx = Math.floor((d.getTime() - startH.getTime())/3600000);
      if (idx >= 0 && idx < 24) counts[idx]++;
    }
  } catch {}
  // If no data, synthesize a smooth demo curve
  if (counts.every(c => c === 0)) {
    for (let i=0;i<24;i++) {
      const base = [0,1,2,3,4,5].includes(i%24) ? 2 : 6; // night lower
      const peak = (i>=9 && i<=18) ? 12 : 0; // business hours
      counts[i] = base + Math.floor(Math.random()*4) + peak;
    }
  }
  const ChartLib = window.Chart;
  if (!ChartLib || !canvas) return; // Chart.js not loaded or canvas missing
  const ctx = canvas.getContext('2d');
  new ChartLib(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Transaction Count', data: counts, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.1)', tension:0.4, fill:true, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }}, scales:{ y:{ beginAtZero:true, grid:{ color:'#f3f4f6'}}, x:{ grid:{ display:false }}} }
  });
}

async function renderTransactions() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card">
    <div class="card-header">
      <h3 class="card-title">All Transactions</h3>
      <a id="btn-csv" class="btn btn-secondary" href="#">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        Export CSV
      </a>
    </div>
    <div class="mb-4 flex flex-wrap gap-2">
      <input id="flt-provider" placeholder="Filter by provider" class="flex-1 min-w-[200px]" value="M-Pesa" />
      <select id="flt-type" class="min-w-[150px]"><option value="">All types</option><option>deposit</option><option>withdrawal</option></select>
      <button id="btn-apply" class="btn btn-primary">Apply Filters</button>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table"><thead><tr><th>ID</th><th>Status</th><th>Provider</th><th>Type</th><th>Channel</th><th>From</th><th>To</th><th>Ref</th><th>Amount</th><th>Time</th></tr></thead><tbody id="tx-body"></tbody></table>
    </div>
  </div>`;
  async function load() {
    const provider = document.getElementById('flt-provider').value;
    const type = document.getElementById('flt-type').value;
    const qs = new URLSearchParams(); if (provider) qs.set('provider', provider); if (type) qs.set('type', type);
    const r = await api('/api/transactions?'+qs.toString());
    const body = document.getElementById('tx-body'); body.innerHTML='';
    for (const t of r.items) {
      const tr = document.createElement('tr');
      const cells = [
        { html: `<span class="font-mono">${t.idKey || '—'}</span>` },
        { html: `<span class="stat-badge ${t.status === 'SUCCESS' ? 'stat-badge-green' : (t.status === 'PENDING' ? 'stat-badge-blue' : 'stat-badge-red')}">${t.status || '—'}</span>` },
        { text: t.provider || '—' },
        { html: `<span class="stat-badge stat-badge-${t.type === 'deposit' ? 'green' : 'blue'}">${t.type || '—'}</span>` },
        { text: t.channel || '—' },
        { html: `<span class="font-mono text-xs">${t.fromMsisdn || '—'}</span>` },
        { html: `<span class="font-mono text-xs">${t.toMsisdn || '—'}</span>` },
        { html: `<span class="font-mono text-xs">${t.externalRef || t.reference || '—'}</span>` },
        { text: `${(t.amount||0).toLocaleString('en-US')} ${t.currency||'TZS'}`, className: 'font-semibold', style: 'text-align:right' },
        { text: fmtDate(t.occurredAt), className: 'text-gray-500' }
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        if (c.text != null) td.textContent = c.text;
        if (c.html != null) td.innerHTML = c.html;
        if (c.className) td.className = c.className;
        if (c.style) td.setAttribute('style', c.style);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    const csvUrl = '/api/reports/export.csv?'+qs.toString();
    document.getElementById('btn-csv').href = csvUrl;
  }
  document.getElementById('btn-apply').onclick = load;
  load();
}

async function renderReports() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Financial Reports</h3>
        <div class="space-x-2">
          <a id="rep-csv" class="btn btn-secondary" href="#">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export CSV
          </a>
          <button id="rep-pdf" class="btn btn-secondary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
          Export PDF
          </button>
          <button id="rep-print" class="btn btn-secondary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 8H5a2 2 0 00-2 2v6h4v4h10v-4h4v-6a2 2 0 00-2-2zM17 3H7v5h10V3z"/></svg>
            Print
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-3 mb-6">
        <div class="flex flex-col gap-1">
          <label class="text-sm text-gray-600 font-medium">From</label>
          <input type="date" id="rep-from">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm text-gray-600 font-medium">To</label>
          <input type="date" id="rep-to">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm text-gray-600 font-medium">Provider</label>
          <input type="text" id="rep-provider" placeholder="(any)" class="min-w-[160px]" value="M-Pesa">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm text-gray-600 font-medium">Type</label>
          <select id="rep-type" class="min-w-[140px]"><option value="">All</option><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm text-gray-600 font-medium">Status</label>
          <select id="rep-status" class="min-w-[140px]"><option value="">All</option><option value="SUCCESS">SUCCESS</option><option value="PENDING">PENDING</option><option value="FAILED">FAILED</option></select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm text-gray-600 font-medium">Granularity</label>
          <select id="rep-gran"><option value="daily">Daily</option><option value="weekly" disabled>Weekly</option><option value="monthly" disabled>Monthly</option></select>
        </div>
        <div class="flex items-end">
          <button id="rep-run" class="btn btn-primary">Run Report</button>
        </div>
      </div>
      <div style="position: relative; height: 350px; margin-bottom: 2rem;">
        <canvas id="rep-chart"></canvas>
      </div>
      <div id="rep-table"></div>
    </div>`;
  const today = new Date();
  const y = new Date(Date.now()-86400000);
  const elFrom = document.getElementById('rep-from');
  const elTo = document.getElementById('rep-to');
  if (elFrom) { try { elFrom.valueAsDate = y; } catch { elFrom.value = y.toISOString().slice(0,10); } }
  if (elTo) { try { elTo.valueAsDate = today; } catch { elTo.value = today.toISOString().slice(0,10); } }
  document.getElementById('rep-run').onclick = (e) => { e?.preventDefault?.(); run(); };
  document.getElementById('rep-pdf').onclick = (e) => {
    e?.preventDefault?.();
    const JSPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JSPDF) { alert('PDF library not loaded'); return; }
    const doc = new JSPDF();
    doc.text('Report', 10, 10);
    doc.save('report.pdf');
  };
  document.getElementById('rep-print').onclick = (e) => {
    e?.preventDefault?.();
    // Use the browser print dialog. Ensure the report area is printable.
    window.print();
  };
  // When any filter changes, optionally auto-run
  ['rep-from','rep-to','rep-provider','rep-type','rep-status','rep-gran'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('change', () => run());
  });
  let chartRef = null;
  async function run() {
    try {
      // Resolve dates with fallbacks
      let fromVal = document.getElementById('rep-from').value;
      let toVal = document.getElementById('rep-to').value;
      let from = new Date(fromVal);
      let to = new Date(toVal);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        const today = new Date();
        const y = new Date(Date.now()-86400000);
        from = y; to = today;
        if (elFrom && !fromVal) elFrom.value = y.toISOString().slice(0,10);
        if (elTo && !toVal) elTo.value = today.toISOString().slice(0,10);
      }
      const gran = document.getElementById('rep-gran').value;
      const provider = document.getElementById('rep-provider').value.trim();
      const type = document.getElementById('rep-type').value;
      const status = document.getElementById('rep-status').value;
      const qp = new URLSearchParams({ granularity: gran, from: from.toISOString(), to: to.toISOString() });
      if (provider) qp.set('provider', provider);
      if (type) qp.set('type', type);
      if (status) qp.set('status', status);

      // UI: show loading state in table container
      const wrap = document.getElementById('rep-table');
      if (wrap) { wrap.innerHTML = '<div class="text-sm text-gray-500">Loading…</div>'; }

      // Load summary data
      const data = await api(`/api/reports/summary?${qp.toString()}`);

      // Render chart (destroy previous)
      const ChartLib = window.Chart;
      const canvas = document.getElementById('rep-chart');
      if (ChartLib && canvas) {
        const ctx = canvas.getContext('2d');
        if (chartRef && chartRef.destroy) chartRef.destroy();
        chartRef = new ChartLib(ctx, { type:'bar', data:{ labels:data.map(d=>d.bucket), datasets:[ { label:'Deposits', data:data.map(d=>d.depositSum), backgroundColor:'#16a34a' }, { label:'Withdrawals', data:data.map(d=>d.withdrawalSum), backgroundColor:'#dc2626' } ] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top', align:'end' }}, scales:{ y:{ beginAtZero:true, grid:{ color:'#f3f4f6'}}, x:{ grid:{ display:false }}} }});
      }

      // Render table
      const tbl = el('<table class="data-table mt-4"><thead><tr><th>Bucket</th><th>Deposit Count</th><th>Deposit Sum</th><th>Withdrawal Count</th><th>Withdrawal Sum</th></tr></thead><tbody></tbody></table>');
      for (const r of data) tbl.querySelector('tbody').append(el(`<tr><td>${r.bucket}</td><td>${r.depositCount}</td><td>${r.depositSum}</td><td>${r.withdrawalCount}</td><td>${r.withdrawalSum}</td></tr>`));
      if (wrap) { wrap.innerHTML=''; wrap.append(tbl); }

      // Update CSV export link with same filters
      const csv = document.getElementById('rep-csv'); if (csv) { csv.href = '/api/reports/export.csv?'+qp.toString(); csv.setAttribute('download','report.csv'); }
    } catch (err) {
      console.error(err);
      alert('Failed to run report. Please check your filters and try again.');
    }
  }
  run();
}

async function renderIntegrations() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-header">
        <h3 class="card-title">Add Integration</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <input id="in-name" placeholder="Name" value="Provider Demo API" />
        <select id="in-type"><option value="generic-rest">Generic REST</option></select>
        <input id="in-baseurl" placeholder="Base URL (e.g. mock:demo)" value="mock:demo" />
        <input id="in-apikey" placeholder="API Key" value="demo-key-123" />
        <label class="flex items-center gap-2 col-span-1">
          <input type="checkbox" id="in-enabled" class="w-4 h-4 rounded">
          <span class="text-sm">Enabled</span>
        </label>
        <button id="in-save" class="btn btn-primary">Save Integration</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Active Integrations</h3>
        <button id="in-refresh" class="btn btn-secondary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Enabled</th><th>Status</th><th>Last Run</th><th>Actions</th></tr></thead><tbody id="in-body"></tbody></table>
      </div>
    </div>`;
  document.getElementById('in-save').onclick = async () => {
    const body = {
      name: document.getElementById('in-name').value,
      providerType: document.getElementById('in-type').value,
      enabled: document.getElementById('in-enabled').checked,
      config: { baseUrl: document.getElementById('in-baseurl').value, apiKey: document.getElementById('in-apikey').value }
    };
    try {
      const resp = await api('/integrations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      console.log('Integration saved:', resp);
      // Give visual feedback and reload list
      alert('Integration saved: ' + (resp.name || resp.id));
      load();
    } catch (err) {
      console.error('Failed to save integration:', err);
      alert('Failed to save integration: ' + (err.message || err));
    }
  };
  document.getElementById('in-refresh').onclick = load;
  async function load() {
    const list = await api('/integrations');
    console.log('DEBUG: fetched integrations', list);
    const body = document.getElementById('in-body'); body.innerHTML='';
    for (const it of list) {
      const statusBadge = it.enabled ? '<span class="stat-badge stat-badge-green">Active</span>' : '<span class="stat-badge stat-badge-gray">Inactive</span>';
      const tr = el(`<tr><td class="font-medium">${it.name}</td><td>${it.providerType}</td><td>${statusBadge}</td><td class="text-gray-500">${it.status||'—'}</td><td class="text-gray-500 text-sm">${it.lastRunAt?.seconds? new Date(it.lastRunAt.seconds*1000).toLocaleString(): '—'}</td><td class="space-x-2"></td></tr>`);
      const td = tr.querySelector('td:last-child');
      const btnTest = el('<button class="btn btn-secondary text-xs py-1">Test</button>');
      btnTest.onclick = async () => { const r = await api(`/integrations/${it.id}/test`, { method: 'POST' }); alert('Test: '+JSON.stringify(r)); };
      const btnRun = el('<button class="btn btn-primary text-xs py-1">Run</button>');
      btnRun.onclick = async () => { const r = await api(`/integrations/${it.id}/run`, { method: 'POST' }); alert('Run: '+JSON.stringify(r)); };
      td.append(btnTest, btnRun);
      body.append(tr);
    }
  }
  load();
}

async function renderDevices() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card">
    <div class="card-header">
      <h3 class="card-title">Connected Devices</h3>
      <span class="text-sm text-gray-500">Monitor device status</span>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table"><thead><tr><th>Device</th><th>Provider</th><th>Status</th><th>Queue</th><th>Battery</th></tr></thead><tbody id="dev-body"></tbody></table>
    </div>
  </div>`;
  const r = await api('/api/devices');
  const body = document.getElementById('dev-body'); body.innerHTML='';
  for (const d of r.items) {
    const statusBadge = d.online ? '<span class="stat-badge stat-badge-green">Online</span>' : '<span class="stat-badge stat-badge-gray">Offline</span>';
    const tr = el(`<tr><td class="font-medium">${d.id}</td><td>${d.provider||'—'}</td><td>${statusBadge}</td><td>${d.queueSize||0}</td><td>${d.battery??'—'}</td></tr>`);
    body.append(tr);
  }
}

async function renderSettings() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-header">
        <h3 class="card-title">Parser Sandbox</h3>
        <span class="text-sm text-gray-500">Test transaction parsing</span>
      </div>
      <textarea id="ps-in" class="w-full border rounded-lg p-3" rows="6" placeholder="Paste raw transaction text here...">M-Pesa confirmation REF123456 for TZS 25,000 sent to Lakeview Stores. New balance TZS 120,450 on 2025-01-21 14:22.</textarea>
      <button id="ps-run" class="mt-3 btn btn-primary">Parse Text</button>
      <pre id="ps-out" class="mt-3 bg-gray-50 p-3 rounded-lg text-sm border border-gray-200 overflow-x-auto"></pre>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">System Configuration</h3>
      </div>
      <div class="space-y-3">
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <div class="font-medium text-sm">Timezone</div>
            <div class="text-xs text-gray-500">All rollups computed in this timezone</div>
          </div>
          <span class="stat-badge stat-badge-blue">Africa/Kampala (UTC+3)</span>
        </div>
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <div class="font-medium text-sm">Version</div>
            <div class="text-xs text-gray-500">Current application version</div>
          </div>
          <span class="stat-badge stat-badge-gray">v1.0.0</span>
        </div>
      </div>
    </div>`;
  document.getElementById('ps-run').onclick = () => {
    const txt = document.getElementById('ps-in').value;
    const parsed = { raw: txt, length: txt.length };
    document.getElementById('ps-out').textContent = JSON.stringify(parsed, null, 2);
  };
}

// Live updates
function setupSSE() {
  const es = new EventSource('/live');
  const status = document.getElementById('live-status');
  if (status) status.textContent = 'Connecting...';
  es.onopen = () => { const s = document.getElementById('live-status'); if (s) s.textContent = 'Connected'; };
  es.addEventListener('tx:new', () => {
    if (location.hash === '#/dashboard') loadDashboardData();
  });
}


