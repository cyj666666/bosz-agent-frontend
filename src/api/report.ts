/**
 * 报告 API — 报告生成、查询、删除
 */
import { get, post, del } from './request';
import type { Report, PageResult } from '../types';

export const reportApi = {
  /** 一键生成报告：采集数据 → Know-Kit分析 → 生成HTML */
  create: (customerId: number) =>
    post<Report>(`/report/create?customerId=${customerId}`),

  /** 基于已有分析任务生成报告（单独重生成场景） */
  generate: (customerId: number, knowKitTaskId: number) =>
    post<Report>(`/report/generate?customerId=${customerId}&knowKitTaskId=${knowKitTaskId}`),

  /** 分页查询报告列表，可选按客户筛选 */
  page: (page: number, size: number, customerId?: number) =>
    get<PageResult<Report>>('/report/page', { page, size, customerId }),

  /** 按 ID 查报告元数据 */
  getById: (id: number) => get<Report>(`/report/${id}`),

  /** 按 ID 查报告 HTML 正文 */
  getHtml: (id: number) => get<string>(`/report/${id}/html`),

  /** 删除报告 */
  delete: (id: number) => del(`/report/${id}`),

  /** 获取报告结构化数据（供前端渲染三栏式报告页） */
  getData: (customerId: number) => get<any>(`/report/data/${customerId}`),
};
