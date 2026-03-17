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
                
                # --- 第一步：输入邮箱并点击下一步 ---
                email_input = page.get_by_label("Email address")
                await email_input.wait_for(state="visible", timeout=30000)
                await email_input.fill(acc['email'])
                
                # 使用类名锁定主按钮，避开 Google 登录按钮
                continue_btn = page.locator('button.cl-formButtonPrimary')
                await continue_btn.click()
                
                # --- 第二步：输入密码并提交 ---
                print("  等待密码输入框...")
                # 对应你截图中 Password 下方的输入框
                pwd_input = page.locator('input[name="password"]')
                await pwd_input.wait_for(state="visible", timeout=20000)
                await pwd_input.fill(acc['password'])
                
                # 再次点击主提交按钮进入 Dashboard
                await continue_btn.click()
                
                # --- 第三步：Dashboard 自动化点击 ---
                print("  正在跳转 Dashboard...")
                await page.wait_for_url("**/dashboard**", timeout=40000)
                await asyncio.sleep(10) # 给予充足的列表渲染时间

                # 查找 START 或 RESTART 按钮并点击
                buttons = page.get_by_role("button")
                btn_count = await buttons.count()
                clicked = 0
                
                for i in range(btn_count):
                    btn = buttons.nth(i)
                    text = await btn.inner_text()
                    if any(x in text.upper() for x in ["START", "RESTART"]):
                        print(f"  执行维护操作: {text}")
                        await btn.click()
                        clicked += 1
                        await asyncio.sleep(5)

                report.append(f"👤 {acc['email']}: ✅ 已点击 {clicked} 个服务")
            
            except Exception as e:
                print(f"❌ {acc['email']} 操作失败: {str(e)}")
                report.append(f"👤 {acc['email']}: ❌ 失败")
            finally:
                await page.close()

        await browser.close()
        if report:
            send_tg("🔔 <b>Pella UI 自动化报告</b>\n\n" + "\n".join(report))

if __name__ == "__main__":
    asyncio.run(solve_pella())
