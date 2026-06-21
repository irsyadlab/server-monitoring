/** CPU metrics */
export interface CPUMetrics {
  model: string;
  cores: number;
  loadAvg: { "1min": number; "5min": number; "15min": number };
  usagePercent: number;
}

/** Memory & swap metrics */
export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
  swapTotal: number;
  swapUsed: number;
  swapUsagePercent: number;
}

/** Per-mount disk info */
export interface DiskInfo {
  mount: string;
  total: number;
  used: number;
  available: number;
  usagePercent: number;
}

/** Network throughput */
export interface NetworkMetrics {
  rxRate: number; // bytes/sec
  txRate: number;
  rxTotal: number;
  txTotal: number;
}

/** Single process info */
export interface ProcInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memPercent: number;
}

/** Full system snapshot returned by collectMetrics() */
export interface SystemMetrics {
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  disks: DiskInfo[];
  network: NetworkMetrics;
  topProcs: ProcInfo[];
  temperature: number | null; // celsius
}

/** A single server entry in the config */
export interface ServerEntry {
  token: string;
  interval: number;
  chatId?: string;
}

/** Top-level config persisted to disk — single file, multiple servers */
export interface ServerMonConfig {
  servers: Record<string, ServerEntry>;
}

/** A named config loaded at runtime — internal for multi-server loop */
export interface NamedConfig {
  name: string;
  cfg: ServerEntry;
}
