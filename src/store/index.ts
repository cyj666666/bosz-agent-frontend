/**
 * 全局状态管理 — Zustand store
 *
 * 只存跨页面共享的状态（token/用户信息/当前选中的客户/报告），页面级数据用组件内 useState
 */
import { create } from 'zustand';

const TOKEN_KEY = 'bosz_token';
const USER_KEY = 'bosz_user';

interface AuthState {
  token: string | null;
  username: string | null;
  realName: string | null;
  roles: string[];
  menus: string[];  // 可访问的菜单路由列表
  setAuth: (token: string, username: string, realName: string, roles: string[], menus: string[]) => void;
  clearAuth: () => void;
  isLoggedIn: () => boolean;
  hasRole: (role: string) => boolean;
}

interface AppState extends AuthState {
  customerId: number | null;
  setCustomerId: (id: number | null) => void;
  reportId: number | null;
  setReportId: (id: number | null) => void;
}

/** 全局 store：认证 + 当前选中的客户 ID 和报告 ID */
export const useAppStore = create<AppState>((set, get) => ({
  // 认证状态（初始从 localStorage 恢复）
  token: localStorage.getItem(TOKEN_KEY),
  username: localStorage.getItem(USER_KEY + '_name'),
  realName: localStorage.getItem(USER_KEY + '_real'),
  roles: JSON.parse(localStorage.getItem(USER_KEY + '_roles') || '[]'),
  menus: JSON.parse(localStorage.getItem(USER_KEY + '_menus') || '[]'),

  setAuth: (token, username, realName, roles, menus) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY + '_name', username);
    localStorage.setItem(USER_KEY + '_real', realName);
    localStorage.setItem(USER_KEY + '_roles', JSON.stringify(roles));
    localStorage.setItem(USER_KEY + '_menus', JSON.stringify(menus));
    set({ token, username, realName, roles, menus });
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY + '_name');
    localStorage.removeItem(USER_KEY + '_real');
    localStorage.removeItem(USER_KEY + '_roles');
    localStorage.removeItem(USER_KEY + '_menus');
    set({ token: null, username: null, realName: null, roles: [], menus: [] });
  },

  isLoggedIn: () => !!get().token,
  hasRole: (role) => get().roles.includes(role),

  // 业务状态
  customerId: null,
  setCustomerId: (id) => set({ customerId: id }),
  reportId: null,
  setReportId: (id) => set({ reportId: id }),
}));
