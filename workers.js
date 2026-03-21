/**
 * Pella 隧道哨兵 - GitHub 触发版
 */
const CONFIG = {
  ARGO_DOMAIN: 'your-argo-domain.com', 
  GITHUB_REPO: 'your-name/your-repo', 
  GITHUB_TOKEN: 'ghp_xxxxxxxxxxxx',    // GitHub PAT
  EVENT_TYPE: 'pella_trigger'          // 必须与 GitHub Workflow 对应
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/check' || url.pathname === '/run') {
      ctx.waitUntil(monitor(env));
      return new Response('Manual check triggered. Check CF logs.');
    }
    return new Response('Sentry is active.');
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(monitor(env));
  }
};

async function monitor(env) {
  const domain = env.ARGO_DOMAIN || CONFIG.ARGO_DOMAIN;
  console.log(`[Monitor] 正在检查: ${domain}`);

  try {
    const res = await fetch(`https://${domain}`, { 
      method: 'GET',
      headers: { 'User-Agent': 'CF-Worker-Monitor' }
    });

    // 监控核心状态码
    if ([521, 522, 530].includes(res.status)) {
      console.log(`🚨 隧道异常 (Code: ${res.status})，通知 GitHub Actions...`);
      await triggerGitHub(env);
    } else {
      console.log(`✅ 隧道正常 (Code: ${res.status})`);
    }
  } catch (e) {
    console.log(`🚨 连接彻底失败，触发 GitHub: ${e.message}`);
    await triggerGitHub(env);
  }
}

async function triggerGitHub(env) {
  const repo = env.GITHUB_REPO || CONFIG.GITHUB_REPO;
  const token = env.GITHUB_TOKEN || CONFIG.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${repo}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CF-Worker-Trigger',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ event_type: CONFIG.EVENT_TYPE })
  });

  if (res.ok) {
    console.log('🚀 GitHub Action 触发指令已发送！');
  } else {
    console.error('❌ GitHub 触发失败:', await res.text());
  }
}
