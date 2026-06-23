import { get, post } from './request';
import type { KnowKitTask } from '../types';

export const knowKitApi = {
  submitAnalysis: (customerId: number, scenarioTags: string[]) =>
    post<KnowKitTask>(`/know-kit/analyze?customerId=${customerId}`, scenarioTags),

  getTask: (taskId: number) => get<KnowKitTask>(`/know-kit/task/${taskId}`),

  retryTask: (taskId: number) => post<KnowKitTask>(`/know-kit/task/${taskId}/retry`),
};
