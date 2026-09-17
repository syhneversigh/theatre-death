# 后端 v2 进度

基线 cc3e48e；计划 docs/backend-v2-plan.md。

| 步骤 | 状态 | 验证 |
| --- | --- | --- |
| 01 工程基线 | 完成 | Luna：engine目录宿主/容器哈希一致；smoke 1/1；compose app继承挂载且独立端口 |

旧 3000 服务和数据未改动。测试命令为 compose.v2.yml run --rm --no-deps test；Windows换行差异按解析后的JSON锁文件比较。
