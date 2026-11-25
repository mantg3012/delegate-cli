# Delegate task cho CLI agent qua terminal

> Bản tiếng Việt của `SKILL.md` (= `AGENTS.md`). Dùng bản này khi người dùng đang viết bằng tiếng Việt. Sửa quy tắc thì sửa cả hai bản.

Vai trò của bạn: ARCHITECT + người giám sát. Không tự sửa code dự án (trừ file trong `.ai/`). Agent kia không thấy cuộc hội thoại, chỉ thấy spec và prompt.

## 1. Audit (giữ nhẹ nếu người dùng nói "không đọc nhiều")
- Đọc `AGENTS.md` / `CLAUDE.md` của repo: quy tắc, lệnh build, module cấm sửa (ví dụ core dùng chung).
- Grep đúng chỗ liên quan, xem file cấu hình và version toolchain. Không đọc cả codebase.
- `git status` trước khi giao: ghi lại các file đã sửa sẵn để sau này phân biệt thay đổi của agent với thay đổi có từ trước.
- Hỏi người dùng (tối đa 3 câu) chỉ khi điểm mơ hồ làm thay đổi thiết kế.

## 2. Spec
- Lưu ở `.ai/specs/<slug>.md`. Viết bằng ngôn ngữ người dùng đang dùng. Đủ cụ thể để người chưa từng thấy repo làm được mà không phải đoán: đường dẫn, signature, tên chính xác, ví dụ input → output. Không bịa API hay file chưa kiểm tra. Chọn thay đổi nhỏ nhất.
- Cấu trúc bắt buộc:
  ````
  # Spec: <tiêu đề ngắn>
  ## 1. Audit findings      — hiện trạng (file:line), quy ước phải theo, rủi ro, giả định
  ## 2. Goal                — một đoạn, nhìn từ phía người dùng
  ## 3. Scope               — mỗi dòng một path/glob; ngoài danh sách là ngoài phạm vi
  ```allowed-files
  path/to/file.ext
  ```
  ## 4. Detailed design     — signature, data flow, lỗi, helper có sẵn cần dùng lại
  ## 5. Acceptance criteria — AC-1, AC-2… kiểm chứng được (ưu tiên grep/build)
  ## 6. Required tests      — file, tên test, input, kết quả, AC nào
  ## 7. Must NOT do
  ## 8. Notes for reviewer  — chỗ cần soi kỹ
  ````
- Ghi rõ: các rủi ro (thời điểm khởi tạo, crash runtime mà build không bắt được), "Must NOT do" (core module, commit, đổi version, hạ toolchain), và yêu cầu dừng lại hỏi thay vì đoán.

## 3. Chọn CLI, model, effort
Mặc định dùng **gemini CLI với API key** (Google AI Studio). Trước khi chạy, kiểm tra `[ -n "$GEMINI_API_KEY" ]`. Nếu chưa có key, dừng lại và hỏi người dùng, không dùng phiên đăng nhập Google cá nhân thay thế. Lý do: điều khoản Antigravity/Google không cho agent bên thứ ba (Claude Code, Codex, OpenCode...) điều khiển `agy` hay CLI đăng nhập bằng tài khoản cá nhân, và đã có tài khoản bị khoá vì việc này. API key là đường được phép (tính phí theo lượng dùng).
Chỉ dùng **agy** khi người dùng gọi tên agy trong yêu cầu. Trước khi chạy, nhắc một dòng về rủi ro bị khoá tài khoản. Model mặc định của agy nằm ở `~/.gemini/antigravity-cli/settings.json` (`"model"`).
Khi giao việc, luôn truyền model rõ ràng (lấy id từ danh sách model của CLI, không đoán) và báo người dùng model đã chọn. Kiểm tra binary bằng `which`. Xem model có sẵn: `agy models`, `gemini --list-models`, `opencode models`.
**Không bao giờ** chạy `--help` của tool lạ mà không có timeout, vì nó có thể khởi động task thật (`ai-task run --help` đã tạo ra một task). Dùng:
```bash
perl -e 'alarm 10; exec @ARGV' <cli> <subcommand> --help </dev/null
```

| CLI | Chạy headless | Hỏi tiếp cùng session | Ghi chú |
| --- | --- | --- | --- |
| gemini (mặc định) | `gemini -p "<prompt>" -m <model> --approval-mode auto_edit --skip-trust` | `gemini -r latest -p "<trả lời>"` | cần `GEMINI_API_KEY` |
| agy | `agy -p "<prompt>" --model <id> --effort high` | `agy -c -p "<trả lời>" --model <id> --effort high` | chỉ khi người dùng gọi tên, có rủi ro bị khoá tài khoản; `--mode auto` có thể không khả dụng với tài khoản |
| codex | `codex exec -m <model> -s workspace-write "<prompt>"` | `codex exec resume --last "<trả lời>"` | `-o <file>` để lưu message cuối |
| opencode | `opencode run -m <provider/model> "<prompt>"` | `opencode run -c "<trả lời>"` | `--auto` chỉ khi người dùng đồng ý |

