// Simple in-memory demo data generator used for illustration with rich sample fields
import { formatDailyBucket, startOfDayKampala, endOfDayKampala } from '../utils/time.js';
import { broadcast } from '../sse.js';

const PROVIDERS = ['M-Pesa', 'Airtel', 'Tigo', 'MTN'];
const TYPES = ['deposit', 'withdrawal'];
const CHANNELS = ['USSD', 'Agent', 'Mobile App', 'API'];
const LOCATIONS = ['Dar es Salaam', 'Dodoma', 'Mwanza', 'Arusha', 'Mbeya', 'Morogoro'];
const WALLET_MSISDN = '255700000001';

const PURPOSES = {
  deposit: [
    { description: 'Customer wallet top-up', category: 'Cash-In' },
    { description: 'Agent cash-in at kiosk', category: 'Agent Services' },
    { description: 'Bank to wallet transfer', category: 'Bank Transfer' },
    { description: 'Incoming merchant settlement', category: 'Merchant Settlement' }
  ],
  withdrawal: [
    { description: 'Agent cash-out to customer', category: 'Cash-Out' },
    { description: 'Merchant settlement payout', category: 'Merchant Settlement' },
    { description: 'Wallet to bank transfer', category: 'Bank Transfer' },
    { description: 'Bill payment to utility', category: 'Bill Payment' }
  ]
};

const COUNTERPARTIES = [
  { name: 'Aida Trading Co.', msisdn: '255712345678' },
  { name: 'John Mushi', msisdn: '255713334455' },
  { name: 'Green Energy Ltd.', msisdn: '255714556677' },
  { name: 'Lakeview Stores', msisdn: '255715667788' },
  { name: 'National Water Agency', msisdn: '255716778899' },
  { name: 'Mlimani Hospital', msisdn: '255717889900' }
];

const STATUS_DISTRIBUTION = [
  { value: 'SUCCESS', weight: 78 },
  { value: 'PENDING', weight: 12 },
  { value: 'FAILED', weight: 10 }
];

// seeded random helper (deterministic per boot)
let seed = 1337;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return Math.abs(seed) / 0xffffffff;
}

function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

function weightedPick(options) {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rnd() * total;
  for (const option of options) {
    if ((roll -= option.weight) <= 0) return option.value;
  }
  return options[0].value;
}

function randomAmount() {
  // 5,000 .. 250,000 with occasional high values
  const base = 5000 + Math.floor(rnd() * 120000);
  const premium = rnd() > 0.9 ? Math.floor(rnd() * 180000) : 0;
  return base + premium;
}

function computeDepositFee(amount) {
  return Math.max(80, Math.round(amount * 0.0015));
}

function computeWithdrawalFee(amount) {
  return Math.max(200, Math.round(amount * 0.008));
}

function createSkeleton(idKey, occurredAt) {
  const provider = pick(PROVIDERS);
  const type = pick(TYPES);
  const counterpart = pick(COUNTERPARTIES);
  const channel = pick(CHANNELS);
  const purpose = pick(PURPOSES[type]);
  const status = weightedPick(STATUS_DISTRIBUTION);
  const amount = randomAmount();
  const externalRef = `REF${String(Math.floor(rnd() * 1_000_000)).padStart(6, '0')}`;

  return {
    idKey,
    provider,
    type,
    status,
    amount,
    currency: 'TZS',
    channel,
    occurredAt,
    createdAt: new Date(occurredAt.getTime() + Math.floor(rnd() * 30_000)),
    updatedAt: new Date(occurredAt.getTime() + Math.floor(rnd() * 45_000)),
    externalRef,
    reference: externalRef,
    receiptNumber: `RCPT${String(Math.floor(rnd() * 1_000_000)).padStart(6, '0')}`,
    counterpartyName: counterpart.name,
    counterpartyNumber: counterpart.msisdn,
    fromMsisdn: type === 'deposit' ? counterpart.msisdn : WALLET_MSISDN,
    toMsisdn: type === 'deposit' ? WALLET_MSISDN : counterpart.msisdn,
    walletMsisdn: WALLET_MSISDN,
    location: pick(LOCATIONS),
    description: purpose.description,
    category: purpose.category,
    initiatedBy: channel === 'Agent' ? 'Field Agent' : channel === 'API' ? 'Integration' : 'Customer',
    tags: [provider, type, channel, purpose.category],
    fee: 0,
    feeCurrency: 'TZS',
    totalDebit: 0,
    totalCredit: 0,
    netAmount: 0,
    balanceBefore: 0,
    balanceAfter: 0,
    statusDetail: status === 'SUCCESS' ? 'Settled' : status === 'PENDING' ? 'Awaiting confirmation' : 'Declined by provider',
    metadata: {
      channelReference: `CH-${externalRef}`,
      settlementBatch: `BATCH-${String(Math.floor(rnd() * 9999)).padStart(4, '0')}`,
      deviceId: `device-${1 + Math.floor(rnd() * 3)}`
    }
  };
}

