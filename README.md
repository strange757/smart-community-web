# 和邻智慧社区 · 最终交付版

更新日期：2026-09-07。本文档及同目录资料以 `smart_community/smart-community-web` 中的代码为准。

和邻智慧社区面向 HarmonyOS 平板使用，提供业主、物业、维修三类角色，覆盖公告管理、报修全流程、模拟缴费、车位预约、运营概况和 AI 辅助填写。交付形态为 React 网页前端与 FastAPI 服务端，数据保存在 SQLite 中。

交付包包含可直接在 DevEco Studio 打开的 [HarmonyOS 平板工程](harmonyos/README.md)，通过 ArkUI Web 容器访问系统。已在 MatePad Pro 13 模拟器完成安装、业主登录与首页显示检查；运行方法见 [平板模拟器指南](docs/deveco-tablet-guide.md)。

## 文档导航

| 文档 | 内容 |
|---|---|
| [部署与运行](docs/deployment.md) | 环境安装、构建、启动、数据恢复与网络排障 |
| [DevEco Studio 平板模拟器](docs/deveco-tablet-guide.md) | 本机配置、镜像准备、HDC 映射与 Web 容器代码 |
| [HarmonyOS 工程](harmonyos/README.md) | 已配置的平板客户端、构建和安装步骤 |
| [现场演示流程](docs/demo-script.md) | 三角色切换、报修闭环、缴费、预约、公告与 AI |
| [测试报告](docs/test-report.md) | 当前交付目录的复核结果与验证范围 |
| [AI 使用与配置](docs/ai-assistance.md) | 离线演示、模型配置与数据边界 |
| [AI 设计与实现](docs/ai-assistance-plan.md) | 接口、权限、服务适配与验收标准 |
| [AI 辅助开发记录](docs/ai-development-log.md) | 需求、工程决策与质量核对记录 |
| [演示工具](demo/README.md) | 启动器、检查工具及参数 |
| [第三方声明](THIRD_PARTY_NOTICES.md) | 依赖许可与设计参考 |
| [图片授权](frontend/public/ASSET_LICENSES.md) | 登录图片来源与许可 |

## 交付功能

| 模块 | 交付行为 |
|---|---|
| 登录与权限 | 三角色登录、会话恢复、退出及社区数据隔离 |
| 公告 | 物业创建草稿、发布、撤回；业主和维修人员查看已发布公告 |
| 报修 | 业主提交及可选图片附件、物业派单、维修处理、业主确认与评价、允许状态下取消 |
| 缴费 | 查看账单、确认模拟缴费、生成参考号、同键重试保持幂等 |
| 车位 | 图形化点选车位、占用状态定时刷新、物业审批与驳回、重叠冲突检测、查看和取消预约 |
| 运营 | 物业首页展示待处理工单、已完成工单和待收费用 |
| AI | 业主社区问答、功能查询、报修整理、公告拟稿，业务操作仍由用户确认 |

模拟缴费不发生真实扣款。当前电脑通过本机配置的 BuffLink API 调用 `gpt-6-astra`；其他环境使用自己的模型配置，离线规则草稿需显式启用。这些是本次交付的功能范围。门禁硬件、停车硬件与真实支付网关不在交付范围内。

## 架构

```text
平板浏览器 / ArkUI Web 容器 / 电脑浏览器
                  |
             FastAPI :8000
              /         \
      React 构建产物     /api/v1
                           |
                      SQLAlchemy
                           |
                        SQLite
```

服务端同源托管页面与 API；Alembic 负责迁移，启动时写入幂等种子数据。社区、房屋、工单、附件、账单和预约等数据配置关系约束及审计时间。模型调用只在服务端执行。

## 首次准备

推荐 Windows 10/11、PowerShell、Python 3.12、Node.js 22.12 以上及 npm。首次安装依赖和模拟器镜像需要联网。

从 GitHub 获取工程时执行以下命令，再运行下方的环境安装步骤。下方 `Set-Location` 为原交付电脑的路径示例，请按实际克隆位置调整。

```powershell
git clone https://github.com/strange757/smart-community-web.git
Set-Location smart-community-web
```

```powershell
Set-Location 'C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web'
python --version
node --version
npm --version
python -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -e 'backend[dev]'
npm --prefix frontend ci
npm --prefix frontend run build
```

