# Operations

## Install or refresh

```bash
cd ~/private-dev-factory
cp -n .env.example .env
cp -n workers.example.json workers.json
$EDITOR .env workers.json
./scripts/install.sh
./scripts/doctor.sh
```

Run both scripts as your normal user. `install.sh` prompts for `sudo` internally when it needs to create or repair `/srv/telemux` and `/srv/factory`, but all Bun and `systemctl --user` work stays under your user account.

The loader defaults to `./workers.json`. Set `FACTORY_WORKERS_FILE` in `.env` only if you want a different path.

If you want startup-time `chat_member` command registration for the control supergroup, set `FACTORY_TELEGRAM_CONTROL_CHAT_ID` in `.env` to that supergroup chat id.

Recommended worker config for phase 1:

- `valkyrie` uses `transport: "local"`
- `erbine` uses `transport: "ssh"` over the Tailscale network

## Repo push access

This checkout can use a dedicated GitHub deploy key for pushes to `Swader/valkyrie` without changing the identity used by other repos on the machine.

- private key: `~/.ssh/private-dev-factory_github_deploy`
- public key: `~/.ssh/private-dev-factory_github_deploy.pub`
- SSH host alias: `github.com-private-dev-factory`

With this setup, the repo remote can be:

```bash
git@github.com-private-dev-factory:Swader/valkyrie.git
```

Paste the public key into the GitHub repo at:

- `Swader/valkyrie` -> `Settings` -> `Deploy keys`

Enable write access if the key should be allowed to push.

## Day 0 Telegram onboarding

1. Create or recover the bot token from `@BotFather`.
2. Put the token in `~/private-dev-factory/.env` as `FACTORY_TELEGRAM_BOT_TOKEN=...`.
3. Add the bot to the target supergroup.
4. Ensure forum topics are enabled in the supergroup.
5. Disable bot privacy in `@BotFather` so plain text and media captions inside a bound topic reach the bot.
6. From the allowed Telegram account, send `/whoami` in the target topic.

## Common topic setups

### Valkyrie general host context

In the `valkyrie-general` topic:

```text
/newctx valkyrie-general valkyrie host
```

That creates a managed local git workspace under:

- `/srv/factory/hostctx/valkyrie-general/`
- an initial git commit so future diffs start clean

### Scratchpad

In a throwaway topic:

```text
/newctx scratchpad valkyrie scratch
```

That creates:

- `/srv/factory/scratch/scratchpad/`
- an initial git commit so future diffs start clean

### Existing repo path

```text
/newctx bitfalls-dashboard valkyrie /absolute/path/to/repo
```

### Managed clone from a git URL

```text
/newctx bitfalls-dashboard erbine https://github.com/example/project.git main
```

If `erbine` is unavailable, the context is still created and stored as `pending`.

## Using the bot

### Inspect identity and binding

```text
/help
/explainctx
/synccommands
/showcommands
/whoami
/topicinfo
/mode
/model
/effort
```

### Inspect workers

```text
/workers
```

### Start or continue work

```text
/run audit the repo and update the docs
/resume continue from the current TODO
/loop keep going until you hit a real blocker or a clean checkpoint
```

Inside a bound topic, plain text starts or resumes the stored Codex session automatically.

You can change the Codex runtime for the current topic without rebinding it:

```text
/mode fast
/mode normal
/mode max
/mode clear
/model gpt-5.4-mini
/model clear
/effort low
/effort clear
```

Preset meanings:

- `fast` -> `gpt-5.4-mini` with `low`
- `normal` -> `gpt-5.4` with `medium`
- `max` -> `gpt-5.4` with `xhigh`

These overrides are stored with the bound context and applied to both `codex exec` and `codex exec resume`, so the session continues instead of starting over.

Captioned image or file messages use the same path. Supported inbound Telegram media is staged into the bound workspace before Codex runs. Images are also attached to the Codex prompt with `--image`, while non-image files are left on disk for Codex to inspect.

Audio and voice-only Telegram messages are intentionally blocked before Codex in the current phase. They need transcription first.

### Context lifecycle notes

