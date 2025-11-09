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

  // 打印可用表面信息，帮助排查
  try {
    const surfaces = {};
    for (const h of hostsToInspect) {
      surfaces[h.name] = inspect(h.obj) || null;
    }
    logger.info(
      `[SendLike][safeCallApi] inspect surfaces: ${JSON.stringify(surfaces)}`
    );
  } catch (err) {
    logger.info(`[SendLike][safeCallApi] inspect failed: ${err}`);
  }

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
        logger.info(`[SendLike][safeCallApi] succeeded via ${c.name}`);
        return res;
      }
    } catch (err) {
      attempted.push({ name: c.name, error: String(err) });
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
      await safeCallApi(this.e, "send_like", {
        user_id: Number(userId),
        times: Number(times),
      });
      return true;
    } catch (error) {
      logger.error(`[SendLike] 点赞失败: ${error}`);
      return false;
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
