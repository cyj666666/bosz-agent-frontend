/**
 * 路由守卫 — 未登录重定向到 /login，无菜单权限时重定向到 /reports
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token);
  const menus = useAppStore((s) => s.menus);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 根据菜单权限判断：当前路径是否在允许的菜单列表中
  const path = location.pathname;
  const allowed = menus.some(m => path === m || path.startsWith(m + '/'));
  if (path !== '/' && path !== '/reports' && path !== '/login' && !allowed) {
    return <Navigate to="/reports" replace />;
  }

  return <>{children}</>;
}