# DM × SCP — Traditional Gantt + CPM

這是將原先自由節點式「專案網路圖」改為 **傳統甘特圖 + 要徑法（CPM/PDM）** 的 GitHub Pages 靜態互動原型。

## 主畫面

左側為傳統 WBS 任務表：
- WBS ID
- Task / Capability
- Owner
- Duration
- Total Float

右側為時間軸：
- 月份與週次
- 任務甘特條
- R0–R7 Release Gate 菱形里程碑
- Float 可用區間
- FS / SS / FF 相依箭線

## 要徑表示

- 紅色：Critical Path（Total Float = 0）
- 橘色：Near-critical（Total Float 1–2 working days）
- 藍色：DM
- 綠色：SCP
- 紫色：Cross-platform / Release
- 虛線：該任務可使用的 Total Float

相依關係可切換：
1. 只顯示要徑（預設）
2. 顯示全部
3. 隱藏

## CPM 基準

- 128 WBS tasks
- 86 weeks / 430 working days
- Baseline: 2026-09-01 → 2028-04-24
- Critical Path:
  `WBS-002 → WBS-034 → WBS-050 → WBS-078 → WBS-094 → WBS-107 → WBS-126 → WBS-127 → WBS-128`

本版本仍採用 **resource-aware CPM/PDM**，保留 12 人 WBS 的實際 start offset；因此不是純理論 CPM，而是與既有 release cadence 對齊的專案控制圖。

## Local preview

```bash
python -m http.server 8000
```

## GitHub Pages

1. 將本資料夾推送至 GitHub repository 的 `main` branch。
2. 到 **Settings → Pages**。
3. Source 選擇 **GitHub Actions**。
4. 已附 `.github/workflows/pages.yml`，推送後即可發布。

無需 Node.js、npm 或後端服務。
