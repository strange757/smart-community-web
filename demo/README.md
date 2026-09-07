# 最终交付演示工具

更新日期：2026-09-07。此目录提供启动器、本机模型配置导入、可选离线草稿服务和运行检查工具。完整安装见 [部署指南](../docs/deployment.md)，平板运行见 [DevEco Studio 指南](../docs/deveco-tablet-guide.md)。

## 启动与恢复

安装依赖后，在工程根目录运行：

```powershell
Set-Location 'C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web'
npm --prefix frontend run build
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db
```

打开 `http://127.0.0.1:8000`，保持启动窗口运行。默认使用 `backend/.env` 和环境变量中的模型配置，并幂等补充社区规模演示数据。当前电脑已接入 BuffLink 网关的 `gpt-6-astra`；其他电脑需按 [AI 配置](../docs/ai-assistance.md) 设置。

结束时按 `Ctrl+C` 停止启动器，数据库保留。下轮需清空专用演示库时，在停止后运行：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db --reset
```

`--reset` 删除所选数据库的全部记录。不写 `--database` 时目标是 `backend/community.db`。

## 运行检查

另开窗口，在工程根目录执行：

```powershell
.\backend\.venv\Scripts\python.exe demo\check_demo.py --check-ai
```

检查页面、三角色登录、业务数据和两项 AI 草稿，不修改社区业务记录。AI 请求仍消耗调用限额，使用真实供应商时可能计费。只检查业务接口时省略 `--check-ai`。

其他服务端口使用 `--base-url http://127.0.0.1:8002`。成功结尾为“演示检查完成：0 项失败。”。

## 账号与选项

三个账号为 `owner`、`property`、`maintenance`，密码均为 `123456`，分别对应业主、物业、维修。

| 参数 | 作用 |
|---|---|
| `--database PATH` | 指定 SQLite 文件，推荐 `backend\delivery-demo.db` |
| `--reset` | 启动前删除并重建所选数据库 |
| `--host ADDRESS` | 默认 `127.0.0.1`，`0.0.0.0` 接受局域网连接 |
| `--port 8002` | 更换社区端口，默认 8000 |
| `--mock-ai` | 显式运行离线草稿模拟服务，智能问答需要真实模型 |
| `--ai-port 9101` | 使用 `--mock-ai` 时更换模拟端口，默认 9100 |
| `--no-mock-ai` | 使用现有模型配置，与默认行为一致，保留兼容 |
| `--minimal-data` | 仅使用原始小型数据，不追加社区规模数据 |

真实模型先按 [AI 配置](../docs/ai-assistance.md) 设置，再运行：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db --no-mock-ai
```

离线模式只覆盖子进程的 AI 环境变量，不改写 `.env`。默认模型模式本身不会生成凭据，仍需有效配置；`configure_local_ai.py` 可将本机已有 API 配置导入服务端。

## 社区规模数据

演示启动器默认向后端传入 `--demo-data`，生成批次只执行一次。包括多栋楼和住户、96 个车位、多种费用、工单状态与事件、停车审批和公告。已有记录、付款及取消结果不会被覆盖。批次标记保存在受迁移管理的 `demo_data_batch` 表。

当前电脑扩充后的数量和验证范围见 [实施记录](../docs/assistant-data-update-plan.md)。`--minimal-data` 不会删除已经生成的数据；要获取独立小型数据，使用新的数据库路径并加此选项。

## 平板与现场演示

HDC 将设备 8000 反向映射到电脑 8000，平板浏览器或 Web 容器访问 `http://127.0.0.1:8000`。无需映射 AI 端口。

`--host 0.0.0.0` 只改变监听地址；完整无线演示还需有效 HTTPS，以满足前端安全上下文 API 的要求。详见 [部署指南](../docs/deployment.md)。

约 12 分钟的按钮顺序、输入示例和预期结果见 [演示脚本](../docs/demo-script.md)。
