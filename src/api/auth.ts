/**
 * 认证 API — 登录
 */
import { post } from './request';
import type { LoginResult } from '../types';

export const authApi = {
  /** 用户登录 */
  login: (username: string, password: string) =>
    post<LoginResult>('/auth/login', { username, password }),
};