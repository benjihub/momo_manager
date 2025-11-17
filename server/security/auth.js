import session from 'express-session';
import express from 'express';
import { ENV } from '../env.js';

const SESSION_NAME = 'momo.sid';
const PUBLIC_PATHS = new Set(['/login', '/healthz']);

export function configureAuth(app) {
  app.use(session({
    name: SESSION_NAME,
    secret: ENV.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: ENV.COOKIE_SECURE
    }
  }));
  app.use(express.urlencoded({ extended: true }));
}

export function registerAuthRoutes(app) {
  app.get('/login', (req, res) => {
    if (req.session?.user) {
      return res.redirect('/');
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderLogin());
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const isValid = username === ENV.AUTH_USERNAME && password === ENV.AUTH_PASSWORD;
    if (!isValid) {
      res.status(401).type('html').send(renderLogin('Invalid username or password.'));
      return;
    }
    req.session.regenerate((err) => {
      if (err) {
        res.status(500).type('html').send(renderLogin('Unable to create session, please try again.'));
        return;
      }
      req.session.user = { username };
      res.redirect('/');
    });
  });

  app.post('/logout', (req, res) => {
    const done = () => {
      res.clearCookie(SESSION_NAME, { path: '/', sameSite: 'lax', secure: ENV.COOKIE_SECURE });
      res.redirect('/login');
    };
    if (!req.session) {
      done();
      return;
    }
    req.session.destroy(() => done());
  });
}

export function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }
  if (PUBLIC_PATHS.has(req.path)) {
    return next();
  }
  if (req.path.startsWith('/login')) {
    return next();
  }
  if (req.session?.user) {
    return next();
  }
  if (req.accepts('html')) {
    return res.redirect('/login');
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function renderLogin(errorMessage = '') {
  const errorBlock = errorMessage
    ? `<div class="error">${escapeHtml(errorMessage)}</div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MoMo Monitor • Login</title>
  <style>
    :root { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f7fb; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: radial-gradient(circle at top, #eef2ff, #f9fafb); }
    .card { width: min(90vw, 420px); background: #fff; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 25px 60px rgba(15, 23, 42, 0.12); border: 1px solid rgba(226, 232, 240, 0.8); }
    .logo { width: 3rem; height: 3rem; border-radius: 1rem; display: grid; place-items: center; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #fff; margin-bottom: 1.25rem; }
    h1 { margin: 0 0 0.25rem 0; font-size: 1.5rem; color: #0f172a; }
    p { margin: 0; color: #475569; font-size: 0.95rem; }
    form { margin-top: 1.75rem; display: flex; flex-direction: column; gap: 1rem; }
    label { font-size: 0.85rem; font-weight: 600; color: #475569; display: flex; flex-direction: column; gap: 0.45rem; }
    input { padding: 0.85rem 1rem; border-radius: 0.9rem; border: 1px solid rgba(148, 163, 184, 0.4); font-size: 1rem; transition: border-color 0.2s, box-shadow 0.2s; }
    input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
    button { margin-top: 0.5rem; padding: 0.9rem 1rem; border-radius: 0.95rem; border: none; font-weight: 600; font-size: 1rem; background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
    button:hover { transform: translateY(-1px); box-shadow: 0 15px 30px rgba(37, 99, 235, 0.25); }
    .error { padding: 0.85rem 1rem; border-radius: 0.9rem; background: rgba(239, 68, 68, 0.08); color: #b91c1c; font-weight: 500; border: 1px solid rgba(248, 113, 113, 0.4); margin-bottom: 1rem; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.9)" />
        <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" stroke="rgba(255,255,255,0.9)" />
      </svg>
    </div>
    <h1>Sign in</h1>
    <p>Enter your admin credentials to access the dashboard.</p>
    ${errorBlock}
    <form method="post" action="/login">
      <label>Username
        <input name="username" placeholder="admin" autocomplete="username" required />
      </label>
      <label>Password
        <input type="password" name="password" placeholder="••••••••" autocomplete="current-password" required />
      </label>
      <button type="submit">Continue</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(input) {
  return String(input).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}
