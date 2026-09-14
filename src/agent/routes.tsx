/**
 * agent 模块 — 路由表
 *
 * 挂载方式：宿主 src/router/index.tsx 在 MainLayout 的 children 里展开 `...agentRoutes`。
 * 路径统一为 /agent/*，与宿主既有路由隔离。
 */
import type { RouteObject } from 'react-router-dom';
import IndexConfigList from './pages/index-config/IndexConfigList';
import KnowledgeConfigList from './pages/knowledge-config/KnowledgeConfigList';
import RuleList from './pages/rule/RuleList';

/** agent 模块路由（作为根路由的 children，路径为相对路径） */
export const agentRoutes: RouteObject[] = [
  { path: 'agent/index-config', element: <IndexConfigList /> },
  { path: 'agent/knowledge-config', element: <KnowledgeConfigList /> },
  { path: 'agent/rule', element: <RuleList /> },
];
