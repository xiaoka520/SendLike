import { segment } from "icqq";
import lodash from "lodash";
import Config from "../config/config.js";

function safeCallApi(e, action, params) {
  // 尝试常见宿主提供的 API 调用入口
  try {
    const host = e || globalThis || {};
    if (host.app && typeof host.app.callApi === "function") {
      return host.app.callApi(action, params);
    }
    if (host.client && typeof host.client.callApi === "function") {
      return host.client.callApi(action, params);
    }
    if (host.bot && typeof host.bot.callApi === "function") {
      return host.bot.callApi(action, params);
    }
    // 某些环境提供直接的 http 请求方法
    if (host.app && typeof host.app.httpPost === "function") {
      return host.app.httpPost(`/api/${action}`, params);
    }
  } catch (err) {
    // 交给上层捕获并记录
    throw err;
  }

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
