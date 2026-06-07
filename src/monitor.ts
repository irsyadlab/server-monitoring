import * as os from "os";

export interface CPUMetrics {
  model: string;
  cores: number;
  loadAvg: { "1min": number; "5min": number; "15min": number };
  usagePercent: number;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
  swapTotal: number;
  swapUsed: number;
  swapUsagePercent: number;
}

export interface DiskInfo {
  mount: string;
  total: number;
  used: number;
  available: number;
  usagePercent: number;
}

export interface NetworkMetrics {
  rxRate: number; // bytes/sec
  txRate: number;
  rxTotal: number;
  txTotal: number;
}

export interface ProcInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memPercent: number;
}

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

async function exec(cmd: string): Promise<string> {
  const proc = Bun.spawn(["bash", "-c", cmd], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

function parseDfLine(line: string): DiskInfo | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;
  const total = parseInt(parts[1]!) * 1024;
  const used = parseInt(parts[2]!) * 1024;
  const available = parseInt(parts[3]!) * 1024;
  const usagePercent = parseInt(parts[4]!);
  const mount = parts[5]!;
  return { mount, total, used, available, usagePercent };
}

async function readNetDev(): Promise<{ rx: number; tx: number }> {
  const data = await exec("cat /proc/net/dev 2>/dev/null");
  let rx = 0,
    tx = 0;
  for (const line of data.split("\n")) {
    if (!line.includes(":")) continue;
    const ifname = line.split(":")[0]!.trim();
    // Skip loopback
    if (ifname === "lo") continue;
    // Skip veth, docker
    if (ifname.startsWith("veth") || ifname.startsWith("docker") || ifname.startsWith("br-"))
      continue;
    const parts = line.split(":")[1]!.trim().split(/\s+/);
    rx += parseInt(parts[0]!) || 0;
    tx += parseInt(parts[8]!) || 0;
  }
  return { rx, tx };
}

async function readTemperature(): Promise<number | null> {
  try {
    const zones = await exec(
      `for z in /sys/class/thermal/thermal_zone*/temp; do [ -r "$z" ] && echo "$z=$(cat "$z")"; done 2>/dev/null`
    );
    if (!zones) return null;
    let best = Number.MAX_VALUE;
    for (const line of zones.split("\n")) {
      const val = parseInt(line.split("=")[1]!);
      // thermal_zone0 often the CPU package; pick the highest non-zero temp
      if (val > 0 && val < best) best = val;
      // Actually we want the HIGHEST, not lowest
    }
    // Reread — pick highest
    let highest = -Infinity;
    for (const line of zones.split("\n")) {
      const val = parseInt(line.split("=")[1]!);
      if (val > 0 && val > highest) highest = val;
    }
    return highest > 0 ? highest / 1000 : null;
  } catch {
    return null;
  }
}

export async function collectMetrics(): Promise<SystemMetrics> {
  // --- disk ---
  const dfOutput = await exec("df -P -B1 / /home 2>/dev/null");
  const disks: DiskInfo[] = dfOutput
    .split("\n")
    .slice(1)
    .map(parseDfLine)
    .filter(Boolean)
    .filter((d, i, arr) => arr.findIndex((x) => x.mount === d.mount) === i) as DiskInfo[];

  // --- memory ---
  const memOutput = await exec("free -b 2>/dev/null");
  const memLines = memOutput.split("\n");
  const memParts = memLines[1]?.trim().split(/\s+/);
  const swapParts = memLines[2]?.trim().split(/\s+/);
  const memTotal = memParts ? parseInt(memParts[1]!) : os.totalmem();
  const memUsed = memParts ? parseInt(memParts[2]!) : os.totalmem() - os.freemem();
  const memFree = memParts ? parseInt(memParts[3]!) : os.freemem();
  const swapTotal = swapParts ? parseInt(swapParts[1]!) : 0;
  const swapUsed = swapParts ? parseInt(swapParts[2]!) : 0;

  // --- CPU usage (poll /proc/stat with 500ms delay) ---
  const loadAvg = os.loadavg();
  const stat1 = await exec("cat /proc/stat | grep '^cpu '");
  await new Promise((r) => setTimeout(r, 500));
  const stat2 = await exec("cat /proc/stat | grep '^cpu '");

  function cpuTicks(stat: string): number[] {
    return stat.split(/\s+/).slice(1).map(Number);
  }
  const t1 = cpuTicks(stat1);
  const t2 = cpuTicks(stat2);
  let usagePercent = 0;
  if (t1.length >= 4 && t2.length >= 4) {
    const idle1 = t1[3]! + (t1[4] ?? 0);
    const idle2 = t2[3]! + (t2[4] ?? 0);
    const total1 = t1.reduce((a, b) => a + b, 0);
    const total2 = t2.reduce((a, b) => a + b, 0);
    const totalDelta = total2 - total1;
    const idleDelta = idle2 - idle1;
    if (totalDelta > 0) usagePercent = ((totalDelta - idleDelta) / totalDelta) * 100;
  }

  // --- network rate (poll 1s delta) ---
  const net1 = await readNetDev();
  await new Promise((r) => setTimeout(r, 1000));
  const net2 = await readNetDev();
  const rxRate = Math.max(0, net2.rx - net1.rx); // bytes/sec
  const txRate = Math.max(0, net2.tx - net1.tx);

  // --- top processes ---
  const topOutput = await exec(
    "ps -eo pid,comm,pcpu,pmem --sort=-pcpu --no-headers 2>/dev/null | head -5"
  );
  const topProcs: ProcInfo[] = topOutput
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const p = line.trim().split(/\s+/);
      return {
        pid: parseInt(p[0]!) || 0,
        name: p[1]?.slice(0, 15) ?? "?",
        cpuPercent: parseFloat(p[2]!) || 0,
        memPercent: parseFloat(p[3]!) || 0,
      };
    });

  // --- temperature ---
  const temperature = await readTemperature();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.machine(),
    uptime: os.uptime(),
    cpu: {
      model: (os.cpus()[0]?.model ?? "unknown").trim(),
      cores: os.cpus().length,
      loadAvg: { "1min": loadAvg[0]!, "5min": loadAvg[1]!, "15min": loadAvg[2]! },
      usagePercent: Math.round(usagePercent * 10) / 10,
    },
    memory: {
      total: memTotal,
      used: memUsed,
      free: memFree,
      usagePercent: Math.round((memUsed / memTotal) * 1000) / 10,
      swapTotal,
      swapUsed,
      swapUsagePercent: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0,
    },
    disks,
    network: { rxRate, txRate, rxTotal: net2.rx, txTotal: net2.tx },
    topProcs,
    temperature,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(2)} MB/s`;
  if (bytesPerSec >= 1_024) return `${(bytesPerSec / 1_024).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
