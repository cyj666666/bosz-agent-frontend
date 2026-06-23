/**
 * Know-Kit API — 智能体分析任务触发与查询
 */
import { get, post } from './request';
import type { KnowKitTask } from '../types';

export const knowKitApi = {
  /** 提交分析任务：客户ID + 场景标签数组 → KnowKitTask */
  submitAnalysis: (customerId: number, scenarioTags: string[]) =>
    post<KnowKitTask>(`/know-kit/analyze?customerId=${customerId}`, scenarioTags),

  /** 查询任务状态和结果 */
  getTask: (taskId: number) => get<KnowKitTask>(`/know-kit/task/${taskId}`),

  /** 重试失败的任务 */
  retryTask: (taskId: number) => post<KnowKitTask>(`/know-kit/task/${taskId}/retry`),
};
