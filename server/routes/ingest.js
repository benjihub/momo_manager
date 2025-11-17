import express from 'express';
import { verifyHmac, isFresh } from '../security/hmac.js';
import { col, Timestamp } from '../firestore.js';
import { buildIdKey } from '../utils/idempotency.js';
import { broadcast } from '../sse.js';

export const ingestRouter = express.Router();

// Batch ingest from phone bridge (optional)
ingestRouter.post('/transactions/batch', express.text({ type: '*/*' }), async (req, res) => {
  const signature = req.header('X-Signature');
  const ts = req.header('X-Timestamp');
  const deviceId = req.header('X-Device-Id');
  const secret = 'device-shared-secret'; // Replace with per-device secret lookups

  if (!isFresh(Number(ts)) || !verifyHmac(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const batch = JSON.parse(req.body);
  const events = batch.events || [];
  const writes = [];
  for (const ev of events) {
    const occurredAtIso = ev.occurred_at;
    const idKey = buildIdKey({ provider: ev.provider, externalRef: ev.external_ref, rawText: ev.raw_text || '', occurredAtIso });
    const txRef = col.transactions().doc(idKey);
    writes.push(txRef.set({
      idKey,
      provider: ev.provider,
      type: ev.direction,
      amount: Number(ev.amount),
      currency: ev.currency || 'UGX',
      fromMsisdn: ev.from_msisdn || null,
      toMsisdn: ev.to_msisdn || null,
      externalRef: ev.external_ref || null,
      status: 'SUCCESS',
      reasonCode: null,
      occurredAt: new Date(occurredAtIso),
      rawPayload: ev,
      createdAt: Timestamp.now()
    }, { merge: true }));
  }
  await Promise.all(writes);
  await col.ingestEvents().add({ deviceId, size: events.length, payload: batch, createdAt: Timestamp.now() });
  broadcast('tx:new', { size: events.length });
  res.json({ ok: true, upserted: events.length });
});

ingestRouter.post('/heartbeat', express.json(), async (req, res) => {
  const { deviceId, provider, battery = null, queueSize = 0 } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  await col.devices().doc(deviceId).set({ provider, battery, queueSize, lastHeartbeatAt: Timestamp.now(), updatedAt: Timestamp.now(), createdAt: Timestamp.now() }, { merge: true });
  broadcast('device:heartbeat', { deviceId });
  res.json({ ok: true });
});

export default ingestRouter;

