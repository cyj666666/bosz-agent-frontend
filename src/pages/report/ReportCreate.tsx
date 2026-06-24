/**
 * 报告生成页 — 选择客户 + 场景标签 → 一键生成报告
 *
 * 流程：选客户 → 选场景标签 → POST /api/report/create（后端完成采集+分析+生成） → 跳转查看
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Button, message, Card, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { customerApi } from '../../api/customer';
import { reportApi } from '../../api/report';
import { knowledgeApi } from '../../api/knowledge';

export default function ReportCreate() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const [dataLoading, setDataLoading] = useState(true);

  const loadData = async () => {
    setDataLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        customerApi.page(1, 200),
        knowledgeApi.listScenarios(),
      ]);
      setCustomers(cRes.data.records || []);
      setScenarios(sRes.data || []);
    } catch (e) {
      console.error('加载报告生成页数据失败:', e);
      message.error('加载客户或场景列表失败，请检查后端是否启动');
    } finally {
      setDataLoading(false);
    }
  };
  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (v: any) => {
    setLoading(true);
    try {
      const report = await reportApi.create(v.customerId, v.scenarioTags);
      message.success('报告生成成功！');
      navigate('/report/' + report.data.id);
    } catch (e: any) {
      console.error('报告生成失败:', e);
      message.error('报告生成失败：' + (e?.response?.data?.message || e?.message || '请检查后端日志'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>返回报告列表</Button>
      </div>
      <Card title="生成报告">
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          onFinishFailed={(err) => { console.error('表单校验未通过:', err); message.warning('请选择客户和场景标签'); }}
          style={{ maxWidth: 600 }} disabled={dataLoading}>
          <Form.Item name="customerId" label="选择客户" rules={[{ required: true }]}>
            <Select showSearch placeholder="搜索公司名称..."
              filterOption={(input, option) => (option?.label as string || '').includes(input)}
              options={customers.map(c => ({ label: c.companyName, value: c.id }))} />
          </Form.Item>
          <Form.Item name="scenarioTags" label="场景标签" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="选择场景标签..."
              options={scenarios.map(s => ({ label: s.scenarioName, value: s.scenarioName }))} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              生成报告
            </Button>
            <Button onClick={() => navigate('/reports')}>取消</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
