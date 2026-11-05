import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import { Layout } from '../views/layout.js';
import { DigestPage } from '../views/digest.js';
import { readNight } from './read.js';
import { NoRunLog } from './types.js';

export function mountDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    try {
      const digest = readNight(config.runsDir, night);
      return c.html(
        <Layout title="digest" lane={lane()}>
          <DigestPage night={night} digest={digest} />
        </Layout>,
      );
    } catch (err) {
      if (err instanceof NoRunLog) return c.notFound();
      throw err;
    }
  });
}
