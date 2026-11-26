# ag: drive the Antigravity desktop app from the shell

Lets Claude Code (or another agent) hand work to the Antigravity desktop app's agent and supervise it from the shell.

| Part | What it is |
| --- | --- |
| `ag.mjs` → `ag` | CLI that drives the **Antigravity desktop app's** agent: send a prompt and print the reply, approve or reject commands, switch conversations, models and projects. One file, plain Node, no `npm install`. |
| `skills/antigravity-desktop/` | Claude Code skill that teaches the agent to use `ag`. |

`ag` prints short plain text, so an agent can read results without screenshots.

## Requirements
- macOS. Windows/Linux untested; the script may work, but you must launch the app with the debug flags yourself.
- Node 22+ (built-in `fetch` and `WebSocket`). Check: `node -v`.
- The Antigravity desktop app.

## Install
1. Keep this folder in a fixed place: `ag` and the skill are symlinks into it.
2. Run:
   ```bash
   ./install.sh
   ```
   It checks Node 22+, links `ag` into `~/.local/bin`, links the skill into `~/.claude/skills/antigravity-desktop`, and adds `~/.local/bin` to PATH in `~/.zshrc` if missing. A real (non-symlink) skill folder already there is moved to `~/.claude/skills-backup/`; a leftover `delegate-cli` skill link from older versions is removed. Safe to run again.
3. Open a new terminal tab (or `source ~/.zshrc`).
4. Quit Antigravity completely (Cmd+Q), then reopen it with the debug flag:
   ```bash
   ag start
   ```
   Use this every time you reopen the app. `ag start` never quits a running app (you could lose work); if the app is open without the debug flag it tells you to quit first. Set `AG_PORT=<port>` to change the port.
5. Check: `ag doctor` must print `ok: all … selectors match`.

The skill takes effect in a new Claude Code session. Other agents can read `skills/antigravity-desktop/SKILL.md` directly.

### For an agent installing on the user's behalf
Run `./install.sh` in this folder. Do not run `ag start` and do not quit Antigravity yourself: ask the user to open a new terminal tab, quit Antigravity with Cmd+Q, run `ag start`, then `ag doctor`.

## Usage
```bash
ag status                       # idle | running | waiting-input, open conversation, model
ag ask --new "Summarize README" # new chat in this folder's project, send, wait, print the reply
ag ask --new --model "gemini 4 neon high" "…"  # new chats default to gemini 4 hydrogen high
ag ask "Continue"               # send into the OPEN conversation (refused if it is another project's)
ag ask --no-wait "..."          # send and return at once; later: ag wait
ag answer 1                     # approve the command the agent asks to run (1 = allow once)
ag answer 4 "Don't, do X"       # reject, with a message for the agent
ag answer skip                  # dismiss (the agent treats it as denied)
ag last -n 2                    # last 2 turns
ag list / ag open <id> / ag new
ag project                      # projects and their folders; [cwd] = this folder's project
ag model                        # list models
ag model hydrogen high          # pick Gemini 4 Hydrogen, effort High (after ag new)
ag stop                         # stop the agent
ag help                         # every command and option
```
Errors print `ag: <reason>` and exit 1.

### Parallel tasks: one window each
Antigravity can open several windows, and each runs its own agent at the same time. `ag windows --new` opens one and prints its id (same as Cmd+Shift+N).
- `ag windows` lists them (`<id>\t<title>`). Prefix every command with `AG_WINDOW=<id>` to drive that window; without it `ag` uses the first one.
- Each Claude session that delegates in parallel takes its own window and keeps using the same id. Never drive a window another session uses; if none is free, open one with `ag windows --new`.

### Projects follow the folder you run `ag` in
Antigravity keeps each project's folders in `~/.gemini/config/projects/*.json`. `ag` matches the current directory against them (deepest folder wins), so an agent that runs `ag` from the repo it works on talks to the right Antigravity project:
- `ag new` and `ag ask --new` select that project on the new-chat page.
- `ag ask` without `--new` refuses when the open conversation (window title `<chat> - <project>`) belongs to a different project.
- No project contains the folder → `ag` creates one for it (its git root, named after the folder; the app picks it up live). It refuses only for `~` and `/`.
- Override with `--project <name|path>`; `--project keep` skips the check and leaves the selection as it is.

## Good to know
- **Security:** while the app runs with the debug flag, any program on this machine (local only; the port binds to 127.0.0.1) can control Antigravity, including approving commands. Reopen the app normally when you are not using `ag`.
- **Account risk:** Google's terms may not allow third-party agents to drive Antigravity with a personal account, and accounts have been banned for it. Use `ag` only when you accept that risk.
- **Approval cards** only appear when Antigravity's permission preset asks for them (e.g. "Request Review"; the "Default" preset runs many commands on its own). `ag` cannot change the preset; set it in the app.
- `ag ask --new` creates a new conversation in the sidebar every time.
- **When Antigravity updates**, its UI may change and break `ag`. Run `ag doctor`; a `FAIL` line names the selector to fix in the `SEL` block at the top of `ag.mjs`.
- Tested against the Antigravity UI of 2026-11-25.
