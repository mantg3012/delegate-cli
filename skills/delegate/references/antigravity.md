# Antigravity desktop làm worker (qua `ag`)

Chỉ dùng khi người dùng nêu tên Antigravity/ag. Cách dùng `ag`, chọn model, new chat hay continue, duyệt lệnh: skill `antigravity-desktop` (đọc nó trước).

## Cảnh báo trước lần giao đầu (hiện cho người dùng một dòng)
FAQ Antigravity (https://antigravity.google/docs/faq/, đọc 2026-11-26) ghi dùng phần mềm bên thứ ba để truy cập Antigravity là vi phạm ToS, có thể bị đình chỉ tài khoản; có người báo bị khoá khi dùng cùng Claude Code. `ag` điều khiển app qua CDP nhiều khả năng thuộc diện này. Người dùng đã nêu tên Antigravity thì báo rủi ro rồi làm tiếp.

## Luồng
Model mặc định: Gemini 4 Hydrogen high; task nhiều file/dài: Orchestrator (bảng tier trong `antigravity-desktop`).
1. `ag status`. Lỗi CDP thì nhờ người dùng thoát app và chạy `ag start`. `state` phải là `idle`. Chạy song song với session khác: mỗi session một cửa sổ (`AG_WINDOW`, xem skill).
2. Chạy `ag` với cwd là repo của task (`ag ask --new` tự chọn project chứa cwd).
3. Giao việc (gửi kèm schema vì Antigravity không có `--output-schema`, và footer giới hạn phạm vi), rồi ghi lại id hội thoại (8 ký tự, dòng `open` của `ag list -n 3`):
   ```bash
   d=~/.claude/skills/delegate/scripts; s=.ai/specs/<slug>
   ag ask --new --no-wait [--model "<tier>"] "$(cat $d/worker-rules.md; echo "Spec file: $s.md"; cat $s.md; echo; echo 'Work only inside this project folder. Do not explore the machine, other folders or tools the spec does not name. Your final message is ONLY a JSON object matching this schema, no prose:'; cat $d/handoff.schema.json)"
   ag list -n 3
   ```
   Footer này quan trọng: không có nó agent hay dò môi trường (một repo khác đo được 1,6M → 36k token cho cùng việc).
4. Chờ bằng Bash `run_in_background`: `ag wait --timeout 3000`, rồi `ag last -n 1 --max-chars 2500`. Đó là report JSON, đọc thẳng.
5. `waiting-input` (agent xin chạy lệnh): output đã kèm lệnh; duyệt bằng `ag answer <n>` theo luật của skill `antigravity-desktop`, rồi quay lại bước 4. MCP tool của Antigravity mặc định cũng hỏi duyệt.
6. Trả lời `needs_answer` / resume: trước hết `ag usage <id>`: `age` > ~15 phút và `ctx` lớn thì cache đã nguội, cân nhắc new chat với tóm tắt ngắn (luật "New chat or continue" của skill). Continue: `ag open <id>` nếu hội thoại khác đang mở, rồi `ag ask --no-wait "$(cat .ai/specs/<slug>.answer<n>.txt)"` và quay lại bước 4.

## Khác Codex
- Không áp dụng `codex_env.py`, sandbox, `.codex/rules`: quyền chạy lệnh do preset quyền của Antigravity quyết định (`ag` không đổi được). Báo người dùng preset đang dùng nếu worker sẽ build/test.
- Không có `report.py`/board tự động: tự thêm một dòng vào `.ai/specs/board.log` nếu đang chạy đợt.
- Cache Gemini trong hội thoại đo được ~86% (`ag usage`), turn đầu ~17–23k token; không có tài liệu chính thức về TTL.
- Không gọi `/swarm` hay `/run-workflow` qua `ag`: preview, tốn quota nhanh, mỗi script workflow cần duyệt, chưa kiểm cách chèn lệnh qua CDP.
