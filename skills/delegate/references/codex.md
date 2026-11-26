# Codex làm worker

## Môi trường
Chạy trước mỗi lần giao việc (không gọi model, khoảng 1 giây):
```bash
python3 ~/.claude/skills/delegate/scripts/codex_env.py <repo>
```
- Lần đầu in đầy đủ, sau đó chỉ in `KHÔNG ĐỔI` hoặc phần đổi (`--full` để xem lại). Có dòng kiểm model mặc định còn trong `~/.codex/models_cache.json` và còn effort `max`, dòng `trust` (repo đã trust chưa, `t-run.sh` có `--trust` không), dòng `multi_agent`. Script chỉ in tên MCP, không in args/env/url.
- Khi snapshot báo đổi version, skill, plugin, MCP hoặc chưa có probe: chạy một probe, lưu vào `~/.cache/delegate-cli/codex-env/probe-<ngày>.md`:
  ```bash
  codex exec --ephemeral -C <repo> -s read-only -m gpt-6.2-sol -c model_reasoning_effort="low" -o <file> "Inventory only, do not edit or build. List: (1) skills available with source path; (2) MCP servers and tool namespaces; (3) instruction files loaded; (4) hooks or startup warnings; (5) sandbox, approval, network, writable roots; (6) built-in tools. Say 'unknown' instead of guessing."
  ```
- Đổi version: đo lại bảng dưới (ít nhất dòng `--trust` + rule), cập nhật dòng "đo trên".
- Build/test chạy được nhờ rule allow trong `<repo>/.codex/rules/*.rules`, khớp theo tiền tố lệnh. Chưa có rule thì đưa người dùng nội dung để HỌ tự tạo (auto mode chặn Claude tạo rule chạy ngoài sandbox), ví dụ:
  ```
  prefix_rule(pattern=["xcodebuild", "-project", "<path>.xcodeproj", "-scheme", "<scheme>"], decision="allow")
  prefix_rule(pattern=["xcrun", "xcresulttool"], decision="allow")
  prefix_rule(pattern=["xcrun", "devicectl", "list", "devices"], decision="allow")
  ```
  Repo có rule allow không do người dùng đặt: báo trước khi giao. Không dùng `-s danger-full-access`, `--dangerously-*`, `--yolo`.

## Năng lực đã đo
| Điểm | Thực tế | Đo trên |
| --- | --- | --- |
| Approval trong `codex exec` | Luôn `never`: lệnh bị sandbox chặn là hỏng, không xin quyền | 0.166 |
| `-s workspace-write` | Ghi repo, `/tmp`, `$TMPDIR`. Chặn ghi ngoài (DerivedData, `~/Library`), chặn mạng, không thấy keychain/chứng chỉ ký, không gọi được `devicectl` | 0.166 |
| Rule allow (repo hoặc `~/.codex/rules/`) | Lệnh khớp tiền tố chạy ngoài sandbox, kể cả `xcodebuild` trên máy thật. Lệnh có pipe/`&&` hoặc lệch tiền tố rơi lại vào sandbox | 0.166 |
| Trust | **Từ 0.169 `exec` không tự trust repo**: không có `--trust` thì rule repo không nạp (curl bị chặn); có `--trust` thì chạy được và ghi `trust_level = "trusted"` vào `~/.codex/config.toml` (mỗi worktree mới thêm một mục). `t-run.sh`/`t-resume.sh` luôn truyền `--trust` | 0.172 |
| Hook repo `.codex/hooks.json` | Bị bỏ qua tới khi người dùng trust qua `/hooks` trong TUI | 0.166 |
| `--output-schema` + `-o` | Message cuối là JSON đúng schema (nhận cả `["object","null"]`) | 0.166 |
| `codex exec resume <id>` | Nối đúng phiên; không có `-s`, dùng `-c sandbox_mode=...`; có `--trust`, `-m`, `--output-schema`. Từ 0.172 tự khôi phục sandbox/cwd đã lưu | 0.172 (help) |
| Multi-agent | `features.multi_agent=true` (deprecated): worker là `/root`, có `spawn_agent` (~1 lần/run). `worker-rules.md` giới hạn cho research read-only | 0.166 |
| MCP | Tool MCP bị defer qua tool search (luôn bật): gần như không tốn prefix, không cần tắt cho worker | docs 0.172 |
| `codex exec --worktree` | Có (worktree do Codex quản lý, từ HEAD). Không dùng: thiếu thay đổi chưa commit và file gitignored; dùng `t-wave.sh` | 0.172 (help) |

## Chạy và resume
- `t-run.sh <slug> <n>`: ghép `worker-rules.md` (hoặc `review-rules.md` khi `MODE=review`, sandbox read-only) + spec, chạy `codex exec --trust -m gpt-6.2-sol -c model_reasoning_effort="max" -s workspace-write --output-schema handoff.schema.json`, ghi `.ai/specs/<slug>.run<n>.log` và `.report<n>.json`, in bản gọn qua `report.py`, thêm một dòng vào board.
- `t-resume.sh <slug> <n> <answer-file>`: lấy session id từ log run `<n-1>`, kiểm nguội (`report.py --stale`), rồi `codex exec resume <id>` cùng model/effort/schema.

## Cache (đo trên máy, 25 run, 2026-11)
- Turn đầu mỗi `exec` mới: 27–31k token, **cached 0**, kể cả nhiều worker khởi động cùng lúc với prefix giống nhau. Không có cách chia cache giữa các run qua CLI (codex#35300 còn open). Vì vậy không cần tối ưu thứ tự prompt.
- Trong một session: hit 95–98%. Resume sau ≤5 phút: ~95%. Sau ~15 phút: có lần 0%. Sau 38 giờ: 0% trên 288k token.
- Chi phí/run trung bình (~55 turn, credit 50/2.5/250 per 1M): uncached ~16, cached ~27, output ~14. Phần lớn là context × số turn: spec rõ (ít turn dò), chỉ đường dẫn thay vì dán nội dung, report ngắn.
- Giữ nguyên model, effort, `--output-schema` giữa run và resume: đổi một trong số đó làm vỡ cache.
