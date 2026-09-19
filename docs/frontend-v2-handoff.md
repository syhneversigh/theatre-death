# 新版前端本地交付与接续

2026-09-19工作区整理：本机仅保留5174最终服务，旧3000/3001/3003/5173实例已下线。完整文档与验收产物统一归档到工作区 `documents/`；下文历史验收文件路径对应 `documents/theater-death/` 下的同名路径。当前账户卷、镜像、配置不变；非空历史数据库另存 `retained-data/`。仓库内被构建、测试和相对链接依赖的文档原件保留，避免归档破坏工程。

状态：文字版完整前后端本地交付已验收。根/前端类型检查、79文件504项单元/API测试通过；实际镜像的Chromium和WebKit同源联验各1/1通过。本地localhost:5174已启动且健康，使用独立新数据卷。详细证据见 frontend-v2-acceptance.md，镜像与文件哈希见 frontend-v2-release.json。

## 入口与边界

- 新版页面为 web-v2；API契约2.1，规则2.0。
- 开发环境：deploy/compose.frontend.yml，http://localhost:5173，Vite联调。
- 完整本地候选：deploy/compose.frontend-local.yml，http://localhost:5174，网页、HTTP、Socket、头像由同一个服务提供。
- 本地候选使用独立命名卷 frontend-local-data 和 Cookie td_account_frontend_local；不读取原3000/3001/3003或前端开发数据目录。
- 本地HTTP的API设置为development；前端产物始终强制production构建。后续公网HTTPS部署应配置准确的PUBLIC_BASE_URL和NODE_ENV=production，不放宽服务端HTTPS校验。
- 当前VOICE_ENABLED=false；文字版不要求麦克风。真实媒体和双设备语音未验收。

## 构建与运行

先切换到仓库目录并启动 Docker Desktop。`docker info` 成功才表示引擎就绪，`docker --version` 只说明客户端已安装。以下为当前机器路径，其他机器换成实际仓库路径：

```powershell
Set-Location -LiteralPath 'D:\myApps\暴风雪剧院\theater-death'
docker info
```

依赖镜像为 theater-death-contract-deps:sharp0354-ajv820；锁文件不匹配会拒绝构建，需要先按deploy/Dockerfile.dependencies重建依赖镜像。

新机器没有依赖镜像时先执行下列命令；已有且锁文件匹配时可直接复用。其Dockerfile固定基础镜像摘要，再按package-lock.json安装依赖，不在宿主安装Node。

```powershell
docker build -f deploy/Dockerfile.dependencies -t theater-death-contract-deps:sharp0354-ajv820 .
```

```powershell
if (-not (Test-Path -LiteralPath .env.frontend-local)) {
  Copy-Item .env.frontend-local.example .env.frontend-local
}
# 编辑 .env.frontend-local，将 ADMIN_PASSWORD 换成至少16位且仅本环境使用的密码。
$env:FRONTEND_VCS_REF = git rev-parse HEAD
docker compose --env-file .env.frontend-local -f deploy/compose.frontend-local.yml build app
.\deploy\frontend-local.ps1 start
```

构建含根类型检查、新前端类型检查、完整单元/API门禁和生产前端构建；只在最终候选检查点执行，不把它用作每个小改动的增量验证。运行时不挂载源码或测试时钟。

## 日常启动和 Docker 故障恢复

日常无需重新构建。Windows PowerShell 5.1 和 PowerShell 7 均可使用：

```powershell
Set-Location -LiteralPath 'D:\myApps\暴风雪剧院\theater-death'
.\deploy\frontend-local.ps1 start
.\deploy\frontend-local.ps1 status
```

脚本基于自身位置查找仓库和 `.env.frontend-local`，固定使用本机 `desktop-linux` context，不会误操作其他 Docker context。找不到 CLI 时可传 `-DockerPath '实际的docker.exe绝对路径'`。它等待引擎就绪（约90秒）、用现有镜像启动并等待容器健康，然后检查 `/healthz`、玩家页和 `/admin`；失败会报错，不会自动修复 Docker、下载或重建镜像，也不会输出密码。管理员是否配置仍由本地 env 决定，`/admin` 返回200不代表已经登录。

5174服务使用 `restart: unless-stopped`：Docker正常启动后自动恢复之前运行的该服务；主动执行 stop 后保持停止，需再次 start。5173开发服务和测试服务不纳入常驻启动。此策略不恢复内存中的对局，也不能修复 Docker 引擎本身的启动故障。

如果 Docker Desktop 明确报告 `sailor-ingest.sock` 或 `docker-secrets-engine/engine.sock` 的 `The file cannot be accessed by the system` 启动错误，使用独立恢复入口：

```powershell
.\deploy\recover-docker-sockets.ps1 -WhatIf
.\deploy\recover-docker-sockets.ps1
```

恢复入口只接受本用户最近15分钟内的匹配后台启动失败日志（含轮转日志），且引擎必须不可用；日志已有后续成功监听记录时忽略旧故障。健康引擎直接跳过，其他错误拒绝修复。它先核对两个目录只包含已知零长度 socket，并拒绝经过目录链接的路径，再停止失败的 Desktop；如果进程没有退出，会停止操作并提示退出错误对话框后重试，不自动强杀。确认 Desktop 已退出后，将两个目录改名为带时间戳的 `.recovery-*` 留存，建立空目录，重新启动 Desktop 并验证5174服务。不会清空旧目录、重置出厂设置、删除卷或修改 Docker AI 设置。`-WhatIf` 只做检查并显示计划，不停止进程或改名。恢复 Desktop 会影响其承载的所有本地容器；只有5174属于本脚本的应用启动范围。

