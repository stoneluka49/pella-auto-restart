import { chromium } from "playwright";
import fetch from "node-fetch";

// ===== TG 配置 =====
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

async function sendTG(message) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: message
    })
  });
}

const ACCOUNT_JSON = process.env.ACCOUNT_JSON;

async function processAccount(account) {
  console.log("\n====================");
  console.log("📧 账号:", account.email);

  let claimCount = 0;

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ===== 登录 =====
    await page.goto("https://www.pella.app/login", {
      waitUntil: "networkidle"
    });

    await page.getByLabel("Email address").fill(account.email);
    await page.click('button.cl-formButtonPrimary');

    await page.waitForSelector('input[name="password"]', { timeout: 20000 });
    await page.fill('input[name="password"]', account.password);
    await page.click('button.cl-formButtonPrimary');

    await page.waitForLoadState("networkidle");

    try {
      await page.waitForSelector("text=Your Projects", { timeout: 15000 });
    } catch {
      await page.waitForTimeout(8000);
    }

    console.log("✅ 登录成功");

    // ===== 点击项目 =====
    const project = page.locator('div:has-text("Your Projects") ~ div >> div').first();

    if (await project.isVisible()) {
      await project.click();
      console.log("📂 进入项目");
    }

    await page.waitForTimeout(5000);

    // ===== 进入 renew =====
    await page.goto("https://www.pella.app/renew", {
      waitUntil: "networkidle"
    });

    console.log("🔄 进入 renew 页面");

    await page.waitForTimeout(8000);

    // ===== 查找 Claim 按钮 =====
    const buttons = page.locator("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = await btn.innerText();

      if (text.includes("Claim")) {
        claimCount++;

        console.log("👉 点击:", text);

        try {
          const [newPage] = await Promise.all([
            context.waitForEvent("page"),
            btn.click()
          ]);

          await newPage.waitForLoadState();
          await newPage.waitForTimeout(8000);
          await newPage.close();

        } catch {
          // fallback（有些不会开新页）
          await btn.click();
          await page.waitForTimeout(8000);
        }
      }
    }

    console.log("🎯 总点击:", claimCount);

    // ===== TG 通知 =====
    await sendTG(`✅ Pella完成
账号: ${account.email}
点击Claim: ${claimCount}`);

  } catch (e) {
    console.log("❌ 错误:", e.message);

    await sendTG(`❌ Pella失败
账号: ${account.email}
错误: ${e.message}`);
  }

  await browser.close();
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

  for (const acc of accounts) {
    await processAccount(acc);
  }
})();
