# DevEco Studio 平板模拟器运行指南

更新日期：2026-09-07。目标是在 HarmonyOS 平板模拟器中完成和邻智慧社区最终交付版的三角色演示。

## 1. 运行方式与本机情况

本项目是 React + FastAPI Web 系统。电脑运行社区服务，平板通过浏览器或 ArkUI Web 组件显示界面并操作同一套数据。DevEco Studio 管理模拟器，并在需要时编译安装承载网页的 HarmonyOS 应用。

本次检查到的电脑环境：

| 项目 | 结果 |
|---|---|
| 最新工程 | `C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web` |
| DevEco Studio | `26.0.0.821`，安装于 `D:\Users\DevEco Studio` |
| HDC | `D:\Users\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe`，版本 `3.2.0f` |
| 已运行的平板设备 | `MatePad Pro 13`，Tablet，HarmonyOS 7.0.0 / API 26 |
| 平板配置参数 | 2880 x 1920、密度 320、4 核、4096 MB 内存 |
| 设备连接 | 本次运行设备标识为 `127.0.0.1:5555`，以后以 `hdc list targets` 为准 |
| 镜像准备 | 已通过 Device Manager 下载并安装 `tablet_x86` 平板镜像 |
| 应用运行 | `com.helin.community` 已安装，业主登录和首页显示已验证 |

以下步骤适用于本机；其他电脑需要准备相应 SDK 和镜像。交付包已包含 [harmonyos 工程](../harmonyos/README.md)，无需重新创建容器。设备实测截图和验证范围见 [测试报告](test-report.md)。

## 2. 在电脑启动系统

首次安装依赖按 [部署指南](deployment.md) 完成。在 PowerShell 中运行：

```powershell
Set-Location 'C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web'
npm --prefix frontend run build
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db
```

打开电脑浏览器的 `http://127.0.0.1:8000`，用 `owner / 123456` 登录，再退出。保持服务窗口打开。此命令使用已配置模型并补充社区规模数据，模型配置见 [AI 说明](ai-assistance.md)。

需要重演初始状态时，先停止服务，再对同一独立数据库加 `--reset` 启动；该参数会清空所选数据库的全部记录。

## 3. 准备并启动平板模拟器

1. 打开 DevEco Studio。在欢迎页或 IDE 的工具入口查找 **Device Manager**；通常位于 **Tools > Device Manager**。
2. 进入 **Local Emulator**。已有 `MatePad Pro 13` 时检查其系统镜像状态；需要下载时先完成下载。没有设备则用 **New Emulator / Create Device / +** 创建。
3. 设备类型选 **Tablet**，可选 `MatePad Pro 13` 或同类平板。系统镜像须匹配支持 Tablet 的 HarmonyOS 版本及本机架构。本机配置是 HarmonyOS 7.0.0 / API 26；旧版 DevEco Studio 使用其可用的匹配 SDK 与镜像即可。
4. 下载完成后点击设备右侧运行图标，等待进入系统桌面，解锁屏幕。
5. 将设备旋转到横屏。默认设备分辨率即可，不需要强行改成 1024 x 768；后者是网页自动化验证的 CSS 视口，不等于模拟器物理像素。

模拟器窗口的缩放仅影响电脑上的显示大小。网页可用宽度不够时，左侧导航会变为图标或折叠菜单；可先把设备横屏并将应用最大化。

若镜像启动失败，先依据 Device Manager 的诊断检查 BIOS 虚拟化、该版本要求的 Windows 虚拟化组件、内存和磁盘空间，再冷启动设备。不要把手机镜像当作平板镜像使用。

## 4. 建立设备到电脑的端口映射

另开一个 PowerShell 窗口：

```powershell
$hdc = 'D:\Users\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
& $hdc list targets
```

只有一台连接设备时：

```powershell
& $hdc rport tcp:8000 tcp:8000
& $hdc fport ls
```

多个设备时，把下面的值替换成列表中平板的完整标识：

