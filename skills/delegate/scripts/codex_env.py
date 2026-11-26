#!/usr/bin/env python3
"""Snapshot môi trường Codex cho skill delegate. Không gọi model, không in secret.

Dùng: codex_env.py <repo> [--full] | --selftest
In bản đầy đủ lần đầu, sau đó chỉ in phần đổi so với snapshot trước.
"""
import difflib
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tomllib

HOME = pathlib.Path.home()
CODEX = HOME / ".codex"
CACHE = HOME / ".cache" / "delegate-cli" / "codex-env"


def run(cmd, cwd=None, timeout=30):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                           timeout=timeout, stdin=subprocess.DEVNULL)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:  # timeout, binary thiếu
        return -1, str(e)


def mcp_lines(cfg):
    # Chỉ in tên, kiểu và cờ enabled: args/env/url có thể chứa secret.
    out = []
    for name, s in sorted(cfg.get("mcp_servers", {}).items()):
        kind = "url" if "url" in s else "command"
        off = "" if s.get("enabled", True) else " (disabled)"
        out.append(f"  {name} [{kind}]{off}")
    return out


def skill_names(root):
    return sorted({p.parent.name for p in root.rglob("SKILL.md")}) if root.exists() else []


def plugin_skills():
    root = CODEX / "plugins" / "cache"
    names = set()
    for p in root.rglob("SKILL.md") if root.exists() else []:
        plugin = p.relative_to(root).parts[1]
        names.add(f"{plugin}:{p.parent.name}")
    return sorted(names)


def allow_rules(d):
    if not d.exists():
        return []
    return [f"  {f.name}: {line.strip()}" for f in sorted(d.glob("*.rules"))
            for line in f.read_text().splitlines() if 'decision="allow"' in line]


def sandbox_probe(repo, label, cmd):
    code, out = run(["codex", "sandbox", "-c", 'sandbox_mode="workspace-write"', "--", *cmd],
                    cwd=repo, timeout=20)
    return f"  {label}: {'OK' if code == 0 else 'BLOCKED'}" + ("" if code == 0 else f" ({out.splitlines()[-1][:90] if out else code})")


def model_line():
    # Model mặc định lấy từ t-run.sh; kiểm còn trong models_cache và còn effort max.
    m = re.search(r"-m (\S+)", (pathlib.Path(__file__).parent / "t-run.sh").read_text())
    slug = m[1] if m else "?"
    try:
        models = json.loads((CODEX / "models_cache.json").read_text())
        models = models.get("models", models) if isinstance(models, dict) else models
        hit = next((x for x in models if x.get("slug") == slug), None)
    except (OSError, ValueError) as e:
        return f"  model mặc định {slug}: không đọc được models_cache ({e.__class__.__name__})"
    if not hit:
        return f"  model mặc định {slug}: KHÔNG CÓ trong models_cache, sửa t-run.sh/t-resume.sh"
    levels = [x.get("effort", x) if isinstance(x, dict) else x for x in hit.get("supported_reasoning_levels", [])]
    return f"  model mặc định {slug}: OK" + ("" if "max" in levels else " nhưng KHÔNG hỗ trợ effort max")


def version(text):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", text)
    return tuple(map(int, m.groups())) if m else (0, 0, 0)


def upgrade_lines(ver, cfg, repo, run_sh):
    """Thay đổi đã biết giữa các bản codex mà skill delegate phụ thuộc."""
    out = []
    if ver >= (0, 169, 0):
        trusted = cfg.get("projects", {}).get(str(repo), {}).get("trust_level") == "trusted"
        has = "--trust" in run_sh
        out.append(f"  trust: repo {'đã trust' if trusted else 'chưa trust'}; t-run.sh "
                   + ("có --trust (OK)" if has else "THIẾU --trust: .codex/rules sẽ không nạp (đo trên 0.172)"))
    if cfg.get("features", {}).get("multi_agent") and ver >= (0, 168, 0):
        out.append("  multi_agent: bật (deprecated từ 0.168, xem `codex features list`); worker có spawn_agent")
    return out


