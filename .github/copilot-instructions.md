## 快速定位（目的）
本文件帮助 AI 代码代理快速理解并改动此 AstrBot 插件仓库（`astrbot_plugin_zanwo`）。主要目标：定位入口点、配置保存点、消息过滤与响应模式、以及调试/集成提示。

## 关键文件
- `main.py` — 插件主实现，包含 `zanwo` 类（继承 `Star`）和所有命令/事件处理逻辑。
- `metadata.yaml` — 插件元信息（name/version/author），用于发布与识别。
- `_conf_schema.json` — 配置 schema（若存在），用于了解可持久化配置项。
- `README.md` — 使用说明与命令示例，可用于生成帮助文本或校验命令行为。

## 架构与数据流（简明）
- 插件通过 `@register(...)` 注册为 AstrBot 的一个 `Star` 实例（见 `main.py` 顶部）。
- 事件进入点：带有 `@filter.command` 或 `@filter.regex` 的方法（例如 `like_me`, `subscribe_like` 等）。
- 与平台交互的客户端是 `event.bot`（类型：`CQHttp`），用于调用 `send_like`, `get_profile_like`, `get_stranger_info` 等 API。
- 配置信息通过构造函数注入 `AstrBotConfig`（存在 `self.config.save_config()` 调用表示持久化点）。

## 项目特有约定 / 可修改点
- 文本回复模板集中在 `main.py` 顶部的列表（例如 `success_responses`, `limit_responses` 等）。修改这些列表会直接影响回复内容。
- 白名单与订阅用户通过 `config.get("enable_white_list_groups")`, `config.get("white_list_groups")`, `config.get("subscribed_users")` 读取并通过 `self.config.save_config()` 保存。
- 获取被 @ 的用户 id：静态方法 `get_ats(event: AiocqhttpMessageEvent)` 返回 `Comp.At` 段的 qq id 列表，注意过滤自身 id。

## 常见变更模式（示例）
- 添加新命令：在类中增加带 `@filter.command("命令名")` 的 async 方法，使用 `yield event.plain_result(...)` 返回文本，或 `yield event.image_result(url)` 返回图像。
- 更改持久化键：修改 `metadata.yaml` 或在 `main.py` 中对 `self.config.get("key")` 的键名保持一致，确保 `.save_config()` 在有变更时被调用。
- 错误处理：`aiocqhttp.exceptions.ActionFailed` 在 `_like` 中被捕获并映射为用户可读的回复；参照该模式做外部 API 调用的容错。

## 依赖与运行环境提示
- 目标运行环境：Python 3.8+
- 主要依赖（从源码可见）：`aiocqhttp`, `astrbot` 框架。仓库没有顶层运行脚本；插件按 AstrBot 插件机制被载入。
- 本地调试：把本插件放入 AstrBot 的插件目录并运行 AstrBot 主进程；或在单元测试中 mock `Aiocqhttp` 客户端并调用 `zanwo` 的方法。

## 调试与测试要点
- 若要模拟点赞行为，可 mock `client.send_like` 以触发不同的异常路径（达到上限 / 权限问题 / 成功）。
- 持久化行为：修改 `self.subscribed_users` 后应调用 `self.config.save_config()`，检查配置文件（由 AstrBot 管理）是否更新。
- 日志与快速定位：在触发路径中临时添加 `print()` 或日志以查看 `event` 的 `message_str`, `get_sender_id()`, `get_group_id()` 等字段。

## 不要做的事（针对 AI 代理的限制）
- 不要假设有单元测试或 CI 配置；仓库当前没有测试目录。
- 不要修改 AstrBot 框架外的行为（例如更改 `aiocqhttp` 的公共 API）——只在插件内部适配。

## 编辑优先级建议（小列表）
1. 优先修改 `main.py` 顶部的回复模板与错词映射：影响范围大且低风险。
2. 修改配置键或持久化逻辑时，确保同时更新 `_conf_schema.json` / `metadata.yaml`（如果有关联）。
3. 新增命令时保持与现有 `filter.command` / `filter.regex` 风格一致，并使用 `PermissionType` 装饰器保护管理命令。

## 需要人工确认的点
- 插件如何在目标 AstrBot 环境中被加载（插件目录路径、插件清单格式）。
- 是否允许更新 `metadata.yaml` 的 `repo` 字段。若需要我可以生成一个小的 PR 建议。

---
如果上述任何部分不清楚或你希望我把某些示例转成具体的代码修改（例如替换某些回复模板或添加一个新的命令），告诉我哪一项，我会立刻改写并提交补丁。 