已有可用虚拟环境及前端依赖时，从构建步骤继续。若 `python` 指向其他版本，使用已安装 Python 3.12 的完整路径创建虚拟环境。PowerShell 限制 `npm.ps1` 时，将 `npm` 改为 `npm.cmd`。

## 运行与账号

推荐现场演示命令使用已配置模型和社区规模数据，并使用独立验收数据库：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db
```

电脑打开 [系统首页](http://127.0.0.1:8000)，保持启动窗口运行。重复启动保留业务记录。接口说明见 [API 文档](http://127.0.0.1:8000/docs)。

| 角色 | 账号 | 密码 | 默认页面 |
|---|---|---|---|
| 业主 | `owner` | `123456` | 首页 |
| 物业 | `property` | `123456` | 运营首页 |
| 维修 | `maintenance` | `123456` | 我的工单 |

需要清空上轮演示操作时，先按 `Ctrl+C` 停止服务，确认数据库路径后运行：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db --reset
```

`--reset` 会删除指定数据库中的全部记录。只启动社区服务、按 `.env` 决定是否启用 AI 时，运行 `.\backend\.venv\Scripts\python.exe backend\run.py --host 127.0.0.1`；该入口默认数据库为 `backend/community.db`。

## 平板模拟器快速入口

1. 在 DevEco Studio 的 Device Manager 中下载并启动 Tablet 类型的本地模拟器。
2. 保持社区服务运行，在新的 PowerShell 窗口执行以下命令。
3. 在 DevEco Studio 打开本仓库的 `harmonyos` 子目录，选择 `entry` 和 Tablet 设备运行；容器会加载 `http://127.0.0.1:8000`。已安装浏览器的镜像也可直接访问此地址。
4. 按 [现场演示流程](docs/demo-script.md) 完成验收。

```powershell
$hdc = 'D:\Users\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
& $hdc list targets
& $hdc rport tcp:8000 tcp:8000
& $hdc fport ls
```

HDC 路径对应当前电脑；其他电脑使用各自安装路径。多设备选择、无浏览器方案、签名与联网排障见 [完整指南](docs/deveco-tablet-guide.md)。普通局域网 HTTP 可能缺少前端所需的安全上下文，应使用回环地址映射或有效 HTTPS。

## 检查与测试

报修现支持可选图片上传、预览及按工单权限查看，使用与保存说明见 [报修附件](docs/repair-images-update.md)。图片文件保存在服务端私有目录，不纳入GitHub。

停车管理已增加审批和车位图，功能规则及本轮定向验证记录见 [停车更新说明](docs/parking-update-plan.md)。按当前开发安排，本轮不执行全项目回归。

业主社区助手、模型接入和扩充数据见 [更新记录](docs/assistant-data-update-plan.md)。当前电脑包含 192 套房、96 个车位、201 条工单、1188 笔账单、81 条预约和 24 条公告；数量包含保留的原有操作记录。物业账单支持筛选与分页，业主账单显示关联房屋。

服务运行后，执行 `.\backend\.venv\Scripts\python.exe demo\check_demo.py --check-ai`，检查页面、三角色数据与 AI 草稿，不改写社区业务记录。

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend\tests
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run test:e2e-runner
Push-Location frontend
npx playwright install chromium
Pop-Location
npm --prefix frontend run e2e
```

浏览器测试使用端口 8001、单个 Chromium worker 和独立测试库。结果及设备覆盖范围见 [测试报告](docs/test-report.md)。

## 目录

```text
backend/app/          接口、服务、模型、认证与配置
backend/migrations/   数据库迁移
backend/tests/        后端测试
frontend/src/         页面、组件、状态与样式
frontend/e2e/         浏览器业务流程验证
frontend/public/      本地图片与授权说明
harmonyos/            HarmonyOS 平板客户端工程
demo/                 启动器、离线 AI 服务与检查工具
docs/                 交付文档
docs/screenshots/     随附界面截图
```

虚拟环境、依赖目录、构建产物和运行数据库由安装、构建及启动产生，不纳入 GitHub 源码。签名材料与模型凭据只在本机配置。`._` 开头的 macOS 元数据也不纳入仓库。
