import { get, post, put, del } from './request';
import type { CollectorConfig, ParserConfig, PageResult } from '../types';

export const dataConfigApi = {
  pageCollector: (page: number, size: number, type?: string) =>
    get<PageResult<CollectorConfig>>('/data-config/collector/page', { page, size, type }),

  saveCollector: (data: CollectorConfig) => post('/data-config/collector', data),

  updateCollector: (data: CollectorConfig) => put('/data-config/collector', data),

  deleteCollector: (id: number) => del(`/data-config/collector/${id}`),

  listParser: (collectorId: number) =>
    get<ParserConfig[]>(`/data-config/parser/list/${collectorId}`),

  saveParser: (data: ParserConfig) => post('/data-config/parser', data),

  deleteParser: (id: number) => del(`/data-config/parser/${id}`),

  triggerCollect: (collectorId: number, customerId: number) =>
    post(`/data-config/collect/${collectorId}?customerId=${customerId}`),
};
