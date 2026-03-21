import { chromium } from "playwright";

const ACCOUNT_JSON = process.env.ACCOUNT_JSON;

async function processAccount(account) {
  console.log("\n====================");
  console.log("📧 账号:", account.email);

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
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

    // ===== 4. 等待进入 dashboard =====
   await page.waitForLoadState("networkidle");

try {
  await page.waitForSelector("text=Your Projects", { timeout: 15000 });
} catch {
  console.log("⚠️ 未找到项目列表，使用延时兜底");
  await page.waitForTimeout(8000);
}

    console.log("✅ 登录成功");

    // ===== 5. 等待页面加载（关键）=====
    await page.waitForTimeout(8000);

    // ===== 6. 点击第一个项目 =====
    const project = page.locator('div:has-text("Your Projects") ~ div >> div').first();

    if (await project.isVisible()) {
      await project.click();
      console.log("📂 进入项目");
    }

    await page.waitForTimeout(8000);

    // ===== 7. 进入 renew 页面（关键）=====
    await page.goto("https://www.pella.app/renew", {
      waitUntil: "networkidle"
    });

    console.log("🔄 进入 renew 页面，触发广告刷新");

    await page.waitForTimeout(10000);

    // ===== 8. 抓取所有 renew 链接 =====
    const links = await page.$$eval("a[href*='/renew/']", els =>
      els.map(e => e.href)
    );

    const uniqueLinks = [...new Set(links)];

    console.log("🎯 找到续期链接:", uniqueLinks.length);

    // ===== 9. 逐个访问 =====
    for (const link of uniqueLinks) {
      console.log("👉 访问:", link);

      const newPage = await context.newPage();

      try {
        await newPage.goto(link, { waitUntil: "domcontentloaded" });

        // 等广告/验证
        await newPage.waitForTimeout(8000);

        console.log("✅ 已触发广告");

      } catch (e) {
        console.log("❌ 访问失败");
      }

      await newPage.close();
      await page.waitForTimeout(3000);
    }

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
