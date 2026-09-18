# 契约 2.1 开发与候选维护

完整计划见 [实施计划](client-contract-2.1-plan.md)，真实验收范围见 [进度](client-contract-2.1-progress.md)。本次不部署前端或公网服务。

## 隔离开发

旧网页3000使用固定上游镜像。旧后端候选3001在2.1候选验收完成前保留。开发3003使用独立 `data-contract-2.1` 与 Cookie `td_account_contract_21`；因为浏览器Cookie不按端口隔离，不能改成3001同名Cookie。账号迁移先用3001数据库的SQLite在线备份副本验证；禁止把开发副本覆盖到正式目录。

```powershell
docker compose -f deploy/compose.contract.yml run --rm --no-deps test node scripts/test-incremental.mjs tests/room-membership.test.ts
docker compose -f deploy/compose.contract.yml run --rm --no-deps test npm run typecheck
docker compose -f deploy/compose.contract.yml --profile app up -d app
```

测试使用工作树的只读挂载。只有依赖发生变化才更新依赖镜像；不能用运行中的发布容器测试其内部旧源码来证明当前修改。构建/运行均在Docker中，不在Windows安装npm依赖。候选镜像只挂载数据，源码固定为候选SHA。

开发app使用普通Node启动，没有热重载。每次经过验证的源码更新后，执行 `docker compose -f deploy/compose.contract.yml --profile app restart app` 才会加载新模块；这会结束开发实例的内存对局。一次性测试容器每次都重新读取只读源码，不依赖这个长期开发进程的版本。

## Windows Docker启动问题

本次启动日志确认 `Docker/run/sailor-ingest.sock` 和 `docker-secrets-engine/engine.sock` 失效。停止失败的Desktop/backend进程，核对目录只含运行socket后，将这两个目录改名留存，再重建空目录并启动即可恢复。未使用factory reset，未删除虚拟磁盘或镜像。这个动作只适用于已确认的相同错误，不能把所有Docker启动失败都按此处理。

日志位置：`C:/Users/xumat/AppData/Local/Docker/log/host/com.docker.backend.exe.log`。本机Docker路径：`C:/Users/xumat/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe`。如果代理沙箱账号的LOCALAPPDATA不同，应使用实际安装路径。启动时使用隐藏窗口，界面需要用户操作时另行说明。

## 切换与回滚约束

切换只发生在确认无进行中对局之后。先保存当前部署镜像SHA/摘要，对 `data-v2` 做新的完整备份；数据库在线备份必须使用SQLite备份API，或先停该服务再复制整个目录（包括WAL/SHM）。迁移仅增加列/表，不迁移旧匿名Cookie为账号。有效账号会话保持，内存房间不恢复。

2.1候选切到3001时使用正常Cookie `td_account_v2`。回滚同时恢复旧镜像与对应备份数据库；旧AccountStore会拒绝高于其认识范围的schema，不能只回滚代码。保留3000服务供旧网页使用；最终前端入口切换是后续任务。

候选镜像、标签、schema、备份路径与实际命令在发布步骤完成后记录到进度/验收文档。没有这些证据时，本手册中的发布流程不等于已经部署完成。

审计库新迁移使用 `PRAGMA user_version=1`，新增聊天消息和客户端关联ID列；历史消息列值为空，原记录保持。账号库有独立的 `schema_migrations` 版本表，两者的版本号不能混用。回滚的备份必须来自切换前同一时间段，不能拿早期开发副本替代。

## 头像依赖依据（供步骤11实现核对）

2026-09-18核对Sharp官方版本记录，当前选择固定版本0.35.4；它支持本项目Node24运行时。安装和锁文件更新在Linux Docker中执行，避免把Windows平台二进制写进运行依赖。依赖镜像单独更新，不触发发布全量门禁。[版本记录](https://sharp.pixelplumbing.com/changelog/v0.35.4/) · [安装条件](https://sharp.pixelplumbing.com/install/)

准备记录：隔离目录生成Sharp0.35.4/Ajv8.20.0锁文件并完成依赖层构建；214个原锁条目中已有包版本变化为0，新锁共249条目。测试及开发实例已切换到 `theater-death-contract-deps:sharp0354-ajv820`，manifest `sha256:ff3d66fe93bf9145f565b8b5bb983b49a4d0ab253fdecd5e88783554b44f3768`。业务验证范围以progress为准，依赖安装成功本身不是头像或契约验收。

依赖层切换使用仓库的 `deploy/Dockerfile.dependencies` 与现有锁文件；`docker compose -f deploy/compose.contract.yml build test` 仅构建依赖，不执行候选全量门禁。候选才使用 `deploy/Dockerfile.v2`。增量入口会检查容器内锁文件和只读工作树锁的语义一致性，不能把改过的package挂到旧依赖镜像后忽略检查。

采用输入像素上限和严格无效数据处理，图片任务另设并发上限。Sharp的concurrency控制每张图片的处理线程，不等同于请求并发限制。metadata中的pages可识别WebP多帧；PNG动画还需检查APNG控制块，不能假设pages覆盖所有格式。[构造参数](https://sharp.pixelplumbing.com/api-constructor/) · [输入元数据](https://sharp.pixelplumbing.com/api-input/) · [线程控制](https://sharp.pixelplumbing.com/api-utility/)

输出重编码为256×256 WebP，不调用keepMetadata/withMetadata；Sharp默认移除元数据。验证仍须覆盖伪装格式、过量像素、动画以及写入失败后旧引用保留。[输出元数据策略](https://sharp.pixelplumbing.com/api-output/#keepmetadata)

契约验证采用Ajv的2020-12导出校验OpenAPI3.1中的JSON Schema及实际响应样例；不能把草稿07验证器直接当成2020-12验证器。[Ajv版本支持](https://ajv.js.org/json-schema)

动画输入在解码前检查PNG的acTL/fcTL/fdAT和WebP的ANIM/ANMF/VP8X动画标志，同时由解码器验证格式和页数。块长度也必须有效；不能只检查扩展名或HTTP Content-Type。[PNG第三版规范](https://www.w3.org/TR/png-3/) · [WebP容器规范](https://developers.google.com/speed/webp/docs/riff_container)
