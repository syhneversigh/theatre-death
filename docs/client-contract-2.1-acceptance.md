# 契约2.1候选验收记录

完成日期：2026-09-19（Asia/Shanghai）。API仍为/api/v2，客户端契约2.1，规则2.0。范围是可独立接入的新后端；前端UI、对局崩溃恢复、真实语音容量不在本次交付内。

## 固定版本与部署

| 项目 | 实际值 |
| --- | --- |
| 候选标签 | v2.1.0-rc.1 |
| 镜像源码提交 | 41d18369d4570b17230376ee54335664578027c6 |
| 本地镜像标签 | theater-death-v2:41d18369d4570b17230376ee54335664578027c6 |
| 部署镜像摘要（manifest list） | sha256:e22a95b5dd7a67f9640b77202164ac4c3f955c558e2332e82d1b351121ce59f3 |
| Linux镜像manifest | sha256:953523903b3ace47f8d8c5fe33fe4e21a880decf07ac2a479907eec5c9c40124 |
| Node / schema | Node24.15.0；账号2；审计PRAGMA user_version=1 |
| 运行入口 | http://localhost:3001；theater-death-v2-candidate-app-1 |
| 服务限制 | 2 CPU / 4 GiB，仅挂载data-v2，无源码覆盖 |
| Cookie / 功能 | td_account_v2；头像、自定义实验板、第二屏启用，语音关闭 |

.env.v2中的V2_IMAGE已固定为上述sha256摘要。Docker构建的自动Git来源探测曾有warning，已显式传入VCS_REF并核对revision标签；额外比较81份运行源码、规则书与依赖清单，工作树/镜像的统一换行SHA256均为 `d7b7753f0b885e0b62ebb6aeac3234cb7c91799e9633a28380071ce6ffb3d83c`。验收报告属于构建后的文档提交，候选标签指向镜像源码提交。

旧网页3000保持原镜像 `sha256:d4ef39c208b61fc89e6885cba8cbf35437e06b839cc9aefc63f6cd76b49f7c93`，切换后HTTP仍为200。3003保留隔离开发环境及独立Cookie；它不是发布镜像验收依据。

## 测试门禁

日常按[逐步记录](client-contract-2.1-progress.md)进行Luna指定文件验证。候选构建只执行一次完整单元/API门禁：67个测试文件、431个用例全部通过，typecheck通过，没有运行旧UI全量E2E。

```powershell
docker build -f deploy/Dockerfile.v2 --build-arg VCS_REF=41d18369d4570b17230376ee54335664578027c6 -t theater-death-v2:41d18369d4570b17230376ee54335664578027c6 .
```

选定真实HTTP链覆盖首夜竞选至晨间公告、立即终局与复盘回大厅、新一局、跨设备控制与屏幕撤销；新增contract-release-flow用FakeClock真实推进两昼夜，覆盖非终局放逐天理→遗言→移交，以及继任者夜死→公开公告→普通发言前移交。该链未修改phase/win，普通发言以超时推进。OpenAPI列出35路径/34schema，选定实际响应与19份完整JSON逐份验证；并非穷举每条错误分支。JSON中的constructed review仅验证格式，不能替代真实玩法证据。

## 五分钟文字容量

测试服务使用上述固定镜像，客户端在另一个容器运行，不挂载服务数据库。100个账号、50个持续连接，两桌共26玩家与24公开观众。正式窗口300000ms，实际300000ms。

| 指标 | 结果 | 门槛 |
| --- | --- | --- |
| 普通API样本 | 5918 | 排除登录、诊断、健康检查 |
| API P95 | 242.814ms | <300ms |
| 事件循环P99（30次诊断的最大值） | 74.187ms | <100ms |
| 峰值进程RSS | 294817792 bytes，约281.16MiB | <1000000000 bytes |
| 最小/结束时连接数 | 50 / 50 | 50 |
| 5xx、网络、Socket错误 | 0 | 0 |
| 重复回执/消息、权限或本人视角异常 | 0 | 0 |

正式命令在每个新PowerShell会话设置环境后执行：

```powershell
$env:V2_LOAD_IMAGE = 'theater-death-v2:41d18369d4570b17230376ee54335664578027c6'
$env:CAPACITY_DURATION_MS = '300000'
$env:CAPACITY_RESULT_PATH = '/app/test-results-v2/contract-2.1/capacity-candidate-41d1836.json'
docker compose -f deploy/compose.v2.load.yml --profile load up -d --no-deps load-app
docker compose -f deploy/compose.v2.load.yml --profile load run --rm --no-deps load-client
docker compose -f deploy/compose.v2.load.yml --profile load stop load-app
```

首次5秒接通检查P95=1808.77ms失败。定位到每份快照重复查询公开账号资料后，新增2048项上限的资料缓存，头像事务成功后更新，授权/会话仍实时查库；回归20例与typecheck通过。第二次5秒P95=280.17ms通过，随后才对固定候选进行上述正式验收。两次probe都不是五分钟结果，失败报告保留。

登录与头像另行采样，不混入普通API指标：登录10次、并发2、P95=374.845ms，HTTP全部200；头像10次、并发2、P95=19.850ms，失败0，认证读取验证为256×256 WebP。这是轻量样本，不是二者的满载容量结论。辅助收集脚本曾在完成请求后因输出路径和报告字段名出错；第二批报告数值未改，之后独立严格校验exit0。两位测试账号的头像版本10来自两批成功保存，非正式容量的重复执行。

## 数据和回滚验证

切换前，旧3001的accounts/sessions/invitations及audit rooms/events/messages均0行，且所有旧房间入口要求账号，因此无进行中对局。停止旧3001后复制完整数据及原配置，备份位置：

`D:/myApps/暴风雪剧院/v2-data-backup-20260919-before-contract-2.1`

- data/保存旧账号schema1与旧审计；deployment.env.v2保存旧配置，均未被升级覆盖。
- 新候选在独立副本迁移到账号2/审计1，原表数据保持，integrity与重复打开均通过；真实旧密码/会话保留由有数据的schema1迁移测试证明。
- 冷备份的WAL数据库在只读目录缺少临时锁文件时无法备份，改为复制到可写临时输入目录后验证成功；原备份不变。
- 旧镜像e44d12c读取回滚副本成功，账号schema1/integrity ok；同一旧镜像确实拒绝schema2。回滚需要配套恢复镜像和数据库。

旧3001镜像保留：`theater-death-v2:e44d12cc505f67cada841fc9a2ee7ce70cded0fc`，摘要 `sha256:c08b5617b6e018479f1c50d902d42114561d55483e8cca047db9292ba248e913`。具体启动、维护和安全保留新数据的回滚步骤见[运行手册](client-contract-2.1-runbook.md)。

新3001启动后已验证health契约2.1、9角色/10章目录、头像启用、匿名/me/rooms返回401，账号2/审计1的integrity均ok。健康检查只作为部署检查；玩法和性能结论分别来自上面的测试与正式负载。

原始证据在本工作区test-results-v2/contract-2.1：candidate-build.log、capacity-candidate-41d1836.json、两份probe、auxiliary-candidate-41d1836.json与auxiliary-validation-notes.json。负载凭证fixture保持Git忽略；报告不包含真实凭证。Git只做本地提交和标签，未推送或发布远端。
