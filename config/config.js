import YAML from "yaml";
import fs from "fs";
import chokidar from "chokidar";
import lodash from "lodash";

const _path = process.cwd();
const configPath = `${_path}/plugins/send-like/config/config.yaml`;

class Config {
  constructor() {
    this.config = {
      enable_white_list: false,
      white_list_groups: [],
      subscribed_users: [],
      last_like_date: "",
      reply_templates: {
        success: [],
        limit: [],
        stranger: [],
      },
    };
  }

  // 获取配置
  get(key, defaultValue) {
    return lodash.get(this.config, key, defaultValue);
  }

  // 设置配置
  set(key, value) {
    lodash.set(this.config, key, value);
  }

  // 保存配置
  async save() {
    const yaml = YAML.stringify(this.config);
    fs.writeFileSync(configPath, yaml, "utf8");
  }

  // 加载配置
  async load() {
    try {
      if (fs.existsSync(configPath)) {
        const yaml = fs.readFileSync(configPath, "utf8");
        this.config = YAML.parse(yaml);
      } else {
        await this.save(); // 保存默认配置
      }
    } catch (error) {
      console.error(`[SendLike] 加载配置文件失败: ${error}`);
    }
  }

  // 监听配置文件变化
  watch() {
    const watcher = chokidar.watch(configPath);
    watcher.on("change", (path) => {
      logger.info(`[SendLike] 配置文件已修改: ${path}`);
      this.load();
    });
  }

  async init() {
    await this.load();
    this.watch();
  }
}

export default new Config();
