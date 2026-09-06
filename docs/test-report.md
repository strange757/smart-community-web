# 测试报告

## 范围与环境

- 日期：2026-09-04（Asia/Shanghai）
- 系统：Microsoft Windows 11 家庭版中文版，10.0.26200，64 位
- CPU：Intel Core i9-14900HX
- Python 3.12.14；FastAPI 0.116.1；SQLAlchemy 2.0.43；Alembic 1.16.5；Uvicorn 0.35.0
- Node.js 24.15.0；npm 11.12.1；Vite 7.3.6；Vitest 3.2.7；Playwright 1.62.1
- 浏览器：Playwright Chromium，单 worker

## TDD 证据

生产托管与迁移测试先于实现写入。初始命令：

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m pytest tests/test_production_hosting.py tests/test_migrations.py -q
```

RED 结果：`1 passed, 4 failed`。三个失败是 `create_app()` 尚无显式 `frontend_dist` 参数；迁移失败是 `backend/alembic.ini` 不存在。安全重置测试随后单独观察到 `2 failed`，原因是 `backend/run.py` 尚不存在。

实现后的聚焦命令：

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_production_hosting.py tests/test_migrations.py tests/test_release_runner.py -q
```

GREEN 结果：`8 passed`，无警告。覆盖显式静态托管、SPA 直达、构建产物、API 404、非 GET 405、缺失构建报错、Alembic 空库升级和单文件安全重置。自审时另观察到 `1 failed` 的保护测试，证明旧实现会把 `.txt` 当作数据库删除；扩展名白名单修复后该测试转绿。

完整 Vitest 首次纳入 E2E 文件时，41 个单元测试均通过，但套件因 Playwright API 被 Vitest 收集而退出非零；`vite.config.ts` 随后明确排除 `e2e/**`。最终 Vitest 与 Playwright 各自只收集所属测试。

最终审查修复同样遵循 RED/GREEN：并发车位测试先得到两个 `201`；共享 Provider 角色切换测试先显示了上一角色的工单；SQLite 外键、社区复合约束与审计字段测试先失败；API 时间先缺少 UTC 后缀，UTC 环境中的中国日期先显示为 9 月 3 日；报修详情切换/重开测试先保留旧错误和输入；认证数据库故障先被误报为 401；E2E 启动拒绝测试先遗留数据库及 `-shm`/`-wal`。对应聚焦 GREEN 为后端 `10 passed`、前端 `13 passed`，E2E 包装器清理脚本退出码 0。

## 完整自动化结果

从仓库根目录或注明目录执行：

| 检查 | 命令 | 结果 |
|---|---|---|
| 后端 | `backend\.venv\Scripts\python.exe -m pytest backend\tests` | `48 passed in 87.64s` |
| 前端单元 | `npm --prefix frontend test` | `10 files passed, 46 tests passed` |
| 类型 | `npm --prefix frontend run typecheck` | 退出码 0，无 TypeScript 诊断 |
| 构建 | `npm --prefix frontend run build` | 退出码 0，1830 modules transformed，无 >500 kB 告警 |
| E2E 包装器 | `npm --prefix frontend run test:e2e-runner` | 启动拒绝路径退出码 0；数据库与两个 sidecar 均被清理 |
| Alembic | 对全新临时 SQLite 库执行 `upgrade head` 后执行 `check` | `No new upgrade operations detected.` |
| E2E | `npm --prefix frontend run e2e` | `1 passed (23.0s)`，Chromium 单 worker；数据库及 sidecar 清理检查均为 `False` |

构建前主 JavaScript 为 `537.22 kB`（gzip `168.68 kB`），触发 Vite 告警。启用按 React、UI、Query 和其余依赖划分的 `manualChunks` 后，最大文件为 `react-vendor 286.25 kB`（gzip `91.93 kB`）；最终其余 JavaScript 为 `98.19/31.38`、`64.30/21.42`、`53.28/14.13`、`35.30/10.40 kB`（原始/gzip）。

## E2E 流程

E2E 每次用 `--reset` 创建 `frontend/test-results/e2e/community-e2e.db`，由 `backend/run.py` 在 FastAPI 上托管真实 `frontend/dist`，结束后只清理该 SQLite 文件及可能的 `-shm/-wal` sidecar。

单一串行流程验证：

1. 直接加载 `/app/home` 返回生产 SPA，登录图片自然宽度非零。
2. 业主创建水电报修；物业指派陈师傅；维修开始并完成；业主确认并五星评价。
3. 真实服务器先完成缴费，但浏览器收到一次模拟 503；UI 用同一幂等键重试并显示同一个服务端 `DEMO-...` 参考号。
4. 业主预约 `A-01 / 09:00-10:00`，再次提交同槽位收到真实 409；日期、车位、选中时段保留，然后取消活动预约。
5. 物业创建并发布公告，业主随后看到标题、正文和“已发布”状态。
6. 除预期 503/409 网络诊断外无控制台错误，且无页面运行时错误。

