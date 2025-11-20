import lodash from "lodash";
import Config from "../config/config.js";

async function safeCallApi(e, action, params) {
  // 尝试常见宿主提供的 API 调用入口（异步）
  const hostsToInspect = [
    { name: "event", obj: e },
    { name: "e.app", obj: e?.app },
    { name: "e.client", obj: e?.client },
    { name: "e.bot", obj: e?.bot },
    { name: "global.app", obj: globalThis?.app },
    { name: "global.client", obj: globalThis?.client },
    { name: "global.bot", obj: globalThis?.bot },
  ];

  const attempted = [];

  const inspect = (obj) => {
    try {
      if (!obj) return null;
      return Object.keys(obj).slice(0, 50);
    } catch (err) {
      return null;
    }
  };

  // inspect surfaces: 不在正常调用路径中打印，避免产生噪音日志

  // 按优先顺序尝试真实调用
  const candidates = [
    // 直接使用 sendApi 方法
    { name: "e.bot.sendApi", fn: () => e?.bot?.sendApi?.(action, params) },
    // 通过 napcat 接口发送
    {
      name: "e.bot.napcat.sendLike",
      fn: () => {
        if (action === "send_like" && e?.bot?.napcat?.sendLike) {
          return e.bot.napcat.sendLike(params.user_id, params.times);
        }
        return null;
      },
    },
    {
      name: "e.bot.napcat.getStrangerInfo",
      fn: () => {
        if (action === "get_stranger_info" && e?.bot?.napcat?.getStrangerInfo) {
          return e.bot.napcat.getStrangerInfo(params.user_id);
        }
        return null;
      },
    },
    {
      name: "e.bot.napcat.getProfileLike",
      fn: () => {
        if (action === "get_profile_like" && e?.bot?.napcat?.getProfileLike) {
          return e.bot.napcat.getProfileLike();
        }
        return null;
      },
    },
    // 尝试 sendApi 的全局版本
    {
      name: "bot.sendApi",
      fn: () => globalThis?.Bot?.sendApi?.(action, params),
    },
  ];

  for (const c of candidates) {
    try {
      const res = await c.fn();
      if (res !== undefined && res !== null) {
        // 成功返回（或业务错误对象）——记录原始返回便于排查宿主/napcat 返回的业务信息
        try {
          logger.info(
            `[SendLike][safeCallApi] candidate ${c.name} returned: ${JSON.stringify(
              res
            )}`
          );
        } catch (e) {
          // 忽略序列化错误
        }
        return res;
      }
    } catch (err) {
      // 有些宿主在业务失败时会以 reject({status, retcode, message}) 的形式返回（NapCat）
      // 把这类业务错误当作有效返回，交由上层业务逻辑处理，避免 noisy errors
      try {
        if (
          err &&
          typeof err === "object" &&
          (err.status || err.retcode || err.message)
        ) {
          // NapCat 业务错误对象（例如达到上限），作为业务返回处理，不记录 info 日志
          return err;
        }
      } catch (e2) {
        // ignore
      }

      // 序列化错误用于记录
      let serr;
      try {
        serr = JSON.stringify(err);
      } catch (e) {
        serr = String(err);
      }
      attempted.push({ name: c.name, error: serr });
    }
  }

  logger.error(
    `[SendLike][safeCallApi] no suitable api surface for action ${action}, attempted: ${JSON.stringify(
      attempted
    )}`
  );
  throw new Error(
    `no_api: cannot call action ${action} - unsupported host api surface`
  );
}

export default class LikeUtil {
  constructor(e) {
    this.e = e;
  }

  /**
   * 给用户点赞
   * @param {number} userId 用户QQ号
   * @param {number} times 点赞次数，默认10次
   * @returns {Promise<boolean>} 是否成功
   */
  async sendLike(userId, times = 10) {
    try {
      // 尝试 NapCat / OneBot 兼容的 send_like 接口
      const res = await safeCallApi(this.e, "send_like", {
        user_id: Number(userId),
        times: Number(times),
      });

      try {
        logger.info(
          `[SendLike][sendLike] user:${userId} times:${times} raw_response:${JSON.stringify(
            res
          )}`
        );
      } catch (e) {
        // ignore serialization errors
      }

      // 如果 NapCat 返回业务错误对象（status/retcode/message），把它作为业务结果返回
      if (
        res &&
        typeof res === "object" &&
        (res.status || res.retcode || res.message)
      ) {
        return { success: false, nap: res };
      }

      return { success: true, data: res };
    } catch (error) {
      logger.error(`[SendLike] 点赞失败: ${error}`);
      return { success: false, error: String(error) };
    }
  }
  /**
   * 获取用户信息
   * @param {number} userId 用户QQ号
   */
  async getUserInfo(userId) {
    try {
      // NapCat / OneBot: get_stranger_info
      const res = await safeCallApi(this.e, "get_stranger_info", {
        user_id: Number(userId),
      });
      // 如果是 NapCat 错误对象，返回 null
      if (
        res &&
        typeof res === "object" &&
        (res.status || res.retcode || res.message)
      ) {
        return null;
      }
      // 兼容不同返回结构
      return res?.data || res || null;
    } catch (error) {
      logger.error(`[SendLike] 获取用户信息失败: ${error}`);
      return null;
    }
  }

  /**
   * 从消息中获取被@的用户列表
   * @returns {number[]} 用户QQ号列表
   */
  getAtUsers() {
    const atList = [];
    const messages = this.e?.message || [];
    for (const msg of messages) {
      if (msg.type === "at") {
        atList.push(Number(msg.qq));
      }
    }
    const botUin = this.e?.bot?.uin || (globalThis?.Bot?.uin ?? null);
    return atList.filter((qq) => qq !== botUin); // 过滤掉机器人自己
  }

  /**
   * 获取机器人收到的点赞列表
   */
  async getProfileLike() {
    try {
      const res = await safeCallApi(this.e, "get_profile_like", {});
      // 兼容 OneBot 风格返回
      const data = res?.data || res;
      return data?.favoriteInfo?.userInfos || data?.userInfos || [];
    } catch (error) {
      logger.error(`[SendLike] 获取点赞列表失败: ${error}`);
      return [];
    }
  }

  /**
   * 随机获取一条回复模板
   * @param {string} type 模板类型：success/limit/stranger
   * @param {Object} params 模板参数
   */
  getReplyTemplate(type, params = {}) {
    const templates = Config.get(`reply_templates.${type}`, []);
    if (templates.length === 0) return "操作完成";

    let template = lodash.sample(templates);
    for (const [key, value] of Object.entries(params)) {
      template = template.replace(`{${key}}`, value);
    }
    return template;
  }
}
