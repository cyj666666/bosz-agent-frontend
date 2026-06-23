import { get, post, put, del } from './request';
import type { KnowledgeRule, RuleCondition, RuleTag, RuleScenario, PageResult } from '../types';

export const knowledgeApi = {
  // Scenarios
  pageScenario: (page: number, size: number) =>
    get<PageResult<RuleScenario>>('/knowledge/scenario/page', { page, size }),

  listScenarios: () => get<RuleScenario[]>('/knowledge/scenario/all'),

  saveScenario: (data: RuleScenario) => post('/knowledge/scenario', data),

  deleteScenario: (id: number) => del(`/knowledge/scenario/${id}`),

  // Rules
  pageRule: (page: number, size: number, keyword?: string) =>
    get<PageResult<KnowledgeRule>>('/knowledge/rule/page', { page, size, keyword }),

  getRule: (id: number) => get<KnowledgeRule>(`/knowledge/rule/${id}`),

  saveRule: (data: KnowledgeRule) => post('/knowledge/rule', data),

  updateRule: (data: KnowledgeRule) => put('/knowledge/rule', data),

  deleteRule: (id: number) => del(`/knowledge/rule/${id}`),

  // Conditions
  listConditions: (ruleId: number) =>
    get<RuleCondition[]>(`/knowledge/rule/${ruleId}/conditions`),

  saveConditions: (ruleId: number, data: RuleCondition[]) =>
    post(`/knowledge/rule/${ruleId}/conditions`, data),

  // Tags
  listTags: (ruleId: number) => get<RuleTag[]>(`/knowledge/rule/${ruleId}/tags`),

  saveTags: (ruleId: number, data: RuleTag[]) =>
    post(`/knowledge/rule/${ruleId}/tags`, data),
};
