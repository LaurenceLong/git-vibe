import { eq } from 'drizzle-orm';
import { appSettings } from '../models/schema.js';
import { getDb } from '../db/client.js';

const DEFAULT_AGENT = 'opencode';
const DEFAULT_AGENT_PARAMS = '{}';

export interface GlobalSettings {
  defaultAgent: string;
  defaultAgentParams: string; // JSON string
}

export class SettingsRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async getGlobalSettings(): Promise<GlobalSettings> {
    const db = await this.getDbInstance();
    const rows = await db.select().from(appSettings).execute();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      defaultAgent: map.get('defaultAgent') ?? DEFAULT_AGENT,
      defaultAgentParams: map.get('defaultAgentParams') ?? DEFAULT_AGENT_PARAMS,
    };
  }

  async updateGlobalSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const db = await this.getDbInstance();
    if (updates.defaultAgent !== undefined) {
      await db.delete(appSettings).where(eq(appSettings.key, 'defaultAgent')).execute();
      await db
        .insert(appSettings)
        .values({ key: 'defaultAgent', value: updates.defaultAgent })
        .execute();
    }
    if (updates.defaultAgentParams !== undefined) {
      await db.delete(appSettings).where(eq(appSettings.key, 'defaultAgentParams')).execute();
      await db
        .insert(appSettings)
        .values({ key: 'defaultAgentParams', value: updates.defaultAgentParams })
        .execute();
    }
    return this.getGlobalSettings();
  }
}

export const settingsRepository = new SettingsRepository();
