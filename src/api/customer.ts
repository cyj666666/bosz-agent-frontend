/**
 * 客户 API — 客户 CRUD
 */
import { get, post, put, del } from './request';
import type { Customer, PageResult } from '../types';

export const customerApi = {
  /** 分页查询客户，支持关键字模糊搜索 */
  page: (page: number, size: number, keyword?: string) =>
    get<PageResult<Customer>>('/customer/page', { page, size, keyword }),

  /** 按 ID 查单个客户 */
  getById: (id: number) => get<Customer>(`/customer/${id}`),

  /** 新增客户 */
  save: (data: Customer) => post('/customer', data),

  /** 更新客户 */
  update: (data: Customer) => put('/customer', data),

  /** 删除客户 */
  delete: (id: number) => del(`/customer/${id}`),
};
