# 新前端实施记录

依据：工作区根目录《前端开发计划.md》。用户于 2026-09-19 授权执行完整计划。基线 83c48dc；本地集成分支 frontend/v2。原 3000/3001/3003 配置与数据不修改，独立联调入口计划为 5173。

## 当前交付状态

2026-09-19文字版完整前后端本地交付验收通过，F00～F10完成，集成分支frontend/v2。其后用户批准增加独立账户与邀请码管理系统，当前在frontend/admin-console收口：数据库schema v3、独立管理员认证、账户改名/头像/会话/停用启用、邀请码全生命周期、`/admin`页面及独立Compose已实现；定向单元/API 6文件34例和15-admin双浏览器各3例通过，最终完整镜像门禁及5174替换尚待执行。原文字版交付证据仍见frontend-v2-release.json；真实语音、公网部署和正式数据脱敏/迁移仍不在本次范围。

## 2026-09-19：账户与邀请码管理扩展

- 管理员密码仅从环境读取，16～256字符且拒绝示例占位值；独立两小时内存会话、HttpOnly/Strict Cookie、Origin校验及IP限流。管理员Cookie名可配置，5174使用`td_admin_frontend_local`，避免localhost不同端口相互覆盖。
- 账户库从schema2迁移到3：新增disabled_at、邀请created_at/revoked_at及不含秘密的admin_actions。旧账号、会话、头像和邀请迁移测试通过；token/password/session原文或哈希均不进入管理DTO。
- “移除”实现为停用并可恢复。大厅成员释放并按既有在线规则继任；playing/review保留offline席位。改名在活跃对局拒绝，清头像沿用延迟回收，注销会话和停用立即撤销旧设备授权。
- 注册邀请支持5分钟至30天、自定义/编辑到期、撤销、重新生成；重置码绑定账号且默认30分钟。原文仅创建响应/弹窗显示一次，未知响应用相同requestId/body重放。
- 定向后端最终6文件34例通过；15-admin Chromium3/3（5.0秒）、WebKit3/3（10.5秒），唯一报告results-admin-{chromium,webkit}-final.json。测试发现并修复含下划线账号搜索的SQL转义缺陷；旧失败报告保留。
- 浏览器验收使用独立named volumes和固定测试密码，项目已停止且不接触5174卷。管理页面视觉截图复验进行中；完整候选镜像门禁尚未执行，不能用上述增量结果替代最终产物验收。

## 里程碑

| 阶段 | 状态 | 证据/边界 |
| --- | --- | --- |
| F00 工程与素材 | 通过 | 14张PNG与原文件/ZIP条目哈希一致，实际产物资源200；桌面/手机截图核验，来源见frontend-v2-assets.md |
| F01 传输与状态 | 通过 | HTTP/快照/回执单测、真实Socket/control、20秒deadline、10恢复和12重连验证 |
| F02 认证账户 | 通过 | 01账户链、14无效邀请/双击/头像失败恢复、08偏好、13实际镜像注册/头像 |
| F03 首页大厅 | 通过 | 02房间双浏览器、配置/权限模型、12自动继任/空置/补位/回收 |
| F04 对局结构 | 通过 | 5/13/26/64布局边界、身份/信息弹层、实际5人和13人场景及固定行动栏 |
| F05 全部行动 | 通过 | 18意图组件、04重复目标、09查验及11特殊局17类实际命令，10未知结果恢复 |
| F06 信息规则 | 通过 | tracker8例、05双浏览器各4例、06真实聊天、滚动/草稿/IME与规则回查 |
| F07 观战复盘 | 通过 | 06真实第二屏授权、07复盘/管理导航、09真实13人终局/原大厅/第二局开始 |
| F08 响应式视觉 | 检查点通过 | 9ff55a8；08双浏览器各5例、行动回归各3例，证据见验收台账 |
| F09 新 UI 验收 | 通过 | 09正式13人首局/第二局启动；10/11/12/14双浏览器、07管理导航通过；实际18命令覆盖，边界见验收台账 |
| F10 完整本地交付 | 通过 | 79文件504测试、类型检查、生产构建及13实际镜像双浏览器通过；5174健康，交接与清单齐全 |
| V01 实时语音 | 条件项 | 当前后端关闭，真实媒体验收另列 |

