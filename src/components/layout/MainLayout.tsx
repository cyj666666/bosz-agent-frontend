/**
 * 主布局 — 侧边导航 + 顶栏(用户名/退出) + 内容区
 *
 * 结构：
 *   左侧 Sider → 可折叠菜单导航
 *   右侧 Layout → Header 标题栏 + 用户信息 + Content（Outlet 渲染子路由页面）
 *
 * 菜单来源：宿主菜单（报告管理、系统管理）+ agent 模块菜单（src/agent 的 agentMenus）。
 * 可见性：由登录返回的 menus 权限数组过滤；'*' 表示超管全量可见。
 */
import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Modal, Form, Input, Space, theme, message } from 'antd';
import {
  LockOutlined,
  LogoutOutlined,
  UserOutlined,
  SecurityScanOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../store';
import { userApi } from '../../api/user';
import { agentMenus } from '../../agent';

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

  /**
   * 菜单项：根据登录返回的 menus 权限控制可见性
   *
   * agent 模块的菜单由 src/agent 提供，这里只做合并——新增 agent 页面不需要改本文件。
   */
  const allMenus: Record<string, any> = {
    '/reports': { key: '/reports', icon: <FileTextOutlined />, label: '报告管理' },
    ...Object.fromEntries(agentMenus.map((m) => [m.key, m])),
    '__system__': {
      key: 'system',
      icon: <SecurityScanOutlined />,
      label: '系统管理',
      children: [] as any[],
    },
  };

  /**
   * 当前路径对应的菜单 key
   *
   * 不能简单取一级路径段：agent 模块是两级路径（/agent/xxx），取一级会得到 '/agent' 匹配不到任何菜单。
   * 这里按"最长匹配前缀"解析，明细页（如 /report/123）也能正确高亮到父菜单。
   */
  const selectedKey = (() => {
    const path = location.pathname;
    const candidates = [
      ...Object.keys(allMenus).filter((k) => k !== '__system__'),
      '/users',
      '/roles',
    ];
    const hit = candidates
      .filter((k) => path === k || path.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0];
    return hit || path;
  })();

  const menuItems: any[] = [];

  // admin 全权限标记：直接渲染所有菜单
  if ((menus || []).includes('*')) {
    for (const key of Object.keys(allMenus)) {
      if (key === '__system__') {
        const sys = { ...allMenus['__system__'], children: [
          { key: '/users', label: '用户管理' },
          { key: '/roles', label: '角色管理' },
        ]};
        menuItems.push(sys);
      } else {
        menuItems.push(allMenus[key]);
      }
    }
  } else {
    for (const m of menus || []) {
      if (m === '/users' || m === '/roles') {
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
          {collapsed ? '苏银' : '贷后管理智能体系统'}
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
          <span style={{ fontSize: 16, fontWeight: 600 }}>苏州银行 · 贷后管理智能体系统</span>
          <Space>
            <UserOutlined />
            <span>{realName || '管理员'}</span>
            <Button type="link" icon={<LockOutlined />} onClick={() => setPwdOpen(true)}>修改密码</Button>
            <Button type="link" icon={<LogoutOutlined />} onClick={handleLogout}>退出</Button>
          </Space>
        </Header>
        <Content style={{
          margin: 16,
          padding: 0,
          background: themeToken.colorBgContainer,
          borderRadius: 8,
          height: 'calc(100vh - 96px)',         // Header 64 + margin 16*2 = 96，子路由内部自滚
          // ⚠️ 用 auto 而不是 hidden 做兜底：规范上子路由要自己撑满并内部滚动（见 index.css 的 .page-fill），
          //    但只要有一个页面忘了，hidden 就会把内容（比如分页栏）**裁得连滚动条都没有、永远够不到**。
          //    auto 的代价只是"没自滚的页面变成整页滚动"，比"内容不可达"好得多。
          overflow: 'auto',
        }}>
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
