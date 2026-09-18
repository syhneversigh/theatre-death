# 契约 2.1 实施记录

基线 cbc93c7；集成分支 backend/client-contract-2.1。批准需求见 [实施计划](client-contract-2.1-plan.md)。规则仍为 2.0。尚未完成的步骤不能从旧版 310 测试或健康检查推断已通过。

| 步骤 | 状态 | 验证及未覆盖范围 |
| --- | --- | --- |
| 01 契约与隔离基础 | 增量通过 | Luna：contract-foundation + v2-config + smoke，3文件9例；容器typecheck通过；HTTP/Socket自定义Cookie与默认Cookie隔离。未跑全量/E2E。源码只读挂载，基线cbc93c7 |
| 02 持续房间与单局运行时 | 增量通过 | Luna：stable-room5 + day-driver9 + server-api24；typecheck通过。配置深冻结/观众不占参赛席/共用队列/审计关联与时间；暂未接入2.1 HTTP入口 |
| 03 进入与成员身份 | 增量通过 | Luna：room-membership5 + stable-room5；typecheck通过。补强无当前房间账号并发进入两房、观众重复进入不自动转正式，单文件复跑5/5；尚未接新HTTP入口 |
| 04 连接状态与宽限 | 增量通过 | Luna：member-presence5、room-membership5、v2-realtime5；typecheck通过。首轮fake-clock测试补等房间队列后presence单文件5/5；真实Engine.IO握手验证10s/20s，不等待真实计时 |
| 05 房主治理 | 增量通过 | Luna：room-governance5 + member-presence5 + room-membership5；typecheck通过。审阅后补强双候选加入顺序、旧房主在线返回、拒绝非房主/离线/观众目标、复盘解散拒绝；单文件复跑5/5 |
| 06 零正式成员回收 | 增量通过 | Luna：初始empty5 + membership5 + governance5及typecheck；审阅补上未执行回调时入口拒绝、死亡/复盘保留，最终empty7/7。最后仅新增测试后未重复typecheck，后续类型门禁覆盖；不再以标题声称覆盖 |
| 07a 对局绑定第二屏 | 增量通过 | Luna：screen-grants5 + membership5 + access6及typecheck；补强真实离开、旧设备兑换失败不消费token、媒体撤销spy后单文件5/5。只验证领域层，Socket撤销待08 |
| 07b 复盘回大厅与连续两局 | 增量通过 | Luna：room-rounds1完整链路 + stable-room5 + screen-grants5，11/11及typecheck通过。两次真实night/day结算human胜，首局实际用莱莱可技能；新局ID/技能/聊天/回执/邀请隔离，保留当前成员及连接。尚未验证HTTP/Socket跨局 |
| 08a 明确快照DTO | 基础投影增量通过 | Luna：contract-snapshots8 + knowledge8 + room-rounds1，17/17与typecheck通过。初次修复SeatDTO presence推断。大厅字段、权限、私人窗口、隐藏事件版本、私屏只读及投票计数；新投影的公告前后链、跨局版本与网络授权仍待08b/c，非空提交状态待09 |
| 08b 房间Socket订阅 | 增量通过 | Luna：room-realtime4 + contract-snapshots8 + member-presence5，17/17及typecheck。roomId握手、接管/撤销断开、同连接跨复盘及新局递增版本、隐藏事件不推帧、失效会话原因；复盘状态为传输fixture，不是再次真实玩法验收。HTTP尚未接入 |
| 08c HTTP与维护接入 | 增量通过 | HTTP A 8例；真实公告前夜死者报名/发言/语音许可/投票/当选到公告1例；观战/维护10例；auth5+race1；目录与旧计时器回归12例。最终容器typecheck通过。旧join/watch已无入口；全局当前房间、logout区别、自然7天过期、媒体mock撤销、空房跨房清理均验证。未测外部LiveKit |
| 09a 命令回执与提交状态 | 增量通过 | command-receipts-api3 + receipts6 + v2-api3 + room-rounds1，13/13与typecheck。阻塞队列下pending、同意图并发只执行一次、排队越过截止、跨人查询隔离、私屏请求ID隐藏、当前窗口提交状态和复盘保留。补强随机合法目标/完成后冲突/二次合法提交后单文件3/3 |
| 09b 房间操作幂等 | 增量通过 | Luna：operation-receipts4 + room-operation-api8 + v2-api3 + contract-http-lifecycle3 + v2-spectators-api4，共22例，typecheck通过。并发创建、ready/start重放、离开/解散后回执、旧控制设备不能获取邀请、路由别名均覆盖；语音凭证保持实时。复盘是构造fixture，503 HTTP重试未单独覆盖 |
| 09c 聊天确认及审计关联 | 增量通过 | Luna：chat-receipts-api6 + audit-migration2 + v2-api3 + review2 + room-rounds1，共14例与typecheck。补强review重试/新消息拒绝、复盘ID保留、旧gameId拒绝后单文件6/6及typecheck。实际Socket/HTTP确认一致，临时文件验证旧审计迁移重开；新局使用构造终局，不替代真实玩法验收 |
| 09d 团队面板有效方案 | 增量通过 | Luna：v2-proposal、night-driver、contract-snapshots共33例与typecheck。显示最新草稿和此刻截止候选，区分旧全员确认、最新合法空刀、无提交及二阶段联合池；普通观众无私有方案。不修改实际结算策略 |
| 10–13 | 待实施 | 账号迁移、头像、资料目录与契约验收、候选构建/容量/切换尚未完成 |

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
| 06 / 9319d3d | empty-rooms、room-membership、room-governance；补强后empty-rooms7例复跑 | 5729d3a80d10871d928d18ea313bc2a6f59d4e1f02aa339eab01c29f70937269 / 9e61c52944c855b2b653cac70ff68d20b6b1e4e0904c16e656b40b2e8fefcb6c |
| 07a / f3a23d2 | screen-grants、room-membership、access-v2；审阅补强后screen-grants5例复跑 | 3104edc71c5b6e5c5a60ad3456bd0f2872b1b9a3eb4c3c8e37020374bb4468a0 / c2b30c0158e6e288c1b38bc966f597e3074bcb0018cad914405dcc1c3363a01d |
| 07b / b16849b | room-rounds、stable-room、screen-grants；类型检查亦覆盖06/07a最终测试 | 1f445907707ddc05ef5a32d5e8301058dbeee7124e392b655500ef637b8d40c9 / rounds.ts f19cc52f361c4ac679f731fe0e33f4fc58709ffc9f2562b863390adfcd1dc9f2 |
| 08a / b80567c | contract-snapshots、knowledge、room-rounds | 488e6271eba89f38e84e612c2400caceb05dc4f370629d15c93a82ac403301ae / a69dd827583592c3a14ebee7336bee082f2dd07c7d3ef1b14ef873c9516ef822 |
| 08b / d8fdb55 | room-realtime、contract-snapshots、member-presence；snapshot mock头像变更与窗口数组断言同步补强 | d0d1267994ab3a792eb0ba388a0ce05941cfed2f7d52f2994d4fe1f14759aa19 / cf7510b33757ab5c847e09b4b97b20b9718c3804dcb8191455c42af6fcb660bf |
| 08c / f02c1e6 | v2-api、contract-foundation、contract-http-lifecycle；contract-knowledge-api；v2-spectators-api、v2-maintenance；auth-v2、auth-race；room-membership、empty-rooms 分批执行，未全量 | app.ts bf61075f0962869e351ffa4ff024da393eb5efe764e888fbfc272cc08ba555fc；auth.ts 6febd641499465c891300b73f9bb4d73a829ff5a49c5b46fe2e6adb7c0d8c1f8。最终观战测试8226cc85c7db7f39abe3736f391dadc8990c93845980fe228951d51aa05237e9；维护测试e6365c4a75e90ae6be3a78c840619dc3ee97461e33d4c5a16264f887820b47b5 |

