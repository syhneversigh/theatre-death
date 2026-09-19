# 新版前端验收台账

状态：进行中；不是最终验收通过报告。依据工作区《前端开发计划.md》及前端需求 AC-01～AC-23。API /api/v2、contract2.1、rules2.0。所有账号、数据库、头像均为独立 frontend 联调环境；不使用真实用户数据。

## 已完成的基础验证

- 快照/HTTP 传输：Luna 2文件14例通过；覆盖scope/version/ticket、时钟、深拷贝、control分流、头像资料版本及网络未知结果。不能据此推断真实房间Socket链通过。
- 头像几何/动画源识别：Luna 1文件5例通过；不能据此推断浏览器上传通过。
- 基础与账户当前源码的新版typecheck/build通过；宿主/容器app.tsx曾核验SHA一致。新E2E首次却读到Vite旧转换缓存，该轮结果作废为新版证据，详见进度记录。
- IAB登录页桌面与390×844显示检查、真实无效邀请码反馈通过。没有将单个页面检查当作整套响应式验收。

## 业务验收状态

| 项目 | 当前状态 | 待补证据 |
| --- | --- | --- |
| AC-01～03 认证/账号/头像 | 规定主要及异常流程通过 | 01真实账户双浏览器各3例，14补无效邀请/双击/头像503恢复双浏览器各2例；故障注入边界见下文 |
| AC-04～11 房间与大厅 | 通过 | 02双浏览器核心房间流程；12补房主宽限继任、旧权限、空置/补位取消空置及5分钟回收 |
| AC-12～14 席位与行动 | 布局、18行动及恢复通过 | 5/13/26/64布局、18意图/回执夹具；04真实重复目标、09查验、11特殊局17命令、10未知结果恢复，见下文实际证据 |
| AC-15～18 消息/情报/规则/弹层 | 主要流程通过 | 05双浏览器涵盖IME、历史、规则/焦点及公开票型；06真实聊天/授权链与08动效通过，见下文证据 |
| AC-19 断线重连 | 通过 | 12真实协议断开/恢复、同局同成员、页面倒计时下降、命令/消息不重发；08覆盖死亡提示重连基线不重播 |
| AC-20 两局循环 | 首局终局及第二局启动通过 | 09正式13人真实结算、原大厅、第二局新ID及状态清理；只证明第二局开始并行动，不声称两次终局 |
| AC-21 解散 | 大厅通过 | 双成员确认解散、双方回首页及原码拒绝；局中不允许解散由capability控制 |
| AC-22 横竖屏与软键盘 | 浏览器视口验证通过 | 08含桌面/手机、110%缩放及等效键盘视口；不是物理手机键盘实测 |
| AC-23 跨账号与旧视图 | 通过 | F03接管、F05/06跨scope、F07撤销/慢复盘、10同浏览器换账号后迟到请求隔离；12房主变化后旧确认框和管理权限失效 |
| 完整同源构建产物 | 未运行 | 当前只有Vite开发环境，不是最终镜像 |
| 实时语音 | 条件未具备 | 当前features.voice=false；文字版不请求麦克风；真实媒体另验 |

## F09/F10 当前补充（未完成验收）

