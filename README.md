# DM × SCP CPM Project Network

A static GitHub Pages prototype generated from `dm_scp_wbs_gantt_12p.xlsx`.

## CPM basis
- 128 WBS tasks
- Project duration: **430 working days / 86 weeks**
- Baseline: **2026-09-01 → 2028-04-24**
- Method: resource-aware CPM/PDM that preserves the 12-person WBS start offsets.
- Relationship types:
  - `FS` / `FS+lag`: next release or workstream start
  - `SS+lag`: planned overlap/staggering inside a workstream
  - `FF`: feature/release-readiness work must finish by the release gate
- Critical path = Total Float 0
- Near-critical = Total Float 1–2 working days

## Critical path
`WBS-002 → WBS-034 → WBS-050 → WBS-078 → WBS-094 → WBS-107 → WBS-126 → WBS-127 → WBS-128`

## Local preview
```bash
python -m http.server 8000
```

## GitHub Pages
1. Push the project to `main`.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. The included workflow publishes the static site.

The site has no build step and no external JavaScript dependencies.
