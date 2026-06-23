/**
 * 路由配置 — 所有页面路由集中定义
 *
 * 路由表：
 *   /               → 重定向到 /reports
 *   /reports        → 报告列表
 *   /report/:id     → 报告详情（三栏布局目标）
 *   /report-create  → 生成报告（Know-Kit 触发）
 *   /customers      → 客户管理
 *   /data-config    → 数据源配置（采集器+解析器）
 *   /rules          → 知识库管理（规则+条件+标签+场景）
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import ReportList from '../pages/report/ReportList';
import ReportView from '../pages/report/ReportView';
import ReportCreate from '../pages/report/ReportCreate';
import CustomerList from '../pages/data/CustomerList';
import DataConfig from '../pages/data/DataConfig';
import RuleList from '../pages/knowledge/RuleList';

/** 所有路由嵌套在 MainLayout 下，共享侧边栏+顶栏布局 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/reports" replace /> },
      { path: 'reports', element: <ReportList /> },
      { path: 'report/:id', element: <ReportView /> },
      { path: 'report-create', element: <ReportCreate /> },
      { path: 'customers', element: <CustomerList /> },
      { path: 'data-config', element: <DataConfig /> },
      { path: 'rules', element: <RuleList /> },
    ],
  },
]);

export default router;
