/**
 * 知识库 API — 场景、规则、条件、标签的 CRUD
 */
import { get, post, put, del } from './request';
import type { KnowledgeRule, RuleCondition, RuleTag, RuleScenario, PageResult } from '../types';

export const knowledgeApi = {
  // ========== 场景 ==========

  /** 分页查询场景 */
  pageScenario: (page: number, size: number) =>
    get<PageResult<RuleScenario>>('/knowledge/scenario/page', { page, size }),

  /** 查询全部场景列表（用于下拉选择） */
  listScenarios: () => get<RuleScenario[]>('/knowledge/scenario/all'),

  /** 新增场景 */
  saveScenario: (data: RuleScenario) => post('/knowledge/scenario', data),

  /** 更新场景 */
  updateScenario: (data: RuleScenario) => put('/knowledge/scenario', data),

  /** 删除场景 */
  deleteScenario: (id: number) => del(`/knowledge/scenario/${id}`),

  /** 获取各类型标签的去重值（供报告生成页下拉选择行业/产品/风险类型） */
  distinctTagValues: () => get<Record<string, string[]>>('/knowledge/tags/distinct-values'),

  // ========== 规则 ==========

  /** 分页查询规则，支持关键字搜索 */
  pageRule: (page: number, size: number, keyword?: string, ruleType?: string, enabled?: number) =>
    get<PageResult<KnowledgeRule>>('/knowledge/rule/page', { page, size, keyword, ruleType, enabled }),

  /** 按 ID 查单个规则 */
  getRule: (id: number) => get<KnowledgeRule>(`/knowledge/rule/${id}`),

  /** 新增规则 */
  saveRule: (data: KnowledgeRule) => post('/knowledge/rule', data),

  /** 更新规则 */
  updateRule: (data: KnowledgeRule) => put('/knowledge/rule', data),

  /** 删除规则 */
  deleteRule: (id: number) => del(`/knowledge/rule/${id}`),

  // ========== 条件 ==========

  /** 查询某规则下的所有条件 */
  listConditions: (ruleId: number) =>
    get<RuleCondition[]>(`/knowledge/rule/${ruleId}/conditions`),

  /** 批量保存某规则的条件（覆盖式） */
  saveConditions: (ruleId: number, data: RuleCondition[]) =>
    post(`/knowledge/rule/${ruleId}/conditions`, data),

  // ========== 标签 ==========

  /** 查询某规则下的所有标签 */
  listTags: (ruleId: number) => get<RuleTag[]>(`/knowledge/rule/${ruleId}/tags`),

  /** 批量保存某规则的标签（覆盖式） */
  saveTags: (ruleId: number, data: RuleTag[]) =>
    post(`/knowledge/rule/${ruleId}/tags`, data),
};
