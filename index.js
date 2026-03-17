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

// ===== 登录（增强调试版）=====
async function login(email, password) {
  const BASE = "https://clerk.pella.app/v1/client";
  const API_VERSION = "2025-11-10";
  const JS_VERSION = "5.125.3";

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://www.pella.app",
    "Referer": "https://www.pella.app/",
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*"
  };

  console.log(`🔐 正在登录: ${email}`);

  const res = await fetch(
    `${BASE}/sign_ins?__clerk_api_version=${API_VERSION}&_clerk_js_version=${JS_VERSION}`,
    {
      method: "POST",
      headers,
      body: new URLSearchParams({
        identifier: email,
        password: password,
        strategy: "password"
      })
    }
  );

  const text = await res.text();

  // 🔥 防 Cloudflare / HTML 返回
  if (text.startsWith("<!DOCTYPE")) {
    throw new Error("被 Cloudflare 拦截（返回 HTML）");
  }

  const data = JSON.parse(text);

  console.log("📦 登录返回:", JSON.stringify(data).slice(0, 300));

  if (data.errors) {
    throw new Error("登录失败: " + JSON.stringify(data.errors));
  }

  let sessionId =
    data.response?.created_session_id ||
    data.client?.sessions?.[0]?.id;

  let token =
    data.client?.sessions?.[0]?.last_active_token?.jwt;

  const cookies = res.headers.get("set-cookie") || "";
  const clientCookie = cookies.match(/__client=([^;]+)/)?.[1];

  // ===== touch =====
  if (!token && sessionId) {
    console.log("🔄 尝试 touch 获取 token");

    const touchRes = await fetch(
      `${BASE}/sessions/${sessionId}/touch?__clerk_api_version=${API_VERSION}&_clerk_js_version=${JS_VERSION}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Cookie": clientCookie ? `__client=${clientCookie}` : ""
        }
      }
    );

    const touchData = await touchRes.json();

    token =
      touchData.sessions?.[0]?.last_active_token?.jwt ||
      touchData.last_active_token?.jwt;
  }

  // ===== tokens =====
  if (!token && sessionId) {
    console.log("🔄 尝试 tokens 获取 token");

    const tkRes = await fetch(
      `${BASE}/sessions/${sessionId}/tokens?__clerk_api_version=${API_VERSION}&_clerk_js_version=${JS_VERSION}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Cookie": clientCookie ? `__client=${clientCookie}` : ""
        }
      }
    );

    const tkData = await tkRes.json();
    token = tkData.jwt;
  }

  if (!token) {
    throw new Error("获取 token 失败");
  }

  console.log("✅ token 获取成功");

  return { token };
}

// ===== 获取服务器 =====
async function getServers(token) {
  const res = await fetch("https://api.pella.app/server/list", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const text = await res.text();

  console.log("📦 server/list 原始返回:", text.slice(0, 300));

  if (text.startsWith("<!DOCTYPE")) {
    throw new Error("server/list 被拦截（Cloudflare）");
  }

  const data = JSON.parse(text);

  // 🔥 兼容不同结构
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.servers)) return data.servers;

  // ❗ 如果不是数组，直接报错
  throw new Error("server/list 返回异常: " + text.slice(0, 200));
}

// ===== 启动 =====
async function startServer(token, serverId) {
  return fetch("https://api.pella.app/server/start", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Origin": "https://www.pella.app"
    },
    body: JSON.stringify({ serverId })
  });
}

// ===== 重启 =====
async function restartServer(token, serverId) {
  return fetch("https://api.pella.app/server/redeploy", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Origin": "https://www.pella.app"
    },
    body: JSON.stringify({ serverId })
  });
}

// ===== 主逻辑 =====
async function processAccount(account) {
  let report = [];

  try {
    console.log("📧 账号:", account.email);

    const { token } = await login(account.email, account.password);

    const servers = await getServers(token);

    console.log("📊 服务器数量:", servers.length);

    for (const server of servers) {
      try {
        console.log("👉 处理:", server.id, server.status);

        if (server.status === "STOPPED") {
          await startServer(token, server.id);
          report.push(`🟢 ${account.email} 启动 ${server.id}`);
        } else {
          await restartServer(token, server.id);
          report.push(`🔄 ${account.email} 重启 ${server.id}`);
        }

        await new Promise(r => setTimeout(r, 3000));

      } catch (e) {
        report.push(`❌ ${account.email} ${server.id} 失败`);
      }
    }

  } catch (err) {
    console.log("❌ 错误:", err.message);
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
