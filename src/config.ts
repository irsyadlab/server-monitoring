import { homedir } from "os";
import { join } from "path";
import { mkdir } from "fs/promises";

const CONFIG_DIR = join(homedir(), ".irsyadulibad", "servermon");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface ServerMonConfig {
  token: string;
  interval: number;
  chatId?: string;
}

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<ServerMonConfig | null> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (!(await file.exists())) return null;
    const data = await file.json();
    // Minimal validation
    if (!data?.token) return null;
    return {
      token: String(data.token),
      interval: Math.max(30, parseInt(String(data.interval)) || 300),
      chatId: data.chatId ? String(data.chatId) : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: ServerMonConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function configPath(): string {
  return CONFIG_FILE;
}

export function configDir(): string {
  return CONFIG_DIR;
}
