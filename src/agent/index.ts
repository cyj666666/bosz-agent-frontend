/**
 * agent 模块 — 统一注册入口
 *
 * 宿主工程只通过本文件接触 agent 模块，全部接缝共 5 个常量、4 处引用：
 *   src/router/index.tsx                 → agentRoutes
 *   src/components/layout/MainLayout.tsx → agentMenus
 *   src/pages/system/RoleList.tsx        → agentMenuOptions
 *   src/components/layout/AuthGuard.tsx  → agentDetailParents
 *
 * 搬迁/合并时：整个 src/agent 目录复制过去，再改这 4 处即可；
 * 摘除时：删掉 src/agent 目录 + 回退这 4 处改动。
 */
export { agentRoutes } from './routes';
export { agentMenus, agentMenuOptions, agentDetailParents } from './menu';
export type { AgentMenuItem } from './menu';
export type { AgentResult, AgentPageResult, AgentPageQuery } from './types';
export { agentGet, agentPost } from './api/agentRequest';
