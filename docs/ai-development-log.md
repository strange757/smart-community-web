# AI 辅助开发记录

本记录只保留可审计的任务输入、外部输出和工程决策，不包含隐藏推理过程、凭据或个人数据。

## 需求与设计分析

- 代表性提示：要求在五日内完成 HarmonyOS 平板优先的智慧社区 Web MVP，限定 1024 x 768 主视口、三角色、低密度首页和完整报修/缴费/车位/公告流程。
- 代表性输出：形成 FastAPI + React 单仓双目录方案，生产由 FastAPI 同时服务 `/api/v1` 与 Vite 构建；SQLite 用于演示，Alembic 负责空库迁移。
- 参考核对：后端领域关系基于 MicroCommunity 提交 `45102fc13900aad6d117b00a4feeeafe9c3f5fee`；shadcn/ui 使用 MIT 组件模式；Cal 只借鉴分步预约概念；Dub 与 Plane 只作视觉/交互研究，没有复制 AGPL 或商业源码。

## 后端 TDD

- 代表性提示：先为 11 张表、认证与角色、社区隔离、公告状态、报修状态机、缴费幂等和车位时段冲突写行为测试。
- 代表性输出：pytest 覆盖 API 成功/错误 envelope、跨社区拒绝、合法/非法状态转换、SQLite 支付并发和相邻/重叠预约。
- Task 8 RED：静态托管/SPA/API 边界与 Alembic 空库测试合计 `1 passed, 4 failed`；安全重置另有 `2 failed`。
- Task 8 GREEN：聚焦生产测试 `8 passed`；完整后端 `42 passed`。

## 前端 TDD

- 代表性提示：用真实组件验证角色导航、登录恢复、首页信息数量、报修动作矩阵、车位 409 后选择保留和 URL 状态筛选。
- 代表性输出：Vitest 最终为 8 个测试文件、41 个测试；网络只在单元测试边界替代，页面与 provider 使用真实实现。
- 修复循环：URL 精确工单状态曾覆盖页签选择，通过失败的交互测试定位后改为统一由 URL 查询参数驱动。

## 审查与修复循环

- API 审查发现跨社区资源隔离、统一 404 envelope 和 SQLite 缴费并发边界，均先补回归测试再修复。
- 登录审查发现 API 401 只清 storage、不清挂载状态，新增 provider 行为测试后修复。
- 构建审查测得单包 `537.22 kB`（gzip `168.68 kB`）；启用稳定 vendor 分块后最大包降至 `286.25 kB`（gzip `91.93 kB`），告警消失。
- 测试审查发现 Vitest 会收集 Playwright `*.spec.ts`；配置排除 `e2e/**` 后两个运行器职责分离。

## 生产 E2E 与视觉验证

- 代表性提示：只用一个 worker，在新 SQLite 库、Alembic 迁移和 FastAPI 托管的生产构建上串行切换三个角色。
- 代表性输出：Playwright 覆盖报修全生命周期、丢失缴费响应后的同键重试、真实停车 409 与取消、公告发布后业主可见；最终 `1 passed`。
- 视觉输出：保存 800、1024、1280、1366px 四个真实应用截图。首次截图仍有过渡 toast，等待其退出后重新捕获；原尺寸检查和 DOM 宽度检查未发现空白、遮挡、裁切或横向溢出。
- 资产边界：住宅图保存在 `frontend/public/community-residence.jpg`；源 URL、Unsplash 许可和用途写入 `frontend/public/ASSET_LICENSES.md`。

## 最终交付原则

- 每轮完成前重新运行 pytest、Vitest、TypeScript、Vite build、Playwright、差异检查和文件审阅。
- E2E 数据位于忽略的 `frontend/test-results`，结束后精确清除数据库及 SQLite sidecar；正式截图在 `docs/screenshots` 跟踪。
- 未创建 release tag；待独立最终代码审查完成后再由发布负责人标记版本。
