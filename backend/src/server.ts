import { createServer } from './middleware/setup.js';
import { getDb } from './db/client.js';
import { projectsRoutes } from './routes/projects.js';
import { targetReposRoutes } from './routes/targetRepos.js';
import { pullRequestsRoutes } from './routes/pullRequests.js';
import { agentRunsRoutes } from './routes/agentRuns.js';
import { reviewRoutes } from './routes/reviews.js';
import { workitemsRoutes } from './routes/workitems.js';
import { runMigrations } from './db/migrations.js';
import { modelsCache } from './services/ModelsCache.js';

const PORT = parseInt(process.env.PORT || '11031', 10);
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  const server = await createServer();

  // Run database migrations on startup
  await runMigrations();

  // Initialize models cache in the background
  // This runs asynchronously and doesn't block server startup
  // Initialize cache for both available agents
  void modelsCache.initialize('opencode');
  void modelsCache.initialize('claudecode');

  server.get('/health', async () => {
    await getDb();
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await server.register(projectsRoutes);
  await server.register(targetReposRoutes);
  await server.register(pullRequestsRoutes);
  await server.register(agentRunsRoutes);
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
