#!/bin/zsh
# Usage: [MODE=review] t-run.sh <slug> <n> — Codex làm spec .ai/specs/<slug>.md (kèm worker-rules.md);
# log/report số <n>. Khi xong in bản tóm tắt gọn (report.py), không in log, và ghi 1 dòng vào board.
# MODE=review: reviewer read-only, ghép review-rules.md thay cho worker-rules.md.
# DELEGATE_BOARD: file board (mặc định .ai/specs/board.log của repo đang chạy; t-wave.sh trỏ về repo chính).
d=${0:A:h}
cd "$(git rev-parse --show-toplevel)" || exit 1
s=.ai/specs/$1; n=$2
[[ -f $s.md ]] || { echo "Thiếu spec $s.md"; exit 1; }
rules=worker-rules.md sandbox=workspace-write
[[ $MODE == review ]] && rules=review-rules.md sandbox=read-only
# --trust: từ codex 0.169 exec không tự trust repo; thiếu nó thì .codex/rules không nạp (đo trên 0.172).
codex exec --trust -m gpt-6.2-sol -c model_reasoning_effort="max" -s $sandbox \
  --output-schema $d/handoff.schema.json -o $s.report$n.json \
  "$(cat $d/$rules; echo "Spec file: $s.md"; cat $s.md)" </dev/null >$s.run$n.log 2>&1
echo "CODEX_EXIT=$?" >> $s.run$n.log
out=$(python3 $d/report.py $s $n)
print -r -- "$out"
print -r -- "$(date +%m-%d\ %H:%M) $1 run$n ${MODE:-work} | ${${(f)out}[1]} | ${${(f)out}[2]}" >> ${DELEGATE_BOARD:-.ai/specs/board.log}