08c维护测试最初迁移删减过多且没有调用实际maintenance，主代理拒绝该证据；另一Luna按真实HTTP/maintenance补齐上述10例后通过。类型检查分别发现回调返回值兼容与两个测试helper的gameId:null断言错误，修正后通过，未弱化行为断言。

3003开发实例现已运行：theater-death-contract-app-1，原生Node24启动成功，/healthz返回contractVersion=2.1/rulesVersion=2.0。Docker inspect确认server/contracts/tests等只读工作树挂载、data-contract-2.1独立读写；账号schema尚为1、头像与catalog等后续功能尚未接入。此健康检查仅证明导入/启动成功。3000/3001保持原镜像，尚未做候选切换。

09a基线db9aa4f，Docker只读源码：receipts.ts SHA256 be1e1c56232fc9aeab0cbb8c7df4b4947a9211a4d60a75fefa416eea8b93c6ae；app.ts b78e8f7fc1665f8171c2a6ec509c99b30c3775606b04d0504fa1007fd5ec7ba6；最终新增测试8ca39ff76e9abf1e520ba3a3bb7dad45192527bd4d449fa48fa7d33fffdb19b4。查询不执行命令；完整内容指纹区别数值/字符串/null并限制异常嵌套，避免错误重放。

09b基线f30952d，使用上述Docker只读挂载入口运行5个指定文件（operation-receipts、room-operation-api、v2-api、contract-http-lifecycle、v2-spectators-api）及typecheck。新测试SHA256分别为e3a058f21e28f00999cc419f89fdbf5ed487b137c0c64181d199758f248abfa9、d212592038cf8f819be68cd6dc0e8f832df032ec64326f208daa8d32221269315。缓存键包含账号、房间及操作内容；429/503准入失败不固定为永久回执，服务端异常回执保留以避免重复执行。

09c基线a907806，指定Docker命令运行上表5文件，随后仅chat-receipts-api复跑。宿主/只读容器源码一致：app.ts 9be1f0a53e78349e8e64498d002fcadf19f16873098d6e39cc9a1dbbcbf4e654；log-store.ts ca60714bd9670558a7d052d1913fda6ae9f52e34c1df2ccfdcd8bfcfcb763cd1；chat-receipts.ts 5431ba032af5d8b7800e3024dd3b43950b577f98b8dd73d65e17bac9d8c1cf85。最终测试hash 67d0a693ed77eb8261cdde5acefecb40c251c95a8855917f8054a8d07a4d3bfe（提交前仅删除一处行末空格）；审计测试8c56fac5bc828d81b7451041e2dc8312943f64c49ba7c60c8e7f88f95f27a51a。

09d基线214b08b，Docker只读工作树运行v2-proposal、night-driver、contract-snapshots与typecheck。测试SHA256依次5f083f93836f76e15f0afe3bf1d0218fc53d52f7c8e9426ece3a5be3e6d2993a、790d4dcd487a1f75c86b7e3f780b5d90222482e3619b0c1e7c91008a728bfea5、0df108d5ab3a2f8a2d7cbf04db164ae74515bdabdf0bdd130b27c5af1da4952b。原精确对象断言仅补新字段，未删旧预期；snapshot测试继续使用strictWindows及实际instanceId。
