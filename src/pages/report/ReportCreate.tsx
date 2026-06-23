/**
 * 报告生成页 — 选择客户 + 场景标签 → 调用 Know-Kit 分析 → 生成报告
 *
 * 流程：选客户 → 选场景标签 → 提交 KnowKit 任务 → 用任务 ID 生成报告 → 跳转查看
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Select, Button, message, Card } from 'antd';
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

  /** 加载客户列表和场景标签（用于下拉选择） */
  const loadData = async () => {
    const [cRes, sRes] = await Promise.all([
      customerApi.page(1, 200),
      knowledgeApi.listScenarios(),
    ]);
    setCustomers(cRes.data.records || []);
    setScenarios(sRes.data || []);
  };
  useState(() => { loadData(); });

  /** 提交表单 → Know-Kit 分析 → 生成报告 → 跳转查看 */
  const handleSubmit = async (v: any) => {
    setLoading(true);
    try {
      const task = await knowKitApi.submitAnalysis(v.customerId, v.scenarioTags);
      const report = await reportApi.generate(v.customerId, task.data.id!);
      message.success('Report generated!');
      navigate('/report/' + report.data.id);
    } catch {
      message.error('Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Generate Report">
      <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxWidth: 600 }}>
        <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}>
          <Select showSearch placeholder="Search company..."
            filterOption={(input, option) => (option?.label as string || '').includes(input)}
            options={customers.map(c => ({ label: c.companyName, value: c.id }))} />
        </Form.Item>
        <Form.Item name="scenarioTags" label="Scenario Tags" rules={[{ required: true }]}>
          <Select mode="multiple" placeholder="Select tags..."
            options={scenarios.map(s => ({ label: s.scenarioName, value: s.scenarioName }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading}>
          Submit to Know-Kit &amp; Generate
        </Button>
      </Form>
    </Card>
  );
}
