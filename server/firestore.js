import admin from 'firebase-admin';
import { ENV } from './env.js';
import { logger } from './logger.js';

let app;
if (!admin.apps.length) {
  const credPath = ENV.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: ENV.FIREBASE_PROJECT_ID
    });
  } catch (e) {
    logger.error({ err: e }, 'Failed default credentials, trying from file');
    const serviceAccount = JSON.parse(
      await (await import('node:fs/promises')).readFile(new URL(`../${credPath}`, import.meta.url), 'utf8')
    );
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

export const col = {
  devices: () => db.collection('devices'),
  transactions: () => db.collection('transactions'),
  ingestEvents: () => db.collection('ingest_events'),
  integrations: () => db.collection('integrations'),
  rollupsDaily: () => db.collection('rollups_daily'),
  rollupsWeekly: () => db.collection('rollups_weekly'),
  rollupsMonthly: () => db.collection('rollups_monthly')
};

