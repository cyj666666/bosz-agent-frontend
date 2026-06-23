/**
 * 报告查看页 — 展示报告 HTML 正文（目标：三栏式布局）
 *
 * TODO: 三栏布局（左目录 / 中正文 / 右侧边栏）、锚点导航、滚动高亮、Word 导出
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { reportApi } from '../../api/report';
import type { Report } from '../../types';

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  /** 根据路由参数 id 加载报告 */
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    reportApi.getById(Number(id))
      .then(res => setReport(res.data))
      .catch(() => message.error('加载报告失败'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!report) return <p>报告不存在</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>返回</Button>
        <h2>{report.reportTitle}</h2>
      </div>
      {report.contentHtml ? (
        /* ⚠️ XSS 风险：后端 HTML 直接渲染，需确保后端已做净化 */
        <div dangerouslySetInnerHTML={{ __html: report.contentHtml }} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          报告内容待生成。请先通过 Know-Kit 分析生成内容。
        </div>
      )}
    </div>
  );
}
