import { eq } from 'drizzle-orm';
import { projects } from '../models/schema.js';
import type { Project } from '../types/models.js';
import { getDb } from '../db/client.js';

export class ProjectsRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async create(data: {
    id: string;
    name: string;
    sourceRepoPath: string;
    sourceRepoUrl?: string;
    defaultBranch: string;
  }): Promise<Project> {
    const db = await this.getDbInstance();
    const [project] = await db
      .insert(projects)
      .values({
        id: data.id,
        name: data.name,
        sourceRepoPath: data.sourceRepoPath,
        sourceRepoUrl: data.sourceRepoUrl || null,
        defaultBranch: data.defaultBranch,
      })
      .returning()
      .execute();

    return project as Project;
  }

  async findAll(): Promise<Project[]> {
    const db = await this.getDbInstance();
    const result = await db.select().from(projects).execute();
    return result as Project[];
  }

  async findById(id: string): Promise<Project | undefined> {
    const db = await this.getDbInstance();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .execute();

    return project as Project | undefined;
  }

  async update(
    id: string,
    data: {
      name?: string;
      sourceRepoUrl?: string;
    },
  ): Promise<Project | undefined> {
    const db = await this.getDbInstance();
    const [project] = await db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning()
      .execute();

    return project as Project | undefined;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(projects).where(eq(projects.id, id)).execute();
  }
}

export const projectsRepository = new ProjectsRepository();
