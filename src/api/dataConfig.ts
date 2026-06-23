/**
 * 数据源配置 API — 采集器 + 解析器的 CRUD 及采集触发
 */
import { get, post, put, del } from './request';
import type { CollectorConfig, ParserConfig, PageResult } from '../types';

export const dataConfigApi = {
  /** 分页查询采集器，可选按类型筛选 */
  pageCollector: (page: number, size: number, type?: string) =>
    get<PageResult<CollectorConfig>>('/data-config/collector/page', { page, size, type }),

  /** 新增采集器 */
  saveCollector: (data: CollectorConfig) => post('/data-config/collector', data),

  /** 更新采集器 */
  updateCollector: (data: CollectorConfig) => put('/data-config/collector', data),

  /** 删除采集器 */
  deleteCollector: (id: number) => del(`/data-config/collector/${id}`),

  /** 查询某采集器下的所有解析器 */
  listParser: (collectorId: number) =>
    get<ParserConfig[]>(`/data-config/parser/list/${collectorId}`),

  /** 新增解析器 */
  saveParser: (data: ParserConfig) => post('/data-config/parser', data),

  /** 删除解析器 */
  deleteParser: (id: number) => del(`/data-config/parser/${id}`),

  /** 手动触发采集：指定采集器 + 客户 */
  triggerCollect: (collectorId: number, customerId: number) =>
    post(`/data-config/collect/${collectorId}?customerId=${customerId}`),
};
