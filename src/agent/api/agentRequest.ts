/**
 * agent 模块 — 专用 HTTP 客户端
 *
 * 为什么不复用宿主的 src/api/request.ts：
 *   1) 宿主响应拦截器只 return res.data、不校验业务码（code!==200 会被当成功），
 *      agent 模块的接口必须强校验，否则后端 Result.fail 静默通过；
 *   2) 解耦：agent 模块整体搬迁/合并时，不依赖宿主的请求封装。
 *
 * 唯一入向依赖：宿主全局 store 的 token（只读），见 useAppStore。
 */
import axios from 'axios';
import { useAppStore } from '../../store';
import type { AgentResult } from '../types';

const agentRequest = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  // agent 模块存在大模型相关接口（检查项解析等），超时放宽到 60s
  timeout: 60000,
});

agentRequest.interceptors.request.use((config) => {
  const token = useAppStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

agentRequest.interceptors.response.use(
  (res) => res.data,
  (err) => {
    // 401 与宿主保持一致：清登录态后整页跳登录
    if (err?.response?.status === 401) {
      useAppStore.getState().clearAuth();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

/** 业务码校验：code!==200 一律抛错，调用方只需 try/catch */
function expectOk<T>(promise: Promise<unknown>): Promise<T> {
  return promise.then((body) => {
    const res = body as AgentResult<T>;
    if (!res || res.code !== 200) {
      throw new Error(res?.message || '操作失败');
    }
    return res.data;
  });
}

/** GET，自动解包到 data */
export function agentGet<T>(url: string, params?: unknown, timeout?: number): Promise<T> {
  return expectOk<T>(agentRequest.get(url, { params, ...(timeout ? { timeout } : {}) }));
}

/**
 * POST，自动解包到 data
 *
 * @param timeout 可选，覆盖默认 60s。**大模型相关接口必须显式给**：
 *   源工程给「检查项解析」600s、「检查项校验」10min —— 一次解析要等 LLM 返回，
 *   用默认 60s 会让长耗时请求在成功前被前端自己掐断。
 */
export function agentPost<T>(url: string, data?: unknown, timeout?: number): Promise<T> {
  return expectOk<T>(agentRequest.post(url, data, timeout ? { timeout } : undefined));
}

export default agentRequest;
