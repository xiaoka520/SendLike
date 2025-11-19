```instructions
## 目的
帮助 AI 代码代理快速上手并修改本仓库的 SendLike 插件。重点指出入口点、配置与常见修改点、以及与宿主（Miao-Yunzai/OneBot/NapCat）交互的注意事项。

## 关键文件（快速索引）
- `index.js` — 插件主入口，包含命令路由、点赞主流程 `_like`、订阅/定时任务逻辑。
- `utils/like.js` — 与宿主 API 交互的工具：`safeCallApi`（尝试多种宿主接口）、`sendLike`、`getUserInfo`、`getProfileLike` 等。
- `config/config.js`、`config/config.yaml` — 配置存储与模板（`subscribed_users`、`last_like_date`、`reply_templates`）。
- `README.md` — 使用/安装说明（已与代码同步）。

## 当前架构与行为要点（简明）
- 命令由 `index.js` 中的正则规则匹配（例如 `#赞我`、`#赞@`、`#订阅点赞` 等），对应方法执行点赞逻辑。
- 与平台的调用统一通过 `utils/like.js` 的 `safeCallApi`，它会按优先顺序尝试多种宿主表面（`e.bot.sendApi`、`e.bot.napcat.*`、`global.Bot.sendApi` 等）。
- 配置仅保存插件内部用到的键：`subscribed_users`、`last_like_date`、以及 `reply_templates`（success/limit/stranger）。仓库没有“白名单”相关键（请不要在代码中引入不存在的配置键）。
- 关于“陌生人点赞”的策略：插件不再把包含“权限”字眼的宿主返回直接断定为“对方明确拒绝陌生人点赞”，而是统一使用 `stranger` 模板给出中性提示（目的是避免错误地把失败归因于对方设置）。如果需更具体的判定，请在 `utils/like.js` 中增强 `safeCallApi` 的返回解析并增加可选配置。

## 常见变更任务与示例
- 添加/修改回复模板：编辑 `config/config.yaml` 中 `reply_templates`（`success/limit/stranger`），插件会在运行时热加载（`config.js` 使用 chokidar 监听）。
- 新增命令：在 `index.js` 构造器的 `rule` 数组新增一个规则（正则 + 方法名），并在类中加入对应的 async 方法，使用 `await e.reply(...)` 返回。
- 调试宿主 API：在 `utils/like.js.safeCallApi` 中可以查看尝试过的候选表面（注释中列出）。若宿主实现不同，可优先把你的宿主表面塞到候选数组前面。

## 调试与验证建议
- 本地运行/调试：把插件目录放到 Miao-Yunzai 或目标宿主的 `plugins` 下，按 README 的步骤安装依赖并重启宿主。
- 快速模拟：在单元或临时脚本中 mock `e.bot.napcat.sendLike` 返回不同形式（成功对象 / NapCat 业务错误对象 {retcode,status,message} / 抛错），以验证 `_like` 的分支处理。
- 日志：主要关键点（`safeCallApi` 的 attempted 列表、`sendLike`/`get_stranger_info` 的原始返回）对排查非常有用，避免在用户可见消息中做过度推断。

## 编辑优先级建议
1. 修改回复模板（`config/config.yaml`）——低风险，直接可见效果。
2. 修改 `index.js` 中的业务判断（例如对 NapCat 返回的判定）——中等风险，需添加针对性单元/模拟测试。
3. 扩展或改写 `safeCallApi` 以适配新的宿主 API——高风险，需保证对旧宿主兼容。

## 已知差异/注意点
- README 中原先提到的“白名单”机制已移除，配置文件当前不包含 `enable_white_list` 或 `white_list_groups`。
- 是否能成功点赞仍依赖目标 QQ 的隐私设置与宿主的能力；插件只能根据宿主回包给出提示，不能改变目标的隐私策略。

---
如果你希望我把某些说明转成自动化的验证脚本（例如自动模拟 NapCat 不同返回并运行 `_like`），或需要我把某些模板改为更礼貌/中性的文本，告诉我哪一项，我会直接修改并提交补丁。
```
3. 新增命令时保持与现有 `filter.command` / `filter.regex` 风格一致，并使用 `PermissionType` 装饰器保护管理命令。
