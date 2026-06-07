# 🖥 Server Monitor

> **Lightweight server watchdog** — collects real-time system metrics and sends structured reports to Telegram.
> Global CLI tool. Install once, run anywhere. Built with Bun + TypeScript.

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

Each report is color-coded with 🟢🟡🔴 health indicators and visual bar charts.

---

## 🚀 Quick Start

### Install globally

```bash
bun i -g @irsyadulibad/servermon
```

### First run — interactive setup

```bash
servermon
```

You'll be prompted for:

1. **Telegram Bot Token** — get one from [@BotFather](https://t.me/BotFather)
2. **Report interval** — how often to send reports (default: 300s = 5 min)

Config is saved to `~/.irsyadulibad/servermon/config.json`.

### Send a message to your bot

DM your bot **once** (any message). The daemon auto-detects your chat ID.

### Start monitoring

```bash
servermon
```

That's it. The daemon auto-detects your chat ID, sends an initial report, then loops.

---

## 🛠 Development

```bash
git clone https://github.com/irsyadlab/server-monitoring.git
cd server-monitoring
bun install

# Run in dev mode
bun start

# Global link (for testing)
bun link
servermon

# Unlink
bun unlink
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

When thresholds are crossed, alerts appear inline.

---

## 🔧 Scripts

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `bun start`      | Run the daemon in dev mode                     |
| `bun run build`  | Compile standalone binary → `./server-monitor` |
| `bun run lint`   | Run ESLint                                     |
| `bun run format` | Format with Prettier                           |
| `bun run check`  | Format check + lint (CI-ready)                 |

---

## 📁 Project Structure

```
server-monitoring/
├── cli.ts                # Global binary entry (interactive setup + launcher)
├── index.ts              # Daemon core (start/loop/report)
├── src/
│   ├── config.ts         # Config manager (~/.irsyadulibad/servermon/)
│   ├── monitor.ts        # Metrics collector (CPU, RAM, disk, net, temp, procs)
│   └── reporter.ts       # HTML formatter & Telegram sender
├── eslint.config.js
├── .prettierrc
├── package.json
└── tsconfig.json
```

---

## ⚙️ Config

Stored at `~/.irsyadulibad/servermon/config.json`:

```json
{
  "token": "883280...",
  "interval": 300,
  "chatId": "1216431846"
}
```

- `token` — Telegram bot token (required)
- `interval` — seconds between reports, min: 30 (default: 300)
- `chatId` — auto-detected on first run, persisted for subsequent runs

---

## 📦 Deploy as systemd service

```bash
# After installing globally
sudo tee /etc/systemd/system/servermon.service << 'EOF'
[Unit]
Description=Server Monitor Daemon
After=network.target

[Service]
Type=simple
ExecStart=/root/.bun/bin/servermon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now servermon
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
