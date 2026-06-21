import { homedir } from "os";
import { join } from "path";
import { mkdir } from "fs/promises";
import type { ServerMonConfig, ServerEntry } from "../types";

const CONFIG_DIR = join(homedir(), ".irsyadulibad", "servermon");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function configPath(): string {
  return CONFIG_FILE;
}

export function configDir(): string {
  return CONFIG_DIR;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

async function readConfig(): Promise<ServerMonConfig | null> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (!(await file.exists())) return null;
    const data = (await file.json()) as ServerMonConfig;
    if (!data?.servers || typeof data.servers !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

async function writeConfig(config: ServerMonConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(name?: string): Promise<ServerEntry | null> {
  const cfg = await readConfig();
  if (!cfg) return null;
  const key = name ?? "default";
  const entry = cfg.servers[key];
  if (!entry?.token) return null;
  return {
    token: String(entry.token),
    interval: Math.max(30, parseInt(String(entry.interval)) || 300),
    chatId: entry.chatId ? String(entry.chatId) : undefined,
  };
}

export async function saveConfig(entry: ServerEntry & { name?: string }): Promise<void> {
  const cfg = (await readConfig()) ?? { servers: {} };
  const key = entry.name ?? "default";
  cfg.servers[key] = {
    token: entry.token,
    interval: entry.interval,
    chatId: entry.chatId,
  };
  await writeConfig(cfg);
}

export async function deleteConfig(name?: string): Promise<boolean> {
  const cfg = await readConfig();
  if (!cfg) return false;
  const key = name ?? "default";
  if (!cfg.servers[key]) return false;
  delete cfg.servers[key];
  await writeConfig(cfg);
  return true;
}

export async function listServers(): Promise<string[]> {
  const cfg = await readConfig();
  if (!cfg) return [];
  return Object.keys(cfg.servers).sort();
}
