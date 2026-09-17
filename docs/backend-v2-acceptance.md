# 后端 v2 候选验收

日期：2026-09-18。源码基线cc3e48e，本地候选源码提交e44d12cc505f67cada841fc9a2ee7ce70cded0fc；之后的验收记录提交只更新文档。

## 镜像与入口

- 本地候选镜像：`theater-death-v2:e44d12cc505f67cada841fc9a2ee7ce70cded0fc`。
- Docker image ID：`sha256:c08b5617b6e018479f1c50d902d42114561d55483e8cca047db9292ba248e913`。
- Docker返回的本地RepoDigest：`theater-death-v2@sha256:c08b5617b6e018479f1c50d902d42114561d55483e8cca047db9292ba248e913`。没有推送或远端发布。
- 新API：http://localhost:3001；规则版本2.0，账号/审计库位于data-v2。候选容器不挂载源码。
- 旧网页：http://localhost:3000；仍为cc3e48e固定镜像，旧data未修改。
- 候选启动前已停止开发app并备份data-v2到工作区外层 `v2-data-backup-20260918-before-candidate`；未清除原库。

## 测试证据

- 各小步由gpt-5.6-luna子代理执行明确的增量集合，详细计数见backend-v2-progress.md。
- Node24原生导入账号库、应用和配置模块成功，内存SQLite初始化关闭成功；tsconfig启用erasableSyntaxOnly。
- 发布检查点Dockerfile.v2一次完整单元/API门禁：40文件、310用例全部通过，typecheck通过。
- 新旧健康接口均返回ok。旧API不能访问新服务，账号/接管/公开观战/授权第二屏具有真实HTTP及Socket测试。
- 增量CI选择器本地验证：文档变更不运行测试；rate-limit变更选择4文件22用例且通过；未知代码路径拒绝静默跳过。GitHub工作流未触发。
- PowerShell管理脚本语法检查及实际start/status通过。

## 容量测试

专用load-app限制2 CPU、4 GiB，客户端另一个容器，独立data-v2-load，100账号、两桌26玩家和24公开观众。每次完整运行5分钟，未缩短生产玩法计时。账号预置并复用测试密码哈希，登录负载和真实语音未包含在普通API指标中。

首次结果：6038次普通API请求，P95=78.84ms；30次诊断采样，峰值RSS=189300736字节，最高event-loop P99=46.53ms。记录的HTTP/Socket/权限/幂等错误均为0。

首次脚本未区分主动清理与运行中断线，随后强化连接保持断言并完整复验：5988次普通API请求，P95=124.25ms；30次诊断采样，峰值RSS=182820864字节（约174.35MiB），最高event-loop P99=82.97ms；minActiveDuringLoad=50，全程保持50连接，运行期异常断线为0，测试结束主动断开50连接。HTTP/Socket/权限/幂等/self视角校验错误全部为0。最终无凭证报告位于test-results-v2/capacity-validated.json（该目录不入Git）。

## 实用入口与边界

接口契约：backend-v2-api.md；日常操作、邀请码和密码重置：backend-v2-runbook.md。新前端尚未接入，3001返回API信息，不提供新版网页。首个账号须由维护者生成邀请码，再通过注册API创建，没有默认账号或默认密码。

本轮未执行旧UI全量E2E、没有推送代码/合并远端/部署公网。未做真实双设备LiveKit验收；第三方媒体故障时远端撤销需重试。2核4GiB容器验收不等同于已验证任意同规格云主机及其带宽。

账号可持久保存，进行中的对局不可跨服务器重启恢复。新前端完成后才选择无对局窗口切换正式入口。当前只需停止v2候选即可撤回本轮服务，3000旧部署仍可用。
