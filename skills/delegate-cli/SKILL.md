---
name: delegate-cli
description: Light audit, write a spec, then hand a coding task to another CLI agent (default gemini with an API key; codex, opencode; agy/Antigravity only when the user names it) running headless in the Terminal panel, monitor progress, answer its questions and verify the result. Use when the user says "delegate", "give it to gemini/agy/codex/opencode", "let a sub-agent do it", "run it in the terminal and watch", or picks a model/effort for an external agent ("giao cho gemini/agy/codex/opencode", "để sub-agent làm", "chạy terminal và theo dõi", chọn model/effort cho agent ngoài). Do not use ai-task.
---

# Delegate a task to a CLI agent through the terminal

> **Language:** if the user writes in Vietnamese, read `SKILL.vi.md` next to this file (`AGENTS.vi.md` at the repo root) and follow it instead. When you change a rule, change both files.

Your role: ARCHITECT + supervisor. Do not edit project code yourself (except files under `.ai/`). The other agent never sees this conversation, only the spec and the prompt.

## 1. Audit (keep it light if the user says "don't read much")
- Read the repo's `AGENTS.md` / `CLAUDE.md`: rules, build commands, modules that must not be touched (e.g. a shared core).
- Grep only the relevant places, check config files and toolchain versions. Do not read the whole codebase.
- `git status` before delegating: note files already modified so you can later tell the agent's changes from pre-existing ones.
- Ask the user (at most 3 questions) only when an ambiguity changes the design.

## 2. Spec
- Save it at `.ai/specs/<slug>.md`, in the language the user is using. Specific enough that someone who has never seen the repo can do it without guessing: paths, signatures, exact names, input → output examples. Do not invent APIs or files you have not checked. Choose the smallest change.
- Required structure:
  ````
  # Spec: <short title>
  ## 1. Audit findings      — current state (file:line), conventions to follow, risks, assumptions
  ## 2. Goal                — one paragraph, from the user's point of view
  ## 3. Scope               — one path/glob per line; anything not listed is out of scope
  ```allowed-files
  path/to/file.ext
  ```
  ## 4. Detailed design     — signatures, data flow, errors, existing helpers to reuse
  ## 5. Acceptance criteria — AC-1, AC-2… verifiable (prefer grep/build)
  ## 6. Required tests      — file, test name, input, expected result, which AC
  ## 7. Must NOT do
  ## 8. Notes for reviewer  — places to check closely
  ````
- State clearly: the risks (initialization order, runtime crashes the build will not catch), "Must NOT do" (core modules, committing, changing versions, downgrading the toolchain), and that the agent must stop and ask instead of guessing.

