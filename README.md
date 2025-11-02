# SendLike

喵崽 QQ 点赞插件，支持一键点赞、自动订阅点赞等功能。

## 安装方法

1. 在 Miao-Yunzai 根目录下打开终端，执行：

```bash
cd plugins
git clone https://github.com/xiaoka520/SendLike.git send-like
cd send-like
pnpm install
```

2. 重启喵崽即可使用

## 功能指令

| 指令          | 说明                               | 示例          |
| ------------- | ---------------------------------- | ------------- |
| 赞我          | 给发送者点赞                       | 赞我          |
| 赞@xxx        | 给被@的用户点赞                    | 赞@小明       |
| /订阅点赞     | 订阅每日自动点赞                   | /订阅点赞     |
| /取消订阅点赞 | 取消每日自动点赞                   | /取消订阅点赞 |
| /订阅点赞列表 | 查看当前订阅用户                   | /订阅点赞列表 |
| /谁赞了 bot   | 查看谁给机器人点赞了（仅主人可用） | /谁赞了 bot   |

## 配置说明

配置文件位于 `plugins/send-like/config/config.yaml`：

```yaml
# 是否启用群白名单
enable_white_list: false

# 白名单群组列表
white_list_groups: []

# 订阅点赞的用户列表
subscribed_users: []
```

## 注意事项

- 每个用户每天最多可以收到 50 个赞
- 非好友用户可能会因为隐私设置无法点赞
- 自动点赞功能在每天早上 7 点执行

## 开源相关

- 本插件基于 MIT 协议开源
- 项目地址：https://github.com/xiaoka520/SendLike
