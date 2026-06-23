/**
 * 主布局 — 侧边导航 + 顶栏 + 内容区
 *
 * 结构：
 *   左侧 Sider → 可折叠菜单导航（4 个模块）
 *   右侧 Layout → Header 标题栏 + Content（Outlet 渲染子路由页面）
 */
import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme } from 'antd';
import {
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

/** 侧边栏菜单项，key 对应路由 path */
const menuItems = [
  { key: '/reports', icon: <FileTextOutlined />, label: '报告管理' },
  { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
  { key: '/data-config', icon: <SettingOutlined />, label: '数据源配置' },
  { key: '/rules', icon: <SafetyCertificateOutlined />, label: '知识库管理' },
];

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  /** 根据当前路径高亮对应菜单项 */
  const selectedKey = '/' + (location.pathname.split('/')[1] || 'reports');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 左侧可折叠导航 */}
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: collapsed ? 14 : 18, fontWeight: 700,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          {collapsed ? '苏银' : '苏州银行报告系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      {/* 右侧内容区 */}
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: '0 24px', fontSize: 16, fontWeight: 600, borderBottom: '1px solid #f0f0f0' }}>
          苏州银行 · 大模型智能报告平台
        </Header>
        <Content style={{ margin: 16, padding: 24, background: token.colorBgContainer, borderRadius: 8, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