function applyLedger(tx, runningBalance) {
  const isSuccessful = tx.status === 'SUCCESS';
  tx.balanceBefore = Math.max(0, Math.round(runningBalance));

  if (!isSuccessful) {
    tx.balanceAfter = tx.balanceBefore;
    tx.fee = 0;
    tx.netAmount = 0;
    tx.totalCredit = 0;
    tx.totalDebit = 0;
    return runningBalance;
  }

  if (tx.type === 'deposit') {
    tx.fee = computeDepositFee(tx.amount);
    tx.totalCredit = tx.amount;
    tx.totalDebit = 0;
    tx.netAmount = tx.amount - tx.fee;
    tx.balanceAfter = tx.balanceBefore + tx.netAmount;
    tx.statusDetail = 'Credited successfully';
  } else {
    const fee = computeWithdrawalFee(tx.amount);
    const totalDebit = tx.amount + fee;
    if (runningBalance < totalDebit) {
      // Not enough funds, flip to deposit so balances remain positive
      tx.type = 'deposit';
      tx.fee = computeDepositFee(tx.amount);
      tx.totalCredit = tx.amount;
      tx.totalDebit = 0;
      tx.netAmount = tx.amount - tx.fee;
      tx.toMsisdn = WALLET_MSISDN;
      tx.fromMsisdn = tx.counterpartyNumber;
      tx.statusDetail = 'Auto adjusted to top-up';
      tx.balanceAfter = tx.balanceBefore + tx.netAmount;
    } else {
      tx.fee = fee;
      tx.totalDebit = totalDebit;
      tx.totalCredit = 0;
      tx.netAmount = tx.amount;
      tx.balanceAfter = tx.balanceBefore - totalDebit;
      tx.statusDetail = 'Completed payout';
    }
  }

  tx.feeCurrency = tx.currency;
  tx.balanceAfter = Math.max(0, Math.round(tx.balanceAfter));
  tx.summary = `${tx.type === 'deposit' ? 'Credit' : 'Debit'} ${tx.amount.toLocaleString('en-US')} ${tx.currency} via ${tx.channel}`;
  return tx.balanceAfter;
}

function generateTransactions(count = 240, startingBalance = 550_000) {
  const now = Date.now();
  const items = [];
  for (let i = 0; i < count; i++) {
    const offsetMs = Math.floor(rnd() * 7 * 24 * 3600 * 1000); // last 7 days
    const jitter = Math.floor(rnd() * 3600 * 1000);
    const occurredAt = new Date(now - offsetMs - jitter);
    items.push(createSkeleton(`demo_${String(i + 1).padStart(5, '0')}`, occurredAt));
  }

  // Oldest first for ledger calculation
  items.sort((a, b) => a.occurredAt - b.occurredAt);
  let running = startingBalance;
  for (const tx of items) {
    running = applyLedger(tx, running);
  }

  // Latest first for UI consumption
  items.sort((a, b) => b.occurredAt - a.occurredAt);
  return { items, runningBalance: running, nextId: count + 1 };
}

