# 契约2.1交接

本轮后端对齐计划已完成。正式事实以[验收记录](client-contract-2.1-acceptance.md)和[逐步证据](client-contract-2.1-progress.md)为准，前端从[契约入口](client-contract-2.1.md)开始。

## 可使用的交付

- 本机3001：契约2.1、规则2.0，只提供后端API。候选源码41d18369d4570b17230376ee54335664578027c6，标签v2.1.0-rc.1；部署按manifest list摘要sha256:e22a95b5dd7a67f9640b77202164ac4c3f955c558e2332e82d1b351121ce59f3固定。
- 旧3000网页与镜像保留。3003为工作树开发实例，独立data-contract-2.1和Cookie td_account_contract_21；没有热重载，后续开发须按运行手册重启加载变更。
- OpenAPI35路径/34schema、动作/错误/事件字典、共享DTO、19份完整JSON与独立人工小样例、同源代理/HTTP/Socket/倒计时/头像示例均已交付。
- 67文件431单元/API用例、typecheck、真实关键HTTP链、5分钟100账号/50连接容量通过。P95=242.814ms，事件循环P99=74.187ms，峰值RSS约281MiB，异常/重复/权限泄漏0。
- 新账号schema2和审计schema1在实际3001启动、integrity通过。旧账号/密码/会话迁移、头像处理与回收、持续房间与多局、接管、观战等边界见测试索引，不要将健康检查当作完整玩法证据。
- 正式容量使用固定镜像且无源码挂载。原始负载报告、构建日志与辅助登录/头像结果在test-results-v2/contract-2.1；负载凭证不入库。431用例门禁只在候选构建执行一次，未跑旧UI全量E2E。

## 后续工作边界

下一项工作是根据Client Requirements(v2)实施新前端并联调；本任务没有重做UI、发布公网、验证真实语音容量或增加服务器崩溃后的对局恢复。voice目前关闭，头像等功能按bootstrap实际值显示。旧rc.1线协议没有兼容入口。

前端必须遵守Room/member/Game分离、gameId变化清局内缓存、旧viewVersion丢弃、服务端capabilities/tasks授权、原ID原载荷重试以及control即时清除旧私有视图。不要依据个人死亡真相或前端计时自行决定资格/胜负。完整例子在tests/fixtures/contract-2.1/full-index.json；review-constructed仅是格式样例，真实胜负链测试另有证据。

## 实现入口

- server/v2/stable-room.ts、room-directory.ts：持续房间、局内运行时与单房间成员约束。
- presence/governance/empty-rooms/rounds/screen-grants：在线宽限、房主、空房、复盘和观战生命周期。
- app.ts、room-realtime.ts、snapshots.ts：账号HTTP/roomId Socket、明确授权投影与版本；旧辅助模块仅为内部/旧测试保留，未挂载旧协议。
- receipts.ts、operation-receipts.ts、chat-receipts.ts：命令/管理/聊天回执。proposal.effective与最新草稿不同。
- account-store/auth/avatars/catalog：账号迁移、邀请认证、头像与完整目录。公开资料缓存最多2048条且在头像事务提交后更新；会话与授权仍实时检查。
- deploy/Dockerfile.dependencies复用依赖；Dockerfile.v2是候选全量门禁。功能CI按受影响范围选测试，候选CI仅手动触发，不自动推送/部署。

## 运维接续

Docker实际路径C:/Users/xumat/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe。所有构建/运行/测试在Docker内，源码测试只读挂载；Git/Docker操作可能需require_escalated。Node24.15.0、Sharp0.35.4、Ajv8.20.0；依赖未变不重建。

升级前备份在工作区v2-data-backup-20260919-before-contract-2.1，data/和deployment.env.v2保留旧版；旧3001镜像e44d12c仍可用。回滚需镜像与数据库成对恢复，并先保留升级后新增数据。[运行手册](client-contract-2.1-runbook.md)有启动、邀请码、重置密码和检查路径后的回滚命令。不得拿开发或负载库覆盖正式data-v2。

后续继续使用用户指定的Luna小范围测试流程：主代理定义行为，测试代理只改约定文件，冻结被测源码，审阅真实断言和输出，再本地小分支提交、ff合入backend/client-contract-2.1。已批准权限仍有效；无需重复询问常规可逆实现步骤。当前未推送或合并远端。
