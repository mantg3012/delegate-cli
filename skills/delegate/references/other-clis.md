# CLI khác (chưa có script)

Chỉ dùng khi người dùng nêu tên. Ghi "môi trường: chưa kiểm" vào spec mục 0. Kiểm `command -v <cli>` và version trước; chạy `--help` luôn kèm `perl -e 'alarm 10; exec @ARGV' <cli> ... </dev/null`. Luôn truyền model rõ ràng (lấy id từ danh sách model của CLI, không đoán) và báo người dùng. Prompt = `worker-rules.md` + spec + schema như phần Antigravity (các CLI này không có `--output-schema`).

| CLI | Headless | Hỏi tiếp cùng phiên | Ghi chú |
| --- | --- | --- | --- |
| gemini | `gemini -p "<prompt>" -m <model> --approval-mode auto_edit --skip-trust` | `gemini -r latest -p "<trả lời>"` | Cần `GEMINI_API_KEY` (AI Studio, trả theo dùng). Không có key thì dừng và hỏi; không dùng đăng nhập Google cá nhân (ToS; từ 2026-06-18 Gemini CLI không phục vụ gói Pro/Ultra/free). Cache chỉ chạy với API key/Vertex |
| opencode | `opencode run -m <provider/model> "<prompt>"` | `opencode run -c "<trả lời>"` | `--auto` chỉ khi người dùng đồng ý |
| agy | `agy -p "<prompt>" --model <id>` | `agy -c -p "<trả lời>" --model <id>` | Chỉ khi người dùng nêu tên agy; cảnh báo rủi ro khoá tài khoản (như Antigravity). Model: `agy models` |
