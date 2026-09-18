# 2.1 接续位置（候选验收尚未完成）

实际进度以 [progress](client-contract-2.1-progress.md)、批准范围以 [plan](client-contract-2.1-plan.md) 为准。已完成01–12；13短接通发现并修复资料读取开销，正式候选构建、5分钟容量、回滚和3001切换尚未完成。集成分支目前82e8975，工作分支test/contract-capacity-client。v2.1-profile-checkpoint在7aa9abc。不要把健康检查或短probe当成完整交付。

## 已完成的服务行为

- StableRoom持久roomId/code/冻结config；每局独立gameId/playerId/座位/角色。RoomDirectory管单房间成员、进入/接管/离开/补位，游戏驱动共享稳定房间队列。
- 多连接presence、掉线宽限、房主转移、0正式成员5分钟回收、游戏绑定第二屏、复盘回大厅与连续两局均已增量验证。
- app.ts已挂载2.1 HTTP；Socket用roomId。旧join/watch/gameId握手无入口。旧辅助模块仍被部分旧测试引用，不要为了清理文件误删媒体/授权依赖。
- 明确RoomSnapshot投影、账号+房间viewVersion、当前窗口提交状态、pending/not_seen命令回执、房间操作幂等、聊天去重和持久messageId均完成。每次重读授权能力要重新检查当前控制会话。
- proposal的latest草稿和effective截止候选分开；旧全员确认优先于新的未确认草稿，空刀有版本与完全未提交不同。规则仍2.0，未改变结算算法。
- 账号schema2新增头像引用/版本/资产表，原密码与有效会话保留；register/login/me返回flat profile，邀请码预检不消费。bootstrap/catalog已公开提供真实开关、约束、9角色、唯一正式13人板及完整54条规则。
- avatar业务已分存储3c979e1与HTTP7aa9abc提交：静态三格式输入、Sharp重编码、并发2/等待8、异步提交前再鉴权、先完整文件后DB引用、7天未引用GC、HTTP认证下载和房间资料刷新。开发实例启用，3001旧候选尚未切换。

## 当前未提交/未验收的交付

- docs/openapi-v2.1.json收录35路径/34schema，选定真实HTTP/Socket与19份完整JSON已通过Ajv2020 strict校验，入口tests/fixtures/contract-2.1/full-index.json。人工片段另列，不冒充完整RoomSnapshot。请求额外顶层字段忽略但参与指纹，响应明确投影。没有声称全部错误路径均已用schema测试遍历。
- actions/events/examples/runbook及可执行客户端示例已在2a0331d提交。客户端示例5例与选择器6例、OpenAPI3例及最终tsc通过。gameView过滤了historyFromSeq，不是实际传输泄漏。
- 负载客户端已用只读源码做两次5秒probe，独立100账号/50连接、均无错误/泄漏/重复。首次P95=1808.77ms失败；82e8975有界公开profile cache修复后P95=280.17ms。两份报告分别为capacity-probe.json与capacity-probe-profile-cache.json，保留失败证据；两次均已停止load-app释放3002。
- 正式load-app编排已改为必须V2_LOAD_IMAGE且只挂data-v2-load/contract-2.1，接下来的5分钟必须使用新候选固定镜像。load-client外置、不挂数据库，fixture与报告在test-results-v2/contract-2.1；已seed，不能再对非空库seed或覆盖旧报告。
- CI增量选择与手动候选工作流已在571ebe2提交。原main旧发布流程保留；2.1候选工作流不自动推送/部署。新增release-flow测试及helper映射尚待随负载客户端提交。
- 候选仍必须完成一次完整单元/API镜像门禁、选定真实后端链、5分钟容量（100账号/50连接/2桌26玩家+24观众/2CPU4GB），以及镜像+数据库配套回滚验证。真实外部语音与前端UI不在本次完成范围。
- 最终只切3001：确认无进行中对局、做新备份、按候选镜像升级并检查、保留旧镜像与备份；标签v2.1.0-rc.1，全部Git本地操作不推送。

## Docker与数据事实

- Docker绝对路径C:/Users/xumat/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe；PowerShell PATH加该目录。Docker与Git修改用require_escalated；不要推断沙箱LOCALAPPDATA就是实际用户目录。
- compose.contract继承compose.v2，server/contracts/docs/tests等只读挂载；当前依赖镜像theater-death-contract-deps:sharp0354-ajv820，Node24.15.0/Sharp0.35.4/Ajv8.20.0。依赖锁改变才重建Dockerfile.dependencies；正式候选用Dockerfile.v2执行一次全量门禁。
- 3000保持上游cc3e48e镜像；3001保持旧e44d12c候选，image sha256:c08b5617b6e018479f1c50d902d42114561d55483e8cca047db9292ba248e913。最终切换前重新核实实时状态。
- 3003已备份到data-v2-test/dev-before-profile-2.1并重新创建，原生Node加载7aa9abc源码。开发账号schema2、审计schema1、integrity均ok；bootstrap头像启用、语音关闭，catalog9角色10章。独立data-contract-2.1和Cookie td_account_contract_21，无热重载。不得把开发库覆盖正式data-v2。
- Luna已运行scripts/check-contract-migration.mjs，把只读data-v2在线备份到data-v2-test/migration-contract-2.1-check-1，得到账号schema2/审计schema1、两库integrity ok及幂等重开。正式库当时各表0行，真实旧凭证保留由带数据的schema1测试证明。
- 旧stale socket故障已仅隔离Docker/run及docker-secrets-engine目录并留备份；没有factory reset或删除镜像、虚拟磁盘。

## 测试接续

继续使用http_security_tests与round_cycle_tests（用户指定Luna）。只让测试代理修改约定测试文件，冻结被测源码，指定文件运行；审阅断言后再本地短分支提交并ff合入backend/client-contract-2.1。头像、资料cache和完整mock均已审阅实际断言。最新contract-release-flow 1例通过：真实HTTP两昼夜、非终局放逐天理后遗言移交、继任者夜死后公开公告并在普通发言前移交；普通发言以FakeClock超时推进，不是13次END。新增缓存回归20例与tsc通过，SQLite UPDATE前abort验证真实回滚后仅cache单文件4例补强通过。

Git命令使用safe.directory=D:/myApps/暴风雪剧院/theater-death与user.name=Codex/user.email=codex@localhost。仓库外Issue目录保留入口，最终交付时更新指向新版契约与实际验收记录。
