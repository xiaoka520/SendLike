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

  // 发送者要求点赞
  async likeMe(e) {
    try {
      logger.info(`[SendLike][likeMe] start user:${e.user_id}`);
      const reply = await this._like(e, e.user_id);
      try {
        await e.reply(reply);
        logger.info(`[SendLike][likeMe] replied to user:${e.user_id} reply:${reply}`);
      } catch (err) {
        logger.error(`[SendLike][likeMe] failed to reply: ${String(err)}`);
      }
      return true;
    } catch (err) {
      logger.error(`[SendLike][likeMe] unexpected error: ${String(err)}`);
      try {
        await e.reply("处理点赞时发生错误，请稍后重试");
      } catch (e2) {
        logger.error(`[SendLike][likeMe] failed to send fallback reply: ${String(e2)}`);
      }
      return true;
    }
  }

  // 给@的用户点赞
  async likeAt(e) {
    try {
      const util = new LikeUtil(e);
      const atList = util.getAtUsers();
      if (atList.length === 0) return false;

      logger.info(`[SendLike][likeAt] start user:${e.user_id} at:${JSON.stringify(atList)}`);
      const replies = [];
      for (const userId of atList) {
        const reply = await this._like(e, userId);
        replies.push(reply);
      }
      const out = replies.join("\\n");
      try {
        await e.reply(out);
        logger.info(`[SendLike][likeAt] replied: ${out}`);
      } catch (err) {
        logger.error(`[SendLike][likeAt] failed to reply: ${String(err)}`);
      }
      return true;
    } catch (err) {
      logger.error(`[SendLike][likeAt] unexpected error: ${String(err)}`);
      try {
        await e.reply("处理点赞时发生错误，请稍后重试");
      } catch (e2) {
        logger.error(`[SendLike][likeAt] failed to send fallback reply: ${String(e2)}`);
      }
      return true;
    }
  }

  // 初始化
  async init() {
    await Config.init();
  }


  // 点赞核心逻辑
  async _like(e, userId) {
    try {
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

    if (nap && nap.retcode === 1200) {
      const napMsg = (nap.message || nap.wording || "").toString();

      // 针对 NapCat 提示 "点赞数无效" 的情况：可能是单次传 50 超出宿主允许的单次最大值。
      // 这时尝试降级为多次 10 次尝试（5 次）以兼容宿主限制。
      if (napMsg.includes("点赞数无效") || napMsg.includes("点赞数不合法")) {
        logger.info(
          `[SendLike][_like] napcat returned invalid like count, fallback to chunks for user ${userId}`
        );

        // 依次尝试 5 次 10 点赞
        const chunks = [10, 10, 10, 10, 10];
        let lastNap = null;
        for (const chunk of chunks) {
          const part = await util.sendLike(userId, chunk);
          try {
            logger.info(
              `[SendLike][_like] chunk attempt user:${userId} chunk:${chunk} res:${JSON.stringify(
                part
              )}`
            );
          } catch (e) {
            // ignore
          }

          if (part && part.success) {
            totalLikes += chunk;
            // 小间隔，避免被宿主限流
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }

          // 保存最后一次 nap 以便后续返回
          lastNap = part?.nap || null;

          // 如果子请求返回限额/已赞提示，按限额逻辑处理
          const pnapMsg = (lastNap?.message || lastNap?.wording || "").toString();
          if (pnapMsg.includes("达上限") || pnapMsg.includes("已赞") || pnapMsg.includes("已经")) {
            // 如果在分块过程中已经有部分成功，则应向用户反馈实际成功的数量；
            // 只有在没有成功点赞的情况下才返回 limit 模板。
            if (totalLikes > 0) {
              return util.getReplyTemplate("success", {
                username,
                total_likes: totalLikes,
              });
            }

            try {
              if (e && String(e.user_id) === String(userId)) {
                return "今天已经给你点过赞啦～";
              }
            } catch (ex) {
              // ignore
            }
            return util.getReplyTemplate("limit", { username });
          }

          // 其他错误继续尝试下一个 chunk
        }

        // 如果通过 chunks 有部分成功则返回 success，否则优先返回最后一次 nap 信息
        if (totalLikes > 0) {
          return util.getReplyTemplate("success", {
            username,
            total_likes: totalLikes,
          });
        }

        if (lastNap && (lastNap.wording || lastNap.message)) {
          return lastNap.wording || lastNap.message;
        }

        return util.getReplyTemplate("stranger", { username });
      }

      // 其它 retcode===1200 的情况（例如达到上限/已赞等），更严格地通过消息文本判断是否是“已赞过”场景
      const veryMsg = nap.message || nap.wording || "";
      if (veryMsg && /已|赞过|已赞|重复|不能重复/.test(veryMsg)) {
        // 若之前已有部分点赞成功，优先返回 success 并告知实际点赞数量；否则返回 limit 提示
        if (totalLikes > 0) {
          return util.getReplyTemplate("success", {
            username,
            total_likes: totalLikes,
          });
        }

        try {
          if (e && String(e.user_id) === String(userId)) {
            return "今天已经给你点过赞啦～";
          }
        } catch (ex) {
          // ignore
        }
        return util.getReplyTemplate("limit", { username });
      }

      // 其它未覆盖的 retcode 1200，回落到通用 limit 模板以提示用户业务受限
      return util.getReplyTemplate("limit", { username });
    }

    // 如果已经有实际成功的点赞，优先反馈成功并显示实际发送的数量
    if (totalLikes > 0) {
      return util.getReplyTemplate("success", {
        username,
        total_likes: totalLikes,
      });
    }

    // 若未成功，则查看 NapCat/宿主返回的业务消息（message/wording）并直接返回，以便保留宿主提示
    if (nap && (nap.wording || nap.message)) {
      try {
        return nap.wording || nap.message;
      } catch (e) {
        // 若读取 nap 字段出错则回退到默认模板
      }
    }

    // 最后返回 stranger 模板（包含更中性的信息）
    return util.getReplyTemplate("stranger", { username });
    } catch (err) {
      try {
        logger.error(`[SendLike][_like] unexpected error for user ${userId}: ${String(err)}`);
      } catch (e) {
        // ignore
      }
      // 返回中性错误信息，避免抛出未捕获异常导致框架认为处理已完成但无响应
      return "点赞过程中发生异常，请查看日志或联系管理员";
    }
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
