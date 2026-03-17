import fetch from "node-fetch";

// ===== 环境变量 =====
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const ACCOUNT_JSON = process.env.ACCOUNT_JSON;

// ===== TG通知 =====
async function sendTG(msg) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: msg,
      parse_mode: "HTML"
    })
  });
}

// ===== 登录 =====
async function login(email, password) {
  const BASE = "https://clerk.pella.app/v1/client";
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://www.pella.app",
    "Referer": "https://www.pella.app/",
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*"
  };

  console.log(`🔐 登录: ${email}`);

  const res = await fetch(`${BASE}/sign_ins`, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      identifier: email,
      password: password,
      strategy: "password"
    })
  });

  const text = await res.text();

  if (text.startsWith("<!DOCTYPE")) {
    throw new Error("被 Cloudflare 拦截");
  }

  const data = JSON.parse(text);

  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  let token =
    data.client?.sessions?.[0]?.last_active_token?.jwt;

  if (!token) throw new Error("token获取失败");

  console.log("✅ token OK 长度:", token.length);

  return { token };
}

// ===== 获取服务器 =====
async function getServers(token) {
  const res = await fetch("https://api.pella.app/user/servers", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const text = await res.text();

  console.log("📦 server/list:", text.slice(0, 200));

  const data = JSON.parse(text);

  return data.servers || [];
}

// ===== 操作请求（统一封装）=====
async function doAction(url, token, serverId) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://www.pella.app"
    },
    body: JSON.stringify({ serverId })
  });

  const text = await res.text();

  console.log("📡 API返回:", url, text);

  return {
    ok: res.ok,
    body: text
  };
}

// ===== 主逻辑 =====
async function processAccount(account) {
  let report = [];

  try {
    console.log("\n========================");
    console.log("📧 账号:", account.email);

    const { token } = await login(account.email, account.password);

    let servers = await getServers(token);

    console.log("📊 服务器数量:", servers.length);

    for (const server of servers) {
      console.log("\n👉 处理:", server.id);
      console.log("   当前状态:", server.status);

      try {
        let action;

        if (server.status === "OFFLINE") {
          action = "start";
          await doAction("https://api.pella.app/server/start", token, server.id);
        } else {
          action = "restart";
          await doAction("https://api.pella.app/server/redeploy", token, server.id);
        }

        // ===== 等待执行 =====
        console.log("⏳ 等待5秒...");
        await new Promise(r => setTimeout(r, 5000));

        // ===== 再查状态（关键）=====
        const newServers = await getServers(token);
        const updated = newServers.find(s => s.id === server.id);

        console.log("🧪 操作后状态:", updated?.status);

        if (updated?.status === server.status) {
          report.push(`⚠️ ${account.email} ${server.id} ${action}无变化`);
        } else {
          report.push(`✅ ${account.email} ${server.id} ${action}成功`);
        }

      } catch (e) {
        console.log("❌ 操作异常:", e.message);
        report.push(`❌ ${account.email} ${server.id} 失败`);
      }
    }

  } catch (err) {
    console.log("❌ 总错误:", err.message);
    report.push(`❌ ${account.email} 失败: ${err.message}`);
  }

  return report;
}

// ===== 入口 =====
(async () => {
  const accounts = ACCOUNT_JSON
    .split("\n")
    .filter(line => line.includes("-----"))
    .map(line => {
      const [email, password] = line.split("-----");
      return {
        email: email.trim(),
        password: password.trim()
      };
    });

  let finalReport = [];

  for (const acc of accounts) {
    const res = await processAccount(acc);
    finalReport.push(...res);
  }

  const msg = "🔔 <b>Pella 自动化报告</b>\n\n" + finalReport.join("\n");

  console.log(msg);
  await sendTG(msg);
})();
