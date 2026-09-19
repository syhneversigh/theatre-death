# 新版前端本地交付与接续

状态：准备中，尚未完成最终候选构建和同源浏览器验收。本文命令是交付操作说明，不是已执行证明；实际结果以 frontend-v2-acceptance.md 为准。

## 入口与边界

- 新版页面为 web-v2；API契约2.1，规则2.0。
- 开发环境：deploy/compose.frontend.yml，http://localhost:5173，Vite联调。
- 完整本地候选：deploy/compose.frontend-local.yml，http://localhost:5174，网页、HTTP、Socket、头像由同一个服务提供。
- 本地候选使用独立命名卷 frontend-local-data 和 Cookie td_account_frontend_local；不读取原3000/3001/3003或前端开发数据目录。
- 本地HTTP的API设置为development；前端产物始终强制production构建。后续公网HTTPS部署应配置准确的PUBLIC_BASE_URL和NODE_ENV=production，不放宽服务端HTTPS校验。
- 当前VOICE_ENABLED=false；文字版不要求麦克风。真实媒体和双设备语音未验收。

## 构建与运行

在仓库根目录、Docker可用时执行。依赖镜像为 theater-death-contract-deps:sharp0354-ajv820；锁文件不匹配会拒绝构建，需要先按deploy/Dockerfile.dependencies重建依赖镜像。

新机器没有依赖镜像时先执行下列命令；已有且锁文件匹配时可直接复用。其Dockerfile固定基础镜像摘要，再按package-lock.json安装依赖，不在宿主安装Node。

```powershell
docker build -f deploy/Dockerfile.dependencies -t theater-death-contract-deps:sharp0354-ajv820 .
```

```powershell
$env:FRONTEND_VCS_REF = git rev-parse HEAD
docker compose -f deploy/compose.frontend-local.yml build app
docker compose -f deploy/compose.frontend-local.yml up -d app
docker compose -f deploy/compose.frontend-local.yml ps
```

构建含根类型检查、新前端类型检查、完整单元/API门禁和生产前端构建；只在最终候选检查点执行，不把它用作每个小改动的增量验证。运行时不挂载源码或测试时钟。

访问 http://localhost:5174。PUBLIC_BASE_URL是精确来源，localhost与127.0.0.1不可随意互换；当前端口只绑定本机回环地址。

## 账号维护

新卷初始没有玩家账号。维护者在本机生成邀请码，再通过页面注册：

```powershell
docker compose -f deploy/compose.frontend-local.yml exec app node server/v2/admin.ts invite
docker compose -f deploy/compose.frontend-local.yml exec app node server/v2/admin.ts reset-password <username>
docker compose -f deploy/compose.frontend-local.yml exec app node server/v2/admin.ts revoke-invite <id>
```

这些命令输出的一次性码应私下交给对应玩家，不放入截图、Git或验收报告。密码重置码由维护者签发，页面不提供邮件找回。

## 停止与数据

```powershell
docker compose -f deploy/compose.frontend-local.yml down
```

该命令保留命名数据卷；不要加-v，除非明确要删除此环境全部账号、头像和审计数据。当前版本不承诺服务器重启恢复正在进行的对局。生产迁移、脱敏和公网入口切换由用户后续另行安排。

## 未完成交付证据

尚需补齐F09需求映射、最终候选镜像ID与源码提交、全量构建门禁结果，以及真实同源认证/头像/Socket/静态资源浏览器验证。暂不将本文作为项目完工声明。

最终产物的隔离验证编排为deploy/compose.frontend-smoke.yml：不开放宿主端口，使用另一个独立数据卷，浏览器通过http://app:3000访问实际候选。该环境用于验证非localhost HTTP下的请求ID兼容，不在本地交付卷中生成验收账号；测试脚本和最终结果仍待补齐。
