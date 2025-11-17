import express from 'express';
import rateLimit from 'express-rate-limit';
import { col, Timestamp } from '../firestore.js';
import { logger } from '../logger.js';
import generic from '../connectors/generic-rest.js';
import { runIntegration } from '../jobs/run-connectors.js';

const connectors = { [generic.key]: generic };

export const integrationsRouter = express.Router();

integrationsRouter.get('/', async (req, res) => {
  const snap = await col.integrations().orderBy('updatedAt', 'desc').get();
  res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});

integrationsRouter.post('/', express.json(), async (req, res) => {
  const { id, name, providerType, enabled = false, pollIntervalSec = 60, config = {} } = req.body || {};
  if (!name || !providerType) return res.status(400).json({ error: 'name and providerType required' });
  if (!connectors[providerType]) return res.status(400).json({ error: 'Unknown providerType' });
  const ref = id ? col.integrations().doc(id) : col.integrations().doc();
  const data = { name, providerType, enabled, pollIntervalSec, config, status: 'IDLE', updatedAt: Timestamp.now(), createdAt: Timestamp.now() };
  await ref.set(data, { merge: true });
  res.json({ id: ref.id, ...data });
});

integrationsRouter.post('/:id/test', async (req, res) => {
  const doc = await col.integrations().doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'Not found' });
  const integ = doc.data();
  const conn = connectors[integ.providerType];
  try {
    const out = await conn.testConnection(integ.config || {});
    res.json(out);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const runLimiter = rateLimit({ windowMs: 60_000, limit: 5 });
integrationsRouter.post('/:id/run', runLimiter, async (req, res) => {
  const doc = await col.integrations().doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'Not found' });
  const integ = doc.data();
  try {
    const count = await runIntegration(doc.id, integ);
    res.json({ ok: true, upserted: count });
  } catch (e) {
    logger.error(e);
    await col.integrations().doc(doc.id).set({ status: 'ERROR', updatedAt: Timestamp.now() }, { merge: true });
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default integrationsRouter;

