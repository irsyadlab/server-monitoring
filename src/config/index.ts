import { homedir } from "os";
import { join } from "path";
import { mkdir, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import type { ServerMonConfig } from "../types";

const CONFIG_DIR = join(homedir(), ".irsyadulibad", "servermon");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function configFile(name?: string): string {
  return name ? join(CONFIG_DIR, `config-${name}.json`) : CONFIG_FILE;
}

export function configPath(name?: string): string {
  return configFile(name);
}

export function configDir(): string {
  return CONFIG_DIR;
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(name?: string): Promise<ServerMonConfig | null> {
  try {
    const file = Bun.file(configFile(name));
    if (!(await file.exists())) return null;
    const data = await file.json();
    if (!data?.token) return null;
    return {
      token: String(data.token),
      interval: Math.max(30, parseInt(String(data.interval)) || 300),
      chatId: data.chatId ? String(data.chatId) : undefined,
      name: data.name ? String(data.name) : name,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: ServerMonConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(configFile(config.name), JSON.stringify(config, null, 2));
}

export async function deleteConfig(name?: string): Promise<boolean> {
  const file = configFile(name);
  if (!existsSync(file)) return false;
  try {
    await unlink(file);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Inventory                                                          */
/* ------------------------------------------------------------------ */

export async function listServers(): Promise<string[]> {
  const names: string[] = [];
  try {
    const entries = await readdir(CONFIG_DIR);
    for (const entry of entries) {
      const match = entry.match(/^config-(.+)\.json$/);
      if (match) names.push(match[1]!);
    }
  } catch {
    // dir may not exist yet
  }
  if (existsSync(CONFIG_FILE)) names.unshift("default");
  return names;
}
