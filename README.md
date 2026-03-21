Pella Auto Restart
这是一个基于 GitHub Actions 的自动化重启脚本项目。支持定时运行（Cron）、手动触发（Workflow Dispatch）以及通过 Cloudflare Workers 远程 API 触发。

🚀 功能特性
多模式触发：支持定时任务、手动点击以及远程 HTTP 调用。

环境隔离：使用 GitHub Secrets 安全管理敏感信息。

轻量化：基于 Node.js 20 环境运行。

CF Worker 集成：通过简单的 API 调用即可随时随地重启服务。

🛠️ 配置步骤
1. 设置 GitHub Secrets
在你的 GitHub 仓库中，前往 Settings > Secrets and variables > Actions，添加以下环境变量：

变量名	说明
TG_BOT_TOKEN	Telegram 机器人的 Token
TG_CHAT_ID	接收通知的 Telegram 会话 ID
ACCOUNT_JSON	账号信息的 JSON 字符串
GH_PAT	(可选) 具有 Actions 权限的个人访问令牌（用于远程触发）


示例
#ACCOUNT_JSON
email1-----password1
email2-----password2
#TG_BOT_TOKEN
你的Telegram Bot Token
#TG_CHAT_ID
你的聊天ID
2. GitHub Action 配置
确保你的 .github/workflows/pella-restart.yml 包含以下触发器：

YAML
on:
  workflow_dispatch:   # 手动触发
  repository_dispatch: # 远程触发接口
    types: [pella-restart-event]
🌐 远程触发 (Cloudflare Workers)
你可以部署一个 Cloudflare Worker 来实现“一键重启”或对接其他 Webhook。


📦 本地开发
克隆仓库

Bash
git clone https://github.com/your-username/pella-auto-restart.git
cd pella-auto-restart
安装依赖

Bash
npm install
运行测试
确保你本地配置了对应的环境变量，然后执行：

Bash
node index.js



