import express from 'express';
import { col } from '../firestore.js';
import { csvStream } from '../utils/csv.js';
import { startOfDayKampala, endOfDayKampala, isAlignedFullDays, formatDailyBucket } from '../utils/time.js';

export const apiRouter = express.Router();

// List transactions
apiRouter.get('/transactions', async (req, res) => {
  const { provider, type, status, from, to, limit = '50', cursor } = req.query;
  let q = col.transactions().orderBy('occurredAt', 'desc');
  if (provider) q = q.where('provider', '==', provider);
  if (type) q = q.where('type', '==', type);
  if (status) q = q.where('status', '==', status);
  if (from) q = q.where('occurredAt', '>=', new Date(from));
  if (to) q = q.where('occurredAt', '<=', new Date(to));
  if (cursor) q = q.startAfter(new Date(cursor));
  const snap = await q.limit(Number(limit)).get();
  const items = snap.docs.map((d) => ({ idKey: d.id, ...d.data() }));
  const nextCursor = items.length ? items[items.length - 1].occurredAt.toDate?.()?.toISOString?.() || items[items.length - 1].occurredAt.toISOString?.() : null;
  res.json({ items, nextCursor });
});

apiRouter.get('/transactions/:idKey', async (req, res) => {
  const doc = await col.transactions().doc(req.params.idKey).get();
  if (!doc.exists) return res.status(404).json({ error: 'Not found' });
  res.json({ idKey: doc.id, ...doc.data() });
});

// Devices
apiRouter.get('/devices', async (req, res) => {
  const snap = await col.devices().get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const now = Date.now();
  items.forEach((d) => {
    const hb = d.lastHeartbeatAt?.toDate?.()?.getTime?.() || new Date(d.lastHeartbeatAt || 0).getTime();
    d.online = hb && now - hb <= 120000;
  });
  res.json({ items });
});

// Reports summary
apiRouter.get('/reports/summary', async (req, res) => {
  const { granularity = 'daily', from, to, provider, type } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const aligned = granularity === 'daily' && isAlignedFullDays(from, to);
  if (aligned) {
    // Use daily rollups
    const fromD = startOfDayKampala(new Date(from));
    const toD = startOfDayKampala(new Date(to));
    const days = [];
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      days.push(formatDailyBucket(d));
    }
    const reads = await Promise.all(days.map((b) => col.rollupsDaily().doc(b).get()));
    const out = days.map((b, i) => {
      const data = reads[i].data() || { totalsAll: { depositCount: 0, depositSum: 0, withdrawalCount: 0, withdrawalSum: 0 } };
      let totals = data.totalsAll;
      if (provider && data.totalsByProvider?.[provider]) totals = data.totalsByProvider[provider];
      return { bucket: b, ...totals };
    });
    return res.json(out);
  }

  // Otherwise compute from transactions
  const map = new Map();
  const q = col.transactions()
    .where('occurredAt', '>=', new Date(from))
    .where('occurredAt', '<=', new Date(to));
  const snap = await q.get();
  for (const doc of snap.docs) {
    const t = doc.data();
    if (provider && t.provider !== provider) continue;
    if (type && t.type !== type) continue;
    const bucket = formatDailyBucket(t.occurredAt.toDate?.() || t.occurredAt);
    const prev = map.get(bucket) || { depositCount: 0, depositSum: 0, withdrawalCount: 0, withdrawalSum: 0 };
    if (t.type === 'deposit') { prev.depositCount++; prev.depositSum += Number(t.amount || 0); }
    else if (t.type === 'withdrawal') { prev.withdrawalCount++; prev.withdrawalSum += Number(t.amount || 0); }
    map.set(bucket, prev);
  }
  const out = Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([bucket, v]) => ({ bucket, ...v }));
  res.json(out);
});

// CSV export
apiRouter.get('/reports/export.csv', async (req, res) => {
  const { provider, type, status, from, to } = req.query;
  let q = col.transactions().orderBy('occurredAt', 'desc');
  if (provider) q = q.where('provider', '==', provider);
  if (type) q = q.where('type', '==', type);
  if (status) q = q.where('status', '==', status);
  if (from) q = q.where('occurredAt', '>=', new Date(from));
  if (to) q = q.where('occurredAt', '<=', new Date(to));
  const snap = await q.limit(5000).get();
  const headers = ['idKey','provider','type','amount','currency','fromMsisdn','toMsisdn','externalRef','status','occurredAt'];
  async function* rows() {
    for (const d of snap.docs) {
      const t = d.data();
      yield [d.id, t.provider, t.type, t.amount, t.currency, t.fromMsisdn, t.toMsisdn, t.externalRef, t.status, (t.occurredAt.toDate?.() || t.occurredAt).toISOString()];
    }
  }
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');
  csvStream(res, headers, rows());
});

export default apiRouter;

