import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

const envPath = new URL('../.env', import.meta.url).pathname;
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const demoFlag = process.env.DEMO;
const demoEnabled = demoFlag === undefined ? true : String(demoFlag).toLowerCase() === 'true';
const cookieSecureFlag = process.env.COOKIE_SECURE;
const cookieSecure = cookieSecureFlag ? String(cookieSecureFlag).toLowerCase() === 'true' : false;

const sessionSecret = process.env.SESSION_SECRET || 'momo-monitor-secret';
const authUsername = process.env.ADMIN_USERNAME || 'admin';
const authPassword = process.env.ADMIN_PASSWORD || 'changeme';

export const ENV = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 8080,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:8080',
  HMAC_SKEW_SECONDS: process.env.HMAC_SKEW_SECONDS ? Number(process.env.HMAC_SKEW_SECONDS) : 120,
  TZ: process.env.TZ || 'Africa/Kampala',
  DEMO: demoEnabled,
  SESSION_SECRET: sessionSecret,
  AUTH_USERNAME: authUsername,
  AUTH_PASSWORD: authPassword,
  COOKIE_SECURE: cookieSecure
};

// Set process TZ early for date math
if (ENV.TZ) {
  process.env.TZ = ENV.TZ;
}

