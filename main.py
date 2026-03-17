import os
import json
import time
import requests

def send_tg_notification(message):
    bot_token = os.getenv('TG_BOT_TOKEN')
    chat_id = os.getenv('TG_CHAT_ID')
    if not bot_token or not chat_id:
        print("⚠️ 未配置 TG 通知变量，跳过通知")
        return

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    try:
        requests.post(url, json=payload, timeout=10)
        print("✅ TG 通知已发送")
    except Exception as e:
        print(f"❌ TG 通知发送失败: {e}")

def process_pella():
    account_raw = os.getenv('ACCOUNT_JSON', '[]')
    accounts = []
    # 兼容处理
    if account_raw.strip().startswith('['):
        accounts = json.loads(account_raw)
    else:
        for line in account_raw.strip().split('\n'):
            if '-----' in line:
                u, p = line.split('-----')
                accounts.append({"email": u.strip(), "password": p.strip()})

    report = []
    total_start = 0
    total_redeploy = 0

    for acc in accounts:
        email = acc.get('email')
        password = acc.get('password')
        print(f"\n👤 处理账号: {email}")
        
        try:
            # 登录
            login_url = "https://clerk.pella.app/v1/client/sign_ins?__clerk_api_version=2025-11-10"
            login_res = requests.post(login_url, data={"identifier": email, "password": password, "strategy": "password"})
            token = login_res.json().get('client', {}).get('sessions', [{}])[0].get('last_active_token', {}).get('jwt')
            
            if not token:
                report.append(f"👤 {email}: ❌ 登录失败")
                continue

            headers = {"Authorization": f"Bearer {token}"}
            server_res = requests.get("https://api.pella.app/user/servers", headers=headers)
            servers = server_res.json().get('servers', [])

            s_start = 0
            s_redeploy = 0
            for s in servers:
                status = s.get('status', '').lower()
                is_offline = status == 'offline' or s.get('suspended') is True
                action = "start" if is_offline else "redeploy"
                
                action_res = requests.post(f"https://api.pella.app/server/{action}?id={s.get('id')}", headers=headers, json={})
                if action_res.status_code == 200:
                    if is_offline: s_start += 1
                    else: s_redeploy += 1
                time.sleep(1)

            report.append(f"👤 {email}: ✅ Start({s_start}) | Redp({s_redeploy})")
            total_start += s_start
            total_redeploy += s_redeploy

        except Exception as e:
            report.append(f"👤 {email}: ❌ 出错: {str(e)}")

    # 汇总消息发送 TG
    if report:
        msg = f"🚀 <b>Pella GitHub 自动拉起任务</b>\n\n"
        msg += "\n".join(report)
        msg += f"\n\n📊 <b>汇总</b>: 启动:{total_start} | 重部署:{total_redeploy}"
        send_tg_notification(msg)

if __name__ == "__main__":
    process_pella()
