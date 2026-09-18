# 2.1 接续位置（实现尚未完成）

当前领域层与独立Socket已增量验证，本地集成分支到 `7a4aff0`。当前短分支 `feat/contract-http`，尚未改HTTP主入口。检查点 `v2.1-rooms-checkpoint` 在 `b80567c`，不代表完整候选。全部决定、范围与最终门禁见 plan/progress/verification，不能把部分测试当成2.1交付完成。

## 下一项：08c HTTP与维护接入

- `server/v2/app.ts` 仍使用旧单局RoomAccess/API；除了可注入cookieName，尚未使用下面的新模块。`index.ts`同样仍启动原createV2App。必须替换接入，不能保留可绕过新授权的旧join/watch入口。
- `StableRoom` 持续roomId/code/冻结ruleset，members按userId，participants为当前局冻结席位；startMatch创建独立Room运行时，queueOwner让旧引擎计时器共享稳定房间队列。matchStartedAt/matchEndedAt用于当前局时长。
- `RoomDirectory` 的成员写操作统一目录队列→房间队列；enter/create/promote/leave/显式takeover。requestId幂等尚未接入（09）；不要把内部ActiveMember或StableRoom直接序列化，里面含session/epoch/数据库依赖，必须投影明确DTO。
- `RoomGovernance` 管房主继任/转移/kick/dissolve。`changed(room,event)` 调 reconcile，presence的实际断线event才触发房主掉线接任，避免HTTP建房到首次Socket间隙误判。创建者初始房主；随后断线/过期/离开转最早在线正式成员。
- `EmptyRooms.observe` 在成员变化后运行，beforeMutation调用expireIfDue，removed调用清理。旧maintenance的2小时/24小时规则必须删除替换；正式成员离线仍保留。空房到期进行中audit为aborted。
- `ScreenGrants` 游戏绑定邀请/原子兑换/撤销；普通观众可升级，原局玩家（即使离开）不能借屏。撤销降公开并发screen_revoked，旧Socket断开。`RoomRounds.endReview`清runtime/access/participants/receipts/准备，私屏降公开，成员与连接保留。
- `RoomSnapshots` 依赖directory、profile(userId)、可选submissions provider。已明确DTO、按账号+roomId版本、公开票数及只读投影。profile目前需要接真实AccountStore；schema1可先查询username+null头像/0版本，10再迁移。submissions默认空，09必须补真实状态。
- `createRoomRealtime`（room-realtime.ts）以roomId握手，attachV2(server)、refresh(roomId)、control(room,sessionId|null,reason)、connectionCount、close。每帧重验会话/成员；已真实Socket测试跨局，不是旧realtime.ts以gameId握手的hub。旧ResolvedViewer/gameView仍供单局授权/媒体复用，不应暴露旧线协议。
- 游戏broadcaster收到gameId后查对应StableRoom，及时recordCompletion、刷新roomId快照、media.sync当前RoomAccess。结束复盘close旧媒体房，不清除RoomSnapshots账号房间版本；仅房间移除forget(roomId)。
- authRouter的onRevoked现在只有userId，需要携带注销sessionId/原因并可await：控制设备logout立即leave，其他设备logout不影响当前成员；改密/重置/过期只releaseControl+离线，不删除formal。别用旧RoomAccess.expireSessions把持续私屏授权/成员身份意外删除。
- 局内写操作检查gameId；房间操作带requestId。新增enter/promote/transfer-host/dissolve/end-review。所有显示名用账号名，不再要求nickname。新预设ID建议按草案用default-13；它与rulesetId=theater-death不同。只支持默认正式13，提供roles强制experimental，playerCount若有须等于总数。
- 返回review时加实际startedAt/endedAt/durationMs及当前头像，角色/座位保留对局快照。
- 还须覆盖新投影实际死亡公告前后链及HTTP→Socket→语音授权。旧v2-api/spectators/maintenance测试按批准的新语义迁移，保留身份、截止、幂等和信息隔离断言；不要只删除失败旧用例。

边界待核查：观众当前所在房间已超过emptyDeadline、timer尚未执行时，去创建/进入另一房间不应一直被已过期current绑定阻挡。当前beforeMutation只处理目标房间；集成时以固定锁顺序检查/清理过期旧房间，增加复现测试。

## 09–13仍需完成

09 房间写操作幂等、命令pending/not_seen回执查询、私有提交状态、聊天clientMessageId稳定确认及载荷冲突；10 additive schema迁移保留账号/密码/有效session，auth/me资料、邀请码预检、bootstrap/catalog；11 Sharp真实头像上传/规范化/授权下载/7天未引用回收；12完整OpenAPI/DTO/实际JSON fixtures及文档核对、CI增量映射；13候选全量单元/API门禁、5分钟100账号50连接2CPU4GB容量、迁移副本和回滚验证、无进行中对局时备份后切换3001，标签v2.1.0-rc.1。具体指标与禁止范围以plan为准。

`docs/openapi-v2.1.json` 为未验证草案（34路径/34schema），先前仅从已知DTO和计划整理；必须与最终HTTP结果核对，补事件payload目录、webhook文档和真实示例验证。voice凭证实际只有url/token/roomName。`docs/rules-v2-full.md` 是54条规则合并文本，尚未接catalog；仍需校对、去新文件多余行尾空白并提交。当前未提交文档还包括actions/runbook/examples。`.dockerignore`有排除data-contract-2.1的未提交修改，须随环境文件纳入提交。

## 运行与工具事实

- 本轮Docker启动又遇stale socket；已只隔离 `C:/Users/xumat/AppData/Local/Docker/run` 与仅含engine.sock的docker-secrets-engine，保留quarantine备份。未factory reset或删除镜像/磁盘。3000/3001已恢复，健康检查均ok。
- Docker绝对路径 `C:/Users/xumat/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe`，PowerShell PATH加同目录，Docker/Git修改需require_escalated。不要由sandbox的LOCALAPPDATA推真实Docker路径。
- 所有测试在 `docker compose -f deploy/compose.contract.yml run --rm --no-deps test ...`，继承compose.v2.yml源码只读挂载，依赖仍旧cc3e48e镜像；Sharp尚未引入，后续锁文件变化必须单独刷新依赖镜像。
- 3003尚未启动。独立data-contract-2.1已用Node SQLite backup()从只读data-v2复制accounts.sqlite/audit.sqlite，两库integrity_check=ok。源库未改。迁移验证先用此副本，不可拿开发数据覆盖正式库。
- 旧3000镜像cc3e48e；3001仍为e44d12c候选，镜像sha256:c08b5617b6e018479f1c50d902d42114561d55483e8cca047db9292ba248e913。最终部署前重新确认实时状态/无进行中对局。
- Git不推送。命令加safe.directory=D:/myApps/暴风雪剧院/theater-death与user.name=Codex/user.email=codex@localhost；独立小分支测试后ff合入backend/client-contract-2.1。
- 用户授权用一次banked reset只在用量耗尽时。本轮尚未使用；最后查看周窗口使用84%、2个reset可用。只能按授权使用一个，重试同idempotencyKey。
- 测试代理：contract_foundation_tests（Luna medium）、round_cycle_tests（Luna high），均已完成，没有活动测试进程。测试报告曾有“标题即覆盖”的问题，已逐步补强；审阅真实断言，不依赖报告措辞。
