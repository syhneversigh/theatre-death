# 新版语音本地验收记录

日期：2026-09-19。范围仅限本地 Docker 隔离环境；没有推送 GitHub、上传镜像、修改常驻 5174 服务或操作公网服务器。

## 结果

- 根 TypeScript、新版前端 TypeScript 和生产构建通过；LiveKit 客户端为独立延迟加载 chunk，`features.voice=false` 时不会下载该模块。
- 语音增量单元/API：4 个文件、20 项通过，覆盖一次性开麦意图、撤权、离开对局页、断线、同步失败、接管旧会话及麦克风音轨限制。
- 最终候选镜像构建门禁：83 个测试文件、522 项通过；镜像标签 `theater-death-frontend-v2:voice-local`，摘要 `sha256:de6ac69774dce4ce34e6738249cd026b0d0214c74b6ca1d1f7871b38a65bd46b`，未部署。
- Chromium 真实媒体 E2E：标准 13 人局、13 个独立浏览器会话同时加入自托管 LiveKit；发言者使用虚拟麦克风手动开麦，接收端远端音频进入可播放状态且播放时间增长；发言结束后媒体服务撤销发布权并产生 `track_unpublished`。1/1 通过。
- LiveKit webhook 的 `participant_joined`、`track_published`、`track_unpublished` 均由签名接收端成功处理；媒体链路使用 UDP。

截图：

- `test-results-frontend-v2/voice-joined-listener.png`：非发言者加入后只听。
- `test-results-frontend-v2/voice-speaking.png`：当前发言者手动开麦。
- `test-results-frontend-v2/voice-permission-revoked.png`：进入投票后自动撤权并关闭麦克风。

## 未完成的公网验收

- 未在真实手机、Safari、移动网络或 `47.76.227.151` 上运行。
- 未验证公网 HTTPS/WSS、云安全组、TCP 7881 回退、实际带宽或长时间稳定性。
- 首版未提供 TURN/TLS；受限校园网和公司网络的可达性留待部署后验证。

本记录不能作为公网语音已上线的声明。部署说明见 `frontend-v2-voice.md`。