所有构建/测试在 Docker 内执行。Luna 只负责约定测试文件；主代理审阅。默认定向验证，未运行项明确记录。

以下为实施历史，保留失败及修复过程；其中当时的待验事项，以本页当前表格和最终验收台账为准。

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

## F03 实现与核心验收

- 新建AuthenticatedShell持有房间Socket，导航到账户/首页不等同离开。登录前直接访问房间hash会保留目标；恢复、进入和接管分开。me/rooms异步响应带本地序号，终端control清理后不接受早先请求回填。
- 创建页按catalog展示唯一正式板与自定义实验板；提交正式板不发roles，自定义明确人数/角色合计及约束。进入页区分房间码与邀请，接管需显式确认。大厅按capabilities控制准备、开局、转移、踢人、补位、离开/解散，提供冻结规则与完整章节入口。
- 房间写操作保存原requestId及完整载荷，未知结果不显示失败或自动重发；管理弹层的目标和权限在确认时重查。空房倒计时使用服务端emptyDeadline，不以连接数或死亡数推断。
- Luna只新增tests/frontend-v2-room-model.test.ts，指定增量9/9及根typecheck通过。主代理已阅读断言：实际完整fixture，非法配置、memberId/权限、自我保护、公开夜间标题不依赖私有窗口、白天标签和倒计时。不能据此推断真实UI治理已通过。
- F03 E2E范围：新02-rooms.spec及必要helper，Chromium/WebKit；默认正式板与治理、实验5人满员观战/显式补位/离线可开局、创建响应丢失同ID重试及跨设备接管。seed扩充每个project七个独立房间账号，仅写专用测试库。仍禁止用构造phase/win当完整玩法证据。
- F03首轮E2E在“创建房间”入口停止：宿主与容器app.tsx/config均同SHA，但Vite HTTP仍返回旧Home、不含AuthenticatedShell；500ms轮询并未根治当前Docker Desktop下的缓存问题。旧证据归档archive/f03-old-vite-cache。改为冻结源码检查点先显式restart web（不重启API），待端口就绪再核对实际HTTP模块；开发过程不可仅靠页面刷新推断代码已加载。最终交付以独立静态构建验证，不依赖热更新。
- 实际执行：typecheck:web:v2、build:web:v2、browser直接TypeScript检查通过；指定02-rooms.spec Chromium3/3（26.6秒）、WebKit3/3（32.6秒）。随后相关01-account双浏览器6/6（16.3秒）。主代理读取JSON统计均unexpected/skipped/flaky=0并审阅测试与真实大厅截图。
- 房间证据固定在test-results-frontend-v2/results-f03-rooms-chromium.json、results-f03-rooms-webkit.json；账户回归固定在results-f03-account-regression.json。早期泛名results-chromium/results-webkit会被后续运行复用，不能作为历史不可变证据；以后每阶段保存唯一命名报告。
- 真实场景包含：正式13人请求不含roles、规则只读、准备/取消/刷新、切账户后服务端仍在线、转移房主、踢人重入新memberId、解散后码失效；实验5人满员观战、主动promote未准备、被踢重入观众、关页后轮询服务端真实offline再开局、固定gameId、开局后踢人边界、明确leave；首次创建已执行但响应丢失，用相同UUID和完整载荷恢复且仅新增一个当前房间，显式接管后旧端清界面/准备状态保留。me/rooms允许包含此前已离开的可恢复旧局，测试按新增roomId而非列表总长度判断。
- 此步没有验证整局行动、投票、聊天、私人第二屏、真实5分钟空房回收或完整自动继任链。切账户测试证据为返回后服务端在线，不将它夸大为对每一网络帧的无断开证明。

