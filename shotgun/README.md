# Shotgun — the texting co-pilot

`CLAUDE.md` here is Shotgun's **brain**. Shotgun *is* a Claude Code session running
from this folder with a **channel plugin** attached (the thing that pipes texts in/out).
Same brain, swappable channel:

- **`fakechat`** — a localhost chat box. Zero permissions/infra. Use this to test + tune the voice.
- **`telegram`** — headless, runs on Linux/the droplet. The reliable workhorse for the trip.
- **`imessage`** — native blue bubbles, but macOS-only + AppleScript (fragile for 3-month unattended).

Tools Shotgun uses: the **Supabase MCP** (read/write the itinerary — user-scoped, inherited),
**WebFetch** (live hours/cost/conditions/route beta), and the app's **scout** at `/api/dtours`.

---

## ▶︎ Test it now (fakechat — no permissions, no Mac lock-in)

1. Make sure the app is running (for the scout): from the repo root, `npm run dev`.
2. Launch Shotgun with the test channel (Haiku = cheap + fast; `--model` is
   per-session, so it never touches your other Opus sessions):
   ```sh
   cd shotgun
   claude --model claude-haiku-4-5 --channels plugin:fakechat@claude-plugins-official
   ```
3. First launch asks you to **approve the Supabase MCP** — say yes (one-time).
4. fakechat prints a **localhost URL** — open it and text Shotgun. Try:
   - `hamilton pool — what is it, cost, hours? gonna make us late?`
   - `anywhere near tonight's stop i can swim a real 50m and lift?`
   - `what's coming up if we're at 30.19,-98.09?`

If the voice/decisions feel right, we go live.

---

## 🚀 Go live (Telegram — the 3-month workhorse)

1. In Telegram, message **@BotFather** → `/newbot` → copy the **bot token**.
2. Install + run the channel:
   ```sh
   claude plugin install telegram@claude-plugins-official
   cd shotgun
   claude --model claude-haiku-4-5 --channels plugin:telegram@claude-plugins-official   # set the bot token as its config prompts
   ```
3. Message your bot, pair your account (the plugin gates by access control).
4. Share **live location** with the bot so Shotgun always knows where you are.
5. **Always-on for the trip:** run this on the DigitalOcean droplet under `systemd`
   (RunAtLoad + Restart=always) inside `tmux`. No Mac to babysit.

## 🧗 Dossier sweep (fill objective beta)

When David adds an objective in the CMS (`/cms/objectives`) and seeds it links, its
`beta` is empty and the public dossier shows "🔍 compiling…". Shotgun fills it.
The research needs the model, so it's a Claude run (not a plain script):

- **From a running Shotgun session:** just say *"Sweep the objectives that need a
  dossier and fill them."* The brain (`CLAUDE.md` → Objective dossiers) knows the
  protocol: read each objective's pinned `sources`, research, write `objectives.beta`.
- **Headless one-shot:**
  ```sh
  cd ~/Sites/d-tours/shotgun
  claude -p "Sweep objectives where beta is null and compile each dossier per CLAUDE.md, writing objectives.beta via the Supabase MCP."
  ```
- **Scheduled (the watcher):** cron the headless command on the iMac so new
  objectives auto-fill within a day, and conditions refresh as the trip nears:
  ```sh
  # crontab -e  → every morning at 7am
  0 7 * * * cd ~/Sites/d-tours/shotgun && claude -p "Sweep objectives needing a dossier; refresh stale conditions." >> ~/shotgun-sweep.log 2>&1
  ```

### Known TODOs for the headless droplet
- The Supabase MCP is the hosted/OAuth one — confirm it re-auths headlessly on the droplet,
  or swap Shotgun to hit the app's own owner-authed API / a direct service-role path there.
- `--channels` is a research-preview flag (hidden from `--help`) but works on v2.1.163.
- Brain rule: Shotgun **confirms before writing** to the plan — keep it that way.
