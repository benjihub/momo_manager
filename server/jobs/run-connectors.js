import cron from 'node-cron';
import { col, Timestamp } from '../firestore.js';
import { logger } from '../logger.js';
import { buildIdKey } from '../utils/idempotency.js';
import { broadcast } from '../sse.js';
import generic from '../connectors/generic-rest.js';

const connectors = { [generic.key]: generic };

export function startConnectorsScheduler() {
  // Every minute
  cron.schedule('* * * * *', async () => {
    await runOnce();
  });
}

export async function runOnce() {
  const snap = await col.integrations().where('enabled', '==', true).get();
  for (const doc of snap.docs) {
    const integ = doc.data();
    try {
      await runIntegration(doc.id, integ);
    } catch (e) {
      logger.error({ err: e, id: doc.id }, 'Integration run failed');
    }
  }
}

export async function runIntegration(id, integ) {
  const connector = connectors[integ.providerType];
  if (!connector) throw new Error(`Unknown connector ${integ.providerType}`);
  const since = integ.lastRunAt?.toDate?.() || new Date(Date.now() - 24 * 3600 * 1000);
  const until = new Date();
  const events = await connector.fetchSince({ config: integ.config || {}, sinceIso: since.toISOString(), untilIso: until.toISOString() });

  let upserted = 0;
  for (const ev of events) {
    const occurredAtIso = ev.occurred_at;
    const idKey = buildIdKey({ provider: ev.provider, externalRef: ev.external_ref, rawText: ev.raw_text || '', occurredAtIso });
    const txRef = col.transactions().doc(idKey);
    await txRef.set({
      idKey,
      provider: ev.provider,
      type: ev.direction === 'deposit' ? 'deposit' : 'withdrawal',
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
    }, { merge: true });
    upserted++;
    broadcast('tx:new', { idKey });
  }

  await col.integrations().doc(id).set({ status: 'OK', lastRunAt: Timestamp.now(), updatedAt: Timestamp.now() }, { merge: true });
  broadcast('integrations:run', { id, upserted });
  return upserted;
}

