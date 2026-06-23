/**
 * 报告生成页 — 选择客户 + 场景标签 → 调用 Know-Kit 分析 → 生成报告
 *
 * 流程：选客户 → 选场景标签 → 提交 KnowKit 任务 → 用任务 ID 生成报告 → 跳转查看
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Button, message, Card, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { customerApi } from '../../api/customer';
import { knowKitApi } from '../../api/knowkit';
import { reportApi } from '../../api/report';
import { knowledgeApi } from '../../api/knowledge';

export default function ReportCreate() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const loadData = async () => {
    const [cRes, sRes] = await Promise.all([
      customerApi.page(1, 200),
      knowledgeApi.listScenarios(),
    ]);
    setCustomers(cRes.data.records || []);
    setScenarios(sRes.data || []);
  };
  useState(() => { loadData(); });

  const handleSubmit = async (v: any) => {
    setLoading(true);
    try {
      const task = await knowKitApi.submitAnalysis(v.customerId, v.scenarioTags);
      const report = await reportApi.generate(v.customerId, task.data.id!);
      message.success('报告生成成功！');
      navigate('/report/' + report.data.id);
    } catch {
      message.error('报告生成失败');
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
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxWidth: 600 }}>
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
              提交分析并生成报告
            </Button>
            <Button onClick={() => navigate('/reports')}>取消</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
