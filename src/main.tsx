/**
 * 应用入口 — 挂载根组件到 DOM
 */
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
// ⚠️ 必须显式引入 dayjs 的中文语言包：dayjs 默认只带 en，而日期面板里的「月份名 / 星期名」
//    是 dayjs 渲染的（ConfigProvider 的 zhCN 只管按钮与占位符文案），不引就会出现
//    「2026年Sep」「Su Mo Tu We Th Fr Sa」这种中英混排。
import 'dayjs/locale/zh-cn';
import App from './App';
import './index.css';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
