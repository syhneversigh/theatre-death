# 契约 2.1 实施记录

基线 cbc93c7；集成分支 backend/client-contract-2.1。批准需求见 [实施计划](client-contract-2.1-plan.md)。规则仍为 2.0。尚未完成的步骤不能从旧版 310 测试或健康检查推断已通过。

| 步骤 | 状态 | 验证及未覆盖范围 |
| --- | --- | --- |
| 01 契约与隔离基础 | 增量通过 | Luna：contract-foundation + v2-config + smoke，3文件9例；容器typecheck通过；HTTP/Socket自定义Cookie与默认Cookie隔离。未跑全量/E2E。源码只读挂载，基线cbc93c7 |
| 02–13 | 待实施 | 见计划，暂未变更 3000/3001 部署 |

Docker启动时两处失效socket阻止引擎启动。已保留并隔离 `Docker/run` 与仅含 `engine.sock` 的 `docker-secrets-engine` 目录；未重置或删除镜像/磁盘/账号。原3000与3001候选容器已恢复。这里只表示运行恢复，不是2.1玩法验收。