def snapshot(repo):
    cfg = tomllib.loads((CODEX / "config.toml").read_text())
    lines = ["# Codex"]
    ver_text = run(["codex", "--version"])[1]
    lines.append("  " + ver_text)
    lines.append(model_line())
    lines += upgrade_lines(version(ver_text), cfg, repo, (pathlib.Path(__file__).parent / "t-run.sh").read_text())
    for k in ("model", "model_reasoning_effort", "sandbox_mode", "approval_policy"):
        lines.append(f"  config.{k} = {cfg.get(k, '(unset)')}")
    lines.append("  exec: approval luôn là never (đo trên 0.166); không còn tự trust repo từ 0.169 (đo trên 0.172)")
    lines.append(f"  features: {', '.join(f'{k}={v}' for k, v in sorted(cfg.get('features', {}).items()))}")
    g = CODEX / "AGENTS.md"
    lines.append(f"  ~/.codex/AGENTS.md: {g.stat().st_size if g.exists() else 'không có'} byte")

    lines.append("# Skills trên đĩa (ứng viên; danh sách Codex thật sự nạp: xem probe)")
    lines.append("  ~/.codex/skills: " + ", ".join(skill_names(CODEX / "skills")))
    lines.append("  ~/.agents/skills: " + ", ".join(skill_names(HOME / ".agents" / "skills")))
    lines.append("  plugin cache: " + ", ".join(plugin_skills()))
    enabled = [n for n, p in sorted(cfg.get("plugins", {}).items()) if p.get("enabled")]
    lines.append("  plugins enabled: " + ", ".join(enabled))

    lines.append("# MCP khai báo (danh sách thật trong phiên chỉ biết qua probe model)")
    lines += mcp_lines(cfg)

    lines.append("# Hooks đã trust (user/plugin)")
    lines += [f"  {k}" for k in sorted(cfg.get("hooks", {}).get("state", {}))]
    lines.append("# Rules allow ở user layer (chạy NGOÀI sandbox cho mọi repo): "
                 f"{len(allow_rules(CODEX / 'rules'))} dòng (không liệt kê)")

    r = repo / ".codex"
    lines.append(f"# Repo {repo}")
    lines.append("  AGENTS.md: " + ("có" if (repo / "AGENTS.md").exists() else "KHÔNG"))
    lines.append("  .codex/: " + (", ".join(sorted(p.name for p in r.iterdir())) if r.exists() else "không có"))
    hooks = r / "hooks.json"
    if hooks.exists():
        lines.append(f"  hooks.json (cần trust qua /hooks trong TUI): {hooks.read_text()[:300]}")
    rules = allow_rules(r / "rules")
    lines.append(f"  rules allow (chạy NGOÀI sandbox; codex exec tự trust repo nên luôn nạp): {len(rules)}")
    lines += rules

    lines.append("# Sandbox workspace-write (đo bằng codex sandbox)")
    probe_dir = HOME / "Library" / "Caches" / "delegate-cli-probe"
    lines.append(sandbox_probe(repo, "ghi ngoài workspace",
                               ["sh", "-c", f"mkdir -p '{probe_dir}' && rmdir '{probe_dir}'"]))
    lines.append(sandbox_probe(repo, "mạng", ["curl", "-sSI", "-m", "8", "https://example.com"]))
    return "\n".join(lines) + "\n"


def selftest():
    fake = {"mcp_servers": {"lark": {"command": "npx", "args": ["-s", "SECRET123"],
                                     "env": {"TOKEN": "SECRET456"}},
                            "docs": {"url": "https://x/SECRET789", "enabled": False}}}
    text = "\n".join(mcp_lines(fake))
    assert "SECRET" not in text, text
    assert "lark [command]" in text and "docs [url] (disabled)" in text, text
    assert version("codex-cli 0.172.0") == (0, 172, 0) and version("x") == (0, 0, 0)
    cfg = {"features": {"multi_agent": True}, "projects": {"/r": {"trust_level": "trusted"}}}
    new = "\n".join(upgrade_lines((0, 172, 0), cfg, "/r", "codex exec --trust"))
    assert "đã trust" in new and "(OK)" in new and "multi_agent" in new, new
    assert "THIẾU --trust" in "\n".join(upgrade_lines((0, 169, 0), {}, "/x", "codex exec"))
    assert upgrade_lines((0, 166, 0), cfg, "/r", "") == []
    print("selftest OK")


def main():
    if sys.argv[1:] == ["--selftest"]:
        return selftest()
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    repo = pathlib.Path(sys.argv[1]).resolve()
    now = snapshot(repo)
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (hashlib.sha1(str(repo).encode()).hexdigest()[:12] + ".txt")
    old = path.read_text() if path.exists() else None
    path.write_text(now)
    if "--full" in sys.argv or old is None:
        print(("(snapshot mới)\n" if old is None else "") + now, end="")
    elif old == now:
        print(f"KHÔNG ĐỔI so với snapshot trước ({path}). Thêm --full để xem.")
    else:
        print("ĐÃ ĐỔI so với snapshot trước, cân nhắc chạy lại probe model:")
        print("".join(difflib.unified_diff(old.splitlines(True), now.splitlines(True), "trước", "nay", n=0)), end="")


if __name__ == "__main__":
    main()
