import './env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { ENV } from './env.js';
import { logger } from './logger.js';
// Firestore-backed modules are conditionally imported (only when not in DEMO)
import { demoApiRouter, demoIntegrationsRouter } from './routes/demo.js';
import { startDemoFlow } from './demo/data.js';
import liveRouter from './routes/live.js';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { configureAuth, registerAuthRoutes, requireAuth } from './security/auth.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: ENV.CORS_ORIGIN, credentials: true }));
app.use(compression());
configureAuth(app);
registerAuthRoutes(app);

// Ingest limiter will be applied only when mounting real ingest routes

// Static
// Compute __dirname from import.meta.url in a cross-platform way
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

// Health endpoint remains open for uptime checks
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Require authentication for everything else (static + APIs)
app.use(requireAuth);

app.use('/', express.static(publicDir));

// Routes
if (ENV.DEMO) {
  // Mount demo endpoints under the same paths used by the UI
  app.use('/api', demoApiRouter);
  app.use('/integrations', demoIntegrationsRouter);
  // Start demo data generator and cleanup
  startDemoFlow();
} else {
  // Dynamically import Firestore-dependent modules only in non-demo mode
  await import('./firestore.js');
  const [apiMod, ingestMod, integMod, connMod, rollMod] = await Promise.all([
    import('./routes/api.js'),
    import('./routes/ingest.js'),
    import('./routes/integrations.js'),
    import('./jobs/run-connectors.js'),
    import('./jobs/build-rollups.js')
  ]);
  const apiRouter = apiMod.default || apiMod.apiRouter || apiMod;
  const ingestRouter = ingestMod.default || ingestMod.ingestRouter || ingestMod;
  const integrationsRouter = integMod.default || integMod.integrationsRouter || integMod;
  app.use('/api', apiRouter);
  // Apply ingest limiter only when mounting ingest routes
  const ingestLimiter = rateLimit({ windowMs: 60_000, limit: 60 });
  app.use('/ingest', ingestLimiter, ingestRouter);
  app.use('/integrations', integrationsRouter);
  // Start cron jobs
  const startConnectorsScheduler = connMod.startConnectorsScheduler;
  const startRollupsScheduler = rollMod.startRollupsScheduler;
  startConnectorsScheduler?.();
  startRollupsScheduler?.();
}
app.use('/live', liveRouter);

// Cron jobs handled above in non-demo mode

app.listen(ENV.PORT, () => {
  logger.info(`Server listening on http://localhost:${ENV.PORT}`);
});

