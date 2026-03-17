import os
import asyncio
from playwright.async_api import async_playwright
import requests

def send_tg(msg):
    token = os.getenv('TG_BOT_TOKEN')
    chat_id = os.getenv('TG_CHAT_ID')
    if token and chat_id:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"})

async def solve_pella():
    account_raw = os.getenv('ACCOUNT_JSON', '')
    accounts = []
    for line in account_raw.strip().split('\n'):
        if '-----' in line:
            u, p = line.split('-----')
            accounts.append({"email": u.strip(), "password": p.strip()})
    
    if not accounts: return print("❌ 未配置账号")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        
        report = []
        for acc in accounts:
            page = await context.new_page()
            try:
                print(f"🚀 正在登录: {acc['email']}")
                await page.goto("https://pella.app/login", wait_until="networkidle", timeout=60000)
                
                # --- 第一步：输入邮箱 ---
                await page.get_by_label("Email address").fill(acc['email'])
                await page.locator('button.cl-formButtonPrimary').click()
                
                # --- 第二步：输入密码 ---
                pwd_input = page.locator('input[name="password"]')
                await pwd_input.wait_for(state="visible", timeout=20000)
                await pwd_input.fill(acc['password'])
                await page.locator('button.cl-formButtonPrimary').click()
                
                # --- 第三步：处理项目列表 (针对你最新截图的修改) ---
                print("  正在进入项目列表...")
                await page.wait_for_url("**/dashboard**", timeout=45000)
                await asyncio.sleep(8) # 等待列表加载
                
                # 定位 "Your Projects" 下的项目卡片并点击
                # 优先级：寻找包含 "Unnamed" 或 "Server hosted" 字样的卡片
                project_card = page.locator('div:has-text("Your Projects") ~ div >> div').first
                if await project_card.is_visible():
                    print("  点击进入项目详情...")
                    await project_card.click()
                else:
                    # 备选方案：直接点击页面上第一个看起来像卡片的 div
                    await page.click('div[class*="cursor-pointer"]')

                # --- 第四步：服务器管理页点击 ---
                await asyncio.sleep(8) # 等待管理页加载
                print("  正在执行启动/维护操作...")
                
                buttons = page.get_by_role("button")
                btn_count = await buttons.count()
                clicked = 0
                
                for i in range(btn_count):
                    btn = buttons.nth(i)
                    text = await btn.inner_text()
                    # 匹配 START, RESTART, 或图片中显示的启动逻辑
                    if any(x in text.upper() for x in ["START", "RESTART"]):
                        print(f"  点击按钮: {text}")
                        await btn.click()
                        clicked += 1
                        await asyncio.sleep(5)

                report.append(f"👤 {acc['email']}: ✅ 成功进入项目并点击 {clicked} 次")
            
            except Exception as e:
                print(f"❌ {acc['email']} 失败: {str(e)}")
                report.append(f"👤 {acc['email']}: ❌ 失败 (可能卡在项目选择页)")
            finally:
                await page.close()

        await browser.close()
        if report:
            send_tg("🔔 <b>Pella UI 自动化报告</b>\n\n" + "\n".join(report))

if __name__ == "__main__":
    asyncio.run(solve_pella())
