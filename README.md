# 🖥 Server Monitor

> **Lightweight server watchdog** — collects real-time system metrics and sends structured reports to Telegram.
> Built with Bun + TypeScript. Zero dependencies beyond the stdlib.

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Bun-000?style=flat&logo=bun" alt="bun">
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat&logo=typescript" alt="ts">
  <img src="https://img.shields.io/badge/target-Telegram-26A5E4?style=flat&logo=telegram" alt="telegram">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="license">
</p>

---

## ✨ Features

| Category             | What it tracks                                                 |
| -------------------- | -------------------------------------------------------------- |
| 💻 **CPU**           | Model, core count, usage %, load average (1/5/15 min)          |
| 🧠 **RAM**           | Used / total, usage %, swap usage                              |
| 💾 **Disk**          | Per-mount used / total, usage % — deduplicated                 |
| 🌐 **Network**       | RX / TX rate (bytes/sec, sampled over 1s)                      |
| 🌡 **Temperature**   | CPU package temp via thermal zones (`/sys/class/thermal`)      |
| 📊 **Top Processes** | Top 5 by CPU % — PID, name, CPU %, MEM %                       |
| 🚨 **Alerts**        | Auto-flag when CPU > 85%, RAM > 90%, disk > 90%, or swap > 50% |

Each report is color-coded with 🟢🟡🔴 health indicators and visual bar charts — readable at a glance in your Telegram inbox.

---

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone https://github.com/irsyadlab/server-monitoring.git
cd server-monitoring
bun install
```

### 2. Create a Telegram bot

Message [@BotFather](https://t.me/BotFather) on Telegram, create a bot, and copy the token.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set your bot token:

```env
TELEGRAM_BOT_TOKEN=8832804360:AAF7...
MONITOR_INTERVAL=300   # seconds (default: 300 = 5 minutes)
```

**Chat ID is auto-detected.** Just DM your bot once (any message), then run the daemon — it picks up the chat ID automatically and saves it to `.env`.

### 4. Run

```bash
# Development (auto-reload on file changes)
bun --watch index.ts

# Production (compiled binary)
bun run build        # → ./server-monitor
./server-monitor

# With PM2 (recommended for long-running daemons)
pm2 start server-monitor --name monitor
```

---

## 📷 Example Report

```
✅ HEALTHY
📅 7 Jun 2026, 22:11   │  ⏱ 3d 21h
🐧 linux x86_64        │  Intel Xeon E5-2680 v4 @ 2.40GHz (2c)

💻 CPU   10.5%  🟢 ▰▱▱▱▱▱▱▱▱▱
   Load: 0.59 / 1.40 / 1.51

🧠 RAM   27.3%  🟢 ▰▰▰▱▱▱▱▱▱▱
   1.0 GiB / 3.8 GiB

💾 DISK
   /      26%  🟢 ▰▰▰▱▱▱▱▱▱▱
    └ 7957 GiB / 33092 GiB

🌐 NET
   ↓ 2.6 KB/s   ↑ 808 B/s

📊 TOP PROCESSES
   57318  ps              CPU 200.0%  MEM   0.1%
   57296  bun             CPU  13.6%  MEM   1.0%
   56149  hermes          CPU   8.7%  MEM   5.3%

✨ All systems normal
```

When thresholds are crossed, alerts appear inline with your report — no separate alerting channel needed.

---

## 🔧 Scripts

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `bun start`      | Run the daemon (watch mode)                    |
| `bun run build`  | Compile standalone binary → `./server-monitor` |
| `bun run lint`   | Run ESLint                                     |
| `bun run format` | Format with Prettier                           |
| `bun run check`  | Format check + lint (CI-ready)                 |

---

## 📁 Project Structure

```
server-monitoring/
├── src/
│   ├── monitor.ts        # Metrics collector (CPU, RAM, disk, net, temp, procs)
│   └── reporter.ts       # HTML formatter & Telegram sender
├── index.ts              # Daemon entry point (loop + auto-detect chat ID)
├── eslint.config.js      # Flat ESLint config
├── .prettierrc           # Prettier config
├── .env.example          # Config template
├── package.json
└── tsconfig.json
```

---

## ⚙️ Configuration

All settings live in `.env`:

| Variable             | Required | Default     | Description                       |
| -------------------- | -------- | ----------- | --------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Yes      | —           | Bot token from @BotFather         |
| `TELEGRAM_CHAT_ID`   | No       | auto-detect | Target chat ID (DM or group)      |
| `MONITOR_INTERVAL`   | No       | `300`       | Seconds between reports (min: 30) |

---

## 📦 Deploying

```bash
# Build binary
bun run build

# Copy to server
scp server-monitor user@host:/opt/monitor/

# Run as systemd service
sudo tee /etc/systemd/system/server-monitor.service << 'EOF'
[Unit]
Description=Server Monitor Daemon
After=network.target

[Service]
Type=simple
ExecStart=/opt/monitor/server-monitor
WorkingDirectory=/opt/monitor
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now server-monitor
```

---

## 🛠 Built With

- [Bun](https://bun.com) — fast all-in-one JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Telegram Bot API](https://core.telegram.org/bots/api) — message delivery
- [ESLint](https://eslint.org/) + [Prettier](https://prettier.io/) — code quality

---

## 📝 License

MIT — do whatever you want.
