import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read.js';
import { NoRunLog } from './types.js';

export function mountDigestApi(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    try {
      const digest = readNight(config.runsDir, night);
      return c.json(digest);
    } catch (err) {
      if (err instanceof NoRunLog) {
        return c.json({ error: 'not found' }, 404);
      }
      throw err;
    }
  });
}
