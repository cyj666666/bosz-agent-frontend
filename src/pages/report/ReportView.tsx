/**
 * 报告查看页 — 展示报告 HTML 正文（三栏式布局）
 * 支持导出 Word / HTML 文件
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message, Space } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
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

  /** 导出报告为 HTML 文件 */
  const handleExportHtml = () => {
    if (!report?.contentHtml) {
      message.warning('报告内容为空，无法导出');
      return;
    }
    downloadFile(report.contentHtml, (report.reportTitle || '贷后管理报告') + '.html', 'text/html;charset=utf-8');
    message.success('HTML 报告已导出');
  };

  /** 导出报告为 Word 文档 */
  const handleExportWord = () => {
    if (!report?.contentHtml) {
      message.warning('报告内容为空，无法导出');
      return;
    }
    // 将 HTML 包装为 Word 兼容格式
    // Word 原生支持打开 HTML 文件，加入 MSO 命名空间和页面设置即可直接打开
    const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page{size:A4;margin:2cm}@media print{body{-webkit-print-color-adjust:exact}}
.report-shell{grid-template-columns:1fr!important}.report-nav,.side-panel{display:none}</style>
</head>
<body>${stripScripts(report.contentHtml.replace('</body>', '').replace('</html>', ''))}</body></html>`;

    downloadFile(wordHtml, (report.reportTitle || '贷后管理报告') + '.doc', 'application/msword;charset=utf-8');
    message.success('Word 报告已导出');
  };

  /** 通用文件下载（BOM 头确保中文不乱码） */
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob(['﻿' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 移除脚本标签防注入 */
  const stripScripts = (html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!report) return <p>报告不存在</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>返回</Button>
          <h2 style={{ margin: 0 }}>{report.reportTitle}</h2>
        </Space>
        <Space>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleExportWord}>
            导出 Word
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportHtml}>
            导出 HTML
          </Button>
        </Space>
      </div>
      {report.contentHtml ? (
        <div dangerouslySetInnerHTML={{ __html: report.contentHtml }}
          style={{ borderRadius: 8, overflow: 'hidden' }} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          报告内容待生成。请先通过 Know-Kit 分析生成内容。
        </div>
      )}
    </div>
  );
}