```powershell
$tabletTarget = '替换为平板设备标识'
& $hdc -t $tabletTarget rport tcp:8000 tcp:8000
& $hdc -t $tabletTarget fport ls
```

期待返回 `Forwardport result:OK`，且转发列表出现对应规则。映射方向是：

```text
平板 http://127.0.0.1:8000
             |
       HDC rport 反向映射
             |
电脑 http://127.0.0.1:8000
             |
      社区页面与 /api/v1
```

必须使用 `rport` 创建反向映射。设备和电脑原本各有自己的 `127.0.0.1`，只有建立映射后此地址才会连接电脑服务。不要在页面填写 `0.0.0.0`，也无需猜测模拟器网关地址。

前端使用 `crypto.randomUUID()`，回环地址可满足现代浏览器的安全上下文要求。直接访问普通局域网 HTTP 地址可能显示登录页却不能登录；无线访问需使用有效 HTTPS。离线 AI 由后端调用，因此只映射社区端口。

如果电脑 8000 被占用，在原启动命令末尾增加 `--port 8002`，保留同一数据库路径，再将设备 8000 映射到电脑 8002。服务启动命令为：

```powershell
.\backend\.venv\Scripts\python.exe demo\run_demo.py --database .\backend\delivery-demo.db --port 8002
```

在另一个窗口设置映射：

```powershell
& $hdc rport tcp:8000 tcp:8002
```

此时平板仍访问 `http://127.0.0.1:8000`，电脑访问 `http://127.0.0.1:8002`。创建新映射前，先用 `fport ls` 检查旧规则；确认属于本次演示后，用其精确端口组合移除，例如：

```powershell
& $hdc fport rm tcp:8000 tcp:8000
```

多设备时这些命令同样增加 `-t $tabletTarget`。模拟器重启、断开或 HDC 服务重启后需重新检查映射。

## 5. 路径 A：模拟器有浏览器

1. 在平板桌面打开浏览器，输入完整地址 `http://127.0.0.1:8000`。
2. 出现和邻登录页及住宅图片后，用 `owner / 123456` 登录。
3. 确认首页、报修弹窗和退出登录可操作。
4. 进入 [现场演示流程](demo-script.md)。

部分模拟器镜像没有预装浏览器。此时继续使用路径 B。

## 6. 路径 B：用 ArkUI Web 容器运行

### 6.1 打开交付工程

在 DevEco Studio 选择 **File > Open**，打开本仓库的 `harmonyos` 子目录。本机路径是 `C:\Users\Lenovo\Desktop\harmonyos\smart_community\smart-community-web\harmonyos`。等待依赖同步完成，再选择 `entry` 和平板设备。

此工程由 DevEco CLI 的 Empty Ability 模板生成，采用 ArkTS、Stage 模型、Tablet 设备类型和 API 26。项目根目录是 Web 服务工程，DevEco Studio 应打开其 `harmonyos` 子目录。使用不同 SDK 时需同时核对构建配置与镜像兼容性。

### 6.2 添加网络权限

交付工程 `entry/src/main/module.json5` 已在 `module` 对象内配置以下内容。自行调整时合并已有属性，不要重复添加键：

```json5
"deviceTypes": ["tablet"],
"requestPermissions": [
  { "name": "ohos.permission.INTERNET" }
]
```

需要兼容手机时，可保留模板的 `"phone"` 并追加 `"tablet"`。这里是 `module` 对象内部的片段，不是整个配置文件。

### 6.3 设置页面

交付工程 `entry/src/main/ets/pages/Index.ets` 已实现以下容器逻辑，可直接构建：

```typescript
import { webview } from '@kit.ArkWeb';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();

  build() {
    Column() {
      Web({
        src: 'http://127.0.0.1:8000',
        controller: this.controller
      })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
  }
}
```

React 需要 JavaScript，登录会话使用 `sessionStorage`，因此显式启用脚本和 DOM 存储。页面从 FastAPI 同源加载，API 相对地址 `/api/v1` 自动指向同一服务，不需要修改 React 的请求地址。

