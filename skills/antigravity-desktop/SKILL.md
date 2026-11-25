---
name: antigravity-desktop
description: Drive the Antigravity desktop app's agent from the shell with the `ag` CLI - send a prompt and read the reply, check whether it is running or waiting for approval, approve or reject its commands, switch conversations. Use when the user asks to send something to Antigravity, ask/hand a task to the Antigravity agent, check on or approve what Antigravity is doing ("gửi cho antigravity", "hỏi antigravity", "duyệt lệnh antigravity"). Not for the headless `agy` CLI.
---

# Antigravity desktop via `ag`

`ag` talks to the running Antigravity app over Chrome DevTools Protocol and prints short plain text. Everything you need is text; never use screenshots to read the app.

## First call
`ag status` → JSON with `state` (`idle` | `running` | `waiting-input`), the open conversation, model and, when waiting, an `ask` block.
- `no CDP on 127.0.0.1:9222` → the app was not started with the debug flag. Tell the user to quit Antigravity (Cmd+Q) and run `ag start`. Do not quit the app yourself (they may lose work).
- Something fails after an Antigravity update → `ag doctor`; a `FAIL` line names the broken selector in the `SEL` block of `ag.mjs`.

## Commands
| Command | Does | Prints |
| --- | --- | --- |
| `ag ask "<prompt>" [--new]` | send to the OPEN conversation (`--new`: fresh one in the cwd's project, current model), wait, print the reply | `## agent` + reply |
| `ag ask ... --no-wait` | send and return | `sent` |
| `ag wait [--timeout s]` | block until not running | `idle` / `waiting-input` + question |
| `ag answer <n> ["text"]` | answer the pending card: `1` allow once, `2`/`3` always allow, last option = No (+ text for the agent) | `ok` |
| `ag answer skip` | dismiss the card (agent treats it as denied) | `ok` |
| `ag last [-n 2]` | last n turns of the open conversation | turns |
| `ag list` / `ag open <id>` / `ag new` | sidebar conversations (id, age like `6m`/`2h` or `open`, title) / open one / go to new-chat page in the cwd's project | |
| `ag project [<name\|path>]` | list projects with their folders (`[cwd]`, `[selected]`) / select one on the new-chat page | list / name |
| `ag model ["<name>" effort]` | list models / pick one, e.g. `ag model hydrogen high` | model list / new model name |
| `ag stop` | stop the running agent | `stopped` / `not running` |
| `ag click "<text>"` | click any button in the conversation (fallback) | `clicked: …` |

Errors print `ag: <reason>` on stderr and exit 1. `ask` refuses to send while the agent is `running` or `waiting-input`.

## Project = the repo you work in
Antigravity projects map to folders (`~/.gemini/config/projects/*.json`). Run `ag` with cwd inside the repo you are working on (Bash cwd, or `cd <repo> && ag …`):
- `ag new` and `ag ask --new` select the project whose folder contains cwd (deepest match). `--project <name|path>` overrides; `--project keep` leaves the selection alone.
- `ag ask` without `--new` refuses when the open conversation belongs to another project (the window title ends with ` - <project>`).
- No project contains cwd → `ag` refuses and lists the projects. Ask the user to create one in the app (project menu > New Project); do not use `--project keep` to send work for one repo into another.

## Approvals
When `ask`/`wait` end with `[state: waiting-input]`, the output already shows the question, the exact command and numbered options. Read it there; do not call `status` again.
- Approve with `ag answer 1` only what the user's request clearly covers. Anything destructive, outside the project, or touching credentials or the network beyond the task: show the user the command and ask first.
- Answer `1` (once). Do not pick `2`/`3` (always allow) yourself: that is a standing permission, and Claude Code's auto mode blocks it. If the same harmless tool keeps asking, tell the user they can pick "always allow" in the app.
- After answering, `ag wait` to get the next state, then `ag last -n 1` for the reply.

## New chat or continue
Decide before every `ask`. Gemini caches the prompt prefix automatically: a turn in a recent conversation re-reads its history mostly from cache (much cheaper), and the agent already knows the files it read. A new chat pays a fixed ~17k-token start (system prompt, tools) plus re-reading the files. But the cache is short-lived (about 15-20 min, not guaranteed), is per model, and an unrelated history only adds tokens to every later turn.

Continue (`ag open <id>` if it is not open, then `ag ask` without `--new`) when ALL hold:
- same topic: a follow-up, a fix or next step of what that chat did, or work on the same files or feature;
- it is a chat you used in this session, or the user named it. Never write into another chat of the user's on your own;
- it is recent: age in `ag list` is `open` or at most ~15m (cache likely warm);
- you have sent it fewer than ~15 turns.

Start a new chat when any holds:
- a different topic or task (judge from the title in `ag list` and what that chat did);
- the chat is older than ~15m and the new task can be stated fully in the prompt;
- the chat is long (~15+ turns): open a new one and put a short summary of the state (files touched, what is done, what is left) at the top of the prompt;
- the task needs a different model tier than the chat uses (a model change breaks the cache anyway).
A same-topic chat that is old but whose context is hard to restate (long investigation, many findings): continue it and accept the cost.

Not sure whether it is the same topic → continue if the chat you used last is at most ~15m old, otherwise start a new chat.
Tell the user in one line: continued `<title>` or new chat, and why.

## Choosing a model
The user named a model → use it. When continuing a chat, keep its model (a change breaks the cache) unless the user asks. Otherwise pick it from this table for a NEW conversation only. Never change the model of an open conversation the user did not ask you to change. Pick the lowest tier that fits: Neon costs about 2x Hydrogen.

| Tier | Task looks like | Model |
| --- | --- | --- |
| 1 Easy | question or explanation, read and summarize, rename, format, comments or docs, a small edit in one file with an obvious change | `ag model "gemini 4 hydrogen" medium` |
| 2 Normal (default) | one feature or bug fix with a known cause in 1-3 files, tests for a given function, a small UI screen | `ag model "gemini 4 hydrogen" high` |
| 3 Hard | a feature across many files or modules, debugging across connected files, a refactor that changes interfaces | `ag model "gemini 4 neon" medium` |
| 4 Very hard | cause unknown after a first attempt, architecture or design, migration, concurrency, performance, security, a long multi-step task | `ag model "gemini 4 neon" high` |

- Cannot tell which tier, or the request is too vague → default: Gemini 4 Hydrogen high.
- `ag model` fails (model unavailable or renamed) → run `ag model` to list, use the default if it is there, and tell the user.
- Order: `ag new` → `ag model …` → `ag ask "…"` WITHOUT `--new` (`--new` would open yet another chat).
- Tell the user in one line which model you picked and why (tier).
- A tier-1/2 task that fails or the agent gets stuck → retry once one tier up in a new chat, and say so.

## Saving tokens
- `ask` already prints only the new reply. Do not follow it with `last` or `status`.
- Cap output with `--max-chars N` (default 4000); use a few hundred for short checks. A cut reply ends with `…[+N chars; all: …]`: run that command only if the missing part matters.
- Tell the Antigravity agent to be brief, and to write long results to a file and reply with the path; read only the part you need.
- Never poll in a loop. `ag wait` blocks. For long tasks: `ag ask --no-wait "..."`, do other work, then `ag wait --timeout 600`.
- Keep `ag`'s `--timeout` below your shell tool's timeout (e.g. Bash default 120 s → `--timeout 110`), or run it in the background; a killed `ag` leaves the agent running (check with `ag status`).
- `ag last -n 1`, not more, unless you need history.
- Never `ag screenshot` except to debug `ag` itself.

## Know before using
- `ask` without `--new` writes into whatever conversation is open: check `conversation` in `ag status` first, and follow "New chat or continue".
- `ag model` lists models; `ag model hydrogen high` picks one (partial name + effort for models that have efforts). Set it on the new-chat page (`ag new` first) so you do not change the model of the user's open conversation.
- `ag` cannot change the permission preset; ask the user to set it in the app.
- Every `--new` creates a conversation in the user's sidebar; mention test conversations you created so they can archive them.
