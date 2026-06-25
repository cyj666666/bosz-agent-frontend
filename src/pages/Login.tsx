/**
 * 登录页 — 账号密码登录
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '../api/auth';
import { useAppStore } from '../store';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAppStore((s) => s.setAuth);

  const handleLogin = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(v.username, v.password);
      setAuth(res.data.token, res.data.username, res.data.realName, res.data.roles || [], res.data.menus || []);
      message.success('登录成功');
      navigate('/reports', { replace: true });
    } catch {
      message.error('登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(180deg, #fdfefe 0%, #f3f8ff 58%, #eef5ff 100%)',
    }}>
      <Card title="苏州银行 · 贷后管理智能体系统" style={{ width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <Form onFinish={handleLogin} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}