# DM × SCP — Editable Gantt + CPM

這是一個可直接部署到 GitHub Pages 的靜態互動原型，將傳統甘特圖、WBS 與 Critical Path Method / PDM 整合在同一畫面。

## 新增的可編輯能力

### 1. 里程碑收合
- 點擊左側 M0–M7 里程碑列即可展開／收合。
- 右側對應的甘特列會同步收合。
- 收合狀態會保存在瀏覽器 `localStorage`。

### 2. WBS 拖曳換序
- Capability Build 類型的 WBS 可由左側 `⋮⋮` 拖曳。
- 為避免破壞產品架構，只允許在**同一里程碑、同一功能模組、同一平台**內換序。
- 放開後會重建該 workstream 的 `Workstream start` 與 `SS+lag` sequence edges，再重新執行 CPM。
- WBS ID 不重新編號；畫面上的顯示順序會更新。

### 3. 甘特條水平拖曳
- 一般任務與 Release Gate 都可水平拖曳。
- 拖曳中只更新目前任務的視覺位置與日期提示，不執行全專案重算。
- **pointer up 後才執行一次**拓樸排序、Forward Pass、Backward Pass、Float 與 Critical Path 重算。
- 若使用者想把任務提前到前置條件之前，系統會自動吸附到可行的最早開始日。
- 延後任務可向後傳遞到 Release Gate 與後續階段。

## 效能保護

為避免 128 個 WBS 在拖曳時造成網頁當機：

- 拖曳過程不重建 DOM，也不重算 CPM。
- 視覺拖曳使用 `transform: translateX(...)`。
- pointer move 由 `requestAnimationFrame` 節流。
- CPM 只在 drop / pointer up 後執行一次。
- CPM 網路只有約 128 nodes / 248 base edges，使用 O(V+E) 的拓樸 forward/backward pass。
- 預設只畫 Critical dependency edges；可切換全部或隱藏。
- 里程碑收合可以進一步降低同時顯示的 DOM 數量。

## Undo / Reset

- **Undo**：最多保存最近 20 次排程修改。
- **Reset**：恢復原始 12 人 WBS 的順序、日期與 CPM。
- 修改後的 WBS 順序、manual start constraints 與里程碑收合狀態會儲存在瀏覽器。

## Baseline

- 128 WBS tasks
- 430 working days / 86 weeks
- Baseline: 2026-09-01 → 2028-04-24
- Baseline Critical Path:
  `WBS-002 → WBS-034 → WBS-050 → WBS-078 → WBS-094 → WBS-107 → WBS-126 → WBS-127 → WBS-128`

## Local preview

```bash
python -m http.server 8000
```

開啟 `http://localhost:8000`。

## GitHub Pages

1. 將此資料夾內容推送到 repository 的 `main` branch。
2. Repository → **Settings → Pages**。
3. Source 選擇 **GitHub Actions**。
4. 專案已包含 `.github/workflows/pages.yml`。

無需 Node.js、npm、資料庫或後端服務。
