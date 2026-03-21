import { chromium } from "playwright";
import fetch from "node-fetch";

// ===== 环境变量 =====
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const ACCOUNT_JSON = process.env.ACCOUNT_JSON;

// ===== TG发送图片 =====
async function sendTGPhoto(buffer, caption) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  const formData = new FormData();
  formData.append("chat_id", TG_CHAT_ID);
  formData.append("caption", caption);
  formData.append("photo", buffer, "screenshot.png");

  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: formData
  });
}

// ===== 主流程 =====
async function processAccount(account) {
  console.log("\n====================");
  console.log("📧 账号:", account.email);

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    // ===== 1. 打开登录页 =====
    await page.goto("https://www.pella.app/login", {
      waitUntil: "networkidle"
    });

    // ===== 2. 输入邮箱 =====
    await page.getByLabel("Email address").fill(account.email);
    await page.click('button.cl-formButtonPrimary');

    // ===== 3. 输入密码 =====
    await page.waitForSelector('input[name="password"]', { timeout: 20000 });
    await page.fill('input[name="password"]', account.password);
    await page.click('button.cl-formButtonPrimary');

    // ===== 4. 等待登录完成（兼容 home/dashboard）=====
    await page.waitForLoadState("networkidle");

    try {
      await page.waitForSelector("text=Your Projects", { timeout: 15000 });
    } catch {
      console.log("⚠️ 未检测到项目列表，使用延时兜底");
      await page.waitForTimeout(8000);
    }

    console.log("✅ 登录成功");

    // ===== 5. 点击项目 =====
    const project = page.locator('div:has-text("Your Projects") ~ div >> div').first();

    if (await project.isVisible()) {
      await project.click();
      console.log("📂 已进入项目");
    } else {
      console.log("⚠️ 未找到项目卡片");
    }

    // ===== 6. 等待项目页面 =====
    await page.waitForTimeout(8000);

    // ===== 7. 滚动到广告区域（可选）=====
    await page.evaluate(() => window.scrollBy(0, 500));

    await page.waitForTimeout(2000);

    // ===== 8. 截图 =====
    const screenshot = await page.screenshot({ fullPage: true });

    console.log("📸 截图完成");

    // ===== 9. TG发送 =====
    await sendTGPhoto(
      screenshot,
      `📋 Pella 登录截图\n账号: ${account.email}`
    );

  } catch (e) {
    console.log("❌ 错误:", e.message);
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