确认 `entry/src/main/resources/base/profile/main_pages.json` 保留入口：

```json
{
  "src": ["pages/Index"]
}
```

模板 `EntryAbility.ets` 应加载 `pages/Index`。不要把 `frontend/dist/index.html` 改为本地文件 URL，服务端需要继续提供 API 与路由回退。

### 6.4 运行应用

1. 在顶部运行配置中选择 `entry`，目标设备选择已启动的 Tablet。
2. 确认社区服务运行、HDC 映射存在，点击 **Run**。
3. 如 IDE 提示需要签名，打开 **File > Project Structure > Project > Signing Configs**，按该版本的自动签名流程配置，所需华为账号由操作者登录。不要复用其他工程的私钥或签名文件。
4. 等待编译和安装完成。容器内应出现和邻登录页；横屏后按演示脚本操作。

本次 API 26 本地模拟器接受了未签名的调试 HAP，安装返回 `install bundle successfully`，启动返回 `start ability successfully`。这只说明该本地模拟器的调试能力；真机和分发仍按对应环境完成签名。

右侧 Previewer 是布局预览工具，不能代替上述模拟器 Run 与业务网络验收。Web 容器承载现有系统，数据和模型请求由电脑后端处理，因此社区后端需要保持运行。

## 7. 现场验收顺序

使用独立演示库，三个账号密码均为 `123456`：

1. `owner`：首页、AI 整理报修并提交。
2. `property`：运营首页、将新工单指派给陈师傅。
3. `maintenance`：开始处理、填写完成说明。
4. `owner`：确认、五星评价、模拟缴费、车位预约冲突与取消。
5. `property`：AI 公告拟稿、创建草稿、发布。
6. `owner`：在“消息”查看已发布公告。

每次切角色先关闭弹窗，再点右上角账户菜单的“退出登录”。详细按钮、输入和预期状态见 [12 分钟演示脚本](demo-script.md)。

## 8. 排障与结束

| 现象 | 处理 |
|---|---|
| `hdc` 找不到 | 用实际完整路径；本机路径见第 1 节 |
| `[Empty]` | 等待模拟器完成启动，检查是否已解锁，使用 IDE 配套 HDC 再查询 |
| 多设备错误 | 对每条设备命令加 `-t` 指定平板 |
| 转发端口占用 | 用 `fport ls` 检查本次规则，按第 4 节移除精确规则或改端口 |
| Web 空白或连接被拒绝 | 先在电脑打开 `/docs`，再检查映射、地址和 INTERNET 权限 |
| 页面存在但无法登录 | 检查 JavaScript/DOM 存储，使用映射后的回环地址或有效 HTTPS |
| Web 报明文策略错误 | 依据当前 SDK 的网络策略检查工程配置，或使用有效 HTTPS；不要套用 Android manifest 配置 |
| 菜单只有图标 | 横屏并最大化；800 至 1023 CSS 像素为紧凑侧栏，低于 800 用左上角导航按钮 |
| 切角色菜单不可点 | 先点详情右上角 X 关闭模态层 |
| AI 不可用 | 核对服务端模型配置；草稿可手动填写，智能问答需要配置可用模型 |
| 页面未更新 | 重新构建前端，刷新或重新运行容器 |

结束后关闭容器或浏览器，在社区启动窗口按 `Ctrl+C`。需要移除映射时，先查看 `fport ls`，仅删除本次规则。保留数据库即可保留演示结果。

## 9. 依据

- [OpenHarmony 官方 HDC 使用指导](https://github.com/openharmony/docs/blob/master/zh-cn/device-dev/subsystems/subsys-toolchain-hdc-guide.md)：反向映射、目标选择和规则移除。
- [华为开发者文档入口](https://developer.huawei.com/consumer/cn/doc/)：按已安装版本查阅“本地模拟器”“Web 组件”“自动签名”。
- 本机 DevEco Studio `product-info.json`、模拟器 `config.ini` 及 SDK `@kit.ArkWeb.d.ts`、`component/web.d.ts`：版本、设备类型和容器 API 核对。
