# Final Manual Steps

## For valkyrie phase 1

1. Copy `.env.example` to `.env` if you have not already.
2. Copy `workers.example.json` to `workers.json`.
3. Set `FACTORY_TELEGRAM_BOT_TOKEN=<real-token>`.
4. Add the bot to the target Telegram supergroup and make sure forum topics are enabled.
5. Disable bot privacy in `@BotFather` so plain text inside a bound topic is visible.
6. Run:

```bash
./scripts/install.sh
./scripts/doctor.sh
```

Run those as `swader`, not with `sudo`. `install.sh` now prompts for `sudo` internally only for the privileged `/srv` and linger setup, and keeps Bun-related work under `swader`.

Only set `FACTORY_WORKERS_FILE` in `.env` if you want the worker config somewhere other than `./workers.json`.

7. In Telegram, send `/whoami` in the exact topic you want to use.
8. Create the first local host context:

```text
/newctx valkyrie-general valkyrie host
```

9. Optional: create a scratch topic:

```text
/newctx scratchpad valkyrie scratch
```

At that point, valkyrie phase 1 is usable even if `erbine` is still offline.

Once a topic is active, artifact files can be returned into the same Telegram topic either by asking for them in plain language or by using `/artifacts send [filter]`.

Supported inbound Telegram media now stages into the bound workspace automatically. Voice and audio transcription is still a later phase.

Topic-local Codex runtime switching is also available now through `/mode`, `/model`, and `/effort`.

## Manual erbine work for later

These are the remaining manual prerequisites before remote repo execution on `erbine` will work cleanly:

1. Enable `sshd` on `erbine`.
2. Decide on the remote SSH user and update `workers.json`.
3. Trust valkyrie’s SSH key on `erbine`.
4. Confirm Tailscale networking between `valkyrie` and `erbine`.
5. Confirm `git`, `bash`, and `codex` are installed on `erbine`.
6. Create a pending remote host topic when you are ready:

```text
/newctx erbine-general erbine host
```

7. For a repo topic, either bind an existing path or give a git URL:

```text
/newctx myproj erbine https://github.com/example/project.git main
```

If `erbine` is still unavailable, those contexts should remain `pending` instead of failing hard.
