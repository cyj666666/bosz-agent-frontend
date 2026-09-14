/**
 * 404 页面 — 未匹配到任何路由时兜底
 *
 * 为什么需要：宿主路由表此前没有 `path:'*'` catch-all，
 * 访问未知路径会落到 react-router 内置错误页（生产环境是英文报错），体验很差。
 */
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，你访问的页面不存在。"
      extra={
        <Button type="primary" onClick={() => navigate('/reports', { replace: true })}>
          返回首页
        </Button>
      }
    />
  );
}
