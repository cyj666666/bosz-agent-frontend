/**
 * 用户管理 API
 */
import { get, post, put, del } from './request';
import type { UserInfo, PageResult } from '../types';

export const userApi = {
  page: (page: number, size: number, keyword?: string) =>
    get<PageResult<UserInfo>>('/user/page', { page, size, keyword }),

  getById: (id: number) => get<UserInfo>(`/user/${id}`),

  save: (data: any) => post('/user', data),

  update: (data: any) => put('/user', data),

  delete: (id: number) => del(`/user/${id}`),

  resetPassword: (id: number) => post<{ newPassword: string }>(`/user/${id}/reset-password`),

  setPassword: (id: number, password: string) => put(`/user/${id}/set-password`, { password }),

  changePassword: (oldPassword: string, newPassword: string) =>
    post('/user/change-password', { oldPassword, newPassword }),
};