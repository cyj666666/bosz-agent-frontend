/**
 * 路由配置 — 所有页面路由集中定义
 *
 * 路由表（宿主）：
 *   /login          → 登录页（独立布局，无需认证）
 *   /               → 重定向到 /reports（需认证）
 *   /reports        → 报告列表
 *   /report/:id     → 报告详情
 *   /users          → 用户管理（系统管理）
 *   /roles          → 角色管理（系统管理）
 *
 * agent 模块路由由 src/agent 统一提供（/agent/*），在此展开挂载。
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import AuthGuard from '../components/layout/AuthGuard';
import Login from '../pages/Login';
import ReportList from '../pages/report/ReportList';
import ReportView from '../pages/report/ReportView';
import UserList from '../pages/system/UserList';
import RoleList from '../pages/system/RoleList';
import NotFound from '../pages/exception/NotFound';
import { agentRoutes } from '../agent';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <AuthGuard><MainLayout /></AuthGuard>,
    children: [
      { index: true, element: <Navigate to="/reports" replace /> },
      { path: 'reports', element: <ReportList /> },
      { path: 'report/:id', element: <ReportView /> },
      { path: 'users', element: <UserList /> },
      { path: 'roles', element: <RoleList /> },
      // ---- agent 模块（/agent/*），新增页面只需改 src/agent/routes.tsx ----
      ...agentRoutes,
      // 兜底 404：必须在所有具体路由之后
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default router;