function generateDevices() {
  const now = Date.now();
  return [
    {
      id: 'device-1',
      provider: 'M-Pesa',
      online: true,
      queueSize: 2,
      battery: '82%',
      lastHeartbeatAt: new Date(now - 25_000),
      signal: -72,
      appVersion: '1.4.2',
      location: 'Dar es Salaam'
    },
    {
      id: 'device-2',
      provider: 'Airtel',
      online: true,
      queueSize: 0,
      battery: '65%',
      lastHeartbeatAt: new Date(now - 12_000),
      signal: -68,
      appVersion: '1.4.2',
      location: 'Arusha'
    },
    {
      id: 'device-3',
      provider: 'Tigo',
      online: false,
      queueSize: 0,
      battery: '—',
      lastHeartbeatAt: new Date(now - 420_000),
      signal: null,
      appVersion: '1.3.9',
      location: 'Mwanza'
    }
  ];
}

function generateIntegrations() {
  const now = new Date();
  return [
    {
      id: 'demo-int-mtn',
      name: 'MTN Network Connector (Demo)',
      providerType: 'generic-rest',
      enabled: true,
      status: 'OK',
      pollIntervalSec: 60,
      config: { baseUrl: 'https://mtn.mock/demo', apiKey: 'mtn-demo-key' },
      lastRunAt: new Date(now.getTime() - 2 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 2 * 60 * 1000),
      createdAt: new Date(now.getTime() - 10 * 24 * 3600 * 1000)
    },
    {
      id: 'demo-int-airtel',
      name: 'Airtel Network Connector (Demo)',
      providerType: 'generic-rest',
      enabled: true,
      status: 'OK',
      pollIntervalSec: 75,
      config: { baseUrl: 'https://airtel.mock/demo', apiKey: 'airtel-demo-key' },
      lastRunAt: new Date(now.getTime() - 5 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 5 * 60 * 1000),
      createdAt: new Date(now.getTime() - 12 * 24 * 3600 * 1000)
    },
    {
      id: 'demo-int-1',
      name: 'Demo REST Connector',
      providerType: 'generic-rest',
      enabled: true,
      status: 'IDLE',
      pollIntervalSec: 60,
      config: { baseUrl: 'mock:demo', apiKey: 'demo-key-1' },
      lastRunAt: new Date(now.getTime() - 6 * 60 * 1000),
      updatedAt: now,
      createdAt: new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    },
    {
      id: 'demo-int-2',
      name: 'Merchant Settlements',
      providerType: 'generic-rest',
      enabled: true,
      status: 'OK',
      pollIntervalSec: 120,
      config: { baseUrl: 'mock:merchant', apiKey: 'merchant-456' },
      lastRunAt: new Date(now.getTime() - 18 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 18 * 60 * 1000),
      createdAt: new Date(now.getTime() - 14 * 24 * 3600 * 1000)
    },
    {
      id: 'demo-int-3',
      name: 'Bank Transfers',
      providerType: 'generic-rest',
      enabled: false,
      status: 'PAUSED',
      pollIntervalSec: 300,
      config: { baseUrl: 'mock:bank', apiKey: 'bank-999' },
      lastRunAt: new Date(now.getTime() - 36 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 36 * 60 * 1000),
      createdAt: new Date(now.getTime() - 21 * 24 * 3600 * 1000)
    }
  ];
}

const initial = generateTransactions(240);

export const demoState = {
  transactions: initial.items,
  runningBalance: initial.runningBalance,
  devices: generateDevices(),
  integrations: generateIntegrations(),
  nextId: initial.nextId
};

function filterTransactions(items, { provider, type, status, from, to }) {
  return items.filter((t) => {
    if (provider && t.provider !== provider) return false;
    if (type && t.type !== type) return false;
    if (status && t.status !== status) return false;
    if (from && t.occurredAt < new Date(from)) return false;
    if (to && t.occurredAt > new Date(to)) return false;
    return true;
  });
}

