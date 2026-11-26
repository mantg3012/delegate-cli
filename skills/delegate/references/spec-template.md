# Template spec

Lưu ở `.ai/specs/<slug>.md`. Không viết lại luật chung của `worker-rules.md` (allowed-files, không commit, format report).

````
# Spec: <tiêu đề>
## 0. Agent environment — skill nên dùng, MCP nên dùng (vd gitnexus impact/context), lệnh chạy được/không chạy được
## 1. Context            — hiện trạng (file:line), quy ước, rủi ro; quyết định đã chốt
## 2. Goal               — một đoạn
## 3. Scope
```allowed-files
path/to/file.ext
```
## 4. Design             — signature, data flow, helper dùng lại
## 5. Acceptance         — AC-1, AC-2… kiểm được
## 6. Tests              — file, tên test, AC nào
## 7. Checks             — lệnh nguyên văn, khớp rule (đường dẫn tuyệt đối, không pipe/&&)
## 8. Must NOT do
````

Biến thể:
- **Research:** bỏ mục 3–6, thay bằng câu hỏi cần trả lời; allowed-files chỉ gồm file notes.
- **Test:** mục 6–7 là trọng tâm; UI test thì ghi dùng `ios-ux-xcuitest` và cần `summary.json`.
- **Review** (`MODE=review`, slug `<slug>-review`): mục 2 = "Review thay đổi của `<slug>`"; mục 1 ghi base (`git diff <base>` hoặc uncommitted) và tóm tắt spec gốc; mục 3 = allowed-files của spec gốc; mục 5 = AC của spec gốc; bỏ 4, 6, 7.
- **Đợt song song** (`<wave>-<name>`): mục 1 thêm "Worker khác trong đợt này giữ: <file>… — không sửa"; file dùng chung (strings, project file, route) chỉ giao cho một worker.
