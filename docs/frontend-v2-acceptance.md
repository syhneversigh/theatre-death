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
| AC-01～03 认证/账号/头像 | 主要流程通过 | Chromium3+WebKit3真实账户场景；重复点击、服务器存储失败等其余异常组合留F09，不能据此声称所有分支已覆盖 |
| AC-04～11 房间与大厅 | 核心流程通过 | 双浏览器6例：创建/配置冻结/准备/观战/转移/踢人/补位/离线开局；空房完整回收与自动继任补验留F09 |
| AC-12～14 席位与行动 | 组件及部分真实行动通过 | 5/13/26/64布局、18意图与回执夹具通过；真实守护/同目标双刀通过，其他真实行动待F09 |
| AC-15～18 消息/情报/规则/弹层 | 组件通过/真实链待验 | 05双浏览器涵盖IME、历史、规则/焦点及公开票型；06真实聊天/授权链正在运行 |
| AC-19 断线重连 | 未运行 | 真实Socket断开恢复、无自动重发或重播 |
| AC-20 两局循环 | 未运行 | 正式13人真实结算，复盘返回大厅，第二局隔离 |
| AC-21 解散 | 大厅通过 | 双成员确认解散、双方回首页及原码拒绝；局中不允许解散由capability控制 |
| AC-22 横竖屏与软键盘 | 部分观察 | 当前仅登录页；其他页面与键盘待覆盖 |
| AC-23 跨账号与旧视图 | 部分通过 | F03真实接管、F05/06跨scope夹具通过；第二屏撤销与复盘慢响应仍待F07 |
| 完整同源构建产物 | 未运行 | 当前只有Vite开发环境，不是最终镜像 |
| 实时语音 | 条件未具备 | 当前features.voice=false；文字版不请求麦克风；真实媒体另验 |

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
