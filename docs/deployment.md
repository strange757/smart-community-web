# 最终交付部署与运行指南

更新日期：2026-09-07。适用工程：`smart_community/smart-community-web`。平板操作另见 [模拟器指南](deveco-tablet-guide.md)。

## 1. 环境与目录

推荐 Windows 10/11、PowerShell、Python 3.12、Node.js 22.12 以上及 npm。解压交付包即可运行，不依赖 Git 仓库。

```powershell
Set-Location 'C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web'
python --version
node --version
npm --version
```

后续命令均从此目录执行，只有开发模式明确切换目录。此处应同时包含 `backend`、`frontend`、`demo` 和 `docs`。

## 2. 安装与构建

首次准备：

```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -e 'backend[dev]'
npm --prefix frontend ci
npm --prefix frontend run build
```

已有可用虚拟环境时不必重建。系统默认 Python 不是推荐版本时，使用已安装 Python 3.12 的完整路径创建虚拟环境。成功后应有 `frontend/dist/index.html`；修改前端后重新构建。

## 3. 启动服务

| 场景 | 入口 | 默认监听 |
|---|---|---|
| 现场演示，模型配置及社区规模数据 | `demo/run_demo.py` | `127.0.0.1:8000` |
| 离线草稿演示 | `demo/run_demo.py --mock-ai` | `127.0.0.1:8000` |
| 按配置使用模型服务 | `demo/run_demo.py --no-mock-ai` | `127.0.0.1:8000` |
| 独立社区服务 | `backend/run.py` | `0.0.0.0:8000` |

推荐验收使用独立数据库：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db
```

启动器检查前端构建。社区服务依次执行 Alembic 迁移、基础种子数据、幂等社区规模演示数据和页面/API 托管。重复启动保留业务记录，不重复插入同批数据。默认使用 `.env` 的模型配置，不启动规则模拟服务。

电脑访问 [系统首页](http://127.0.0.1:8000) 和 [API 文档](http://127.0.0.1:8000/docs)。模型由后端访问，平板仅连接社区服务。使用 `--mock-ai` 时模拟服务监听电脑 `127.0.0.1:9100`，也无需映射该端口。

另开窗口检查：

```powershell
.\backend\.venv\Scripts\python.exe demo\check_demo.py --check-ai
```

检查会登录三角色、读取业务数据，并在指定 `--check-ai` 时调用两项 AI 草稿接口；不会创建报修、支付、预约或公告。连接真实模型时，AI 检查会产生模型请求和可能的费用。只检查业务接口时省略 `--check-ai`。

## 4. 数据恢复

先按 `Ctrl+C` 停止服务。需保留本轮记录时，在服务停止后备份所用数据库及同名 SQLite 附属文件。只在明确要清空独立演示库时运行：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db --reset
```

`--reset` 删除指定 SQLite 文件的全部记录后重建，不删除目录。接受 `.db`、`.sqlite`、`.sqlite3` 扩展名；不写 `--database` 时目标为 `backend/community.db`。启动与重置应始终写出同一数据路径。

其他版本留下的数据库如与当前表结构不一致，保留原文件，改用新数据库路径运行本次交付版本。

## 5. 模拟器及 USB 平板连接

推荐 HDC 反向端口映射，直接连接电脑本地服务：

```powershell
$hdc = 'D:\Users\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
& $hdc list targets
& $hdc rport tcp:8000 tcp:8000
& $hdc fport ls
```

先启动并连接目标设备，再建立映射。成功后设备访问 `http://127.0.0.1:8000`。多设备时增加 `-t` 选择设备；重启后检查并重建映射。USB 真机需开启调试并确认电脑连接授权。完整步骤见 [模拟器指南](deveco-tablet-guide.md)。

## 6. 无线局域网访问条件

前端请求及缴费使用 `crypto.randomUUID()`。现代浏览器通常只在安全上下文中提供该接口，普通 `http://192.168.x.x:8000` 可能能显示页面却无法登录。完整演示使用回环地址映射，或配置受设备信任的 HTTPS。

无线 HTTPS 部署时，电脑与平板接入同一网络。由 HTTPS 反向代理把页面和 `/api/v1` 同时转发至 `http://127.0.0.1:8000`，证书须受设备信任且匹配访问域名或 IP。单纯跳过证书错误不作为验收方法。防火墙仅为所选 HTTPS 端口放行专用网络访问。

仅检查网络连通性时，可用 `--host 0.0.0.0` 启动，运行 `ipconfig` 查找活动网卡 IPv4，从平板访问该地址的 `/docs`。此检查证明网络可达，不代表完整网页业务可用。

## 7. 开发模式

窗口 1：

```powershell
Set-Location 'C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

窗口 2：

```powershell
Set-Location 'C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web\frontend'
npm run dev
```

电脑访问 `http://127.0.0.1:5173`，Vite 将 API 代理至 8000。开发工厂直接创建表；交付演示使用经过迁移的构建托管入口。

## 8. 排障

| 现象 | 处理 |
|---|---|
| 找不到文件或打开了其他工程 | 核对当前目录及虚拟环境路径 |
| PowerShell 禁止 `npm.ps1` | 把 `npm` 改成 `npm.cmd` |
| 缺少前端构建 | 执行 `npm --prefix frontend run build` |
| 8000 被占用 | 增加 `--port 8002`；检查工具及 HDC 映射同步调整 |
| 9100 被占用 | 启动器增加 `--ai-port 9101`，社区端口不变 |
| 电脑也打不开 | 查看启动日志；运行 `Test-NetConnection 127.0.0.1 -Port 8000` |
| 电脑能开，模拟器打不开 | 检查目标设备、端口映射及页面地址 |
| 点击登录无效 | 检查是否为普通局域网 HTTP；改用映射或有效 HTTPS |
| AI 不可用 | 按 AI 文档配置模型并重启；草稿离线演示可用 `--mock-ai`，问答需要模型服务 |
| 401 | 检查账号，退出后重新登录 |
| 页面或数据状态不符 | 重新构建并刷新；核对数据库路径，必要时备份后重置演示库 |
| 直接打开构建文件异常 | 使用 FastAPI 地址，不要双击 `dist/index.html` |

## 9. 使用配置

本次完成电脑本地验证，并在 MatePad Pro 13 模拟器完成应用安装、业主登录及首页检查；设备内完整业务验收范围见测试报告。共享网络部署需独立账号、`COMMUNITY_JWT_SECRET`、HTTPS、访问控制与数据库备份。凭据只保存在服务端。

模拟缴费只写入系统内账单与支付记录，不连接支付网关。并发验证使用 SQLite，其他数据库需在采用时另行验证。AI 服务类型和实际验证范围见 [AI 配置](ai-assistance.md) 与 [测试报告](test-report.md)。
