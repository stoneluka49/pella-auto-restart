import fetch from "node-fetch";

// ===== 配置 =====
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

async function login(email, password) {
  const BASE = "https://clerk.pella.app/v1/client";
  const API_VERSION = "2025-11-10";
  const JS_VERSION = "5.125.3";

  const commonHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://www.pella.app",
    "Referer": "https://www.pella.app/",
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*"
  };

  // ===== 1. 登录 =====
  const res = await fetch(
    `${BASE}/sign_ins?__clerk_api_version=${API_VERSION}&_clerk_js_version=${JS_VERSION}`,
    {
      method: "POST",
      headers: commonHeaders,
      body: new URLSearchParams({
        identifier: email,
        password: password,
        strategy: "password"
      })
    }
  );

  if (!res.ok) {
    throw new Error("登录失败");
  }

  const data = await res.json();

  let sessionId =
    data.response?.created_session_id ||
    data.client?.sessions?.[0]?.id;

  let token =
    data.client?.sessions?.[0]?.last_active_token?.jwt;

  const cookies = res.headers.get("set-cookie") || "";
  const clientCookie = cookies.match(/__client=([^;]+)/)?.[1];

  // ===== 2. 如果没 token → touch =====
  if (!token && sessionId) {
    const touch = await fetch(
      `${BASE}/sessions/${sessionId}/touch?__clerk_api_version=${API_VERSION}&_clerk_js_version=${JS_VERSION}`,
      {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Cookie": clientCookie ? `__client=${clientCookie}` : ""
        }
      }
    );

    const t = await touch.json();

    token =
      t.sessions?.[0]?.last_active_token?.jwt ||
      t.last_active_token?.jwt;
  }

  // ===== 3. 再兜底 tokens =====
  if (!token && sessionId) {
    const tk = await fetch(
      `${BASE}/sessions/${sessionId}/tokens?__clerk_api_version=${API_VERSION}&_clerk_js_version=${JS_VERSION}`,
      {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Cookie": clientCookie ? `__client=${clientCookie}` : ""
        }
      }
    );

    const tkData = await tk.json();
    token = tkData.jwt;
  }

  if (!token) {
    throw new Error("获取 token 失败");
  }

  return { token, sessionId, clientCookie };
}

const { token } = await login(email, password);

// ===== 获取服务器 =====
async function getServers(token) {
  const res = await fetch("https://api.pella.app/server/list", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  return await res.json();
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
    const auth = await login(account.email, account.password);

    if (!auth.token) throw new Error("登录失败");

    const token = auth.token;
    const servers = await getServers(token);

    for (const server of servers) {
      try {
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
    report.push(`❌ ${account.email} 登录失败`);
  }

  return report;
}

// ===== 入口 =====
(async () => {
  const accounts = ACCOUNT_JSON.split("\n").map(line => {
    const [email, password] = line.split("-----");
    return { email, password };
  });

  let finalReport = [];

  for (const acc of accounts) {
    const res = await processAccount(acc);
    finalReport.push(...res);
  }

  await sendTG("🔔 <b>Pella 自动化报告</b>\n\n" + finalReport.join("\n"));
})();