- 09-full-game.spec.ts已有实际固定报告results-f09-full-game-chromium.json：1通过、0失败/跳过/重试，10.1秒。主代理复查断言：真实API/Socket、私有Unix socket推进时钟、正式13人首局human终局、浏览器投票/结束复盘/再开局，第二局新gameId/窗口及空聊天/提交/个人历史并接受守护。没有直接修改phase/win；不涵盖所有特殊角色行动或第二次终局。
- 10-recovery旧聚合报告由分别seed的独立场景组成，不能证明当前完整spec可重复运行。源码复查发现旧房间扫描清理、跨测试复用和迟到响应断言不足，正在修正；暂不将其升级为完整通过。
- 修正后的10已移除旧房间扫描/接管/解散与跨场景房间复用，分配不同账号组，只退出本轮记录房间。整份Chromium实际3/3通过（29.4秒），WebKit3/3通过（31.7秒），报告results-f09-recovery-fixed-{chromium,webkit}.json，失败/跳过/重试均0。覆盖阵营文字草稿和行动目标的账户导航保留、20秒未知结果同ID/载荷重试、A迟到请求settled后同一浏览器仍为B、500结束复盘重试及目标约束缩减。新增复盘管理导航回归尚未通过，正在排查测试壳的网格布局与实际Shell差异。
- 新请求ID辅助函数native/fallback定向2例通过；静态入口定向4例通过，覆盖仅入口/资源可读、API响应保留和源码/测试页/路径穿越不可访问。根类型检查通过。接入后web类型检查初次发现Crypto泛型签名不匹配，收窄buffer类型后复验通过。
- 复盘管理导航已补验通过：07新增合法transfer-host未知结果场景，返回复盘再进入管理，保留原requestId和body重试；Chromium1/1（1.1秒）、WebKit1/1（2.5秒），报告results-f09-review-management-{chromium,webkit}.json。测试壳缺少真实Shell的navigation列导致点击受阻，已补aria-hidden占位并使用正常click；产品ReviewPage保持管理组件挂载，避免导航丢失未决意图。未用force点击或修改产品CSS掩盖问题。
- Docker运行npm run build:web:v2通过；脚本显式强制NODE_ENV=production并校验resolveConfig.isProduction与无开发入口。JS379.60kB、gzip118.52kB。临时构建产物不是最终交付镜像。
- compose.frontend-local.yml经Docker只读config验证：仅127.0.0.1:5174，独立Cookie及命名数据卷，无源码挂载。Dockerfile.frontend-v2及交接说明已准备；最终完整镜像、同源浏览器和发布清单尚未验证。
- 14-account-failures补充异常场景通过：Chromium2/2（2.7秒）、WebKit2/2（5.8秒），直接生成results-f09-account-failures-{chromium,webkit}.json，主代理核对实际spec标题与统计。真实无效邀请码反馈、正常双击延迟注册只发送一次且账号可登录；先真实保存头像，再仅对PUT注入503，旧avatarUrl/profileVersion及页面头像保留，恢复真实请求后重试成功。503是前端故障注入，不是实际磁盘故障。
- 并行测试曾共用/results/results.json导致报告复制串写；误归属报告已单独归档，不计证据。playwright配置现在支持FRONTEND_REPORT_FILE与FRONTEND_ARTIFACT_DIR，每次验收应直接指定唯一输出路径，不能复制共享临时报告冒充固定结果。
- 11-special-actions Chromium实际1/1通过（9.27秒），唯一报告results-f09-special-chromium.json，0失败/跳过/重试。真实UI建7人实验房，各演员仅从本人授权view取角色/任务；非空救援和死亡水妖选择已死亡科研员复活通过浏览器完成。17类实际accepted命令断言，加09非空SUBMIT_CHECK，形成18类真实命令证据。还验证竞选平票/复投、首日死讯前候选资格、遗言、天理移交、放逐平票/复投及复活后的真实生命状态；救援事件仅出现在授权私有流，公屏不泄漏。
- 11早期测试驱动错误已修正：没有降临者的固定夜间阶段不暴露任何私人窗口，因此无可见窗口时只自然推进私有测试时钟1000ms并再次观察；不修改phase/win。首日竞选结束的瞬态day结构不可作为唯一断言，改用真实公开sheriff_elected/election_finished事件验证当选。WebKit同项实际1/1通过（14.7秒），报告results-f09-special-webkit.json，0失败/跳过/重试，亦验证真实死者目标选择及复活；11浏览器进程已结束。
- 12-governance-reconnect最终Chromium3/3（14.7秒）、WebKit3/3（20.2秒），报告results-f09-governance-final-{chromium,webkit}.json，reporter直接写入对应唯一文件，0失败/跳过/重试。验证15秒宽限前后房主归属、旧管理弹层关闭和旧API403；离线正式成员不触发空房、正式成员清空后无房主、观众补位变未准备并取消空置、再次空置5分钟后旧码404；真实UI命令/聊天重连后不重发，成员/席位唯一、gameId和截止时间不变、页面倒计时下降，voice=false且getUserMedia/voice请求为0，文字仍可发送。
- 12断开方式为Playwright透传真实Socket后，向实际服务端发送Socket.IO默认namespace DISCONNECT帧41，等待50ms送达并关闭两端WebSocket；通过另一在线成员的授权view确认服务端reconnecting，再用私有时钟测试宽限。早期仅setOffline以及Engine.IO帧1没有触发所需断开，失败报告保留；未改产品presence/phase/win。最终acceptance项目已down，数据卷保留，原开发及旧服务未停止。

