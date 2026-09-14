/**
 * 路由守卫 — 未登录重定向到 /login，无菜单权限时重定向到 /reports
 *
 * 菜单键解析说明：
 *   明细页（如 /report/123）自身不在菜单白名单里，必须通过 DETAIL_PARENT 映射回所属菜单键再判权限，
 *   否则会出现"非 admin 用户打开报告详情被弹回列表"的 bug。
 *   agent 模块的明细页登记在 src/agent 的 agentDetailParents，宿主无需改动本文件。
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import { agentDetailParents } from '../../agent';

/** 明细页路径前缀 → 所属菜单键（宿主 + agent 模块都登记在这里） */
const DETAIL_PARENT: Record<string, string> = {
  '/report': '/reports',
  ...agentDetailParents,
};

/** 无需菜单权限即可访问的路径 */
const ALWAYS_ALLOWED = ['/'];

/** 把路径解析成用于权限判断的菜单键 */
function resolveMenuKey(path: string): string {
  const first = '/' + (path.split('/')[1] || '');
  return DETAIL_PARENT[first] ?? first;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token);
  const menus = useAppStore((s) => s.menus);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // admin 全权限标记，不拦截任何路径
  if (menus.includes('*')) return <>{children}</>;

  const path = location.pathname;
  if (ALWAYS_ALLOWED.includes(path)) return <>{children}</>;

  const menuKey = resolveMenuKey(path);
  const allowed = (menus || []).some(
    (m) => path === m || path.startsWith(m + '/') || menuKey === m,
  );

  if (!allowed) {
    return <Navigate to="/reports" replace />;
  }

  return <>{children}</>;
}
