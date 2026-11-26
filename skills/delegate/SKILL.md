---
name: delegate
description: Claude làm coordinator, giao việc cho một worker là Codex CLI hoặc agent trong app Antigravity desktop (qua `ag`), hoặc gemini/opencode - implement nhiều bước, viết và chạy test, research lấy context, review read-only, chạy nhiều worker song song bằng worktree - rồi trả lời câu hỏi của nó và nhận report gọn. Gõ `/delegate` để chọn worker, hoặc `/delegate codex …` / `/delegate antigravity …`. Dùng khi người dùng bảo "giao cho codex/antigravity/ag/gemini/opencode", "delegate", "để sub-agent làm", "chạy song song", hoặc khi một task tốn nhiều token. Không dùng ai-task.
argument-hint: "[codex|antigravity] [task]"
---

# Claude điều phối, worker làm

Đối số: `$ARGUMENTS`

Claude là COORDINATOR: plan, viết spec, giao việc, trả lời câu hỏi của worker, kiểm chất lượng ở mức report. Worker không thấy hội thoại, chỉ thấy spec. Mục tiêu số một là **tiết kiệm token của Claude**: không đọc log, diff, xcresult hay code chi tiết khi report đã đủ.

## Chọn worker (trước mọi việc khác)
Không có worker mặc định.
- Từ đầu tiên của đối số (hoặc lời người dùng) là `codex` → Codex; `antigravity`/`ag` → Antigravity; `gemini`/`opencode`/`agy` → CLI đó. Phần còn lại là task.
- Không nêu worker: hỏi bằng AskUserQuestion, một câu, header `Worker`, không đánh dấu option nào là khuyến nghị:
  - `Codex`: `codex exec` gpt-6.2-sol effort max, chạy nền trong sandbox, report JSON theo schema, resume để trả lời.
  - `Antigravity`: agent trong app Antigravity qua `ag`, Gemini 4 Hydrogen high (Orchestrator cho task lớn); có rủi ro ToS tài khoản Google.
  (Người dùng chọn "Other" để gõ gemini/opencode.)
- Đã chọn worker trong session này: dùng lại, không hỏi lại mỗi lần giao, trừ khi người dùng đổi.
- Không có task trong đối số: hỏi người dùng cần giao việc gì (văn bản thường, không cần dialog).

Scripts ở `~/.claude/skills/delegate/scripts/` (gọi tắt `$d`). Đọc reference của worker đã chọn, chỉ khi cần:
| Worker / việc | Reference |
| --- | --- |
| Codex | `references/codex.md`: môi trường, sandbox, `.codex/rules`, `--trust`, chạy/resume, cache |
| Antigravity desktop (`ag`) | `references/antigravity.md`: cảnh báo ToS, luồng `ag`, footer prompt, model, usage |
| gemini, opencode, agy | `references/other-clis.md` |
| Nhiều worker song song | `references/wave.md`: `t-wave.sh`, worktree, board, gộp (Codex) |
| Viết spec | `references/spec-template.md` |

## Phân việc
| Việc | Ai làm |
| --- | --- |
| Planning từ context đã có | Claude |
| Tweak thật sự nhỏ (vài dòng, biết rõ chỗ sửa), hoặc spec sẽ dài hơn code | Claude tự sửa |
| Implement nhiều bước, nhiều file, hoặc có khả năng tốn token | Worker |
| Viết test, chạy test (unit, XCUITest), đọc kết quả | Worker, report lại; Claude đọc report, xem ảnh nếu ít |
| Research lấy context (đọc nhiều file, tìm nguyên nhân, audit) | Worker như sub agent, report có kết luận + file:line |
| Review thay đổi của worker | Worker khác, read-only (mục 6) |
| Câu hỏi của worker | Claude trả lời (mục 5) |

**Tin worker:** worker đủ tốt để tin report. Muốn kiểm chứng một điểm thì resume và hỏi lại worker, không tự đọc code hay chạy lại lệnh. Tuân luật thiết bị/build trong `CLAUDE.md` của người dùng (vd máy thật thay simulator).

## 0. Giữ context ngắn
- Đọc report bằng output của script, không mở file report/log trừ khi output báo thiếu.
- Context đã dài (nhiều vòng giao việc): đề nghị người dùng mở session mới. Trước đó ghi `.ai/specs/<slug>.handoff.md` (tối đa ~40 dòng): mục tiêu, spec, run số mấy, session id, việc xong/còn lại, quyết định đã chốt, bẫy đã gặp.

## 1. Audit nhẹ
- Đọc `AGENTS.md`/`CLAUDE.md` của repo; grep đúng chỗ liên quan. Phần đọc nhiều thì giao worker research.
- `git status` trước khi giao, để phân biệt thay đổi của worker với thay đổi có sẵn.
- Hỏi người dùng (tối đa 3 câu) chỉ khi điểm mơ hồ làm đổi thiết kế.

## 2. Môi trường
Codex: `python3 $d/codex_env.py <repo>` trước mỗi lần giao (không gọi model, ~1 giây; chi tiết trong `references/codex.md`). Dòng nào báo `THIẾU`, `KHÔNG CÓ`, `BLOCKED` hay `ĐÃ ĐỔI` thì xử lý trước khi giao. Antigravity: `ag status` (xem reference).

## 3. Spec
Lưu ở `.ai/specs/<slug>.md`, bằng ngôn ngữ người dùng, theo `references/spec-template.md`. Luật chung của worker (allowed-files, không commit, chỉ làm trong repo, format report) nằm trong `scripts/worker-rules.md` và được ghép tự động: **không viết lại trong spec**. Spec chỉ ghi cái riêng của task, đủ cụ thể để không phải đoán. Repo có gitnexus: ghi ở mục 0 của spec để worker dùng `impact`/`context` thay vì đọc rộng.

