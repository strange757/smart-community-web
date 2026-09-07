# 和邻智慧社区平板客户端

最终交付工程，2026-09-07。包名 `com.helin.community`，版本 `1.0.0`，ArkTS + Stage + ArkUI Web，目标设备 Tablet，SDK API 26。

本工程已在 MatePad Pro 13 / HarmonyOS 7.0.0 模拟器完成构建、安装、业主登录及首页显示。完整运行指南见 [平板模拟器文档](../docs/deveco-tablet-guide.md)，留证见 [设备截图](../docs/screenshots/harmonyos-tablet-owner-home.png)。

## 运行

1. 先在仓库根目录按 [部署指南](../docs/deployment.md) 安装依赖、构建前端并启动 `demo/run_demo.py --database backend\delivery-demo.db`。
2. 在 DevEco Studio 打开此 `harmonyos` 目录，完成依赖同步。
3. 在 Device Manager 启动 API 26 的 Tablet 模拟器。
4. 建立反向端口映射，使设备 `127.0.0.1:8000` 连接电脑 8000。
5. 选择 `entry` 和平板设备运行。页面会加载 `http://127.0.0.1:8000`。

本机映射命令如下，其他电脑按实际 DevEco Studio 安装路径调整；多个设备时用 `-t` 指定目标：

```powershell
$hdc = 'D:\Users\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
& $hdc list targets
& $hdc rport tcp:8000 tcp:8000
```

## 命令行构建与安装

已安装 DevEco CLI 并配置开发环境时，在此目录执行：

```powershell
devecocli build --modules entry --build-mode debug
```

本次 API 26 本地模拟器支持安装未签名的调试包。构建成功后，在同一目录执行：

```powershell
& $hdc install '.\entry\build\default\outputs\default\entry-default-unsigned.hap'
& $hdc shell aa start -b com.helin.community -a EntryAbility
```

真机和应用分发按对应环境配置签名。仓库不包含私钥、证书配置、SDK、模拟器镜像、依赖目录或构建产物。

## 连接与数据

Web 组件启用 JavaScript 和 DOM 存储。业务代码、AI 调用和数据库均由电脑服务提供；关闭电脑服务后页面不能继续完成业务操作。模拟器重启后应检查端口映射。

账号为 `owner`、`property`、`maintenance`，密码均为 `123456`。当前容器访问地址位于 `entry/src/main/ets/pages/Index.ets`。修改电脑端口时可让设备 8000 映射到新端口，保持容器地址不变。

## 模板许可

工程基于 Huawei DevEco CLI 1.3.1 的 Empty Ability 模板，保留原始版权声明。模板许可证见 [LICENSE](LICENSE)，项目第三方说明见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
