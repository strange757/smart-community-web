# 和邻智慧社区

面向 HarmonyOS 平板浏览器的智慧社区演示应用。系统提供业主、物业、维修三类角色，覆盖公告、报修全流程、模拟缴费、车位预约与物业运营概况。它是五日 MVP，不包含真实支付、硬件接入或公网生产能力。

## 架构

```text
HarmonyOS/桌面浏览器
        |
        v
FastAPI :8000 ---- /api/v1 ---- SQLAlchemy ---- SQLite
        |
        +---- React 19 + TypeScript + Vite 构建产物
```

- FastAPI 统一提供 API、OpenAPI 文档和生产 SPA；未知 API 保持 JSON 错误格式，非 API 的 GET 路径回退到 SPA。
- SQLAlchemy 定义 11 张领域表；Alembic 从空库升级，启动时再执行幂等种子数据。
- React Router、TanStack Query、Radix UI 与本地 shadcn 风格组件组成平板优先界面。
- 开发模式使用 Vite 代理；演示模式由一个 FastAPI 进程同时服务前后端。

## 环境要求

- Windows 10/11 与 PowerShell 5.1 或 PowerShell 7
- Python 3.12
- Node.js 22.12 以上及 npm
- 首次安装 Playwright Chromium 时需要网络

## 首次安装

在仓库根目录打开 PowerShell：

```powershell
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]"

Set-Location frontend
npm ci
npx playwright install chromium
Set-Location ..
```

## 开发运行

窗口 1 启动 API。测试式应用工厂会快速建表并写入幂等演示数据，但不会自动托管已有的 `frontend/dist`：

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

窗口 2 启动前端：

```powershell
Set-Location frontend
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。API 文档位于 `http://127.0.0.1:8000/docs`。

## 生产构建与一键演示

首次或前端变更后构建一次：

```powershell
npm --prefix frontend run build
```

之后从仓库根目录用一个命令完成 Alembic 升级、幂等种子数据和前后端启动：

```powershell
backend\.venv\Scripts\python.exe backend\run.py
```

默认监听 `0.0.0.0:8000`，使用仓库内 `backend/community.db`。打开 `http://127.0.0.1:8000`，API 文档为 `http://127.0.0.1:8000/docs`。若 `frontend/dist` 不存在，命令会明确提示先构建，不会启动空白页面。

需要恢复演示初始状态时，先停止服务器，再执行：

```powershell
backend\.venv\Scripts\python.exe backend\run.py --reset
```

`--reset` 只删除所选 SQLite 文件，然后迁移、播种并启动；不会递归删除目录。可用 `--database .\backend\another-demo.db` 明确选择另一个演示库。

## 演示账号

| 角色 | 账号 | 密码 | 默认页面 |
|---|---|---|---|
| 业主 | `owner` | `123456` | 首页 |
| 物业 | `property` | `123456` | 运营首页 |
| 维修 | `maintenance` | `123456` | 我的工单 |

## 测试

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run e2e
```

E2E 固定使用一个 Chromium worker、生产构建和独立 SQLite 库；结束后会清理测试数据库。详细结果见 [docs/test-report.md](docs/test-report.md)。

## HarmonyOS 平板访问

1. 电脑与平板连接同一 Wi-Fi。
2. 在电脑运行生产演示命令，并保持 PowerShell 窗口打开。
3. 用 `ipconfig` 找到电脑无线网卡的 IPv4 地址，例如 `192.168.1.20`。
4. 在 HarmonyOS 浏览器打开 `http://192.168.1.20:8000`。
5. 若无法连接，确认 Windows 防火墙允许 TCP 8000、网络为“专用”、路由器未启用客户端隔离。

完整步骤和排障见 [docs/deployment.md](docs/deployment.md)，现场讲解见 [docs/demo-script.md](docs/demo-script.md)。

## 目录

```text
backend/app/             FastAPI 路由、服务、模型与安全逻辑
backend/migrations/      Alembic 初始迁移
backend/tests/           后端行为、隔离、迁移与托管测试
frontend/src/            React 页面、组件、状态与样式
frontend/e2e/            生产环境 Playwright 流程
frontend/public/         本地演示图片与授权记录
docs/screenshots/        已验证的平板截图
docs/                    部署、演示、测试和 AI 开发记录
```

## 参考与授权边界

- 后端领域划分参考 [java110/MicroCommunity](https://github.com/java110/MicroCommunity) 提交 `45102fc13900aad6d117b00a4feeeafe9c3f5fee`，仅借鉴社区、房屋、业主、公告、报修、账单和车位关系，没有复制其 Java/Spring Cloud 实现。
- 组件采用 shadcn/ui 的 MIT 许可模式与 Radix UI 原语，在本仓库独立维护实现。
- 车位流程只借鉴 Cal 的渐进式预约概念。
- Dub 与 Plane 仅用于设计研究，没有复制其 AGPL 或商业源码、品牌素材与文案。
- 登录页住宅照片的原始链接、Unsplash 许可和本地文件说明记录在 [frontend/public/ASSET_LICENSES.md](frontend/public/ASSET_LICENSES.md)。