## 证据规则

真实运行报告保存在被Git忽略的 test-results-frontend-v2；失败轮次先归档，不能用后一次绿灯擦掉问题经过。构造fixture只证明界面格式/局部行为，不能当真实玩法链。测试截图不包含密码、邀请或媒体token，认证流程关闭trace/video自动录制。

最终交付前需将每项状态更新为有具体文件、命令和结果支撑的通过，或明确列出用户确认的条件项；不能用此表的标题或“页面已经存在”推断完成。

## F02 已核验记录

Luna在隔离Compose中执行新版前端typecheck/build、浏览器TypeScript检查及指定01-account.spec。最终WebKit3/3（9.8秒）、Chromium3/3（7.0秒），无全量/旧UI测试；报告分别test-results-frontend-v2/results-webkit.json与results-chromium.json。主代理审阅实际断言与账户截图。

每项目三个场景：①邀请注册、刷新恢复、头像取消/保存/非法图不覆盖、错误旧密码、改密后双会话401、新密码重登退出；②维护者重置码UI及真实新密码登录；③注册请求已送达但响应丢失时转登录恢复且只有一次注册。头像发送字节长度及签名与Content-Type匹配，服务端结果另以授权GET的WebP字节头和profileVersion核对。

初期泛名results-chromium/results-webkit已被后续运行复用；当前账户最新有效回归证据为results-f03-account-regression.json（6/6），不再用泛名冒充固定历史记录。

## F03 已核验记录

新版类型检查/构建与浏览器TS通过；02-rooms.spec Chromium3/3（26.6秒）、WebKit3/3（32.6秒），报告为test-results-frontend-v2/results-f03-rooms-{chromium,webkit}.json；01-account相关回归6/6（16.3秒）。主代理检查统计、断言及rooms-formal/experimental截图。

真实Socket/HTTP场景覆盖正式板、实验5人、治理、观战晋升、服务端确认offline后开局、创建未知结果相同请求重试、跨设备接管。保留空房5分钟/自动继任等未运行项，不把列表、公共状态壳和开局等价为完整对局验证。

这仍不是全项目完成证据：完整对局行动、信息侧栏、多局链与最终同源镜像尚未验收。

## F04/F05 增量证据

行动模型与回执跟踪增量16例通过；03-actions组件夹具Chromium3/3、WebKit3/3，报告results-f04-actions-{chromium,webkit}.json。覆盖18类意图结构、选目标不发送、重复目标、只读、未知结果与原请求重试；这些是组件契约证据，不代表18类真实玩法全部执行。

04-night-actions真实后端五人实验局Chromium1/1（35.7秒）、WebKit1/1（40.2秒），报告results-f04-real-night-{chromium,webkit}.json。守护响应accepted且submissionState对应本局/窗口/请求；服务端固定守护窗口结束后，死神同一目标两次攻击的方案获accepted，latest/effective保留重复目标。没有手工修改引擎阶段。此项仍不覆盖完整13人对局或连续两局。

新增席位边界断言发现桌面环形卡片超出舞台左边界约8.6px；修复为按卡片宽度预留边距及增大最小环形高度。修复后03-actions两浏览器各3/3通过，5/13/26/64席位的完整stage-seat（包括工具条）均在舞台内，报告results-f04-layout-fixed-{chromium,webkit}.json。02房间回归两浏览器各3/3（27.3秒/32.9秒），报告results-f04-rooms-regression-{chromium,webkit}.json。新版类型检查、构建及浏览器TS通过；未重跑真实04或旧全量E2E。

## F06 当前增量证据

chat tracker8例通过（含补强断言）：权限与UTF-16边界、原载荷重试、同sender/同channel对账、错误回执、迟到结果与dispose。根typecheck及新版typecheck通过。

