#!/usr/bin/env node
// ag: drive the Antigravity desktop app over CDP. Needs the app started with `ag start`
// (= open -a Antigravity --args --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1).
import { writeFileSync, readdirSync, readFileSync, realpathSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = process.env.AG_PORT || 9222;
// All UI selectors in one place: fix here when Antigravity updates its UI.
const SEL = {
  input: '[aria-label="Message input"]',
  send: '[data-testid=send-button]',
  stop: '[data-testid=input-cancel-button]', // present only while the agent runs
  newChat: '[data-testid=new-conversation-button]',
  convRow: '[data-testid=conversation-row-sidebar]',
  convView: '[data-testid=conversation-view]',
  user: '[data-testid=user-message]',
  agent: '[data-testid=agent-response]',
  userText: '[data-testid=user-message-content]',
  worked: '[data-testid=worked-for-collapsible]',
  turnCards: '[data-testid=turn-cards-container]', // "2 files changed +74 -5 Review" footer
  mention: 'bdi.context-scope-mention', // inline file chips; their flex span adds newlines to innerText
  model: '[data-testid=model-selector-trigger]',
  project: '[data-testid=project-selector-trigger]', // new-chat page only; aria-label "Select project, current: <name>"
  menuProject: '[data-testid=project-selector-item]', // inside the project menu; data-project-name
  // inside the model menu (only while it is open)
  menuModel: '[data-testid=model-selector-item]', // model without effort levels; data-model-label
  menuEffort: '[data-testid=model-selector-effort-group]', // model with effort submenu; data-model-base
  // card the agent shows when it needs an answer (command approval, questions)
  ask: '[data-testid=interaction-takeover-card]',
  askTitle: '[data-testid=ask-question-header-text]',
  askTarget: '[data-testid=permission-target-editor]', // the command being approved
  askWritein: '[data-testid=ask-question-writein]',
  askSubmit: '[data-testid=interaction-continue-button]',
  askSkip: '[data-testid=interaction-skip-button]',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const die = msg => { console.error('ag: ' + msg); process.exit(1); };

// Antigravity keeps one JSON per project, listing its folders.
const PROJECTS_DIR = join(homedir(), '.gemini/config/projects');
const real = p => { try { return realpathSync(p); } catch { return p; } };
function projects() {
  let files; try { files = readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json')); } catch { return []; }
  return files.flatMap(f => {
    try {
      const p = JSON.parse(readFileSync(join(PROJECTS_DIR, f), 'utf8'));
      const dirs = (p.projectResources?.resources || []).map(r => r.folderUri || r.gitFolder?.folderUri)
        .filter(u => u?.startsWith('file:')).map(u => real(fileURLToPath(u)));
      return p.name ? [{ name: p.name, dirs }] : [];
    } catch { return []; }
  });
}
// the project whose folder is dir or its closest ancestor
function projectFor(dir) {
  const d = real(resolve(dir)); let best, len = -1;
  for (const p of projects()) for (const f of p.dirs)
    if ((d === f || d.startsWith(f.endsWith(sep) ? f : f + sep)) && f.length > len) { best = p; len = f.length; }
  return best;
}
const projectList = () => projects().map(p => `${p.name}\t${p.dirs.join(', ') || '-'}`).join('\n');
const git = (dir, ...a) => { try { return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
// Create a project for dir (its git root if any) the way the app's New Project dialog does;
// the app picks up new files in PROJECTS_DIR live. The dialog itself needs a native folder picker.
function createProject(dir) {
  const d = real(resolve(dir));
  if (!existsSync(d) || !statSync(d).isDirectory()) return null;
  const top = git(d, 'rev-parse', '--show-toplevel'), root = top || d;
  if (root === homedir() || root === sep) die(`refusing to make ${root} an Antigravity project; cd into a repo or pass --project`);
  const taken = new Set(projects().map(p => p.name.toLowerCase()));
  let name = basename(root);
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${basename(root)}-${i}`;
  const branch = git(root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '') || git(root, 'branch', '--show-current') || 'main';
  const uri = pathToFileURL(root).href;
  const id = randomUUID();
  mkdirSync(PROJECTS_DIR, { recursive: true });
  writeFileSync(join(PROJECTS_DIR, id + '.json'), JSON.stringify({
    id, name,
    projectResources: { resources: [top ? { gitFolder: { folderUri: uri, defaultBranch: branch } } : { folderUri: uri }] },
    permissionGrants: { v2Migrated: true }, settings: {}, isWorkspaceOnly: false,
  }, null, 2), { flag: 'wx' });
  console.error(`ag: created Antigravity project "${name}" for ${root}`);
  return { name, dirs: [root] };
}
// --project <name|path> | keep; default: the project of the current directory (created if missing). null = do not switch.
function targetProject(v) {
  if (v === 'keep') return null;
  const p = v ? projects().find(x => x.name.toLowerCase() === v.toLowerCase()) || projectFor(v) || createProject(v) : projectFor(process.cwd()) || createProject(process.cwd());
  if (!p) die(`no Antigravity project named or containing "${v}". Pass --project <name|existing dir> | keep.\nProjects:\n${projectList()}`);
  return p;
}

async function connect() {
  let list;
  try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
  catch { die(`no CDP on 127.0.0.1:${PORT}. Quit Antigravity (Cmd+Q), then run: ag start`); }
  const t = list.find(x => x.type === 'page' && /^https:\/\/127\.0\.0\.1:/.test(x.url) && x.id.startsWith(process.env.AG_WINDOW || ''));
  if (!t) die('Antigravity main window not found' + (process.env.AG_WINDOW ? ` (AG_WINDOW=${process.env.AG_WINDOW})` : ''));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('CDP websocket failed')); });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); pend.delete(m.id); };
  const send = (method, params = {}) => new Promise(r => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  // Run fn(SEL, ...args) inside the page; fn must be self-contained.
  const run = async (fn, ...args) => {
    const m = await send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(SEL)},...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true });
    if (m.error) throw new Error(m.error.message);
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
    return m.result.result.value;
  };
  return { send, run, close: () => ws.close() };
}

// Page-side helpers: serialized into the page, so they must be self-contained.
const pState = S => {
  const card = document.querySelector(S.ask);
  // options are radios; the last one may be a write-in ("No" + free text)
  const ask = card && {
    question: card.querySelector(S.askTitle)?.innerText.trim(),
    command: card.querySelector(S.askTarget)?.value || undefined,
    options: [...card.querySelectorAll('input[type=radio]')].map((r, i) =>
      `${i + 1}. ${r.closest('label')?.innerText.replace(/^\s*\d+\s*/, '').trim() || 'No'}${r.value === '__write_in__' ? ' [+ text]' : ''}`),
  };
  return {
    state: card ? 'waiting-input' : document.querySelector(S.stop) ? 'running' : 'idle',
    conversation: document.title.replace(/ - Antigravity$/, ''), url: location.pathname,
    model: document.querySelector(S.model)?.innerText.trim(),
    project: document.querySelector(S.project)?.innerText.trim(),
    ...(ask && { ask }),
  };
};
const pTurns = (S, n) => {
  const view = document.querySelector(S.convView);
  if (!view) return [];
  return [...view.querySelectorAll(`${S.user},${S.agent}`)].slice(-n).map(el => {
    if (el.matches(S.user)) return { role: 'user', text: (el.querySelector(S.userText) || el).innerText.trim() };
    // drop the "Agent said" header and the "Worked for Ns" collapsible
    let text = el.innerText.replace(/^\s*Agent said\s*/, '');
    const worked = el.querySelector(S.worked)?.innerText.trim();
    if (worked) text = text.replace(worked, '');
    const cards = el.querySelector(S.turnCards)?.innerText.trim();
    if (cards) text = text.replace(cards, `[${cards.replace(/\s*\n\s*/g, ' ').replace(/ Review$/, '')}]`);
    // a chip inside a sentence renders as " \nname\n "; join it back into the line
    for (const m of new Set([...el.querySelectorAll(S.mention)].map(e => e.innerText.trim()).filter(Boolean)))
      text = text.split(` \n${m}`).join(` ${m}`).split(`${m}\n `).join(`${m} `);
    return { role: 'agent', text: text.trim() };
  });
};

async function waitIdle(c, timeoutS) {
  const t0 = Date.now();
  // the stop button can appear a beat after send; give it 5s to show up
  while (Date.now() - t0 < 5000 && (await c.run(pState)).state === 'idle') await sleep(250);
  while (Date.now() - t0 < timeoutS * 1000) {
    const s = await c.run(pState);
    if (s.state !== 'running') return s;
    await sleep(500);
  }
  return { ...(await c.run(pState)), timeout: true };
}

const key = async (c, k) => { for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: { Enter: 13, Escape: 27 }[k], ...(type === 'keyDown' && k === 'Enter' && { text: '\r' }) }); };

// Pick a project on the new-chat page (the only place the selector exists).
async function selectProject(c, name) {
  const cur = () => c.run(S => document.querySelector(S.project)?.getAttribute('aria-label')?.replace(/^.*current: /, '') ?? null);
  const now = await cur();
  if (now === null) die('project selector not found; it only exists on the new-chat page (ag new)');
  if (now === name) return;
  const pick = () => c.run((S, name) => { const i = document.querySelector(`${S.menuProject}[data-project-name="${CSS.escape(name)}"]`); i?.click(); return !!i; }, name);
  await c.run(S => document.querySelector(S.project).click()); await sleep(800);
  let ok = await pick();
  // a project ag just created can take a moment to reach the menu
  if (!ok) { await key(c, 'Escape'); await sleep(1500); await c.run(S => document.querySelector(S.project).click()); await sleep(800); ok = await pick(); }
  if (!ok) { await key(c, 'Escape'); die(`project "${name}" is not in the app's project menu`); }
  await sleep(500);
  if ((await cur()) !== name) die(`could not switch project to "${name}"`);
}

async function selectModel(c, words) {
  words = [...words];
  const effort = words.length > 1 && /^(low|medium|high|extra)$/i.test(words.at(-1)) ? words.pop().toLowerCase() : '';
  const q = words.join(' ').toLowerCase();
  await c.run(S => document.querySelector(S.model).click()); await sleep(700);
  const models = await c.run(S => [
    ...[...document.querySelectorAll(S.menuEffort)].map(g => ({ name: g.dataset.modelBase, effort: true })),
    ...[...document.querySelectorAll(S.menuModel)].map(m => ({ name: m.dataset.modelLabel, off: m.getAttribute('aria-disabled') === 'true' })),
  ]);
  const m = q && (models.find(x => x.name.toLowerCase() === q) || models.find(x => x.name.toLowerCase().includes(q)));
  if (!m) {
    await key(c, 'Escape');
    const lines = models.map(x => x.name + (x.effort ? ' (+effort)' : '') + (x.off ? ' (unavailable)' : ''));
    if (q) die(`no model matching "${q}". Models:\n${lines.join('\n')}`);
    console.log(lines.join('\n')); return null;
  }
  if (m.off) { await key(c, 'Escape'); die(m.name + ' is unavailable'); }
  if (m.effort) {
    if (!effort) { await key(c, 'Escape'); die(`${m.name} needs an effort: low|medium|high|extra`); }
    // the effort submenu opens on real pointer hover, not on click()
    const p = await c.run((S, name) => { const r = [...document.querySelectorAll('[role=menuitem]')].find(e => e.innerText.split('\n')[0] === name).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, m.name);
    for (const dx of [0, 5, 10]) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx, y: p.y });
    await sleep(500);
    const ok = await c.run((S, effort) => { const b = [...[...document.querySelectorAll('[role=menu]')].pop().querySelectorAll('[role=menuitemradio]')].find(e => e.innerText.trim().toLowerCase() === effort); b?.click(); return !!b; }, effort);
    if (!ok) { await key(c, 'Escape'); die(`effort "${effort}" not offered for ${m.name}`); }
  } else await c.run((S, name) => document.querySelector(`${S.menuModel}[data-model-label="${CSS.escape(name)}"]`).click(), m.name);
  await sleep(500);
  return c.run(S => document.querySelector(S.model).innerText.trim());
}


// New chats get a known model, never whatever the new-chat page last had (it may be a costly one).
const DEFAULT_MODEL = 'gemini 4 hydrogen high';
async function newChat(c) {
  const p = targetProject(o.project);
  await c.run(S => document.querySelector(S.newChat).click()); await sleep(800);
  if (p) await selectProject(c, p.name);
  const m = o.model === 'keep' ? null : await selectModel(c, (o.model || DEFAULT_MODEL).split(/\s+/));
  return `project: ${p?.name ?? 'unchanged'}, model: ${m ?? 'unchanged'}`;
}

const askText = s => s.ask ? `\n${s.ask.question}${s.ask.command ? `\n$ ${s.ask.command}` : ''}\n${s.ask.options.join('\n')}\n(reply with: ag answer <n>)` : '';

function printTurns(turns, maxChars) {
  for (const t of turns) {
    const txt = t.text.length > maxChars ? t.text.slice(0, maxChars) + `\n…[+${t.text.length - maxChars} chars; all: ag last -n 1 --max-chars ${t.text.length}]` : t.text;
    console.log(`## ${t.role}\n${txt}\n`);
  }
}

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--new' || a === '--no-wait' || a === '--json') o[a.slice(2)] = true;
    else if (a.startsWith('--') || a === '-n') o[a.replace(/^-+/, '')] = argv[++i];
    else o._.push(a);
  }
  return o;
}

const HELP = `ag — control the Antigravity desktop app (CDP on 127.0.0.1:${PORT})
  ag status                      state (idle|running|waiting-input), conversation, model, pending question
  ag ask "<prompt>" [--new [--model "<name> <effort>"|keep]] [--no-wait] [--timeout 600] [--max-chars 4000] [--project <name|path|keep>]
                                 send a prompt; by default waits and prints the agent's reply.
                                 --new picks the Antigravity project that contains the current directory
                                 (or --project) and sets --model (default: gemini 4 hydrogen high; keep = leave as is);
                                 without --new it refuses if the open chat is another project's
  ag project [<name|path>]       list projects (folder, [cwd], [selected]) / select one on the new-chat page
  ag wait [--timeout 600]        wait until the agent stops running
  ag last [-n 2] [--max-chars 4000]   print the last n turns
  ag list [-n 10]                newest n sidebar conversations (short id, age since last activity or "open", title)
  ag open <conversation-id>      open a conversation
  ag new [--project <name|path|keep>] [--model "<name> <effort>"|keep]
                                 start a new conversation in the current directory's project, default model as above
  ag answer <n> ["text"]         answer the pending card: pick option n (e.g. 1 = allow once,
                                 last = No + optional text for the agent); ag answer skip
  ag click "<button text>"       click any button in the conversation
  ag model ["<name>" [low|medium|high|extra]]
                                 no args: list models; else pick one (name can be partial, e.g. hydrogen high)
  ag stop                        stop the running agent
  ag screenshot [file.png]       save a screenshot (debug only)
  ag doctor                      check every selector still matches the UI
  ag start                       open Antigravity with CDP enabled (macOS; quit the app first)
  ag windows [--new]             list app windows / open a new one and print its id.
                                 AG_WINDOW=<id> ag ... drives that window (default: the first); one window per parallel task.`;

const cdpUp = () => fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.ok, () => false);

// Opens the app with the debug flags. Never quits a running app: the user may have unsaved work.
async function start() {
  if (await cdpUp()) { console.log(`already running with CDP on 127.0.0.1:${PORT}`); return; }
  if (process.platform !== 'darwin') die(`ag start is macOS only; launch Antigravity with --remote-debugging-port=${PORT} --remote-debugging-address=127.0.0.1`);
  let running = true;
  try { execFileSync('pgrep', ['-x', 'Antigravity'], { stdio: 'ignore' }); } catch { running = false; }
  if (running) die('Antigravity is running without CDP. Quit it (Cmd+Q), then run ag start again');
  execFileSync('open', ['-a', 'Antigravity', '--args', `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1']);
  for (let i = 0; i < 60; i++) { if (await cdpUp()) { console.log('ok'); return; } await sleep(500); }
  die(`Antigravity opened but CDP did not answer on 127.0.0.1:${PORT} within 30s`);
}

const o = parse(process.argv.slice(2));
const cmd = o._[0];
if (!cmd || cmd === 'help' || o.help) { console.log(HELP); process.exit(0); }
if (cmd === 'start') { await start(); process.exit(0); }
const appWindows = () => fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json(), () => die(`no CDP on 127.0.0.1:${PORT}; run: ag start`))
  .then(l => l.filter(x => x.type === 'page' && /^https:\/\/127\.0\.0\.1:/.test(x.url)));
if (cmd === 'windows' && !o.new) {
  console.log((await appWindows()).map(x => `${x.id.slice(0, 8)}\t${x.title.replace(/ - Antigravity$/, '')}`).join('\n'));
  process.exit(0);
}
const c = await connect();
const timeout = Number(o.timeout || 600), maxChars = Number(o['max-chars'] || 4000);

try {
  switch (cmd) {
    case 'windows': {
      // the app opens a window on Cmd+Shift+N from its page's before-input-event, which CDP key events reach
      const before = new Set((await appWindows()).map(x => x.id));
      for (const type of ['rawKeyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: 'N', code: 'KeyN', windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 45, modifiers: 4 | 8 }); // 45 = macOS key code for N; without it the app ignores the key
      for (let i = 0; i < 20; i++) {
        const w = (await appWindows()).find(x => !before.has(x.id));
        if (w) { console.log(w.id.slice(0, 8)); break; }
        if (i === 19) die('no new window appeared; press Cmd+Shift+N in the app');
        await sleep(500);
      }
      break;
    }

    case 'status': { const { url, ...s } = await c.run(pState); console.log(JSON.stringify(s)); break; }

    case 'new': {
      console.log(`ok (${await newChat(c)})`); break;
    }

    case 'project': {
      if (!o._[1]) {
        const here = projectFor(process.cwd())?.name;
        const cur = await c.run(S => document.querySelector(S.project)?.getAttribute('aria-label')?.replace(/^.*current: /, ''));
        console.log(projects().map(p => `${p.name}\t${p.dirs.join(', ') || '-'}${p.name === here ? '\t[cwd]' : ''}${p.name === cur ? '\t[selected]' : ''}`).join('\n'));
        break;
      }
      const p = targetProject(o._.slice(1).join(' '));
      await selectProject(c, p.name); console.log(p.name); break;
    }

    case 'ask': {
      const text = o._.slice(1).join(' ');
      if (!text) die('ask needs a prompt');
      if (o.model && !o.new) die('--model only applies with --new; to change the open chat\'s model use ag model');
      if (o.new) console.error(`ag: new chat (${await newChat(c)})`);
      const before = await c.run(pState);
      if (before.state !== 'idle') die(`agent is ${before.state}; use ag wait / ag stop first`);
      if (!o.new && o.project !== 'keep') {
        // the window title is "<conversation> - <project>"; refuse to send work for one repo into another repo's chat
        const want = targetProject(o.project);
        const has = projects().find(x => before.conversation.endsWith(' - ' + x.name));
        if (before.url === '/') await selectProject(c, want.name);
        else if (has && has.name !== want.name) die(`open conversation is in project "${has.name}", not "${want.name}". Use --new, ag open <id>, or --project keep`);
      }
      const prevAgents = await c.run(S => document.querySelectorAll(S.agent).length);
      await c.run(S => { const i = document.querySelector(S.input); if (!i) throw new Error('input not found'); i.focus(); document.execCommand('selectAll'); });
      await c.send('Input.insertText', { text });
      await sleep(300);
      // the home page (new chat) has no send button; Enter submits there
      const clicked = await c.run(S => { const b = document.querySelector(S.send); b?.click(); return !!b; });
      if (!clicked) await key(c, 'Enter');
      if (o['no-wait']) { console.log('sent'); break; }
      const s = await waitIdle(c, timeout);
      // a new conversation starts with 0 turns, so only print turns added by this prompt
      const added = (await c.run(S => document.querySelectorAll(S.agent).length)) - (o.new ? 0 : prevAgents);
      printTurns((await c.run(pTurns, 1)).filter(() => added > 0), maxChars);
      if (s.state !== 'idle' || s.timeout) console.log(`[state: ${s.state}${s.timeout ? ', timed out' : ''}]` + askText(s));
      break;
    }

    case 'wait': {
      const s = await waitIdle(c, timeout);
      console.log(s.state + (s.timeout ? ' (timed out)' : '') + askText(s));
      break;
    }

    case 'last': printTurns(await c.run(pTurns, Number(o.n || 2)), maxChars); break;

    case 'list': {
      // second line of a row is its age (6m, 2h); the open row shows none
      const rows = await c.run(S => [...document.querySelectorAll(S.convRow)].map(r => {
        const l = r.innerText.split('\n').map(s => s.trim()).filter(Boolean);
        return `${r.dataset.cascadeId.slice(0, 8)}\t${r.dataset.selected === 'true' ? 'open' : l.length > 1 ? l.at(-1) : '-'}\t${l[0]}`;
      }));
      console.log(rows.slice(0, Number(o.n || 10)).join('\n')); break;
    }

    case 'open': {
      const id = o._[1]; if (!id) die('open needs a conversation id (see ag list)');
      // ag list prints 8-char ids; accept any unique prefix of the full id
      const n = await c.run((S, id) => { const a = document.querySelectorAll(`${S.convRow}[data-cascade-id^="${CSS.escape(id)}"] a`); if (a.length === 1) a[0].click(); return a.length; }, id);
      if (n !== 1) die(n ? `id prefix "${id}" matches ${n} conversations; use more characters` : 'conversation not found in sidebar: ' + id);
      await sleep(1200); console.log('ok'); break;
    }

    case 'click': {
      const label = o._.slice(1).join(' '); if (!label) die('click needs button text');
      const r = await c.run((S, label) => {
        const scope = document.querySelector(S.convView) || document;
        const all = [...scope.querySelectorAll('button')];
        const name = b => (b.innerText.trim() || b.getAttribute('aria-label') || '').split('\n')[0];
        // prefer exact match, newest first
        const b = all.reverse().find(b => name(b).toLowerCase() === label.toLowerCase()) || all.find(b => name(b).toLowerCase().includes(label.toLowerCase()));
        if (!b) return null; b.click(); return name(b);
      }, label);
      if (!r) die(`no button matching "${label}" (see ag status)`);
      console.log('clicked: ' + r); break;
    }

    case 'answer': {
      const pick = o._[1], text = o._.slice(2).join(' ');
      if (!pick) die('answer needs an option number or "skip" (see ag status)');
      const r = await c.run((S, pick) => {
        const card = document.querySelector(S.ask);
        if (!card) return 'no pending question';
        if (pick === 'skip') { card.querySelector(S.askSkip).click(); return 'ok'; }
        const radio = card.querySelectorAll('input[type=radio]')[Number(pick) - 1];
        if (!radio) return `no option ${pick}`;
        radio.click();
        if (radio.value === '__write_in__') card.querySelector(S.askWritein)?.focus();
        return 'ok';
      }, pick);
      if (r !== 'ok') die(r);
      if (pick !== 'skip') {
        if (text) await c.send('Input.insertText', { text }); // only lands in the write-in box, which has focus
        await sleep(200);
        await c.run(S => document.querySelector(S.ask)?.querySelector(S.askSubmit)?.click());
      }
      console.log('ok'); break;
    }

    case 'model': { const m = await selectModel(c, o._.slice(1)); if (m) console.log(m); break; }

    case 'stop': {
      const ok = await c.run(S => { const b = document.querySelector(S.stop); if (b) b.click(); return !!b; });
      console.log(ok ? 'stopped' : 'not running'); break;
    }

    case 'screenshot': {
      const f = o._[1] || `ag-${Date.now()}.png`;
      const m = await c.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(f, Buffer.from(m.result.data, 'base64')); console.log(f); break;
    }

    case 'doctor': {
      // conversation-only selectors are only checked when a conversation is open
      const r = await c.run(S => Object.fromEntries(Object.entries(S).map(([k, v]) => [k, document.querySelectorAll(v).length])));
      const inConv = r.convView > 0;
      const optional = new Set(['stop', 'send', 'worked', 'turnCards', 'mention',...Object.keys(r).filter(k => /^(ask|menu)/.test(k)),...(inConv ? ['project'] : ['convView', 'user', 'userText', 'agent'])]);
      let bad = 0;
      for (const [k, n] of Object.entries(r)) if (!n && !optional.has(k)) { bad++; console.log(`FAIL ${k}: ${SEL[k]}`); }
      if (bad) process.exitCode = 1; else console.log(`ok: all ${Object.keys(r).length} selectors match`); break;
    }

    default: die(`unknown command "${cmd}"\n\n${HELP}`);
  }
} finally { c.close(); }