- A context is the durable workspace and Codex-session binding for one Telegram topic.
- `/newctx` is usually the one-time setup step for a reusable topic.
- If `/newctx` is run in an already bound topic, the bot warns before rebinding.
- Rebinding changes future routing only.
- The old workspace stays on disk unless you archive it or delete it separately.
- Old Telegram messages stay in Telegram and are not automatically imported into the new context.

### Rebind the current topic

```text
/bind valkyrie scratch
/bind erbine https://github.com/example/project.git main
```

Legacy `/bind <slug>` is still accepted to attach the topic to an existing stored context.

### Archive or detach

```text
/archive
/detach
```

`/archive` marks the context inactive and detaches the topic. `/detach` only removes the topic binding.

### Inspect results

```text
/tail
/artifacts
/artifacts send
/artifacts send screenshot
/usage
```

If a Codex reply says a file was created and recorded in `.factory/ARTIFACTS.md`, you can either ask for it in plain language in the same topic or explicitly run `/artifacts send [filter]` to have the control plane upload the matching file back into Telegram.

While a job is running, the bot should show a `typing...` indicator in the same topic. That is expected while `/topicinfo` reports `Busy: yes`.

## Dashboard

- Main page: `http://127.0.0.1:8787/`
- Health: `http://127.0.0.1:8787/healthz`

The dashboard stays localhost-only by default.

## Telegram command scopes

- Telegram bot commands are scoped by chat/user, not by topic.
- Group topics do not have their own separate command scopes.
- The daemon registers commands for:
  `default`, `all_private_chats`, `all_group_chats`, and optionally `chat_member(chat_id=<control-group>, user_id=16708526)`.
- Telegram clients may still choose not to visually show slash suggestions in some group contexts even when commands are registered correctly.
- Use `/synccommands` to re-register commands and `/showcommands` to inspect what Telegram currently returns for each scope.
- This is separate from any private-chat menu button behavior; group-topic slash suggestions are not fixed with `setChatMenuButton`.

## Service management

```bash
systemctl --user status telemux.service
systemctl --user restart telemux.service
journalctl --user -u telemux.service -f
```

After changing the control plane source under `~/private-dev-factory/src`, restart `telemux.service` because the unit runs directly from `bun run src/main.ts`.

## Boot readiness

- The user systemd service must be enabled: `systemctl --user enable --now telemux.service`
- `loginctl enable-linger <user>` is required if the service should start after reboot without login
- Recommended reboot test:
  reboot the machine, do not log in locally first, then verify from Telegram only with `/whoami`, `/workers`, and plain text in an already bound topic

## Worker troubleshooting

### Worker unavailable

- Run `/workers`
- Confirm the worker shows `status=unreachable` instead of crashing the daemon
- Confirm the SSH target and user in `workers.json`
- Confirm Tailscale networking between `valkyrie` and `erbine`
- Confirm `sshd`, `git`, `bash`, and `codex` exist on the worker

If the worker is unavailable, context creation should land in `pending`.

### Context bootstrap failed locally

- Inspect `/topicinfo`
- Inspect `/tail`
- Fix the local repo/workspace issue
- Retry `/run`, `/resume`, or `/newctx`

### Telegram receives nothing

- Confirm the service is running
- Confirm the token in `.env`
- Confirm the bot is in the target supergroup
- Confirm privacy mode is disabled
- Check `journalctl --user -u telemux.service -n 200 --no-pager`

### Telegram media message was ignored or incomplete

- Confirm the message had either text or a caption, or at least one supported non-audio attachment
- Remember that Telegram photo captions arrive as `caption`, not `text`
- Inspect `.factory/inbox/telegram/` in the bound workspace for staged input files
- Check `journalctl --user -u telemux.service -n 200 --no-pager` for download or staging errors
- Audio/voice-only messages are expected to stop before Codex in the current phase

### Busy topic shows no typing indicator

- Confirm `/topicinfo` reports `Busy: yes`
- Confirm the topic is a real forum topic with a `message_thread_id`
- Check `journalctl --user -u telemux.service -n 200 --no-pager` for `telegram typing heartbeat failed`
- If replies still arrive normally, treat the missing indicator as a Telegram client/UI issue first
