/**
 * 路由配置 — 所有页面路由集中定义
 *
 * 路由表：
 *   /login          → 登录页（独立布局，无需认证）
 *   /               → 重定向到 /reports（需认证）
 *   /reports        → 报告列表
 *   /report/:id     → 报告详情
 *   /report-create  → 一键生成报告
 *   /customers      → 客户管理
 *   /data-config    → 数据源配置
 *   /rules          → 知识库管理
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import AuthGuard from '../components/layout/AuthGuard';
import Login from '../pages/Login';
import ReportList from '../pages/report/ReportList';
import ReportView from '../pages/report/ReportView';
import ReportCreate from '../pages/report/ReportCreate';
import CustomerList from '../pages/data/CustomerList';
import DataConfig from '../pages/data/DataConfig';
import RuleList from '../pages/knowledge/RuleList';
import UserList from '../pages/system/UserList';
import RoleList from '../pages/system/RoleList';

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
      { path: 'report-create', element: <ReportCreate /> },
      { path: 'customers', element: <CustomerList /> },
      { path: 'data-config', element: <DataConfig /> },
      { path: 'rules', element: <RuleList /> },
      { path: 'users', element: <UserList /> },
      { path: 'roles', element: <RoleList /> },
    ],
  },
]);

export default router;
