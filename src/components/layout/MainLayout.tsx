/**
 * 主布局 — 侧边导航 + 顶栏(用户名/退出) + 内容区
 *
 * 结构：
 *   左侧 Sider → 可折叠菜单导航（4 个模块）
 *   右侧 Layout → Header 标题栏 + 用户信息 + Content（Outlet 渲染子路由页面）
 */
import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Modal, Form, Input, Space, theme, message } from 'antd';
import { LockOutlined, LogoutOutlined, UserOutlined, SecurityScanOutlined } from '@ant-design/icons';
import {
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../store';
import { userApi } from '../../api/user';

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdForm] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { token: themeToken } = theme.useToken();
  const { realName, menus, clearAuth } = useAppStore();

  const handleChangePwd = async (v: any) => {
    try {
      await userApi.changePassword(v.oldPassword, v.newPassword);
      message.success('密码修改成功，下次登录生效');
      setPwdOpen(false);
      pwdForm.resetFields();
    } catch { message.error('密码修改失败'); }
  };

  /** 根据当前路径高亮对应菜单项 */
  const selectedKey = '/' + (location.pathname.split('/')[1] || 'reports');

  /** 菜单项：根据登录返回的 menus 权限控制可见性 */
  const allMenus: Record<string, any> = {
    '/reports': { key: '/reports', icon: <FileTextOutlined />, label: '报告管理' },
    '/customers': { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
    '/data-config': { key: '/data-config', icon: <SettingOutlined />, label: '数据源配置' },
    '/rules': { key: '/rules', icon: <SafetyCertificateOutlined />, label: '知识库管理' },
    '__system__': {
      key: 'system',
      icon: <SecurityScanOutlined />,
      label: '系统管理',
      children: [] as any[],
    },
  };

  const menuItems: any[] = [];
  for (const m of menus || []) {
    if (m === '/users' || m === '/roles') {
      // 系统管理子菜单
      if (!menuItems.find((i: any) => i.key === 'system')) {
        menuItems.push(allMenus['__system__']);
      }
      const sysMenu = menuItems.find((i: any) => i.key === 'system');
      if (m === '/users') sysMenu.children.push({ key: '/users', label: '用户管理' });
      if (m === '/roles') sysMenu.children.push({ key: '/roles', label: '角色管理' });
    } else if (allMenus[m]) {
      menuItems.push(allMenus[m]);
    }
  }

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

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
        <Header style={{
          background: themeToken.colorBgContainer, padding: '0 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>苏州银行 · 大模型智能报告平台</span>
          <Space>
            <UserOutlined />
            <span>{realName || '管理员'}</span>
            <Button type="link" icon={<LockOutlined />} onClick={() => setPwdOpen(true)}>修改密码</Button>
            <Button type="link" icon={<LogoutOutlined />} onClick={handleLogout}>退出</Button>
          </Space>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: themeToken.colorBgContainer, borderRadius: 8, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>

      {/* 修改密码弹窗 */}
      <Modal title="修改密码" open={pwdOpen}
        onCancel={() => { setPwdOpen(false); pwdForm.resetFields(); }}
        onOk={() => pwdForm.submit()}>
        <Form form={pwdForm} layout="vertical" onFinish={handleChangePwd} autoComplete="off">
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
