import cron from 'node-cron';
import { col, Timestamp } from '../firestore.js';
import { startOfDayKampala, endOfDayKampala, formatDailyBucket } from '../utils/time.js';
import { broadcast } from '../sse.js';

export function startRollupsScheduler() {
  // Run daily at 00:05 Africa/Kampala. Since process TZ is set to Africa/Kampala, use 5 minutes after midnight.
  cron.schedule('5 0 * * *', async () => {
    const yday = new Date(Date.now() - 24 * 3600 * 1000);
    await buildDailyRollupFor(yday);
  });
}

export async function buildDailyRollupFor(dayDate) {
  const from = startOfDayKampala(dayDate);
  const to = endOfDayKampala(dayDate);
  const bucket = formatDailyBucket(dayDate);

  const q = col.transactions()
    .where('occurredAt', '>=', from)
    .where('occurredAt', '<=', to);
  const snap = await q.get();

  const totalsByProvider = {};
  const totalsAll = { depositCount: 0, depositSum: 0, withdrawalCount: 0, withdrawalSum: 0 };

  for (const doc of snap.docs) {
    const t = doc.data();
    const prov = t.provider || 'UNKNOWN';
    totalsByProvider[prov] ||= { depositCount: 0, depositSum: 0, withdrawalCount: 0, withdrawalSum: 0 };
    if (t.type === 'deposit') {
      totalsByProvider[prov].depositCount++;
      totalsByProvider[prov].depositSum += Number(t.amount || 0);
      totalsAll.depositCount++;
      totalsAll.depositSum += Number(t.amount || 0);
    } else if (t.type === 'withdrawal') {
      totalsByProvider[prov].withdrawalCount++;
      totalsByProvider[prov].withdrawalSum += Number(t.amount || 0);
      totalsAll.withdrawalCount++;
      totalsAll.withdrawalSum += Number(t.amount || 0);
    }
  }

  await col.rollupsDaily().doc(bucket).set({
    bucket,
    totalsByProvider,
    totalsAll,
    updatedAt: Timestamp.now()
  }, { merge: true });

  broadcast('rollups:updated', { bucket });
}

