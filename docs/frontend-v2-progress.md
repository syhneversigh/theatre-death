# 新前端实施记录

依据：工作区根目录《前端开发计划.md》。用户于 2026-09-19 授权执行完整计划。基线 83c48dc；本地集成分支 frontend/v2。原 3000/3001/3003 配置与数据不修改，独立联调入口计划为 5173。

## 当前断点

F00/F01 基础已通过定向验证，F02 认证页面已起步。独立前端 http://localhost:5173，API 仅容器网络暴露；专用 data-frontend-v2 与 td_account_frontend_v2。尚未完成账户编辑、房间、对局或完整 UI 验收。

## 里程碑

| 阶段 | 状态 | 证据/边界 |
| --- | --- | --- |
| F00 工程与素材 | 基础通过 | 隔离启动、前端 typecheck/build、同源 bootstrap/auth smoke；登录页桌面/390×844 预览。身份卡/场景原样复制，默认头像为原图 SVG 裁切；身份卡及头像实际视图待后续验收 |
| F01 传输与状态 | 基础通过 | Luna 两文件14例及后端typecheck通过；HTTP/快照纯逻辑已验证，真实Socket/control接入待房间步骤 |
| F02 认证账户 | 实施中 | 登录/邀请注册/已有重置码页面已接API，无效邀请真实浏览器通过；成功账号链、账户编辑及头像待验证 |
| F03 首页大厅 | 未开始 | |
| F04 对局结构 | 未开始 | |
| F05 全部行动 | 未开始 | |
| F06 信息规则 | 未开始 | |
| F07 观战复盘 | 未开始 | |
| F08 响应式视觉 | 未开始 | |
| F09 新 UI 验收 | 未开始 | 不以旧 UI 或后端测试替代 |
| F10 完整本地交付 | 未开始 | 不切换原服务、不发布公网 |
| V01 实时语音 | 条件项 | 当前后端关闭，真实媒体验收另列 |

所有构建/测试在 Docker 内执行。Luna 只负责约定测试文件；主代理审阅。默认定向验证，未运行项明确记录。

## 2026-09-19：基础检查点

- Docker 起初启动失败。新日志明确为 sailor-ingest.sock 失效；核验 Docker/run 仅4个socket、docker-secrets-engine仅engine.sock，无子目录或数据后，停止已失败的Desktop进程并将两目录分别保留为 `run.before-frontend-20260919-023454`、`docker-secrets-engine.before-frontend-20260919-023454`，再建空目录启动。Engine29.8.0恢复；没有删除镜像、磁盘或账号库。
- 复用 `theater-death-contract-deps:sharp0354-ajv820`，没有安装宿主依赖或升级锁文件。执行 `docker compose -f deploy/compose.frontend.yml --profile dev up -d api web`；API healthy、web仅127.0.0.1:5173。
- Luna执行：`docker compose -f deploy/compose.frontend.yml run --rm --no-deps test node scripts/test-incremental.mjs tests/frontend-v2-snapshot.test.ts tests/frontend-v2-http.test.ts`，2文件14例通过。主代理已逐条审阅测试：真实完整快照fixture、scope/version/ticket、时钟、深拷贝、control/profile和HTTP未知结果；不是仅断言函数存在。
- 同一容器入口分别执行 `npm run typecheck`、`npm run typecheck:web:v2`、`npm run build:web:v2` 均通过；构建输出 `/tmp/web-v2-dist` 在临时容器内，不能作为最终可交付镜像。未跑全量测试或旧UI E2E。
- 测试时源码SHA256：snapshot.ts=`2d56cbbfe1f80d12dd26d24e00263d4c80a61b440fb3a18e442488cb529a71fd`；http.ts=`1eacd216c5b1ac50e60ce77a330ee5ea44f1836f1a6f00f3f0086716ed0576bd`。
- web容器经Vite代理读取 `/api/v2/bootstrap` 返回200、contract2.1/rules2.0、avatars/customBoards/secondScreens/persistentAccounts=true、voice/gameRecovery=false；匿名auth/me返回401。
- 主代理使用IAB检查登录页及390×844手机布局，实际DOM宽390、无页面横向挤压；切到注册，提交隔离无效字符串，页面显示“邀请码无效、已使用或已过期”。未由该检查推断注册成功、头像或房间链已通过。
