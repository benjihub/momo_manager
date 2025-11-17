import express from 'express';
import { addClient } from '../sse.js';

export const liveRouter = express.Router();

liveRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  addClient(res);
});

export default liveRouter;

