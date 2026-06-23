import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import ReportList from '../pages/report/ReportList';
import ReportView from '../pages/report/ReportView';
import ReportCreate from '../pages/report/ReportCreate';
import CustomerList from '../pages/data/CustomerList';
import DataConfig from '../pages/data/DataConfig';
import RuleList from '../pages/knowledge/RuleList';

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
