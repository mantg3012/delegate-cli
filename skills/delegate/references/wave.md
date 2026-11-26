# Đợt worker song song (`t-wave.sh`)

Mượn luật của Antigravity `/swarm`: coordinator không làm việc kỹ thuật; brief là tất cả những gì worker có; chia theo file, chồng lấn là lỗi thiết kế chứ không phải thứ để quản lý; mỗi author một working copy; verifier chỉ báo, author sửa; board chung có thứ tự. Song song không tăng cache hit (mỗi `exec` cold ~30k token), nên chỉ đáng khi mỗi phần đủ lớn và thật sự độc lập.

## Khi nào
- ≥2 phần độc lập, không chung file sửa, mỗi phần là một task delegate bình thường.
- File dùng chung (strings, project file, route, DI): giao cho **một** worker, hoặc để Claude sửa sau khi gộp.
- Test trên máy thật: một tiến trình một lúc. Repo có wrapper khoá (vd lock file, exit "bận") thì dùng; không có thì cho worker build/test ở bước gộp, hoặc lần lượt.

## Bước
1. Hỏi người dùng nếu đĩa ít: mỗi worktree iOS build thêm vài GB DerivedData. `new` in dung lượng trống.
2. File gitignored mà worker cần (docs, scheme trong `xcshareddata`, `AGENTS.md`, scripts): liệt kê trong `.ai/wave.copy`, mỗi dòng một path.
3. Viết spec cho từng worker: `.ai/specs/<wave>-<name>.md` (template: mục "Đợt song song" trong `spec-template.md`). Lệnh check dùng đường dẫn tuyệt đối của **worktree** nếu rule `.codex/rules` khớp theo đường dẫn.
4. Tạo worktree (từ working tree hiện tại, kể cả thay đổi chưa commit và untracked; index thật không đổi):
   ```bash
   zsh $d/t-wave.sh new <wave> <name1> <name2> ...
   ```
   Worktree ở `../<repo>-<wave>-<name>`; snapshot giữ ở `refs/delegate/<wave>`.
5. Chạy mỗi worker bằng Bash `run_in_background` riêng:
   ```bash
   zsh $d/t-wave.sh run <wave> <name> [n]
   ```
   Spec được chép từ repo chính mỗi lần chạy (repo chính là bản gốc). Mỗi run/resume thêm một dòng vào `.ai/specs/<wave>.board`: đọc `tail` board thay vì từng report khi cần nhìn cả đợt.
6. Trả lời: viết `.ai/specs/<wave>-<name>.answer<n>.txt` ở repo chính, rồi `zsh $d/t-wave.sh resume <wave> <name> <n>`.
7. Review (tuỳ chọn, mục 6 SKILL.md): spec `<wave>-<name>-review.md`, chạy trong worktree của author: chép spec review vào `.ai/specs/` của worktree, rồi `cd ../<repo>-<wave>-<name> && MODE=review DELEGATE_BOARD=<repo chính>/.ai/specs/<wave>.board zsh $d/t-run.sh <wave>-<name>-review 1`.
8. Gộp từng worker xong:
   ```bash
   zsh $d/t-wave.sh collect <wave> <name>
   ```
   Chép spec/log/report về, áp phần đổi (từ lần collect trước) vào working tree chính bằng 3-way qua index tạm. `CONFLICT`: sửa marker trong file được liệt kê rồi chạy lại collect (không áp lại). Dòng "gitignored khác nhau": gộp tay (vd `git merge-file`).
9. Sau khi gộp đủ: chạy check của cả đợt ở repo chính (một worker hoặc lệnh check), rồi xoá worktree:
   ```bash
   zsh $d/t-wave.sh rm <wave> <name>
   ```
   `rm` từ chối nếu chưa collect hoặc worktree đổi sau lần collect cuối. Không xoá DerivedData; hỏi người dùng.

## Bẫy
- Mỗi worktree là một path mới với Codex: `--trust` (đã có trong `t-run.sh`) thêm một mục `trust_level` vào `~/.codex/config.toml` mỗi lần.
- Worktree từ snapshot là detached HEAD: worker không được commit (đã có trong `worker-rules.md`).
- Không commit/push thay người dùng; gộp xong để ở working tree.
