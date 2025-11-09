import plugin from "../../lib/plugins/plugin.js";
import Config from "./config/config.js";
import LikeUtil from "./utils/like.js";
import { segment } from "icqq";
import moment from "moment";

export class SendLike extends plugin {
  constructor() {
    super({
      name: "SendLike",
      dsc: "QQ名片点赞插件",
      /** https://github.com/xiaoka520/SendLike */
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#赞我$",
          fnc: "likeMe",
        },
        {
          reg: "^#赞.*",
          fnc: "likeAt",
        },
        {
          reg: "^#订阅点赞$",
          fnc: "subscribe",
        },
        {
          reg: "^#取消订阅点赞$",
          fnc: "unsubscribe",
        },
        {
          reg: "^#订阅点赞列表$",
          fnc: "listSubscribes",
        },
        {
          reg: "^#谁赞了bot$",
          fnc: "whoLikedMe",
          permission: "master",
        },
      ],
    });

    this.task = {
      name: "SendLike定时任务",
      cron: "0 0 7 * * ?", // 每天早上7点
      fnc: () => this.dailyLike(),
    };
  }

  // 初始化
  async init() {
    await Config.init();
  }

  // 检查白名单
  checkWhiteList(e) {
    if (!Config.get("enable_white_list", false)) return true;
    const whiteList = Config.get("white_list_groups", []);
    return !e.isGroup || whiteList.includes(e.group_id.toString());
  }

  // 点赞核心逻辑
  async _like(e, userId) {
    const util = new LikeUtil(e);
    let totalLikes = 0;
    const userInfo = await util.getUserInfo(userId);
    const username = userInfo?.nickname || "未知用户";

    for (let i = 0; i < 5; i++) {
      try {
        if (await util.sendLike(userId, 10)) {
          totalLikes += 10;
        }
      } catch (error) {
        if (error.message?.includes("已达")) {
          return util.getReplyTemplate("limit", { username });
        } else if (error.message?.includes("权限")) {
          return "你设了权限不许陌生人赞你";
        } else {
          return util.getReplyTemplate("stranger", { username });
        }
      }
    }

    return totalLikes > 0
      ? util.getReplyTemplate("success", { username, total_likes: totalLikes })
      : "点赞失败了呢...";
  }

  // 发送者要求点赞
  async likeMe(e) {
    if (!this.checkWhiteList(e)) return false;
    const reply = await this._like(e, e.user_id);
    await e.reply(reply);
    return true;
  }

  // 给@的用户点赞
  async likeAt(e) {
    if (!this.checkWhiteList(e)) return false;
    const util = new LikeUtil(e);
    const atList = util.getAtUsers();
    if (atList.length === 0) return false;

    const replies = [];
    for (const userId of atList) {
      const reply = await this._like(e, userId);
      replies.push(reply);
    }

    await e.reply(replies.join("\\n"));
    return true;
  }

  // 订阅自动点赞
  async subscribe(e) {
    const userId = e.user_id.toString();
    const subscribers = Config.get("subscribed_users", []);

    if (subscribers.includes(userId)) {
      await e.reply("你已经订阅点赞了哦~");
      return true;
    }

    subscribers.push(userId);
    Config.set("subscribed_users", subscribers);
    await Config.save();

    await e.reply("订阅成功！我将每天自动为你点赞");
    return true;
  }

  // 取消订阅
  async unsubscribe(e) {
    const userId = e.user_id.toString();
    const subscribers = Config.get("subscribed_users", []);

    if (!subscribers.includes(userId)) {
      await e.reply("你还没有订阅点赞哦~");
      return true;
    }

    Config.set(
      "subscribed_users",
      subscribers.filter((id) => id !== userId)
    );
    await Config.save();

    await e.reply("已取消订阅！我将不再自动给你点赞");
    return true;
  }

  // 查看订阅列表
  async listSubscribes(e) {
    const subscribers = Config.get("subscribed_users", []);
    if (subscribers.length === 0) {
      await e.reply("当前没有订阅点赞的用户哦~");
      return true;
    }

    const userList = subscribers.join("\\n");
    await e.reply(`当前订阅点赞的用户ID列表：\\n${userList}`);
    return true;
  }

  // 查看谁给机器人点赞
  async whoLikedMe(e) {
    const util = new LikeUtil(e);
    const likes = await util.getProfileLike();

    if (likes.length === 0) {
      await this.reply("暂无有效的点赞信息");
      return true;
    }

    const likeInfo = likes
      .filter((user) => user.nick && user.count > 0)
      .map((user) => `【${user.nick}】赞了我${user.count}次`)
      .join("\\n");

    await e.reply(likeInfo || "暂无有效的点赞信息");
    return true;
  }

  // 每日自动点赞任务
  async dailyLike() {
    const today = moment().format("YYYY-MM-DD");
    if (Config.get("last_like_date") === today) return;

    const subscribers = Config.get("subscribed_users", []);
    if (subscribers.length === 0) return;

    for (const userId of subscribers) {
      await this._like(null, userId);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 加入间隔防止频率过高
    }

    Config.set("last_like_date", today);
    await Config.save();
  }
}
