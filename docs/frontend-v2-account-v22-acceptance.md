# 账号协议 2.2 本地验收记录

日期：2026-09-19

## 交付范围

- 注册改为昵称与密码直接注册，登录改为数字 UID 与密码。
- 公开 UID 从 `10000001` 起单调分配；内部 `userId` 继续用于会话、席位、接管和语音授权。
- 昵称支持 Unicode 文字、组合音标和下划线，允许重名；新密码统一限制为 8～16 个 Unicode 码点。
- 增加本人改昵称、管理员注册开关、直接设置密码和永久删除账号。
- 对局开始时冻结 UID 与昵称，删号后完成对局的复盘仍可读取。
- 客户端契约升级为 2.2，API 前缀和规则版本保持不变。

## 自动化结果

| 门禁 | 结果 |
|---|---|
| 候选 Dockerfile：后端/契约类型检查、前端类型检查 | 通过 |
| 候选 Dockerfile：单元与 API | 84 个文件、513 个用例全部通过 |
| 候选 Dockerfile：生产前端构建 | 通过 |
| 账号注册、UID、改名、改密、丢响应重试（Chromium/WebKit） | 6/6 通过 |
| 管理注册开关、改名、直接设密、停用（Chromium/WebKit） | 4/4 通过 |
| 复盘、第二屏和退出回归（Chromium/WebKit） | 14/14 通过 |
| 候选同源静态资源、头像、Socket 五人开局 | 1/1 通过 |
| 自托管 LiveKit、13 个账号连接、发布/订阅、撤权 | 1/1 通过 |

浏览器 JSON 报告位于 `test-results-frontend-v2/results-account-v22-*.json`。账号与管理页面截图位于：

- `test-results-frontend-v2/account-created-uid-chromium.png`
- `test-results-frontend-v2/account-created-uid-webkit.png`
- `test-results-frontend-v2/account-profile-chromium.png`
- `test-results-frontend-v2/account-profile-webkit.png`
- `test-results-frontend-v2/admin-account-governance-chromium.png`
- `test-results-frontend-v2/admin-account-governance-webkit.png`

## 本地 5174 迁移与清理

迁移前只读检查显示没有房间关联，账号库仅有一个账号 `cockatoo_cute`。按用户确认将它作为彩蛋保留，因此没有账号需要删除。

- 数据卷备份：`theater-death-frontend-local-backup-20260919`
- 迁移后契约：2.2
- 保留账号：UID `10000001`，昵称 `cockatoo_cute`
- 删除账号：0
- 注册开关：开放
- 语音开关：关闭

旧密码哈希被原样保留；即使旧密码超过 16 个字符也仍可登录，只有下次设置密码时才执行新长度限制。

## 未执行事项

没有推送 GitHub、上传镜像或操作公网服务器 `47.76.227.151`。公网电脑与手机互听、移动网络 TCP 回退和实际带宽容量仍需部署后验收。
