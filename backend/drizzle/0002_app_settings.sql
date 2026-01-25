-- Global app settings (key-value). Used for default project settings when creating a project.
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);

-- Default values: defaultAgent = opencode, defaultAgentParams = {}
INSERT OR IGNORE INTO "app_settings" ("key", "value") VALUES ('defaultAgent', 'opencode');
INSERT OR IGNORE INTO "app_settings" ("key", "value") VALUES ('defaultAgentParams', '{}');