## 3. Choose the CLI, model, effort
Default to the **gemini CLI with an API key** (Google AI Studio). Before running, check `[ -n "$GEMINI_API_KEY" ]`. If there is no key, stop and ask the user; do not fall back to a personal Google login. Reason: Antigravity/Google terms do not allow third-party agents (Claude Code, Codex, OpenCode...) to drive `agy` or a CLI logged in with a personal account, and accounts have been banned for it. An API key is the permitted route (billed per use).
Use **agy** only when the user names agy in the request. Before running it, warn in one line about the risk of an account ban. agy's default model is in `~/.gemini/antigravity-cli/settings.json` (`"model"`).
Always pass the model explicitly (take the id from the CLI's model list, never guess) and tell the user which model you picked. Check the binary with `which`. List models: `agy models`, `gemini --list-models`, `opencode models`.
**Never** run `--help` of an unfamiliar tool without a timeout: it may start a real task (`ai-task run --help` created a task). Use:
```bash
perl -e 'alarm 10; exec @ARGV' <cli> <subcommand> --help </dev/null
```

| CLI | Headless run | Follow-up in the same session | Notes |
| --- | --- | --- | --- |
| gemini (default) | `gemini -p "<prompt>" -m <model> --approval-mode auto_edit --skip-trust` | `gemini -r latest -p "<answer>"` | needs `GEMINI_API_KEY` |
| agy | `agy -p "<prompt>" --model <id> --effort high` | `agy -c -p "<answer>" --model <id> --effort high` | only when the user names it; account-ban risk; `--mode auto` may not be available for the account |
| codex | `codex exec -m <model> -s workspace-write "<prompt>"` | `codex exec resume --last "<answer>"` | `-o <file>` saves the last message |
| opencode | `opencode run -m <provider/model> "<prompt>"` | `opencode run -c "<answer>"` | `--auto` only with the user's consent |

Do not use `--yolo`, `--dangerously-*` or `--auto` unless the user says so.

**Antigravity desktop app** (not `agy`): only when the user names it; same account risk as agy. Use the `antigravity-desktop` skill (`ag` command). Run `ag` with the repo root as cwd: `ag new` / `ag ask --new` pick the Antigravity project that contains that folder, and `ag ask` without `--new` refuses to send into another project's conversation. No project for the repo yet → ask the user to create one in the app (project menu > New Project).

## 4. Hand off
- Do not use interactive mode (`-i`, TUI): the terminal tool can only type one command line and cannot send keys, so it gets stuck at the trust prompt or at the agent's question.
- Write the prompt to `.ai/specs/<slug>.prompt.txt`. Content: follow the spec exactly, read AGENTS.md, edit only allowed-files, run the build and fix errors you caused, do not commit, when something is ambiguous stop and ask at the end of the reply, finish with the list of edited files, the build result and open questions.
- Run it in the Terminal panel (`run_in_terminal`, give the tab a title, cwd = repo root), logging to a file:
```bash
gemini -p "$(cat .ai/specs/<slug>.prompt.txt)" -m <model> --approval-mode auto_edit --skip-trust 2>&1 | tee .ai/specs/<slug>.run1.log
```

## 5. Monitor
Use `Monitor` (maximum timeout, re-arm when it expires), do not poll by hand:
```bash
cd <repo>; sleep 5; prev=""; while pgrep -f "<cli> .*-p" >/dev/null; do n=$(git status --short | wc -l | tr -d ' '); [ "$n" != "$prev" ] && echo "changed-files=$n" && prev=$n; sleep 20; done; echo "agent exited"; tail -c 3000 .ai/specs/<slug>.runN.log
```
- The initial count includes pre-existing changes; do not count them as the agent's.
- When the count exceeds your estimate: list `git status --short` and compare with allowed-files.
- Give the user a short update at each milestone.

## 6. Answer the agent's questions
- Read the "Open Questions" part of the log (`grep -n "Open Questions" -A 30`).
- Answer yourself when the answer is minimal and follows the repo's rules. Before answering about existing configuration, check where it came from (`git log -S "<string>" -- <file>`, `git show HEAD:<file>`) to learn why it exists.
- Ask the user (AskUserQuestion, with a recommended option) when: editing a shared core module, editing outside allowed-files in a way that changes behavior, or several approaches are equally good.
- Write the answers to `.ai/specs/<slug>.answerN.txt`, number each one, state the scope ("only delete line X, change nothing else"), then send them with the follow-up command from the table above, `| tee .ai/specs/<slug>.runN+1.log`. Re-arm Monitor.

## 7. Verify before reporting done
The agent's report is not evidence. Check yourself:
- Grep-style acceptance criteria (e.g. the old import is gone).
- `git status`: unexpected files, files `git add`-ed despite "do not commit", files the agent says it created but that do not exist.
- Submodules: `git -C <sub> status`, `git -C <sub> log -3` to be sure the agent did not commit there.
- The build output exists (e.g. `app/build/outputs/apk/...`).
- If files change between two checks after the agent has exited: someone or something else (IDE, Antigravity) is editing the repo. Stop, ask the user, do not "fix" it back.
- Do not review the code yourself unless the user asked; say clearly that it was not reviewed.

## 8. Report to the user
Build result, the questions you answered on the user's behalf (with reasons), what was and was not verified, spec/log paths under `.ai/specs/`. Do not commit.

## Environment tips
- When the context-mode plugin blocks large output: write the output to a file in the scratchpad and read it with `Read` using `offset`/`limit`.
- Pass long prompts with `"$(cat file)"`, not inline, so the command stays one line.
