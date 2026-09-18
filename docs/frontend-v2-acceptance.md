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
| AC-12～14 席位与行动 | 未运行 | 多人数、全部18命令、目标配额、未知结果和截止 |
| AC-15～18 消息/情报/规则/弹层 | 未运行 | IME、滚动、私密信息、票型时机、阅读不中断 |
| AC-19 断线重连 | 未运行 | 真实Socket断开恢复、无自动重发或重播 |
| AC-20 两局循环 | 未运行 | 正式13人真实结算，复盘返回大厅，第二局隔离 |
| AC-21 解散 | 大厅通过 | 双成员确认解散、双方回首页及原码拒绝；局中不允许解散由capability控制 |
| AC-22 横竖屏与软键盘 | 部分观察 | 当前仅登录页；其他页面与键盘待覆盖 |
| AC-23 跨账号与旧视图 | 纯逻辑通过/UI未运行 | 真实接管、权限撤销与慢响应场景 |
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
