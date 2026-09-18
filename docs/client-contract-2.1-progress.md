# 契约 2.1 实施记录

基线 cbc93c7；集成分支 backend/client-contract-2.1。批准需求见 [实施计划](client-contract-2.1-plan.md)。规则仍为 2.0。尚未完成的步骤不能从旧版 310 测试或健康检查推断已通过。

| 步骤 | 状态 | 验证及未覆盖范围 |
| --- | --- | --- |
| 01 契约与隔离基础 | 增量通过 | Luna：contract-foundation + v2-config + smoke，3文件9例；容器typecheck通过；HTTP/Socket自定义Cookie与默认Cookie隔离。未跑全量/E2E。源码只读挂载，基线cbc93c7 |
| 02 持续房间与单局运行时 | 增量通过 | Luna：stable-room5 + day-driver9 + server-api24；typecheck通过。配置深冻结/观众不占参赛席/共用队列/审计关联与时间；暂未接入2.1 HTTP入口 |
| 03 进入与成员身份 | 增量通过 | Luna：room-membership5 + stable-room5；typecheck通过。补强无当前房间账号并发进入两房、观众重复进入不自动转正式，单文件复跑5/5；尚未接新HTTP入口 |
| 04 连接状态与宽限 | 增量通过 | Luna：member-presence5、room-membership5、v2-realtime5；typecheck通过。首轮fake-clock测试补等房间队列后presence单文件5/5；真实Engine.IO握手验证10s/20s，不等待真实计时 |
| 05 房主治理 | 增量通过 | Luna：room-governance5 + member-presence5 + room-membership5；typecheck通过。审阅后补强双候选加入顺序、旧房主在线返回、拒绝非房主/离线/观众目标、复盘解散拒绝；单文件复跑5/5 |
| 06–13 | 待实施 | 见计划，暂未变更 3000/3001 部署 |

Docker启动时两处失效socket阻止引擎启动。已保留并隔离 `Docker/run` 与仅含 `engine.sock` 的 `docker-secrets-engine` 目录；未重置或删除镜像/磁盘/账号。原3000与3001候选容器已恢复。这里只表示运行恢复，不是2.1玩法验收。

3003数据准备：使用容器内 Node SQLite `backup()` 将只读挂载的 `data-v2/accounts.sqlite` 和 `audit.sqlite` 复制到独立 `data-contract-2.1`；目标已有内容时拒绝覆盖。两库 `PRAGMA integrity_check` 均为 ok。尚未执行账号升级迁移，不把副本写回正式目录。[SQLite backup API](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html#sqlitebackupsource-db-path-options)

01 证据补充：compose.contract.yml extends compose.v2.yml 的 test，server/tests/contracts等只读挂载；`node scripts/test-incremental.mjs tests/contract-foundation.test.ts tests/v2-config.test.ts tests/smoke.test.ts`、`npm run typecheck` 均在容器执行。auth.ts 宿主/容器 SHA256 同为 ab5f83278b26b7fb7939facfa6393a042a63500f65ce6df0999d279a7e2f64e5；新增测试 SHA256 0634bd6d7cafebade7fab0c9b711a31def26057d06090b66d465f232fe47c26f。

## 增量证据索引

统一入口 `docker compose -f deploy/compose.contract.yml run --rm test node scripts/test-incremental.mjs <下列文件>`，另在相同服务执行 `npm run typecheck`。测试由 gpt-5.6-luna 执行，主代理审阅断言；运行时冻结被测源码。hash 为当时字节值，Git换行规范化会改变字节hash，不能只凭后续hash差异推断行为改变。

| 步骤/测试基线 | 文件（tests/下） | 新测试SHA256 / 被测主要文件宿主容器一致SHA256 |
| --- | --- | --- |
| 02 / cef21fb | stable-room、day-driver、server-api；修正fixture后仅stable-room复跑 | 4908310a104443a0ea4025430f5f1f2b1d4048b6ea64b4121a0e578ea1346574 / 6610db109b3e0adbc9eb2951d701af2b3417e342538facae44cf547bbe75fe3d |
| 03 / b607c46 | room-membership、stable-room；补强竞争后仅room-membership复跑 | 1f56f9fe373a58ea6fe5ed4203b07a48869bf43343bf816545dc2c9aabe9cd9e / 6647aad1b7aa5704d72cf20c2c82d426fd6700b793119c012f97d68c06fb4655 |
| 04 / c0d5c61 | member-presence、room-membership、v2-realtime；补等异步队列后仅member-presence复跑 | f02b13698e99976d1044adf5d86cccea681856e581d69039110b31cd3bb0ade6 / 0501a22a4ca1fb61a31a6c708973d10e27823bab923c9c80b042e41ed34f7178 |
| 05 / 21cf852 | room-governance、member-presence、room-membership；补强后仅治理复跑 | a69e27e95b9e257d0450f98d41532bc33239dc2d29a0b6127ae1c51721b04307 / a2561679df5f67a33dc1e650a86e84dfcaef79018e1a2ca40aeb55afe13541e3 |
