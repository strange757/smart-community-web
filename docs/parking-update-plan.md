# 停车管理更新实施记录

日期：2026-09-07。范围为物业停车审批与业主图形化车位选择；按本轮要求不执行全项目检查和全流程验收。

## 业务规则

- 新预约提交为 `PENDING`，在所选日期和时段暂占车位。
- 物业通过后为 `ACTIVE`，驳回后为 `REJECTED` 且记录原因；业主可取消自己的待审批或已通过预约。
- 历史 `ACTIVE` 预约保持有效，新增迁移保留数据。
- 空闲图返回所有车位及 `AVAILABLE/PENDING/OCCUPIED/DISABLED` 状态，不向其他业主披露申请人或车牌。
- 图示对应系统预约数据，不接入车位硬件。前端每 3 秒刷新，提交时服务端再次检查冲突。

## 实施任务

- [x] 后端：预约审核字段、迁移、物业列表、通过与驳回、占用图接口、停车定向测试。
- [x] 业主端：日期和时段筛选、车位平面图、车位选择、申请确认、审批记录与取消。
- [x] 物业端：停车管理导航、审批队列、筛选、审核对话框与车位总览。
- [x] 接入：路由、状态标签、查询刷新、旧停车测试与演示步骤更新。

## 接口

`GET /api/v1/parking/availability?date=YYYY-MM-DD&start=HH:MM&end=HH:MM` 返回 `{asOf, spaces}`；每个车位包含原有字段及 `availability/isMine`。

物业使用 `GET /api/v1/parking/reservations`、`POST /api/v1/parking/reservations/{id}/approve` 和 `POST /api/v1/parking/reservations/{id}/reject`。审批请求正文为 `{note}`，驳回原因必填。

预约返回值增加车位编号、区域、车牌、申请人、申请时间、审批时间与审批意见。原有创建、我的预约及取消接口保留。

## 开源参考

- [jQuery Seat Charts](https://github.com/mateuszmarkowski/jQuery-Seat-Charts)，MIT，参考提交 `f43f2a1884c95c3f4fa08ea67d4bc2ccf70aa26b`。借鉴平面位置选择、状态图例、不可用位置和键盘可访问的交互结构；本项目沿用 React 实现，不引入 jQuery 或复制其源码。
- [Kenney Racing Pack](https://kenney.nl/assets/racing-pack)，CC0，使用俯视车辆位图作为占用和选中位置的视觉素材，授权记录见前端素材说明。

## 验证范围

本轮仅执行停车相关的定向测试、必要构建及这两页的基本运行确认。按当前安排先同步源码到 GitHub，全量后端、全量前端、完整浏览器回归和整体交付检查留到后续统一执行。

已执行停车后端与迁移定向用例、两份前端停车页面测试（5 项）以及页面构建。对业主车位页的 1024px/390px 布局和物业两种视图做了基本运行确认，未出现页面运行错误，车辆图片正常显示。

现有运行数据库在升级前通过 SQLite 备份，备份文件为 `backend/backups/parking-before-upgrade-20260907-110228.db`。已升级至 `20260907_0002`，升级前后原停车预约均为 1 条。既有完整浏览器测试中的停车步骤已更新，但本轮没有执行这份全流程测试。