## F04/F05 实施断点

- 最新检查点：模型/tracker16例通过；真实五人夜间守护与同目标多刀两浏览器各1例通过。席位裁切已修复，03组件两浏览器各3例、02房间回归两浏览器各3例通过。详细范围及固定报告名见frontend-v2-acceptance.md的F04/F05记录；不等同18类真实行动或完整13人两局验收。

- actions/model.ts按当前tasks/capabilities生成18类意图，目标/重复次数/forbiddenPairs与最新方案revision校验；commands.ts只按原意图重试，query不发送命令，授权/局/视角变更后丢弃迟到结果。Luna首次2文件13例及根typecheck通过；随后新增reconcile，用同scope submissionState确认已执行意图，避免快照已成功但HTTP响应丢失仍显示未知，新增竞态断言正在补验。
- GameScene以room/game/member/kind/subject作为重挂载边界。舞台使用公开seats，不按private.self.life禁行动；目标点击与详情分开，重复目标可加减，稿件按windowInstanceId隔离。当前草稿、服务端已确认状态与团队effective分别显示。
- 桌面13人以内环形，小屏/大人数网格；手机固定行动摘要与确认入口。各查看弹层保留当前任务/计时及返回行动入口。管理暂复用真实Lobby治理视图，不暂停计时。
- 侧栏当前只有授权公屏/阵营记录、个人事件、公共事件和章节阅读；尚无文字发送、关键词搜索或完善的滚动未读机制，不能标为F06完成。F07还需补私人第二屏的只读当前提交状态及邀请/兑换/撤销完整入口。
- 开发专用game-test.html仅用于加载tests/frontend-v2-game-harness.tsx；不作为Vite生产构建入口。fixture UI测试只证明呈现/请求结构/状态机，不能替代后续真实13人两局链；最终镜像须验证该测试入口不被打包或提供。
- 当前待核对：HUD增加明确的一/二阶段标识；F09异常收口补请求长时间无响应的超时边界，不把timeout当业务失败；最终建立完整同源构建而非交付Vite服务。
- 审阅后已补HUD第1/2阶段、授权目标生成的发言顺序预览；团队最新草稿/确认名单/effective统一放在行动面板，防止编辑时看不到截止候选。confirm revision补安全正整数校验。已重新冻结等待UI验证，不能将此前13例结果直接称为新版本全部通过。
- 独立检查发现web服务继承test的NODE_ENV=test；本地Vite resolveConfig显示isProduction=false。F10必须明确区分web开发环境与正式build的NODE_ENV，检查生产产物不含开发入口。此前build通过只证明可编译，不证明生产构建配置正确；尚未修改该配置以免扰动当前冻结测试。

## F06 当前断点

