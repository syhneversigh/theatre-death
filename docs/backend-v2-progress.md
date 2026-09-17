# 后端 v2 进度

基线 cc3e48e；计划 docs/backend-v2-plan.md。

| 步骤 | 状态 | 验证 |
| --- | --- | --- |
| 01 工程基线 | 完成 | Luna：engine目录宿主/容器哈希一致；smoke 1/1；compose app继承挂载且独立端口 |
| 02 权限查询 | 完成 | Luna：capabilities 5 + voice-policy 9；typecheck通过 |
| 03 合法目标 | 完成 | Luna：targets 5 + night-driver 14 + engine-night 27；typecheck通过。纠正不可达的连续同对测试历史后仅重跑targets |
| 04 公开投影 | 完成 | Luna：knowledge及gameView 8/8；typecheck通过；未公告生命/翻牌隔离及水妖专属回归窗口 |
| 05 实时通道 | 完成 | Luna：v2-realtime 5 + realtime 6；typecheck通过；撤销断开、公开/私人视角、跨来源拒绝 |
| 06 窗口实例 | 完成 | Luna：window-instances 3 + night-driver 14 + day-driver 9；typecheck通过 |
| 07 截止与队列 | 完成 | Luna：deadline-queue 4 + day-driver 9 + night-driver 14；typecheck通过 |
| 08 幂等存储 | 完成 | Luna：receipts 4/4；统一在v2请求入口接入 |
| 09 天理移交 | 完成 | Luna：先复现2失败/1通过，修复后v2-handover3通过（含非法目标/超时），engine-day23+day-driver9通过；旧错误“夜死末尾移交”断言按R46校正 |

旧 3000 服务和数据未改动。测试命令为 compose.v2.yml run --rm --no-deps test；Windows换行差异按解析后的JSON锁文件比较。