## 4. Chạy
**Antigravity:** theo `references/antigravity.md` (gửi bằng `ag ask --no-wait`, chờ bằng `ag wait` chạy nền). Phần dưới là Codex.

**Codex**, chạy bằng Bash `run_in_background` (Claude được báo khi tiến trình thoát):
```bash
zsh $d/t-run.sh <slug> <n>
```
Output: dòng `CODEX_EXIT`, session, status, số test; `summary`; `usage` (turns, cached %, ctx); rồi mỗi mục một dòng. Đó là thứ duy nhất Claude cần đọc. Mỗi run thêm một dòng vào `.ai/specs/board.log`.
- Báo người dùng model/effort đã dùng. Chỉ đổi CLI/model khi người dùng yêu cầu.
- Máy thật dùng chung: trước khi worker chạy test trên máy, hỏi người dùng máy có đang dùng không. Một tiến trình test trên máy tại một thời điểm.
- Các phần độc lập, không chồng file, mỗi phần đủ lớn: chạy song song theo `references/wave.md`.

## 5. Trả lời câu hỏi của worker
Khi `status=needs_answer`, **Claude tự trả lời** (worker kèm đề xuất cho từng câu; đồng ý thì chỉ cần xác nhận).
- Dựa vào spec, quy tắc repo và context đã có. Cần biết lý do một cấu hình có sẵn: `git log -S "<chuỗi>" -- <file>`, đừng đọc rộng.
- Chỉ hỏi người dùng (AskUserQuestion, có option khuyến nghị) khi đó là quyết định của họ: sửa module core dùng chung, mở rộng phạm vi làm đổi hành vi, quyết định sản phẩm có nhiều hướng ngang nhau, hoặc quy tắc repo bảo phải hỏi.
- Ghi câu trả lời vào `.ai/specs/<slug>.answer<n>.txt`, đánh số theo câu hỏi, nói rõ phạm vi ("chỉ xoá dòng X"). Antigravity: gửi theo bước 6 của reference. Codex: `zsh $d/t-resume.sh <slug> <n> .ai/specs/<slug>.answer<n>.txt` (background).
- Codex: `t-resume.sh` từ chối (exit 2, in `NGUỘI`) khi lượt cuối > 10 phút và context > 60k: resume lúc đó đọc lại cả lịch sử không cache (đo được: 288k token full giá). Khi đó: nếu lịch sử khó viết lại thì chạy lại với `RESUME_STALE=1`; còn lại viết handoff ngắn vào spec mới và `t-run.sh` (turn đầu chỉ ~30k). Trả lời sớm để tránh nguội.
- `status=blocked` vì lỗi build/test ở file ngoài allowed-files: Claude tự sửa nếu nhỏ (hoặc mở rộng allowed-files nếu hợp lý), rồi resume với "đã sửa X, build/test lại". Vì lỗi máy (khoá, mất kết nối, "Timed out while enabling automation mode"): nhờ người dùng xử lý, rồi resume "chỉ chạy lại, không sửa file".

## 6. Nhận kết quả và review
- Đủ để báo xong: `CODEX_EXIT=0`, `status=done`, không còn `open_questions`, `files_changed` nằm trong allowed-files (`git status --short` một lần), không có gì bị `git add`/commit (cả trong submodule).
- Test: đọc dòng `tests` và `findings`. Ảnh lỗi trong `artifacts` chỉ xem khi cần phân loại và ít ảnh. UI test: đọc `summary.json`, không mở `report.html`.
- **Review read-only** cho thay đổi nhiều file hoặc rủi ro: viết `.ai/specs/<slug>-review.md` (mục tiêu = thay đổi của `<slug>`, base so sánh, allowed-files, AC của spec gốc), chạy `MODE=review zsh $d/t-run.sh <slug>-review 1` (Codex, sandbox read-only, luật `scripts/review-rules.md`; author là Antigravity thì hỏi người dùng trước khi dùng Codex review). Có finding P0/P1: chép nguyên các dòng finding vào answer file và **resume author ngay** (cache còn ấm). Tối đa 2 vòng, sau đó báo người dùng. P2/P3: Claude lọc, báo kèm.
- Kiểm chứng một điểm đáng ngờ: resume và hỏi ("AC-2 pass dựa trên gì? trả lời path:line"), không tự đọc code. Kết quả có thể chạy trên build cũ (phiên khác vừa sửa code): resume để chạy lại.
- Chỉ đọc `.notes<n>.md`, log hay diff khi người dùng yêu cầu hoặc khi report mâu thuẫn mà hỏi lại không giải quyết được.
- File đổi giữa hai lần kiểm trong khi worker đã thoát: có tiến trình khác đang sửa repo. Dừng lại, hỏi người dùng.

## 7. Báo người dùng
Ngắn: kết luận, số test, lỗi chính (nguyên dòng finding), câu đã trả lời thay người dùng và lý do, review đã chạy hay chưa, cái chưa kiểm, đường dẫn spec/report. Ghi rõ "theo report của <worker>". Không commit.

## Mẹo
- Output Bash/Read lớn hơn khoảng 4 KB bị context-mode cắt: ghi ra file trong scratchpad rồi đọc từng phần bằng `sed -n` hoặc `Read` có `offset`/`limit`.
- Truyền prompt dài bằng `"$(cat file)"`, không viết inline.
- Chạy `--help` của tool lạ luôn kèm timeout: `perl -e 'alarm 10; exec @ARGV' <cli> ... </dev/null` (có tool chạy task thật khi gặp `--help`).
- Không dùng `--yolo`, `--dangerously-*`, `danger-full-access`, `resume --last`.