- chat/model.ts集中约束500 UTF-16长度（接口固定上限，bootstrap/catalog尚不暴露该字段）、capability权限、按本sender/clientMessageId对账、按messageId去重和独立channel cursor排序。未知结果保留原始载荷/ID，5xx及429不冒充业务拒绝；授权scope变化后忽略迟到结果。
- 公屏/阵营区域分别接入ChatChannelView，保留草稿与失败原文、IME候选确认不发送、历史本地分段与手动回到最新。此实现尚待浏览器验证，不能据类型检查推断滚动/未读/IME全部通过。当前sidebar事件流未读与分段回查仍需完善。
- 完整规则支持纯客户端关键词搜索、稳定chapter ID选择及当前角色/阶段入口；规则来源仍是catalog Markdown。产品代码typecheck:web:v2在Docker通过，Luna正在编写chat tracker增量测试。下一步审阅测试结果，冻结源码、重启web验证新模块后进行F06专项浏览器场景及真实聊天验证。
- Luna首轮chat tracker8例与根typecheck通过。主代理审阅发现HTTP错sender已有覆盖，但快照同clientMessageId不同sender/channel尚缺，已要求补测，另补500/502与UnknownResult；不可把首轮8例描述成全部隔离边界已验证。查看规则/身份弹层时聊天暂停自动滚动与已读更新。F06尚未提交，也尚未重启开发web加载这一轮模块。
- 补强后chat tracker仍8例（原场景增加断言）及根typecheck通过；已检查错误sender/channel快照不得确认。事件流新增独立EventHistory：各流cursor排序/去重、60条初始分段、未读/滚动保持。聊天改为固定已加载起点，避免新增消息挤掉正在阅读的最早一条。F06产品依赖已冻结，Luna正在新增05-information专项双浏览器测试，尚无通过结论。
- 并行准备的features/spectator/{panel,actions}.tsx与features/review/{model,page}.tsx尚未被主界面import，不是F07已完成功能。第二屏生成/兑换/撤销、只读授权窗口/提交状态；复盘独立GET及scope/gameId迟到保护、身份/完整时间线/全部交流/结束返回均已有独立组件，全部通过typecheck:web:v2，仍待接入和F07真实验收。F06测试期间不接入这些模块，避免改变被测版本。
- 05-information首轮测试误用夜间禁写fixture填草稿，第二轮票型fixture错误替换完整历史；主代理已指出并要求修正测试数据，未据此修改产品。后续要求仍包括消息去重、事件60条分段回查、规则弹层焦点保持及切标签草稿/位置，只有最终实际断言和固定报告才能证明覆盖；当前未记录F06浏览器通过。

## F07 当前断点

- F06终轮实际证据见acceptance：05 Chromium4/4、WebKit4/4，8个tracker测试通过。已本地提交4c88eec并ff集成。当前F07分支已import ReviewPage、SecondScreenPanel、ObservedActions，类型检查通过，尚无F07验收结论。
- GameScene进入房间管理时保留舞台/聊天组件挂载，保留草稿与未决发送；隐藏期间不记已读，也不更新保存的滚动位置。此项已要求05相关回归增加非零scrollTop验证。
- 第二屏token只在内存，弹层关闭不丢未决requestId；玩家邀请/撤销和公开观众兑换按scope隔离。复盘API独立读取并校验gameId/scope，失败仍显示结局概览；时间线依服务端数组顺序，补充仅复盘可见的攻击/牺牲/救援/死亡确认呈现，不泄漏到对局事件。
- Luna当前任务：06-chat-screen-real真实6人实验局（door/researcher/civilian/death各1，spirit2）和第7公开观众，真实阵营/日间公屏收发、第二屏兑换/撤销，固定夜间自然推进，不改phase/win；两浏览器专项和05回归。需要先等待当前任务结果再改被测源码；失败立即报告。完整复盘慢响应/结束返回与正式13人两局尚待独立测试。
- F08准备文件state/preferences.ts、account/display-settings.tsx、game/death-notice.tsx均未import：非敏感显示偏好、本地保存、系统减少动画、仅新增公开死亡事件短提示并在重连建立新基线。已typecheck通过，尚未接入样式或验收，不能称实际设置已可用。
- 当前已核对06真实WebKit报告results-f07-chat-screen-real-webkit.json：2/2、115.0秒、projectName为webkit。覆盖六人实验局的阵营消息、私人第二屏兑换/撤销及自然转日公屏；此前一轮失败是cleanup未关闭第二屏dialog，测试helper已补关闭动作。Chromium固定报告和05管理视图相关回归尚待Luna确认，不提前宣称全通过。
- 已允许Luna在06等待固定窗口时准备07-review.spec.ts及仅按room.phase选择生产组件的测试harness；真实06结束前不restart web。07将验证独立复盘GET/慢响应/失败/跨scope/结束意图，夹具仍不能当作完整13人真实两局。
- F08准备进一步拆出DOM无关preferences-model.ts及presentation/death-events.ts，便于针对非敏感配置过滤和仅公开死讯选择编写增量单测；新styles/preferences.css尚未import，包含实际缩放、减少动画与非阻塞死亡提示样式，当前页面不受影响。
- 06两浏览器固定报告现已齐全且主代理核对各2/2（Chromium105.8秒/WebKit115.0秒），真实聊天/第二屏范围见acceptance。05管理回归各1例原断言仅返回后非零，已改为abs(after-before)<=1，等待07稳定后精准重跑。07由独立Luna代理frontend_review_tests负责spec、helpers-v2/game.ts及harness；不能与其同时改这些文件/重启web。
- F08纯模型tests/frontend-v2-display-model.test.ts五例与根typecheck通过，覆盖偏好字段过滤及仅公开死讯。keyboard-viewport.ts与preferences.css也已准备但未import；浏览器视觉、缩放、动效、软键盘等仍待接入验收。
- F09预期红测tests/frontend-v2-http-deadline.test.ts已准备：4例中2通过2失败，确认现有http.ts对fetch和JSON体均无20秒截止；未改产品以保持F07冻结。F09必须实现整体截止并保留UnknownResult/外部取消语义，另将commands/useIntent的5xx分类统一为未知可查/原ID恢复。最终门禁前必须使这两例转绿，不可把当前全套单测视作已通过。
- F10准备server/v2/frontend-app.ts尚未接入index.ts；仅包装构建index及/assets，同源API原路径透传，不提供源码/开发测试入口。根typecheck通过，Luna frontend_foundation_tests正在独立静态HTTP测试；尚无最终镜像构建或服务切换。