05-information的初版四场景已在Chromium4/4（3.0秒）、WebKit4/4（7.4秒）通过，报告results-f06-information-{chromium,webkit}.json，Browser TypeScript通过。实际覆盖发送字段、纯文本、IME/Enter/ShiftEnter、500字符输入、unknown重试、只读/禁写、跨scope草稿清理、聊天早历史与滚动/草稿保持、规则搜索/章节及弹层焦点。主代理逐行审阅后要求补充事件早历史、消息重复后的唯一性断言及公共/私人事件流隔离，补测尚在运行。

上述05中的chat/view均为page.route拦截，只证明界面行为，真实后端聊天收发尚未验证。WebKit规则弹层截图已审阅，正文与表格在手机视口可读；全文章节标题出现重复，列入F08显示细节修整。

补强终轮05 Chromium4/4（2.8秒）、WebKit4/4（6.8秒），同名固定报告已更新，Browser TypeScript通过。补充实际断言：事件早历史显示、相同DTO的messageId唯一性、两条事件顺序呈现、公共与私人事件同cursor不串流。最终夹具两条事件已经按cursor排序，不将该断言夸大为逆序输入排序验证。仍不把page.route夹具当成真实聊天链路。

## F07 真实聊天与第二屏增量证据

06-chat-screen-real：Chromium2/2（105.8秒）、WebKit2/2（115.0秒），失败/跳过/重试均0；固定报告results-f07-chat-screen-real-{chromium,webkit}.json。真实六人实验局及一名公开观众，通过各玩家授权view找角色，验证魂灵阵营消息隔离、夜间公屏禁写、私人第二屏邀请/兑换、只读视角及撤销清除private，随后独立场景等待固定夜间自然结束进行公屏双向交流。一次真实POST经route.fetch完成后丢弃响应，最终服务端及界面消息无重复；没有构造phase或win，没有将邀请token写入截图。

05管理视图专项两浏览器各1例通过，固定报告results-f07-information-regression-{chromium,webkit}.json。当时断言证明草稿保留且返回后scrollTop仍大于0，不能单凭该结果证明原位置完全一致；现已把断言加强为差值≤1px，需重跑后更新此项。完整复盘、实际终局和正式13人连续两局仍未通过验收。

加强后的05管理视图断言已于06:24/06:25重跑，两浏览器各1/1通过，证据更新到同名报告；实际比较进入前后的非零scrollTop差值≤1px，同时保留草稿。

07-review组件夹具Chromium4/4、WebKit4/4，固定报告results-f07-review-{chromium,webkit}.json，浏览器TS通过。覆盖独立GET慢响应时结局概览、失败重试、错误gameId、退出复盘后的迟到请求不回填、13身份/最终生命、时间线按数组顺序、两频道完整纯文本记录、房主结束复盘相同requestId重试和非房主无结束入口，以及私人第二屏的只读窗口/提交与公开视角无私人角色。测试harness按phase选择真实生产组件，不直接在DOM伪造复盘页。此处使用constructed review夹具，不能作为真实终局或两局玩法链的证据。

## F08 显示与操作可达性

显示模型5例通过；08-display Chromium5/5（6.6秒）、WebKit5/5（15.3秒），固定报告results-f08-display-{chromium,webkit}.json。覆盖真实设置组件写入仅3个非敏感偏好、90/100/110缩放、系统减少动画、死亡提示首快照/重复/私有事件/重连基线、320/390/844/1440视口、110%手机/桌面5/13/26/64席位、32字符账号与焦点恢复、键盘导航、规则章节返回/单标题/游戏context，以及390×500等效软键盘布局下输入和发送按钮不被行动栏遮挡。此项是浏览器视口等效验证，不冒充物理手机键盘实测。

两项真实缺陷已修复并归档失败证据：弹层关闭后焦点丢失；发送按钮被行动栏覆盖12.77px。另需求审计发现宽屏主操作区未固定，现桌面和手机均有固定行动栏。测试直接核对1440×900首屏及滚动后的bbox、任务倒计时与唯一可见确认入口；03-actions相关回归两浏览器各3/3，固定报告results-f08-actions-regression-{chromium,webkit}.json。主代理审阅桌面/手机截图；新版typecheck/build与Browser TS通过。最终生产构建模式问题仍留F10解决。
