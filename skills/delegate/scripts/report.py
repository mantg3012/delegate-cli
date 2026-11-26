#!/usr/bin/env python3
"""In report Codex dạng gọn cho coordinator: mỗi mục một dòng, không in log.

Dùng: report.py .ai/specs/<slug> <n>          report gọn + dòng usage
      report.py --stale .ai/specs/<slug> <n>  exit 2 nếu session của run <n> đã nguội (resume sẽ trả full giá)
      report.py --selftest
"""
import datetime
import json
import os
import pathlib
import re
import sys

# Đo trên máy (codex 0.166, gpt-6.2-sol): resume sau ≤5 phút hit ~95%, sau ~15 phút có lần 0%.
STALE_MIN, STALE_CTX = 10, 60_000


def rollout(sid):
    root = pathlib.Path(os.environ.get("CODEX_HOME", pathlib.Path.home() / ".codex")) / "sessions"
    hits = sorted(root.rglob(f"rollout-*{sid}.jsonl"), key=lambda p: p.stat().st_mtime) if sid else []
    return hits[-1] if hits else None


def usage(sid, now=None):
    """turns, tổng input/cached/output, ctx (input của request cuối), tuổi (phút) của request cuối. None nếu không đọc được."""
    p = rollout(sid)
    if not p:
        return None
    turns, total, last, ts = 0, None, None, None
    for line in p.read_text(errors="replace").splitlines():
        try:
            o = json.loads(line)
        except ValueError:
            continue
        pl = o.get("payload") or {}
        info = pl.get("info") or {}
        if o.get("type") == "event_msg" and pl.get("type") == "token_count" and info.get("last_token_usage"):
            turns += 1
            total, last, ts = info.get("total_token_usage") or {}, info["last_token_usage"], o.get("timestamp")
    if not turns:
        return None
    now = now or datetime.datetime.now(datetime.timezone.utc)
    age = (now - datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 60 if ts else None
    return {"turns": turns, "in": total.get("input_tokens", 0), "cached": total.get("cached_input_tokens", 0),
            "out": total.get("output_tokens", 0), "ctx": last.get("input_tokens", 0), "age": age}


def k(n):
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}k"


def usage_line(u):
    if not u:
        return "usage: ? (không đọc được rollout)"
    pct = round(100 * u["cached"] / u["in"]) if u["in"] else 0
    return f"usage: turns={u['turns']} in={k(u['in'])} cached={pct}% out={k(u['out'])} ctx={k(u['ctx'])}"


def is_stale(u):
    return bool(u and u["age"] is not None and u["age"] > STALE_MIN and u["ctx"] > STALE_CTX)


def compact(report, exit_line, sid, u=None):
    r = report
    t = r.get("tests")
    out = [f"{exit_line} session={sid or '?'} status={r['status']}"
           + (f" tests pass={t['pass']} fail={t['fail']} skip={t['skip']}" if t else ""),
           "summary: " + r["summary"], usage_line(u)]
    for key in ("open_questions", "findings", "acceptance", "checks", "files_changed", "artifacts"):
        out += [f"{key}: {x}" for x in r.get(key) or []]
    return "\n".join(out)


def read_log(base, n):
    log = pathlib.Path(f"{base}.run{n}.log").read_text(errors="replace")
    sid = (re.search(r"session id: ([0-9a-f-]+)", log) or [None, None])[1]
    exit_line = (re.findall(r"^CODEX_EXIT=\d+", log, re.M) or ["CODEX_EXIT=?"])[-1]
    return log, sid, exit_line


def selftest():
    import tempfile
    r = {"status": "done", "summary": "ok", "tests": {"pass": 3, "fail": 1, "skip": 0},
         "findings": ["P1|bug|A.swift:3|x"], "checks": [], "acceptance": [],
         "files_changed": ["A.swift"], "artifacts": [], "open_questions": []}
    text = compact(r, "CODEX_EXIT=0", "abc")
    assert "fail=1" in text and "findings: P1|bug|A.swift:3|x" in text, text
    assert "checks:" not in text and "usage: ?" in text, text
    with tempfile.TemporaryDirectory() as d:
        os.environ["CODEX_HOME"] = d
        p = pathlib.Path(d, "sessions/2026/11/26/rollout-2026-11-26T10-00-00-abc-123.jsonl")
        p.parent.mkdir(parents=True)
        ev = lambda ts, inp, c, tot: json.dumps({"timestamp": ts, "type": "event_msg", "payload": {
            "type": "token_count", "info": {"last_token_usage": {"input_tokens": inp},
                                            "total_token_usage": {"input_tokens": tot, "cached_input_tokens": c, "output_tokens": 50}}}})
        p.write_text("\n".join([ev("2026-11-26T10:00:00Z", 30000, 0, 30000), "garbage",
                                ev("2026-11-26T10:05:00Z", 90000, 88000, 120000)]))
        now = datetime.datetime(2026, 11, 26, 10, 20, tzinfo=datetime.timezone.utc)
        u = usage("abc-123", now)
        assert u["turns"] == 2 and u["ctx"] == 90000 and round(u["age"]) == 15, u
        assert usage_line(u) == "usage: turns=2 in=120k cached=73% out=0k ctx=90k", usage_line(u)
        assert is_stale(u) and not is_stale({**u, "age": 3}) and not is_stale({**u, "ctx": 20000})
        assert usage("missing") is None
    print("selftest OK")


def main():
    if sys.argv[1:] == ["--selftest"]:
        return selftest()
    if sys.argv[1] == "--stale":
        _, sid, _ = read_log(sys.argv[2], sys.argv[3])
        u = usage(sid)
        if is_stale(u):
            print(f"NGUỘI: lượt cuối {u['age']:.0f} phút trước, ctx={k(u['ctx'])}: resume sẽ đọc lại cả lịch sử không cache "
                  f"(> {STALE_MIN} phút và > {k(STALE_CTX)}). Cân nhắc exec mới với handoff ngắn; vẫn resume: RESUME_STALE=1.")
            sys.exit(2)
        return
    base, n = sys.argv[1], sys.argv[2]
    log, sid, exit_line = read_log(base, n)
    rp = pathlib.Path(f"{base}.report{n}.json")
    try:
        print(compact(json.loads(rp.read_text()), exit_line, sid, usage(sid)))
    except (OSError, ValueError, KeyError) as e:
        # Không có report hợp lệ: in 8 dòng cuối log để biết vì sao.
        print(f"{exit_line} session={sid or '?'} KHÔNG CÓ REPORT HỢP LỆ ({e.__class__.__name__})")
        print("\n".join(log.splitlines()[-8:]))


if __name__ == "__main__":
    main()
