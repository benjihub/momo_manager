import express from 'express';
import { csvStream } from '../utils/csv.js';
import { getTransactions, getSummary, getDevices, getIntegrations, addIntegration, testIntegration, runIntegrationOnce } from '../demo/data.js';

export const demoApiRouter = express.Router();

// Transactions
demoApiRouter.get('/transactions', (req, res) => {
  const { provider, type, status, from, to, limit = '50' } = req.query;
  const items = getTransactions({ provider, type, status, from, to });
  const n = Number(limit);
  const out = items.slice(0, Number.isFinite(n) ? n : 50).map((t) => ({ ...t }));
  res.json({ items: out, nextCursor: null });
});

demoApiRouter.get('/transactions/:idKey', (req, res) => {
  const items = getTransactions({});
  const one = items.find((t) => t.idKey === req.params.idKey);
  if (!one) return res.status(404).json({ error: 'Not found' });
  res.json(one);
});

// Devices
demoApiRouter.get('/devices', (req, res) => {
  res.json({ items: getDevices() });
});

// Reports summary
demoApiRouter.get('/reports/summary', (req, res) => {
  const { from, to, provider, type, status } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const out = getSummary({ from, to, provider, type, status });
  res.json(out);
});

// CSV export
demoApiRouter.get('/reports/export.csv', (req, res) => {
  const { provider, type, status, from, to } = req.query;
  const items = getTransactions({ provider, type, status, from, to });
  const headers = ['idKey','provider','type','amount','currency','fromMsisdn','toMsisdn','externalRef','status','occurredAt'];
  async function* rows() {
    for (const t of items) {
      yield [t.idKey, t.provider, t.type, t.amount, t.currency, t.fromMsisdn, t.toMsisdn, t.externalRef, t.status, t.occurredAt.toISOString()];
    }
  }
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');
  csvStream(res, headers, rows());
});

// Integrations (demo)
export const demoIntegrationsRouter = express.Router();

demoIntegrationsRouter.get('/', (req, res) => {
  res.json(getIntegrations());
});

demoIntegrationsRouter.post('/', express.json(), (req, res) => {
  const { name, providerType = 'generic-rest', enabled = false, pollIntervalSec = 60, config = {} } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const data = addIntegration({ name, providerType, enabled, pollIntervalSec, config });
  res.json(data);
});

demoIntegrationsRouter.post('/:id/test', (req, res) => {
  res.json(testIntegration());
});

demoIntegrationsRouter.post('/:id/run', (req, res) => {
  res.json(runIntegrationOnce());
});

export default demoApiRouter;
