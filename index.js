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


  // 点赞核心逻辑
  async _like(e, userId) {
    const util = new LikeUtil(e);
    let totalLikes = 0;
    const userInfo = await util.getUserInfo(userId);
    const username = userInfo?.nickname || "你";

    // 直接尝试一次性点赞 50 次（符合预期：陌生人点赞应当点 50 次）
    const result = await util.sendLike(userId, 50);
    if (result && result.success) {
      totalLikes += 50;
    }

    // 处理 NapCat 业务错误返回（例如达到上限）
    const nap = result?.nap || null;
    const errStr = result?.error || "";
      // 不要把包含 “权限” 字眼的返回当作确定性的“对方拒绝陌生人点赞”断言。
      // 一些宿主或 NapCat 在失败时会返回含糊的提示词（例如权限/隐私），但这并不
      // 意味着插件可以或应该更改目标用户的隐私设置。统一使用 stranger 模板
      // 返回更中性的失败提示，避免误导用户。若未来需要更细致的分类再补充。
      // （保留 nap/err 的原始信息以便日志分析）
      if ((nap && nap.message && nap.message.includes("权限")) || errStr.includes("权限")) {
        return util.getReplyTemplate("stranger", { username });
      }

    if (
      nap &&
      (nap.retcode === 1200 || (nap.message && nap.message.includes("达上限")))
    ) {
      // 如果是给自己点赞（#赞我），返回更自然的提示
      try {
        if (e && String(e.user_id) === String(userId)) {
          return "今天已经给你点过赞啦～";
        }
      } catch (ex) {
        // 忽略比较错误，回退到默认模板
      }

      return util.getReplyTemplate("limit", { username });
    }

    // 如果 NapCat 返回了业务消息（message/wording），优先使用它作为回复，避免随机模板带来的尴尬
    if (nap && (nap.wording || nap.message)) {
      try {
        return nap.wording || nap.message;
      } catch (e) {
        // 若读取 nap 字段出错则回退到默认模板
      }
    }

    // 最后返回 stranger 模板（包含更中性的信息），否则使用成功模板
    return totalLikes > 0
      ? util.getReplyTemplate("success", { username, total_likes: totalLikes })
      : util.getReplyTemplate("stranger", { username });
  }

  // 发送者要求点赞
  async likeMe(e) {
    const reply = await this._like(e, e.user_id);
    await e.reply(reply);
    return true;
  }

  // 给@的用户点赞
  async likeAt(e) {
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
