import { createServer } from './middleware/setup.js';
import { getDb } from './db/client.js';
import { projectsRoutes } from './routes/projects.js';
import { pullRequestsRoutes } from './routes/pullRequests.js';
import { agentRunsRoutes } from './routes/agentRuns.js';
import { reviewRoutes } from './routes/reviews.js';
import { workitemsRoutes } from './routes/workitems.js';
import { workflowRoutes } from './routes/workflows.js';
import { searchRoutes } from './routes/search.js';
import { settingsRoutes } from './routes/settings.js';
import { runMigrations } from './db/migrations.js';
import { modelsCache } from './services/ModelsCache.js';
import { projectsRepository } from './repositories/ProjectsRepository.js';
import { workflowsRepository } from './repositories/WorkflowsRepository.js';
import {
  createDefaultWorkflow,
  getDefaultWorkflowVersion,
  getWorkflowVersion,
} from './services/workflow/defaultWorkflow.js';
import { workflowExecutionService } from './services/workflow/WorkflowExecutionService.js';
import { agentRunRecoveryService } from './services/agent/AgentRunRecoveryService.js';

// Import workflowExecutionService early to ensure event handlers are registered
import './services/workflow/WorkflowExecutionService.js';

const PORT = parseInt(process.env.PORT || '11031', 10);
const HOST = process.env.HOST || '127.0.0.1';

/**
 * Scans all projects and creates/upgrades default workflows
 * - Creates default workflow if missing
 * - Upgrades default workflow if version is outdated
 *
 * To update the default workflow, simply increment workflowVersion in createDefaultWorkflow()
 */
