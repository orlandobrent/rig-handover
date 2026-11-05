import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { mountDigestApi } from './digest/api.js';
import { mountDigestPage } from './digest/page.js';
import { readNight } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) => {
    const status = readStatus(config);
    const nightEntries = status.nights.map((night) => ({
      night,
      counts: readNight(config.runsDir, night).counts,
    }));
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} nightEntries={nightEntries} />
      </Layout>,
    );
  });

  mountDigestPage(app, config);
  mountDigestApi(app, config);

  return app;
}
