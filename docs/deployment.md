# Windows 演示部署

本指南用于同一局域网内的课堂或验收演示。默认数据库为 `backend/community.db`，服务监听 `0.0.0.0:8000`。

## 1. 准备环境

安装 Python 3.12、Node.js 22.12 以上和 Git。打开 PowerShell，进入仓库根目录后确认版本：

```powershell
python --version
node --version
npm --version
```

首次安装依赖：

```powershell
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]"

Set-Location frontend
npm ci
Set-Location ..
```

## 2. 构建前端

```powershell
npm --prefix frontend run build
```

成功后必须存在 `frontend/dist/index.html`。后续修改前端时要重新构建。

## 3. 迁移、播种并启动

推荐直接运行生产入口：

```powershell
backend\.venv\Scripts\python.exe backend\run.py
```

入口按仓库位置解析前端和迁移目录，依次执行 Alembic `upgrade head`、幂等种子数据，然后启动 Uvicorn。重复启动不会重复插入种子数据。

需要单独验证默认数据库迁移时，可执行：

```powershell
Push-Location backend
.\.venv\Scripts\alembic.exe upgrade head
Pop-Location
```

指定另一个演示 SQLite 文件时，由生产入口为该文件配置迁移：

```powershell
backend\.venv\Scripts\python.exe backend\run.py --database .\backend\class-demo.db
```

本机访问：

- 应用：`http://127.0.0.1:8000`
- API 文档：`http://127.0.0.1:8000/docs`
- 直接路由检查：`http://127.0.0.1:8000/app/home`

## 4. 安全重置演示数据

先按 `Ctrl+C` 停止当前服务器，再运行：

```powershell
backend\.venv\Scripts\python.exe backend\run.py --reset
```

该命令只解除链接并重建当前配置的 SQLite 数据库文件，不会删除目录或相邻文件；随后会迁移、播种并重新启动。指定库必须在重置命令中再次明确给出：

```powershell
backend\.venv\Scripts\python.exe backend\run.py --database .\backend\class-demo.db --reset
```

非 `.db`、`.sqlite`、`.sqlite3` 扩展名、内存库或目录路径会被拒绝。

## 5. HarmonyOS 平板局域网访问

1. 电脑与 HarmonyOS 平板连接同一个 Wi-Fi，建议关闭 VPN。
2. 保持 `backend/run.py` 正在运行；日志应显示 `Uvicorn running on http://0.0.0.0:8000`。
3. 在新的 PowerShell 窗口运行：

```powershell
ipconfig
```

4. 找到当前无线局域网适配器的 IPv4 地址，例如 `192.168.1.20`。
5. 在平板浏览器打开 `http://192.168.1.20:8000`，不要使用电脑的 `127.0.0.1`。

首次需要放行防火墙时，以管理员身份打开 PowerShell：

```powershell
New-NetFirewallRule -DisplayName "和邻智慧社区 TCP 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

演示结束后如需移除该规则：

```powershell
Remove-NetFirewallRule -DisplayName "和邻智慧社区 TCP 8000"
```

## 6. 网络排障

先在电脑验证服务：

```powershell
Test-NetConnection 127.0.0.1 -Port 8000
Get-NetTCPConnection -LocalPort 8000 -State Listen
```

再用实际 IPv4 验证，例如：

```powershell
Test-NetConnection 192.168.1.20 -Port 8000
```

常见原因：

- `frontend/dist is missing`：运行 `npm --prefix frontend run build`。
- 8000 端口被占用：停止占用进程，或用 `backend\run.py --port 8002` 启动并访问对应端口。
- 本机可开、平板不可开：检查防火墙入站规则、Windows 网络是否为“专用”、两台设备是否同一网段。
- 同一 Wi-Fi 仍不通：关闭 VPN/代理，检查访客网络或路由器的 AP/客户端隔离。
- 页面旧或数据状态不适合演示：停止服务后运行 `backend\run.py --reset`，并在平板刷新页面。
- API 返回 401：退出后重新登录；若仍失败，重置演示库。

## 7. 正式生产注意事项

当前入口是局域网 MVP，不应直接暴露到公网。正式部署至少需要：

- 通过 `COMMUNITY_JWT_SECRET` 设置足够长的随机 JWT 密钥，绝不使用仓库中的演示默认值。
- 在反向代理后启用 HTTPS、安全响应头、访问日志、限流和可靠备份。
- 将 SQLite 替换为 PostgreSQL 等更强的数据库，并按部署平台调整启动与连接配置。
- 使用独立账号、最小权限、密钥管理和数据库迁移审计。
- 接入真实支付前完成支付机构签名校验、回调幂等、对账、退款和合规评审；当前“缴费”只生成演示参考号。