function buildSummary(items, { from, to, provider, type, status }) {
  const fromD = new Date(from);
  const toD = new Date(to);
  const days = [];
  for (let d = startOfDayKampala(fromD); d <= endOfDayKampala(toD); d.setDate(d.getDate() + 1)) {
    days.push(formatDailyBucket(new Date(d)));
  }
  const map = new Map(days.map((b) => [b, { depositCount: 0, depositSum: 0, withdrawalCount: 0, withdrawalSum: 0 }]));
  for (const tx of items) {
    if (tx.occurredAt < fromD || tx.occurredAt > toD) continue;
    if (provider && tx.provider !== provider) continue;
    if (type && tx.type !== type) continue;
    // By default include only SUCCESS, but honor explicit status filter
    if (status) {
      if (tx.status !== status) continue;
    } else {
      if (tx.status !== 'SUCCESS') continue;
    }
    const bucket = formatDailyBucket(tx.occurredAt);
    const agg = map.get(bucket);
    if (!agg) continue;
    if (tx.type === 'deposit') {
      agg.depositCount++;
      agg.depositSum += tx.amount;
    } else if (tx.type === 'withdrawal') {
      agg.withdrawalCount++;
      agg.withdrawalSum += tx.amount;
    }
  }
  return Array.from(map.entries()).map(([bucket, v]) => ({ bucket, ...v }));
}

export function getTransactions(query) {
  return filterTransactions(demoState.transactions, query || {});
}

export function getSummary(query) {
  return buildSummary(filterTransactions(demoState.transactions, query || {}), query || {});
}

export function getDevices() {
  return demoState.devices;
}

export function getIntegrations() {
  return demoState.integrations;
}

export function addIntegration(data) {
  const now = new Date();
  const id = `demo-int-${demoState.integrations.length + 1}`;
  const integ = {
    id,
    name: data?.name || `Integration ${demoState.integrations.length + 1}`,
    providerType: data?.providerType || 'generic-rest',
    enabled: data?.enabled ?? false,
    status: data?.enabled ? 'IDLE' : 'PAUSED',
    pollIntervalSec: data?.pollIntervalSec ?? 120,
    config: data?.config || { baseUrl: 'mock:new', apiKey: `auto-${id}` },
    createdAt: now,
    updatedAt: now,
    lastRunAt: null
  };
  demoState.integrations.unshift(integ);
  return integ;
}

export function testIntegration() {
  return { ok: true, latencyMs: Math.round(rnd() * 1200) + 80 };
}

export function runIntegrationOnce() {
  const upserted = Math.floor(rnd() * 8) + 1;
  return { ok: true, upserted };
}

function createRealtimeTransaction() {
  const occurredAt = new Date();
  const tx = createSkeleton(`demo_${String(demoState.nextId++).padStart(5, '0')}`, occurredAt);
  demoState.runningBalance = applyLedger(tx, demoState.runningBalance);
  tx.createdAt = new Date(occurredAt.getTime() + 2_000);
  tx.updatedAt = new Date();
  return tx;
}

let genTimer = null;
let cleanupTimer = null;

export function startDemoFlow({ genIntervalMs = 5000, cleanupIntervalMs = 15000, ttlMs = 3600000 } = {}) {
  if (!genTimer) {
    genTimer = setInterval(() => {
      const count = 1 + Math.floor(rnd() * 3);
      const batch = [];
      for (let i = 0; i < count; i++) {
        batch.push(createRealtimeTransaction());
      }
      demoState.transactions.unshift(...batch);
      broadcast('tx:new', { count });
    }, genIntervalMs);
  }

  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - ttlMs;
      const before = demoState.transactions.length;
      demoState.transactions = demoState.transactions.filter((t) => t.occurredAt.getTime() >= cutoff);
      const removed = before - demoState.transactions.length;
      if (removed > 0) broadcast('tx:cleanup', { removed });
    }, cleanupIntervalMs);
  }
}

export function stopDemoFlow() {
  if (genTimer) {
    clearInterval(genTimer);
    genTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
