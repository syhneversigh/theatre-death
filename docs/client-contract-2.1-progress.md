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
| 10a 账号资料与邀请预检 | 增量通过 | Luna：account-profile6 + account-store5 + auth-v2 5 + auth-race1 + v2-api3，共20例与typecheck。真实schema1文件、已知旧会话和真实密码在schema2仍可用；资料/预检、过期、撤销、单次消费、限流已验证。无头像上传能力，预留存储列与资产表 |
| 10b 客户端约束与规则目录 | 增量通过 | Luna：client-catalog4 + rulesets18 + v2-api3，共25例与typecheck。匿名元数据、实际voice开关、9角色/唯一正式板、完整54条2.0规则、创建5/64人与非法配置边界；不声明64人完整玩法通过。avatars仍为false |
| 11a 头像与契约验证依赖 | 增量通过 | 独立依赖镜像固定Sharp0.35.4/Ajv8.20.0，原包版本未升级。Luna：runtime-dependencies2 + smoke1 + client-catalog4，共7例与typecheck；实际生成/读取WebP、Ajv2020接受/拒绝样例。尚不代表头像业务已完成 |
| 11b 头像处理与存储 | 增量通过 | Luna：avatars5 + account-store5 + runtime-dependencies2，共12例；补强真实动画WebP元数据确认、7天精确边界、过期仍引用保留、文件先存在再改DB、实际并发2后单文件5/5。三格式重编码、EXIF输入去元数据、伪装/过量/非正方拒绝、失败保留及孤儿回收均覆盖 |
| 11c 头像HTTP与资料同步 | 增量通过 | Luna：avatars-api5 + account-profile6 + client-catalog4 + v2-maintenance6，共21例；补鉴权GET后单文件5/5。最终tsc通过，测试请求体改成Node Buffer后再单文件5/5。认证/Origin/大小/三格式、保存后Socket与复盘当前头像、异步撤销及频率均验证；复盘为构造状态，真实语音未涉及 |
| 12a 契约与完整JSON/客户端示例 | 增量通过 | Luna：contract-openapi3 + contract-client-example5；连同CI选择器最终14例及typecheck。OpenAPI收录35路径/34schema，校验选定真实HTTP/Socket响应及19份完整场景JSON，另列人工片段；并非每条路径的全部错误分支。门先生/魂灵按实际角色定位、真实进入白天；复盘明确为构造状态。示例拒绝旧账号/旧房间/旧版本并保留未知结果语义 |
| 12b 增量CI与候选门禁 | 配置及选择器增量通过 | test-selection6例覆盖只列清单、文档/共享helper/依赖映射、去重、未知路径失败；与12a合计14例及tsc通过。功能PR只跑选定范围，手动candidate工作流构建全量单元/API镜像。未推送，未声称GitHub远程工作流已运行 |
| 13a 短接通与性能定位 | 增量修复并复测通过 | 首次5秒P95=1808.77ms失败；有界公开资料缓存减少重复SQL，头像事务成功后更新，授权/会话仍实时校验。缓存/头像/资料20例及tsc、回滚补强4例通过，复测5秒P95=280.17ms。短probe不替代正式容量 |
| 13b 候选发布 | 已交付 | 固定41d1836源码镜像，候选门禁67文件431例及typecheck通过；5分钟100账号/50连接，API P95=242.814ms、事件循环P99=74.187ms、RSS=294817792 bytes，异常/重复/泄漏0。新旧库副本及回滚兼容验证后备份并只切3001，旧3000保持。详见验收记录 |

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

10a基线ae5ce08，新增account-profile测试SHA256 7275d5d34d69b79701c49488c07e28aa7ce97a0787a66938ec1e0c9a17cc6f17。上述5文件在Docker只读工作树运行，未扩大为全量。另一个Luna执行 `docker compose -f deploy/compose.contract.yml run --rm --no-deps -v <repo>/data-v2:/source:ro -v <repo>/data-v2-test:/checks test node scripts/check-contract-migration.mjs /source /checks/migration-contract-2.1-check-1`：账号schema2、审计schema1，integrity均ok、重复打开ok、原表数据不变。实际data-v2的accounts/invitations/sessions与events/messages/rooms均0行，此副本结果不能单独证明旧凭证保留；有数据的凭证保留由前述schema1真实文件测试证明。正式目录与3001尚未迁移。

10b基线5789766，Docker只读源码及docs挂载运行client-catalog、rulesets、v2-api与typecheck。新测试hash 670cd6788bfb70f2a6d0bcbe0bb2cfb72a8112f5317593edab21e2e8d3f14589；全文规则同时入库作为catalog启动输入，原1.1历史文件保留。显式roles请求始终标实验，正式预设请求不发送roles。

11a基线9695be2；实际Node v24.15.0、npm11.12.1。依赖镜像theater-death-contract-deps:sharp0354-ajv820，manifest sha256:ff3d66fe93bf9145f565b8b5bb983b49a4d0ab253fdecd5e88783554b44f3768；原始lock SHA256 201344f3a08498f027dfe149b1cbd3bb4d669a4564910e1b6b58e0c6fd19a02b，容器语义锁hash 98a5e16c65c3bd7dc48c4581de975afd4d602637d643156d802acef8c4770b99。上述3文件通过Docker只读挂载测试，新测试hash 559b8c1025988fab37c97fbb4283cabeadef901628049b390f29b220d8bc1627。未触发候选全量构建或load服务。

