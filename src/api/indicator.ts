/**
 * 指标数据 API — 采集+解析后的结构化指标 CRUD
 */
import { get, post, put, del } from './request';
import type { IndicatorData, PageResult } from '../types';

export const indicatorApi = {
  /** 分页查询指标，支持按客户和数据域筛选 */
  page: (page: number, size: number, customerId?: number, domain?: string) =>
    get<PageResult<IndicatorData>>('/indicator/page', { page, size, customerId, domain }),

  /** 按 ID 查单个指标 */
  getById: (id: number) => get<IndicatorData>(`/indicator/${id}`),

  /** 新增指标 */
  save: (data: IndicatorData) => post('/indicator', data),

  /** 更新指标 */
  update: (data: IndicatorData) => put('/indicator', data),

  /** 删除指标 */
  delete: (id: number) => del(`/indicator/${id}`),
};
