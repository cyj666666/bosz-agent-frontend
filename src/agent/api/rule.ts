/**
 * agent 模块 — 智策引擎（检查项 / 规则）接口
 *
 * 对应源工程 `amar-agent-admin/src/api/agent.js` 中的 rule 相关方法。
 * **URL 与源工程逐字一致**（`/agent/rule/xxx`），因为宿主后端的路径约定就是
 * 「`/api` + 前端相对路径」，前端 baseURL 为 `/api`，两边拼接后正好落到
 * `/api/agent/rule/xxx`。
 *
 * 超时口径也与源工程保持一致：解析要等大模型，用 600s；校验要跑规则引擎 + 取数，用 10min。
 */
import { agentPost } from './agentRequest';
import type {
  AgentListResult,
  RuleItem,
  RuleListQuery,
  RuleSaveParams,
  RuleParseResult,
  RuleExecuteParams,
  RuleExecuteResult,
  TopicOption,
  IndexTreeNode,
  SupplementaryOption,
} from '../types';

/** 检查项解析/校验的超时（毫秒），与源工程一致 */
const TIMEOUT_PARSE = 600 * 1000;
const TIMEOUT_EXECUTE = 10 * 60 * 1000;
const TIMEOUT_INDEX_TREE = 60 * 1000;

/** 检查项分页列表 */
export function getRuleList(params: RuleListQuery): Promise<AgentListResult<RuleItem>> {
  return agentPost<AgentListResult<RuleItem>>('/agent/rule/list', params);
}

/** 新增/更新检查项（id 为空即新增） */
export function saveRule(params: RuleSaveParams): Promise<unknown> {
  return agentPost('/agent/rule/save', params);
}

/** 检查项解析（把触发条件/阈值自然语言转成引擎表达式） */
export function parseRule(ruleText: string): Promise<RuleParseResult> {
  return agentPost<RuleParseResult>('/agent/rule/parse', { ruleText }, TIMEOUT_PARSE);
}

/** 检查项校验（按企业跑一遍规则） */
export function executeRule(params: RuleExecuteParams): Promise<RuleExecuteResult> {
  return agentPost<RuleExecuteResult>('/agent/rule/execute', params, TIMEOUT_EXECUTE);
}

/** 启用/停用检查项 */
export function updateRuleStatus(id: number, ruleStatus: string): Promise<unknown> {
  return agentPost('/agent/rule/updateRuleStatus', { id, ruleStatus });
}

/** 删除检查项（后端是 POST + query 参数） */
export function deleteRule(id: number): Promise<unknown> {
  return agentPost(`/agent/rule/delete?id=${encodeURIComponent(String(id))}`);
}

/** 主题二级联动选项 */
export function getTopicSelect(): Promise<TopicOption[]> {
  return agentPost<TopicOption[]>('/agent/rule/topicSelect');
}

/** 企业名称模糊检索（校验前选企业用） */
export function getEntsList(name: string): Promise<unknown> {
  return agentPost('/agent/rule/getEnts', { name });
}

/**
 * 指标树（检查项表达式编辑时可点的指标）
 *
 * 源工程用的是宿主 `@/api` 的 `paramsAllList`，其定义为
 * `postAction('/index/config/all/queryList', params, 60 * 1000)`。
 * 这里按同一 URL 与同一入参调，**不改后端契约**。
 */
export function loadIndexTree(): Promise<AgentListResult<IndexTreeNode>> {
  return agentPost<AgentListResult<IndexTreeNode>>(
    '/index/config/all/queryList',
    {
      filters: [],
      modelNo: 'Public',
      pageIndex: 1,
      pageSize: 10,
      parentParamNo: '',
      reportVersion: null,
      versionNo: null,
    },
    TIMEOUT_INDEX_TREE,
  );
}

/**
 * 「补充分析」下拉选项
 *
 * 源工程调用 `simplePageList({ keyword, pageIndex, pageSize })`
 * → `/KnowledgeBase/config/simplePageList`。
 * 注意后端返回的是 ListResult 结构（list 字段），不是数组本身。
 */
export async function getSupplementaryOptions(keyword: string): Promise<SupplementaryOption[]> {
  const res = await agentPost<AgentListResult<SupplementaryOption>>('/KnowledgeBase/config/simplePageList', {
    keyword: keyword || '',
    pageIndex: 1,
    pageSize: 200,
  });
  return res?.list ?? [];
}
