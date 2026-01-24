import { createServer } from './middleware/setup.js';
import { getDb } from './db/client.js';
import { projectsRoutes } from './routes/projects.js';
import { pullRequestsRoutes } from './routes/pullRequests.js';
import { agentRunsRoutes } from './routes/agentRuns.js';
import { reviewRoutes } from './routes/reviews.js';
import { workitemsRoutes } from './routes/workitems.js';
import { workflowRoutes } from './routes/workflows.js';
import { searchRoutes } from './routes/search.js';
import { runMigrations } from './db/migrations.js';
import { modelsCache } from './services/ModelsCache.js';
// Import workflowExecutionService early to ensure event handlers are registered
import './services/WorkflowExecutionService.js';

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

  // Recover interrupted workflow runs on startup
  const { workflowExecutionService } = await import('./services/WorkflowExecutionService.js');
  void workflowExecutionService.recoverInterruptedRuns();

  // Recover interrupted agent runs on startup
  const { agentRunRecoveryService } = await import('./services/AgentRunRecoveryService.js');
  void agentRunRecoveryService.recoverInterruptedRuns();

  server.get('/health', async () => {
    await getDb();
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await server.register(projectsRoutes);
  await server.register(pullRequestsRoutes);
  await server.register(agentRunsRoutes);
  await server.register(reviewRoutes);
  await server.register(workitemsRoutes);
  await server.register(workflowRoutes);
  await server.register(searchRoutes);

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

start();
