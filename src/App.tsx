import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import router from './router';

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{
      token: { colorPrimary: '#1664ff', borderRadius: 8 },
    }}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}
