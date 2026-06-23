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
        <div dangerouslySetInnerHTML={{ __html: report.contentHtml }} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          报告内容待生成。请先通过 Know-Kit 分析生成内容。
        </div>
      )}
    </div>
  );
}