11b/11c共用冻结测试基线80eb7f8，拆分存储与HTTP两个提交。存储组运行avatars、account-store、runtime-dependencies，补强后仅avatars复跑；新测试最终SHA256 a8301f07b31815783d552a0c98818b5bdbcf910c0e583ce0972a91f4771040d2。宿主/容器avatars.ts同为6a658068f10850f5b0d8ba4c9efc132ed9dd3aa9e6aafe9c7f8fbec91a05e8c1，account-store.ts同为94533fc603e18214bef846164c44395024d8e7066d6045b2cba38dff6c66e07b。模拟无效存储目录会产生通用清理失败warning，旧引用及文件保持；未包含真实用户图像。

11c HTTP组按上述4文件使用同一Docker只读源码执行；最终avatars-api测试hash 6b51a5bc10c07294359cfa63fff49412c2b9bfa03fd4462ecef4188660ee9d1d。第一次typecheck发现测试使用DOM BodyInit，替换为Node Buffer后全局typecheck及单文件HTTP复跑通过；生产代码未随此修正改变。服务启动的AvatarStore启用后bootstrap.avatars=true；测试注入禁用时为false。

开发实例更新（7aa9abc）：只读确认3003账号0行/schema1后停止，完整备份至data-v2-test/dev-before-profile-2.1，再用新依赖镜像与当前只读源码重建开发容器。原生Node24启动通过；health contract2.1/rules2.0、bootstrap avatars=true/voice=false、catalog9角色10章；开发账号schema2与审计schema1的integrity均ok。此项只证明原生启动和元数据/迁移，不能代替玩法链或正式候选验收。3000、3001保持原镜像。

12基线7aa9abc，最终Docker指定contract-openapi、contract-client-example、test-selection三个文件共14例与typecheck。测试SHA256：contract-openapi 71e24675ef5e5704ac4ff75eef1ac078cc684fcf9e2c926b183d03c0f75da1e7；full-index 59d4b694e47b4990a58565fbd80bc4e6efe84025677018f898cc3faedf5c3d56。最初仅8个人工小对象不能满足完整mock，主代理拒绝收尾；补齐实际响应导出的19场景后再校验通过。源码tests只读挂载，导出写独立临时结果目录，核对后搬入fixtures；无真实凭证。示例mock的typeof fetch类型修正后最终统一tsc通过。

12b选择器源码SHA256 3cc92b4238c4376b77afd50d7e8e0bf4c15d9c45b57943d68eadd976edf9460f，测试ce290920813f0282a21143096f17e8c2b8e2734eb8b05670ec56229ceee90a36。12a提交前仅清除JSON文件末尾多余空行，测试数据未变。原上游main发布工作流保留；本次新增backend-v2-candidate手动工作流不推送/部署镜像，只做候选门禁与身份记录。真正候选构建仍由13执行。

13a基线571ebe2：Luna seed独立data-v2-load/contract-2.1（100账号），load-client在独立容器运行DURATION_MS=5000，保存test-results-v2/contract-2.1/capacity-probe.json，随后停止load-app；2CPU/4GiB已inspect确认。probe普通API P95失败，唯一diagnostics样本来自负载前，不能据此证明负载期P99。主代理用同库隔离探针测100份完整snapshot：每次读SQL资料742.24ms，预载资料且保留相同授权校验68.09ms，仅用于定位。缓存修复测试为account-profile-cache、avatars、avatars-api、account-profile共20例及typecheck；SQLite在UPDATE前abort验证此前asset插入也回滚，单文件复跑4/4。最终cache测试SHA256 feda91d56794a0d49c6674fe849f7032ec833380c639ecaa8e8dc46bc10457d2，account-store源码3c95b030f76bd899406ac9db4e11df47ad80a5c4839b5728c04e91080fa28775。

82e8975后仅再做一次5秒probe：复用原100账号，50连接全程保留，P95=280.17ms，错误/重复/泄漏均0；结果capacity-probe-profile-cache.json，客户端exit0，随后停止load-app。仍是源码挂载短检查，不能代替正式候选5分钟。正式load-app已改为必须传V2_LOAD_IMAGE且只挂数据，load-client独立运行，不读取服务数据库。

发布关键链补充：contract-release-flow单文件1例通过，真实HTTP与假时钟完成首日竞选→晨间→普通发言（超时推进）→非终局放逐天理→遗言→移交→第二夜击杀继任天理→公开晨间死讯→无遗言且普通发言前移交。所有提交回执accepted、gameId稳定、公开HTTP seats和deaths_announced均验证；未直接修改phase/win。最终测试hash 25068ca6751295225b1f5d0444fdedc081b940fa551e9b4181d603b7c598f8b3。

## 最终候选

2026-09-19完成。镜像源码41d18369d4570b17230376ee54335664578027c6，manifest list sha256:e22a95b5dd7a67f9640b77202164ac4c3f955c558e2332e82d1b351121ce59f3，标签v2.1.0-rc.1。全部运行源码/规则书/依赖清单81份统一换行hash与镜像一致d7b7753f0b885e0b62ebb6aeac3234cb7c91799e9633a28380071ce6ffb3d83c。

Luna执行一次Dockerfile.v2候选构建，67文件431例通过；正式5分钟外部客户端5918个普通API样本、50连接全程保留、各错误计数0，服务限制2CPU/4GiB且无源码挂载。登录与头像各10样本独立记录，P95分别374.845ms、19.850ms；辅助collector自身错误已记录，原结果经独立校验exit0，没有把它们计入普通API性能或正式重复统计。真实语音与UI未验收。

旧3001账号、会话、邀请和审计各表0行，符合空局切换条件；停止后完整备份到工作区v2-data-backup-20260919-before-contract-2.1。新镜像迁移副本成功，旧镜像读旧备份副本成功且拒绝新schema2，原备份保持不变。实际3001已按镜像摘要启动，账号2/审计1 integrity均ok，health/catalog/bootstrap/匿名401通过；3000仍原镜像且HTTP200。完整数据与证据说明见[验收记录](client-contract-2.1-acceptance.md)。
