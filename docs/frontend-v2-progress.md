# 新前端实施记录

依据：工作区根目录《前端开发计划.md》。用户于 2026-09-19 授权执行完整计划。基线 83c48dc；本地集成分支 frontend/v2。原 3000/3001/3003 配置与数据不修改，独立联调入口计划为 5173。

## 当前断点

F00/F01 基础已通过定向验证并提交6bab698；F02账户/头像/改密/重置码核心已通过真实双浏览器6例。下一步F03：首页创建/加入、真实房间订阅、大厅与治理。独立前端 http://localhost:5173，API 仅容器网络暴露；专用 data-frontend-v2 与 td_account_frontend_v2。房间/对局尚未接入界面，完整 UI 验收未完成。个人显示偏好放到F08一起实现，仍属待完成范围。

## 里程碑

| 阶段 | 状态 | 证据/边界 |
| --- | --- | --- |
| F00 工程与素材 | 基础通过 | 隔离启动、前端 typecheck/build、同源 bootstrap/auth smoke；登录页桌面/390×844 预览。身份卡/场景原样复制，默认头像为原图 SVG 裁切；身份卡及头像实际视图待后续验收 |
| F01 传输与状态 | 基础通过 | Luna 两文件14例及后端typecheck通过；HTTP/快照纯逻辑已验证，真实Socket/control接入待房间步骤 |
| F02 认证账户 | 核心通过 | 头像单测5例；新版类型检查/构建；Chromium3例+WebKit3例真实账户链通过；个人显示偏好在F08实现，全部异常组合在F09补验 |
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

## F02 验证过程

- 实现账户页、hash账户导航、默认头像、正方形裁剪预览、格式/动画检查、二进制上传与profileVersion保护、修改密码及维护者重置码。新注册响应未知转登录恢复；补充登录成功回首页，避免沿用旧账户页hash。浏览器期望遵循原需求，未为迁就实现降低要求。
- Luna头像几何/动画识别5例及根typecheck通过。新版typecheck首次抓出独立准备的room/session.ts空值访问，主代理修复后typecheck:web:v2与build:web:v2通过。房间session、配置验证与标签目前仅是未接入准备，不能据此标记F03完成。
- 初次账户E2E失败：等待“我的账户”按钮，DOM仍是F00首页。主代理核验宿主/容器app.tsx同SHA，但Vite HTTP模块不含AccountPage/useRoute。停止该轮后将失败artifacts复制到 test-results-frontend-v2/archive/f02-old-vite-cache；Vite配置增加500ms轮询，仅重启web后两个模块标识均正确。旧轮中的少量通过不计新版验收。
- 浏览器基础镜像沿用Playwright1.63.0并固定官方manifest eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27。原E2E镜像没有TypeScript，测试代理的npx tsc误触占位包，已停止且未改项目依赖。新增Dockerfile.frontend-e2e，直接复制现有依赖镜像的TypeScript及@typescript原生平台包；用node调用其bin/tsc，不临时下载编译器。
- 当前浏览器镜像theater-death-frontend-e2e:pw1630-ts，manifest1ab78c7133486c60633bf9a6379c53576b4938c00815109e1a919a469f5976d9。账户E2E只跑specs-v2/01-account.spec.ts，两浏览器，首失败即停。私有测试凭据在命名卷/test-access/accounts.json，seed只允许/app/data-frontend-v2，不打印凭据、不触及旧库。
- 新源码首轮Chromium3例通过；WebKit的Playwright postDataBuffer返回null，无法靠该API观测Blob请求。改为测试期仅对头像PUT的Request副本采集长度、前12字节与类型，原样转发原请求；类型与PNG/JPEG/WebP签名强匹配。保留服务端200、profileVersion递增、认证头像GET的image/webp及RIFF/WEBP头、无效输入不覆盖等断言，没有删除二进制验证。
- 最终Luna依次运行WebKit3/3（9.8秒）、Chromium3/3（7.0秒），每次新seed；直接浏览器TypeScript检查通过。命令：`docker compose -f deploy/compose.frontend.yml --profile dev --profile browser run --rm --no-deps browser node node_modules/typescript/bin/tsc --noEmit -p tsconfig.v2.json`；`... run --rm --no-deps seed`；`... run --rm --no-deps browser npx playwright test --config=playwright.v2.config.ts specs-v2/01-account.spec.ts --project=webkit --max-failures=1`，Chromium同命令替换project。
- 两份独立报告为test-results-frontend-v2/results-webkit.json与results-chromium.json。覆盖真实邀请注册、hash账户页刷新、头像预览取消/裁剪保存、非法SVG/损坏PNG不覆盖、错误旧密码、正确改密后本人及独立旧context都401、新密码重登、维护者token重置、服务端已注册但响应丢失时登录恢复且无重复注册。未跑旧UI或全量E2E。
- 主代理审阅最终测试逻辑和桌面/390×844账户截图；默认头像显示范围正确，账号完整展示、导航长名截断，主操作可达。截图分别account-{chromium,webkit}.png、login-after-change-*.png、login-after-logout-*.png，不包含密码或邀请。
- 本机Git缺少作者设置，提交使用单次 `-c user.name=Codex -c user.email=codex@local.invalid`，不修改全局身份。后续保持本地小分支提交并ff合入frontend/v2，不推送。