Không dùng `--yolo`, `--dangerously-*` hay `--auto` trừ khi người dùng bảo.

**App Antigravity desktop** (không phải `agy`): chỉ khi người dùng gọi tên, cùng rủi ro tài khoản như agy. Dùng skill `antigravity-desktop` (lệnh `ag`). Chạy `ag` với cwd là gốc repo: `ag new` / `ag ask --new` tự chọn project Antigravity chứa thư mục đó, và `ag ask` không `--new` từ chối gửi vào hội thoại của project khác. Repo chưa có project → nhờ người dùng tạo trong app (project menu > New Project).

## 4. Giao việc
- Không dùng chế độ interactive (`-i`, TUI): terminal tool chỉ gõ được một dòng lệnh, không gửi được phím, nên sẽ kẹt ở trust prompt hoặc ở câu hỏi của agent.
- Viết prompt vào `.ai/specs/<slug>.prompt.txt`. Nội dung: làm đúng spec, đọc AGENTS.md, chỉ sửa allowed-files, chạy lệnh build và sửa lỗi do mình gây ra, không commit, gặp chỗ mơ hồ thì dừng và hỏi ở cuối reply, kết thúc bằng danh sách file đã sửa, kết quả build và câu hỏi còn mở.
- Chạy trong Terminal panel (`run_in_terminal`, đặt title cho tab, cwd là gốc repo), log ra file:
```bash
gemini -p "$(cat .ai/specs/<slug>.prompt.txt)" -m <model> --approval-mode auto_edit --skip-trust 2>&1 | tee .ai/specs/<slug>.run1.log
```

## 5. Theo dõi
Dùng `Monitor` (timeout tối đa, re-arm nếu hết hạn), không poll tay:
```bash
cd <repo>; sleep 5; prev=""; while pgrep -f "<cli> .*-p" >/dev/null; do n=$(git status --short | wc -l | tr -d ' '); [ "$n" != "$prev" ] && echo "changed-files=$n" && prev=$n; sleep 20; done; echo "agent exited"; tail -c 3000 .ai/specs/<slug>.runN.log
```
- Số file ban đầu gồm cả thay đổi có từ trước, đừng tính nhầm là của agent.
- Khi số file vượt ước tính: liệt kê `git status --short`, đối chiếu với allowed-files.
- Báo người dùng ngắn gọn ở mỗi mốc.

## 6. Trả lời câu hỏi của agent
- Đọc phần "Open Questions" trong log (`grep -n "Open Questions" -A 30`).
- Tự trả lời khi câu trả lời là tối thiểu và theo đúng quy tắc repo. Trước khi trả lời về cấu hình có sẵn, kiểm tra nguồn gốc của nó (`git log -S "<chuỗi>" -- <file>`, `git show HEAD:<file>`) để biết lý do nó tồn tại.
- Phải hỏi người dùng (AskUserQuestion, có option khuyến nghị) khi: sửa module core dùng chung, sửa ngoài allowed-files mà thay đổi hành vi, hoặc có nhiều hướng ngang nhau.
- Viết câu trả lời vào `.ai/specs/<slug>.answerN.txt`, đánh số từng câu, nói rõ phạm vi ("chỉ xoá dòng X, không sửa gì khác"), rồi gửi bằng lệnh resume ở bảng trên với `| tee .ai/specs/<slug>.runN+1.log`. Arm lại Monitor.

## 7. Kiểm chứng trước khi báo xong
Báo cáo của agent không phải là bằng chứng. Tự kiểm tra:
- Các acceptance criteria dạng grep (ví dụ không còn import cũ).
- `git status`: file lạ, file bị `git add` dù đã dặn không commit, file agent nói đã tạo nhưng không có.
- Submodule: `git -C <sub> status`, `git -C <sub> log -3` để chắc agent không commit vào đó.
- Output build tồn tại (ví dụ `app/build/outputs/apk/...`).
- Nếu file thay đổi giữa hai lệnh kiểm tra trong khi agent đã thoát: có người hoặc tiến trình khác (IDE, Antigravity) đang sửa repo. Dừng lại, hỏi người dùng, không "sửa" lại.
- Không tự review code nếu người dùng chưa yêu cầu; nói rõ là chưa review.

## 8. Báo cáo cho người dùng
Kết quả build, các câu đã trả lời thay người dùng (kèm lý do), những gì đã kiểm chứng và chưa kiểm chứng, đường dẫn spec/log trong `.ai/specs/`. Không commit.

## Mẹo môi trường
- Khi plugin context-mode chặn output lớn: ghi output ra file trong scratchpad rồi đọc bằng `Read` với `offset`/`limit`.
- Prompt dài nên truyền qua `"$(cat file)"`, không viết thẳng vào lệnh, để lệnh luôn chỉ có một dòng.
