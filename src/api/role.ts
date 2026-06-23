/**
 * 角色管理 API
 */
import { get, post, put, del } from './request';
import type { Role, PageResult } from '../types';

export const roleApi = {
  page: (page: number, size: number) =>
    get<PageResult<Role>>('/role/page', { page, size }),

  listAll: () => get<Role[]>('/role/all'),

  save: (data: Role) => post('/role', data),

  update: (data: Role) => put('/role', data),

  delete: (id: number) => del(`/role/${id}`),
};