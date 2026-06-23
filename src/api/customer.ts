import { get, post, put, del } from './request';
import type { Customer, PageResult } from '../types';

export const customerApi = {
  page: (page: number, size: number, keyword?: string) =>
    get<PageResult<Customer>>('/customer/page', { page, size, keyword }),

  getById: (id: number) => get<Customer>(`/customer/${id}`),

  save: (data: Customer) => post('/customer', data),

  update: (data: Customer) => put('/customer', data),

  delete: (id: number) => del(`/customer/${id}`),
};