## 视觉验证

| 视口 | 截图 | 结果 |
|---|---|---|
| 800 x 768 | `docs/screenshots/owner-home-800x768.png` | 72px 紧凑侧栏；服务、事项、公告及顶部控制完整 |
| 1024 x 768 | `docs/screenshots/owner-home-1024x768.png` | 三个服务并排；详情在首屏；无横向溢出 |
| 1280 x 800 | `docs/screenshots/property-operations-1280x800.png` | 三项指标、待处理工单和最新公告完整 |
| 1366 x 768 | `docs/screenshots/property-operations-1366x768.png` | 宽屏列宽稳定；无拉伸、遮挡或裁切 |

Playwright 在四个视口逐元素检查横向边界，`document.scrollWidth <= innerWidth`。人工以原始分辨率检查四张 PNG：没有空白资源、横向滚动、内容重叠、文字裁切、过量首屏文字或不可见控制；768px 高度内关键详情与操作保持可见。截图分别有 40、47、42、47 个按 16px 网格抽样的不同像素颜色，排除空白渲染；文件大小为 31–38 kB。

## 已知非阻断风险

- 自动化使用桌面 Chromium 的目标视口，未覆盖所有 HarmonyOS 浏览器版本、系统字体和实体触摸输入差异；交付前仍建议在目标平板做一次同 Wi-Fi 冒烟。
- 默认 JWT 密钥、HTTP 和 SQLite 只适合演示。公网部署必须更换密钥、启用 HTTPS，并采用更强数据库和备份策略。
- 模拟缴费不接触真实资金，也未实现支付网关回调、退款或对账。
- 首个 Alembic 迁移在正式标签前补充了审计字段和社区复合外键；运行过旧预发布构建的演示数据库必须使用 `--reset` 重建。
- PostgreSQL 等数据库走车位父行 `FOR UPDATE` 锁定路径；本 MVP 的自动化环境只对 SQLite `BEGIN IMMEDIATE` 路径做了真实并发验证。

## 参考与资产核对

- 后端领域参考 MicroCommunity 提交 `45102fc13900aad6d117b00a4feeeafe9c3f5fee`。
- shadcn/ui 组件模式按 MIT 边界使用；Cal 只提供预约概念；Dub/Plane 只做设计参考，未复制 AGPL 或商业代码。
- 登录图片来源和 Unsplash 许可记录在 `frontend/public/ASSET_LICENSES.md`。
- 根目录 `THIRD_PARTY_NOTICES.md` 记录本地独立实现的 shadcn 风格组件边界、直接依赖许可与 Unsplash 资产通知。

## 2026-09-06：可选 AI 辅助填写

新增业主报修整理和物业公告拟稿，两项操作只返回建议，不创建工单或公告。既有业务测试保留。

| 检查 | 命令 | 结果 |
|---|---|---|
| 后端全量 | 在 backend 执行 `.venv\Scripts\python.exe -m pytest tests` | 99 passed，94.67 秒 |
| 前端全量 | `npm --prefix frontend test` | 11 个测试文件，51 passed |
| 类型检查/构建 | `npm --prefix frontend run typecheck` / `npm --prefix frontend run build` | 通过；最大 chunk 286.25 kB |
| 浏览器流程 | `npm --prefix frontend run e2e` | 3 passed；包括原有三角色业务闭环及两项 AI 页面检查 |
| 本地服务 | GET `/login`，业主登录，POST `/api/v1/ai/repair-draft` | 页面 200，角色 OWNER；未配置 AI 返回 503 / `AI_NOT_CONFIGURED` |

AI 后端测试只使用受控 HTTP 响应，覆盖角色权限、输入校验、严格 JSON 输出、密钥和上游错误不泄漏、请求内容不自动包含用户身份、每用户限流、配置路径和不写入业务表。总超时回归让响应持续分段抵达，验证仍在总时限到达时返回 504 并关闭响应流。

前端测试覆盖建议预览和人工采用、失败后保留手动输入及重试、编辑原文后丢弃延迟结果、关闭重开不保留旧建议。Playwright 验证 1024/800/390 x 768 的报修建议弹窗及 1024 x 768 的公告拟稿弹窗；人工查看截图确认内容可滚动、底部提交按钮可见、没有横向溢出。测试截图位于忽略目录 `frontend/test-results/playwright-artifacts/`。

成功生成的前端/浏览器测试使用明确标记的接口测试数据，不能代表真实模型质量。尚未配置云端服务地址、模型与 API Key，真实生成、延迟、费用及实体 HarmonyOS 设备验收待接入后完成。配置说明见 [ai-assistance.md](ai-assistance.md)。
