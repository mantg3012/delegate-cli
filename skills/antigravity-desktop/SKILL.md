---
name: antigravity-desktop
description: Drive the Antigravity desktop app's agent from the shell with the `ag` CLI - send a prompt and read the reply, check whether it is running or waiting for approval, approve or reject its commands, switch conversations. Use when the user asks to send something to Antigravity, ask/hand a task to the Antigravity agent, check on or approve what Antigravity is doing ("gửi cho antigravity", "hỏi antigravity", "duyệt lệnh antigravity"). Not for the headless `agy` CLI.
---

# Antigravity desktop via `ag`

`ag` drives the running Antigravity app over CDP and prints short plain text. Never use screenshots to read the app.

## First call
`ag status` → JSON: `state` (`idle` | `running` | `waiting-input`), open `conversation` (title ends with ` - <project>`), `model`, and an `ask` block when waiting.
- `no CDP on 127.0.0.1:9222` → tell the user to quit Antigravity (Cmd+Q) and run `ag start`. Never quit the app yourself (unsaved work).
- Breaks after an Antigravity update → `ag doctor`; a `FAIL` line names the broken selector in `SEL` in `ag.mjs`.

## Commands
| Command | Does | Prints |
| --- | --- | --- |
| `ag ask "<prompt>" [--new]` | send to the OPEN conversation (`--new`: fresh one in cwd's project), wait, print the reply | `## agent` + reply |
| `ag ask ... --no-wait` | send and return | `sent` |
| `ag wait [--timeout s]` | block until not running | `idle` / `waiting-input` + question |
| `ag answer <n> ["text"]` / `ag answer skip` | answer the pending card (`1` allow once, last option = No + text) / dismiss it (= denied) | `ok` |
| `ag last [-n 2]` | last n turns of the open conversation | turns |
| `ag list [-n 10]` / `ag open <id>` / `ag new` | newest chats (short id, age like `6m` or `open`, title) / open one / new-chat page in cwd's project | |
| `ag project [<name\|path>]` | list projects (`[cwd]`, `[selected]`) / select one on the new-chat page | |
| `ag model ["<name>" effort]` | list models / pick one, e.g. `ag model hydrogen high` | |
| `ag stop` | stop the running agent | `stopped` / `not running` |
| `ag click "<text>"` | click any button in the conversation (fallback) | `clicked: …` |

Errors print `ag: <reason>` on stderr and exit 1. `ask` refuses while the agent is `running` or `waiting-input`.

## Project = the repo you work in
Run `ag` with cwd inside the repo you work on (`cd <repo> && ag …`). Projects map to folders (`~/.gemini/config/projects/*.json`).
- `ag new` / `ag ask --new` select the project containing cwd (deepest match); none → `ag` creates one for cwd's git root. `--project <name|path>` overrides.
- `ag ask` without `--new` refuses if the open chat belongs to another project. Do not use `--project keep` to push one repo's work into another's chat.

## Parallel tasks: one window each
Each Antigravity window runs its own agent. `ag windows --new` opens one and prints its id; `ag windows` lists them. Prefix commands with `AG_WINDOW=<id>` (default: first window). Each delegating Claude session keeps its own window id; never drive a window another session uses.

## Approvals
`ask`/`wait` ending in `[state: waiting-input]` already show the question, command and numbered options; do not call `status` again.
- `ag answer 1` (once) only for what the user's request clearly covers. Destructive, outside the project, credentials, or network beyond the task → show the user the command and ask first.
- Never pick `2`/`3` (always allow) yourself; if a harmless tool keeps asking, tell the user they can choose it in the app.
- Then `ag wait`, then `ag last -n 1` for the reply.

## New chat or continue
Decide before every `ask`. A new chat costs ~17k tokens to start plus re-reading files; continuing reuses Gemini's prompt cache (~15 min, per model, not guaranteed), but unrelated history makes every later turn dearer.

Continue (`ag open <id>`, then `ag ask` without `--new`) when ALL hold: same topic (follow-up, fix, same files or feature); a chat you used this session or the user named (never write into another of the user's chats on your own); age `open` or ≤ ~15m; fewer than ~15 turns sent.
Otherwise start a new chat. If it is long, put a short state summary (files touched, done, left) at the top of the prompt. If same-topic context is too costly to restate, continue anyway. Unsure → continue only if your last chat is ≤ ~15m old.
Tell the user in one line: continued `<title>` or new chat, and why.

## Choosing a model
User named one → use it. Continuing → keep the chat's model (a change breaks the cache); never change an open chat's model unasked. New chat → lowest tier that fits (Neon ≈ 2x Hydrogen):
1. Easy (explain, summarize, rename, docs, obvious one-file edit) → `--model "gemini 4 hydrogen medium"`
2. Normal, default (feature or known-cause fix in 1-3 files, tests, small UI) → `gemini 4 hydrogen high` (used when `--model` is omitted)
3. Hard (many files, cross-file debugging, interface refactor) → `--model "gemini 4 neon medium"`
4. Very hard (unknown cause after a try, architecture, migration, concurrency, performance, security, long multi-step) → `--model "gemini 4 neon high"`

- Use `ag ask --new --model "<name> <effort>" "…"`; a new chat never inherits the app's last model. Model unavailable → `ag model` to list, fall back to the default, tell the user.
- Say which tier and why in one line. A tier-1/2 task that fails or gets stuck → retry once a tier up in a new chat.

## Saving tokens
- `ask` prints only the new reply; do not follow it with `last` or `status`.
- `--max-chars N` caps output (default 4000; a few hundred for checks). A cut reply ends with `…[+N chars; all: …]`; run that only if needed.
- Tell the agent to be brief and to write long results to a file and reply with the path.
- Never poll. Long tasks: `ag ask --no-wait`, do other work, then `ag wait`. Keep `--timeout` below your shell timeout (Bash 120 s → `--timeout 110`); a killed `ag` leaves the agent running.
- `ag screenshot` only to debug `ag` itself.

## Know before using
- `ag` cannot change the permission preset; ask the user to set it in the app.
- Every `--new` adds a chat to the user's sidebar; mention test chats you created so they can archive them.
