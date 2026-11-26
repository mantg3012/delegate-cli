#!/bin/zsh
# Usage: [RESUME_STALE=1] t-resume.sh <slug> <n> <prompt-file> — nối phiên Codex của run <n-1> (session id lấy từ log),
# gửi nội dung <prompt-file> (câu trả lời, yêu cầu chạy lại, câu hỏi kiểm chứng). Log/report số <n>.
# Từ chối (exit 2) khi session đã nguội (> 10 phút và ctx > 60k): resume sẽ trả full giá cả lịch sử.
d=${0:A:h}
cd "$(git rev-parse --show-toplevel)" || exit 1
s=.ai/specs/$1; n=$2; pf=$3
sid=$(grep -m1 -o 'session id: [0-9a-f-]*' $s.run$((n-1)).log | cut -d' ' -f3)
[[ -n $sid ]] || { echo "Không thấy session id trong $s.run$((n-1)).log"; exit 1; }
[[ -n $RESUME_STALE ]] || python3 $d/report.py --stale $s $((n-1)) || exit 2
# Giữ nguyên model/effort/schema như run đầu: đổi một trong số đó làm vỡ cache.
codex exec resume "$sid" --trust -m gpt-6.2-sol -c model_reasoning_effort="max" -c sandbox_mode="workspace-write" \
  --output-schema $d/handoff.schema.json -o $s.report$n.json "$(cat $pf)" </dev/null >$s.run$n.log 2>&1
echo "CODEX_EXIT=$?" >> $s.run$n.log
out=$(python3 $d/report.py $s $n)
print -r -- "$out"
print -r -- "$(date +%m-%d\ %H:%M) $1 run$n resume | ${${(f)out}[1]} | ${${(f)out}[2]}" >> ${DELEGATE_BOARD:-.ai/specs/board.log}