这是已验证恢复办法的保守封装，并非根因修复。2026-09-19在Docker Desktop 4.91.0上，正常CLI重启也复现了Ingest socket错误；隔离运行目录后恢复。关闭AI后仍在当天整理工作区时复现，使用该脚本在失败进程退出后实际完成恢复。若日志过旧，先通过Docker Desktop界面尝试一次启动，得到新的失败记录，再判断是否适用。不要把其他WSL、网络、磁盘或权限错误套用到此流程。

维护脚本专项测试：`powershell.exe -NoProfile -File .\tests\deploy-frontend-local.tests.ps1`。测试只在临时夹具中验证命令超时、参数转义、日志匹配与目录保护，不操作真实Docker。Windows宿主管理脚本必须在Windows验证，业务程序仍全部在容器内运行。实机已验证5174启动/状态、重复启动不重建容器、API和两个页面健康、健康引擎跳过恢复。2026-09-19工作区整理时，预览及目录改名、重新启动、5174健康检查分支也在真实故障后通过；未重新跑业务全量测试或构建镜像。

访问 http://localhost:5174。PUBLIC_BASE_URL是精确来源，localhost与127.0.0.1不可随意互换；当前端口只绑定本机回环地址。

管理入口为 http://localhost:5174/admin，使用 `.env.frontend-local` 中的 `ADMIN_PASSWORD`，不使用玩家账号。没有配置密码时管理API关闭，页面只显示配置说明；项目不提供默认管理员密码。管理员会话固定两小时，并在服务重启后失效。

## 账号维护

新卷初始没有玩家账号。维护者在本机生成邀请码，再通过页面注册：

```powershell
docker compose --env-file .env.frontend-local -f deploy/compose.frontend-local.yml exec app node server/v2/admin.ts invite
docker compose --env-file .env.frontend-local -f deploy/compose.frontend-local.yml exec app node server/v2/admin.ts reset-password 'player_name'
docker compose --env-file .env.frontend-local -f deploy/compose.frontend-local.yml exec app node server/v2/admin.ts revoke-invite 'invitation_id'
```

将player_name和invitation_id替换为实际账号与邀请码ID。这些命令输出的一次性码应私下交给对应玩家，不放入截图、Git或验收报告。密码重置码由维护者签发，页面不提供邮件找回。

日常管理建议使用 `/admin`：可以搜索、改名、清除头像、注销会话、停用/启用账户，查看邀请码状态并生成、调整到期时间、撤销或重新生成。账户停用可恢复；大厅席位会释放，对局/复盘席位保留为离线，避免破坏结算和历史。邀请码与重置码原文只在生成弹窗显示一次，数据库不保存原文。详细行为及接口见 `frontend-v2-admin.md` 和 `openapi-admin-v2.1.json`。

## 停止与数据

```powershell
.\deploy\frontend-local.ps1 stop
```

该命令保留容器和命名数据卷，且明确暂停自动启动。手动使用compose down也会保留命名卷，但不要加-v，除非明确要删除此环境全部账号、头像和审计数据。当前版本不承诺服务器重启恢复正在进行的对局。生产迁移、脱敏和公网入口切换由用户后续另行安排。

## 验收证据与后续边界

镜像产品源码提交为853d1b021d04eeb4b048d1a06e41eb02e11b32e7，镜像摘要为sha256:9dfd1720c7ea01924f7da1b024ebcfda14d31216fc7ca7755a00c7fc886d875b。构建日志为test-results-frontend-v2/build-admin-final.log；81个测试文件、515项单元/API测试、根与前端类型检查及生产构建均通过。

最终产物的隔离验证编排为deploy/compose.frontend-smoke.yml：不开放宿主端口，使用另一个独立数据卷，浏览器通过http://theater-smoke:3000访问实际候选。13-release-smoke.spec.ts验证非localhost HTTP请求ID兼容、实际静态资源/源码404、注册登录/头像/Socket以及真实五人开局；报告results-f10-release-{chromium,webkit}.json分别1/1通过。使用theater-smoke别名，避免裸app域名被浏览器自动升级HTTPS。测试项目已停止，测试账号未写入本地交付卷。

新增15-admin.spec.ts也对实际候选镜像完成Chromium/WebKit验证，每个项目连同13共4/4通过，报告为results-admin-release-{chromium,webkit}.json。覆盖独立管理员登录、邀请与真实注册、账户治理、头像、停用/启用、重置码、邀请编辑/撤销/再生成及未知响应重试。手机邀请码列表另有宽度、触控尺寸与无横向溢出断言。

18类行动与正式13人首局复盘/第二局启动分别由09和11真实链验证；账户异常、草稿、跨账号、房间治理、重连、响应式与键盘验证见验收台账。手机软键盘采用浏览器等效视口验证，没有冒充物理手机实测。真实媒体语音、正式数据脱敏/迁移、公网部署及原服务入口切换仍由用户后续安排；当前没有文本版交付阻塞项。
