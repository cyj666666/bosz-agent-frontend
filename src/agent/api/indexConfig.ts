/**
 * agent 模块 — 指标配置接口
 *
 * 对应源工程 `amar-agent-admin/src/api/index.js`。
 * **URL 规律：本工程 = `/agent` + 源工程 URL**（源工程是 `/index/config/xxx`，
 * 本工程后端 Controller 是 `/api/agent/index/config`，前端 baseURL 为 `/api`）。
 * 例：源 `/index/config/queryAllList` → 本工程 `/agent/index/config/queryAllList`。
 */
import { agentGet, agentPost } from './agentRequest';
import type { AgentListResult } from '../types';

/* ---------------- 分组 ---------------- */

/** 指标分组层级列表（返回树） */
export function queryGroupTree(): Promise<AgentListResult<IndexGroupNode>> {
  return agentGet<AgentListResult<IndexGroupNode>>('/agent/index/config/group/query');
}

/** 新增分组（顶级） */
export function addGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/add/group', params);
}

/** 分组更新（重命名/改值） */
export function updateGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/group/update', params);
}

/** 分组删除 */
export function deleteGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/group/delete', params);
}

/** 新增指标参数组（下级分组） */
export function addConfigGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/object/add', params);
}

/** 指标参数组更新 */
export function updateConfigGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/object/update', params);
}

/* ---------------- 指标列表 / 明细 ---------------- */

/**
 * 分组下指标列表（主列表接口）
 *
 * 入参（照抄源工程）：`{ parentParamNo, groupValue, groupName, filters: [], pageIndex, pageSize, ...筛选 }`
 * 不选分组时不传 parentParamNo，即查全部。
 */
export function queryAllList(params: Record<string, unknown>): Promise<AgentListResult<IndexParamRow>> {
  return agentPost<AgentListResult<IndexParamRow>>('/agent/index/config/queryAllList', params, 60 * 1000);
}

/** 分组下指标列表（另一个口径，当前页面未用，保留给后续） */
export function queryIndexList(params: Record<string, unknown>): Promise<AgentListResult<IndexParamRow>> {
  return agentPost<AgentListResult<IndexParamRow>>('/agent/index/config/queryIndexList', params, 60 * 1000);
}

/** 参数信息列表 */
export function queryList(params: Record<string, unknown>): Promise<AgentListResult<IndexParamRow>> {
  return agentPost<AgentListResult<IndexParamRow>>('/agent/index/config/queryList', params, 60 * 1000);
}

/** 所有指标（树形，用于表达式编辑时选指标） */
export function allQueryList(params: Record<string, unknown>): Promise<AgentListResult<IndexTreeNodeLike>> {
  return agentPost<AgentListResult<IndexTreeNodeLike>>('/agent/index/config/all/queryList', params, 60 * 1000);
}

/** 参数详情 */
export function queryInfo(params: Record<string, unknown>): Promise<IndexParamDetail> {
  return agentPost<IndexParamDetail>('/agent/index/config/queryInfo', params);
}

/* ---------------- 指标增删改 ---------------- */

export function addIndex(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/add', params);
}

export function updateIndex(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/update', params);
}

/** 删除指标（按 paramNo） */
export function deleteIndex(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/delete', params);
}

/** 复制指标 */
export function copyIndex(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/copy', params);
}

/** 移动指标 */
export function moveIndex(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/move', params);
}

/* ---------------- 关联校验 / 其它 ---------------- */

/** 刷新指标缓存 */
export function refreshCache(): Promise<unknown> {
  return agentGet('/agent/index/config/refresh/index/cache');
}

/** 指标关联知识库信息（按指标编号查） */
export function queryIndexRelateKnowledgeInfo(params: Record<string, unknown>): Promise<unknown> {
  return agentGet('/agent/index/config/queryIndexRelateKnowledgeInfo', params);
}

/** 指标 → 知识库 关联校验 */
export function queryRelateKnowledgeInfo(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/queryRelateKnowledgeInfo', params);
}

/** 指标 → 指标 关联校验 */
export function queryRelateIndexInfo(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/queryRelateIndexInfo', params);
}

/** 按指标编号查它用到的接口/数据源参数 */
export function relateParams(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/index/config/relate/params', params);
}

/**
 * 批量同步（发起同步任务）
 *
 * 源工程用 `intfSync`（来自 `api/extintf.js`），其 URL 是 `/knowledge/sync/execute`，
 * 本工程对应 `KnowledgeSyncController` 的 `/api/agent/knowledge/sync/execute`。
 */
export function intfSync(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/knowledge/sync/execute', params, 10 * 60 * 1000);
}

/* ---------------- 类型 ---------------- */

/** 分组树节点（字段来自源工程，见 ConfigList.vue 的 getTreeData） */
export interface IndexGroupNode {
  groupId: string;
  groupValue: string;
  groupName: string;
  reportVersion?: string;
  children?: IndexGroupNode[];
  [key: string]: unknown;
}

/** 指标列表行（列定义见源工程 views/index/tableColumns.json） */
export interface IndexParamRow {
  paramNo: string;
  paramID: string;
  paramName: string;
  paramType: string;
  scriptTypeDesc: string;
  indexSource: string;
  inputUserID: string;
  inputTime: string;
  updateUserID: string;
  updateTime: string;
  [key: string]: unknown;
}

/** 指标详情（字段比列表行更全，配置弹窗回显用） */
export interface IndexParamDetail extends Partial<IndexParamRow> {
  parentParamNo?: string;
  groupValue?: string;
  groupName?: string;
  scriptType?: string;
  [key: string]: unknown;
}

/** 表达式编辑用的指标树节点（all/queryList 返回） */
export interface IndexTreeNodeLike {
  paramNo: string;
  paramName: string;
  parentParamName?: string;
  children?: IndexTreeNodeLike[];
  [key: string]: unknown;
}
