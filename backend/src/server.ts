import { createServer } from './middleware/setup.js';
import { getDb } from './db/client.js';
import { projectsRoutes } from './routes/projects.js';
import { targetReposRoutes } from './routes/targetRepos.js';
import { changesetsRoutes } from './routes/changesets.js';
import { diffsRoutes } from './routes/diffs.js';
import { agentRunsRoutes } from './routes/agentRuns.js';
import { importsRoutes } from './routes/imports.js';
import { reviewRoutes } from './routes/reviews.js';
import { workitemsRoutes } from './routes/workitems.js';
import { runMigrations } from './db/migrations.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  const server = await createServer();

  // Run database migrations on startup
  await runMigrations();

  server.get('/health', async (request, reply) => {
    await getDb();
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await server.register(projectsRoutes);
  await server.register(targetReposRoutes);
  await server.register(changesetsRoutes);
  await server.register(diffsRoutes);
  await server.register(agentRunsRoutes);
  await server.register(importsRoutes);
  await server.register(reviewRoutes);
  await server.register(workitemsRoutes);

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

start();
