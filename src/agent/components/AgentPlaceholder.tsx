/**
 * agent 模块 — 页面骨架占位组件
 *
 * 用途：在真实页面实现前，先把「路由 → 菜单 → 权限」这条链路打通并可验证。
 * 每个真实页面落地后，替换掉对应页面文件里的这个占位组件即可。
 */
export default function AgentPlaceholder({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: '#8c8c8c', margin: 0 }}>
        {note || '页面骨架已就绪，业务实现待接入。'}
      </p>
    </div>
  );
}
