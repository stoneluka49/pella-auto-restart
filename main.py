import os
import json
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
        # 模拟真实浏览器特征
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        
        report = []
        for acc in accounts:
            page = await context.new_page()
            try:
                print(f"🚀 正在登录: {acc['email']}")
                await page.goto("https://pella.app/login", wait_until="networkidle")
                
                # --- 第一步：输入邮箱 ---
                # 对应你截图中红框的 Email address 输入框
                await page.fill('input[type="email"]', acc['email'])
                # 点击 Continue 按钮
                await page.click('button:has-text("Continue")')
                
                # --- 第二步：输入密码 ---
                # 等待密码输入框出现
                await page.wait_for_selector('input[type="password"]', timeout=15000)
                await page.fill('input[type="password"]', acc['password'])
                # 再次点击 Continue 登录
                await page.click('button:has-text("Continue")')
                
                # --- 第三步：进入面板并点击 ---
                await page.wait_for_url("**/dashboard**", timeout=30000)
                await asyncio.sleep(8) # 等待列表完全加载
                
                # 查找所有可用按钮
                all_buttons = await page.get_by_role("button").all()
                clicked = 0
                for btn in all_buttons:
                    txt = (await btn.inner_text()).upper()
                    if "START" in txt or "RESTART" in txt:
                        print(f"  点击按钮: {txt}")
                        await btn.click()
                        clicked += 1
                        await asyncio.sleep(3)
                
                report.append(f"👤 {acc['email']}: ✅ 已点击 {clicked} 个服务")
            except Exception as e:
                print(f"操作失败: {e}")
                report.append(f"👤 {acc['email']}: ❌ 失败 (界面可能已变动)")
            finally:
                await page.close()

        await browser.close()
        if report:
            send_tg("🔔 <b>Pella 自动化执行报告</b>\n\n" + "\n".join(report))

if __name__ == "__main__":
    asyncio.run(solve_pella())