async function ensureDefaultWorkflows() {
  try {
    const projects = await projectsRepository.findAll();
    const CURRENT_WORKFLOW_VERSION = getDefaultWorkflowVersion();

    for (const project of projects) {
      const currentWorkflowDefinition = createDefaultWorkflow(project.id);
      const defaultWorkflow = await workflowsRepository.findDefault(project.id);

      if (!defaultWorkflow) {
        // No default workflow exists, check if a workflow with the same name exists
        const existingWithSameName = await workflowsRepository.findByName(
          currentWorkflowDefinition.workflow.name,
          project.id
        );

        if (existingWithSameName) {
          // Workflow with same name exists but isn't default, update it to be default
          await workflowsRepository.update(existingWithSameName.id, {
            name: currentWorkflowDefinition.workflow.name,
            definition: currentWorkflowDefinition,
            isDefault: true,
            version: CURRENT_WORKFLOW_VERSION,
          });

          console.log(
            `Updated existing workflow ${existingWithSameName.id} to default v${CURRENT_WORKFLOW_VERSION} for project: ${project.name} (${project.id})`
          );
        } else {
          // No workflow with this name exists, create it
          try {
            await workflowsRepository.create({
              id: currentWorkflowDefinition.workflow.id,
              projectId: project.id,
              name: currentWorkflowDefinition.workflow.name,
              definition: currentWorkflowDefinition,
              isDefault: true,
              version: CURRENT_WORKFLOW_VERSION,
            });

            console.log(
              `Created default workflow v${CURRENT_WORKFLOW_VERSION} for project: ${project.name} (${project.id})`
            );
          } catch (error: any) {
            // If creation fails due to unique constraint, update existing workflow instead
            if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.message?.includes('UNIQUE')) {
              const existingWithSameName = await workflowsRepository.findByName(
                currentWorkflowDefinition.workflow.name,
                project.id
              );

              if (existingWithSameName) {
                await workflowsRepository.update(existingWithSameName.id, {
                  name: currentWorkflowDefinition.workflow.name,
                  definition: currentWorkflowDefinition,
                  isDefault: true,
                  version: CURRENT_WORKFLOW_VERSION,
                });

                console.log(
                  `Updated existing workflow ${existingWithSameName.id} to default v${CURRENT_WORKFLOW_VERSION} for project: ${project.name} (${project.id}) due to constraint`
                );
              } else {
                throw error; // Re-throw if we can't handle it
              }
            } else {
              throw error; // Re-throw non-constraint errors
            }
          }
        }
      } else {
        // Default workflow exists, check version
        // Get version from database column first, fallback to definition
        const dbVersion =
          defaultWorkflow.version || getWorkflowVersion(defaultWorkflow.definition) || 1;
        // Also check the definition's version to catch cases where column is outdated
        const definitionVersion = getWorkflowVersion(defaultWorkflow.definition);
        const needsUpdate =
          dbVersion < CURRENT_WORKFLOW_VERSION || definitionVersion < CURRENT_WORKFLOW_VERSION;

        if (needsUpdate) {
          // Version is outdated, update existing workflow
          const oldId = defaultWorkflow.id;
          const newId = currentWorkflowDefinition.workflow.id;

          // If ID changed (due to version change), handle migration carefully
          if (oldId !== newId) {
            // Check if workflow with new ID already exists
            const existingWithNewId = await workflowsRepository.findById(newId);

            if (existingWithNewId) {
              // New ID already exists, update it
              await workflowsRepository.update(newId, {
                name: currentWorkflowDefinition.workflow.name,
                definition: currentWorkflowDefinition,
                version: CURRENT_WORKFLOW_VERSION,
                isDefault: true,
              });

              // Preserve old workflow for traceability: mark it as non-default instead of deleting
              if (oldId !== newId) {
                await workflowsRepository.update(oldId, {
                  isDefault: false,
                });
              }
            } else {
              // Check if there's already a workflow with the same name for this project
              // (to avoid unique constraint violation on project_id + name)
              const existingWithSameName = await workflowsRepository.findByName(
                currentWorkflowDefinition.workflow.name,
                project.id
              );

              if (existingWithSameName && existingWithSameName.id !== oldId) {
                // Update the existing workflow with same name instead of creating new
                await workflowsRepository.update(existingWithSameName.id, {
                  name: currentWorkflowDefinition.workflow.name,
                  definition: currentWorkflowDefinition,
                  version: CURRENT_WORKFLOW_VERSION,
                  isDefault: true,
                });

                // Preserve old workflow: mark it as non-default instead of deleting
                await workflowsRepository.update(oldId, {
                  isDefault: false,
                });
              } else {
                // Safe to create new default workflow while preserving the old one
                // First mark old workflow as non-default
                await workflowsRepository.update(oldId, {
                  isDefault: false,
                });

                try {
                  await workflowsRepository.create({
                    id: newId,
                    projectId: project.id,
                    name: currentWorkflowDefinition.workflow.name,
                    definition: currentWorkflowDefinition,
                    isDefault: true,
                    version: CURRENT_WORKFLOW_VERSION,
                  });
                } catch (error: any) {
                  // If creation fails due to unique constraint, update existing workflow instead
                  if (
                    error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
                    error?.message?.includes('UNIQUE')
                  ) {
                    const existingWithSameName = await workflowsRepository.findByName(
                      currentWorkflowDefinition.workflow.name,
                      project.id
                    );

                    if (existingWithSameName) {
                      await workflowsRepository.update(existingWithSameName.id, {
                        name: currentWorkflowDefinition.workflow.name,
                        definition: currentWorkflowDefinition,
                        version: CURRENT_WORKFLOW_VERSION,
                        isDefault: true,
                      });

                      // Preserve old workflow if it's a different record by marking it non-default
                      if (existingWithSameName.id !== oldId) {
                        await workflowsRepository.update(oldId, {
                          isDefault: false,
                        });
                      }
                    } else {
                      throw error; // Re-throw if we can't handle it
                    }
                  } else {
                    throw error; // Re-throw non-constraint errors
                  }
                }
              }
            }
          } else {
            // Same ID, just update the definition
            await workflowsRepository.update(oldId, {
              name: currentWorkflowDefinition.workflow.name,
              definition: currentWorkflowDefinition,
              version: CURRENT_WORKFLOW_VERSION,
              isDefault: true,
            });
          }
        } else if (dbVersion === CURRENT_WORKFLOW_VERSION) {
          // Version matches, but ensure definition is up-to-date (in case of hotfixes)
          const existingDefinition =
            typeof defaultWorkflow.definition === 'string'
              ? JSON.parse(defaultWorkflow.definition)
              : defaultWorkflow.definition;

          // Compare workflow IDs to detect changes
          if (existingDefinition.workflow.id !== currentWorkflowDefinition.workflow.id) {
            // Workflow ID changed, update it
            await workflowsRepository.update(defaultWorkflow.id, {
              definition: currentWorkflowDefinition,
              version: CURRENT_WORKFLOW_VERSION,
            });

            console.log(
              `Updated default workflow definition for project: ${project.name} (${project.id}) to match v${CURRENT_WORKFLOW_VERSION}`
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to ensure default workflows:', error);
    // Don't throw - allow server to start even if this fails
  }
}

async function start() {
  const server = await createServer();

  // Run database migrations on startup
  await runMigrations();

  // Ensure all projects have default workflows
  await ensureDefaultWorkflows();

  // Initialize models cache in background
  // This runs asynchronously and doesn't block server startup
  // Initialize cache for both available agents
  void modelsCache.initialize('opencode');
  void modelsCache.initialize('claudecode');

  // Recover interrupted workflow runs on startup
  void workflowExecutionService.recoverInterruptedRuns();

  // Recover interrupted agent runs on startup
  void agentRunRecoveryService.recoverInterruptedRuns();

  // Start event outbox processor
  console.log('[Server] Event outbox processor started');

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
  await server.register(settingsRoutes);

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

start();
