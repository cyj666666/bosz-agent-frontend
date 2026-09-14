/**
 * agent 模块 — 菜单与权限项
 *
 * 宿主工程只消费本文件导出的三个常量，不关心模块内部页面结构：
 *   agentMenus        → MainLayout 的侧边菜单（antd MenuProps['items'] 结构）
 *   agentMenuOptions  → RoleList 的"菜单权限"可选项
 *   agentDetailParents→ AuthGuard 的明细页→菜单键映射（本模块暂无明细页，留空）
 */
import type { ReactNode } from 'react';
import { ApartmentOutlined, BookOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

/** 单条菜单定义（结构对齐 antd MenuProps['items']） */
export interface AgentMenuItem {
  key: string;
  icon?: ReactNode;
  label: string;
}

/**
 * agent 模块的一级菜单
 *
 * 路径统一挂 /agent 前缀下，与宿主既有路由（/reports、/users…）完全隔离。
 * 来源：原 amar-agent-admin 的「指标配置 / 知识配置管理 / 智策引擎」三个菜单。
 */
export const agentMenus: AgentMenuItem[] = [
  { key: '/agent/index-config', icon: <ApartmentOutlined />, label: '指标配置' },
  { key: '/agent/knowledge-config', icon: <BookOutlined />, label: '知识配置管理' },
  { key: '/agent/rule', icon: <SafetyCertificateOutlined />, label: '智策引擎' },
];

/** 角色管理的"菜单权限"可选项（宿主 RoleList 直接合并使用） */
export const agentMenuOptions = agentMenus.map((m) => ({ label: m.label, value: m.key }));

/**
 * 明细页路径前缀 → 所属菜单键
 *
 * 明细页本身不出现在菜单里，但权限需要跟随父菜单。
 * 例：'/report' → '/reports'（宿主既有，用来修非 admin 打开报告详情被弹回的 bug）。
 * agent 模块后续若有"列表→详情"页，在这里登记即可，无需改宿主代码。
 */
export const agentDetailParents: Record<string, string> = {};