## F08 当前断点

- App/harness根层应用显示偏好和软键盘hook；账户及对局导航提供真实设置，允许90/100/110缩放、系统/减少/标准动画和死亡提示开关。偏好只保存3个非敏感字段。公开死亡短提示首快照/重连不重播，关闭/减少动画仍保留记录；新增死亡使用独立effectKey重启动画。
- 规则章节去掉重复首标题、增加返回栈；对局和复盘tab支持左右/Home/End及roving tabIndex。规则游戏context sticky顶部不裁切。32字符账号允许换行，移动端键盘时整块chat composer避让固定行动条。
- 08第一次Chromium发现关闭玩家信息后焦点未恢复。修复Modal记住原焦点并在仍可用且没有新弹层时恢复；Stage详情/只读席位按钮显式focus以兼容Safari。修复后前三场景通过，随后390×500等效键盘视口发现发送按钮比行动条顶部低12.77px。已把滚动目标从textarea改为整个composer并添加其scroll-margin，Luna正在复验，不能提前称键盘验收通过。失败报告均要求归档保留。
- 当前F08产品源码冻结，frontend_review_tests拥有08/harness。frontend_foundation_tests正在准备F09隔离假时钟完整链：专用Compose项目/命名卷、仅Unix socket推进时间、真实V2 API/Socket、不直接赋值phase/win；禁止启动直至主代理审阅。初稿Compose继承web带宿主端口，已要求改为继承test服务并检查最终config；09初稿只有skip提纲，已要求实现可审阅的真实驱动循环，不能当作测试已完成。
- F09还需收口：HTTP整体20秒deadline红测转绿、5xx未知分类、目标约束变化后清理非法草稿，以及跨首页/账户导航的局内草稿/未决请求生命周期（当前管理视图已保留，路由导航仍待完善）。最终F10须强制前端生产构建模式；本地HTTP候选API可以development模式配合production前端产物，不能放宽现有production API的HTTPS要求。
- F08最终08两浏览器各5/5通过，03相关行动回归各3/3通过，typecheck/build通过；具体固定报告/修复前归档见acceptance。宽屏固定行动区已按UX-01补齐，桌面与手机均固定任务/目标/回执反馈和唯一可见确认入口，不再要求滚到页面底部才能确认。当前F08功能可形成检查点，后续保持F09/F10未完状态。
