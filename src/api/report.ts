import { get, post, del } from './request';
import type { Report, PageResult } from '../types';

export const reportApi = {
  generate: (customerId: number, knowKitTaskId: number) =>
    post<Report>(`/report/generate?customerId=${customerId}&knowKitTaskId=${knowKitTaskId}`),

  page: (page: number, size: number, customerId?: number) =>
    get<PageResult<Report>>('/report/page', { page, size, customerId }),

  getById: (id: number) => get<Report>(`/report/${id}`),

  getHtml: (id: number) => get<string>(`/report/${id}/html`),

  delete: (id: number) => del(`/report/${id}`),
};
