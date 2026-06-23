import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { knowledgeApi } from '../../api/knowledge';

export default function RuleList() {
  const [rules, setRules] = useState<any[]>([]);
  const [, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mOpen, setMOpen] = useState(false);
  const [sOpen, setSOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [conds, setConds] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [did, setDid] = useState<number | null>(null);
  const [f] = Form.useForm();
  const [sf] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try { const r = await knowledgeApi.pageRule(1, 200); setRules(r.data.records || []); }
    finally { setLoading(false); }
  };
  const fetchS = async () => {
    const r = await knowledgeApi.listScenarios();
    setScenarios(r.data || []);
  };
  const loadD = async (id: number) => {
    setDid(id);
    const [c, t] = await Promise.all([knowledgeApi.listConditions(id), knowledgeApi.listTags(id)]);
    setConds(c.data || []);
    setTags(t.data || []);
  };
  useEffect(() => { fetch(); fetchS(); }, []);

  const handleSave = async (v: any) => {
    editing?.id ? await knowledgeApi.updateRule({ ...editing, ...v }) : await knowledgeApi.saveRule(v);
    message.success('保存成功');
    setMOpen(false); setEditing(null); f.resetFields(); fetch();
  };

  const cols = [
    { title: '规则编号', dataIndex: 'ruleCode' },
    { title: '规则名称', dataIndex: 'ruleName' },
    { title: '规则类型', dataIndex: 'ruleType', render: (t: string) => <Tag>{t}</Tag> },
    {
      title: '状态', dataIndex: 'enabled',
      render: (v: number) => v === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
    },
    {
      title: '操作', render: (_: any, r: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(r); f.setFieldsValue(r); setMOpen(true); }}>编辑</Button>
          <Button type="link" onClick={() => loadD(r.id)}>详情</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={async () => { await knowledgeApi.deleteRule(r.id); fetch(); }}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>知识库规则管理</h2>
        <Space>
          <Button onClick={() => { sf.resetFields(); setSOpen(true); }}>新增场景</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); f.resetFields(); setMOpen(true); }}>新增规则</Button>
        </Space>
      </div>
      <Table columns={cols} dataSource={rules} rowKey="id" loading={loading} />

      {did && (
        <div style={{ marginTop: 24 }}>
          <h3>规则详情 (ID: {did})</h3>
          <h4>条件列表</h4>
          <Table dataSource={conds} rowKey="id" pagination={false} size="small"
            columns={[
              { title: '指标编码', dataIndex: 'indicatorKey' },
              { title: '运算符', dataIndex: 'operator' },
              { title: '阈值', dataIndex: 'threshold' },
              { title: '顺序', dataIndex: 'logicOrder' },
              { title: '连接符', dataIndex: 'logicConnector' },
            ]}
          />
          <h4 style={{ marginTop: 16 }}>标签列表</h4>
          <Table dataSource={tags} rowKey="id" pagination={false} size="small"
            columns={[
              { title: '标签类型', dataIndex: 'tagType' },
              { title: '标签值', dataIndex: 'tagValue' },
            ]}
          />
        </div>
      )}

      <Modal title={editing ? '编辑规则' : '新增规则'} open={mOpen} width={640}
        onCancel={() => { setMOpen(false); setEditing(null); }} onOk={() => f.submit()}>
        <Form form={f} layout="vertical" onFinish={handleSave}>
          <Form.Item name="ruleCode" label="规则编号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select options={[
              { label: '阈值判断 (THRESHOLD)', value: 'THRESHOLD' },
              { label: '布尔判断 (BOOLEAN)', value: 'BOOLEAN' },
              { label: '复合规则 (COMPOSITE)', value: 'COMPOSITE' },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="规则说明（自然语言描述）"><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增场景" open={sOpen}
        onCancel={() => setSOpen(false)} onOk={() => sf.submit()}>
        <Form form={sf} layout="vertical" onFinish={async (v: any) => {
          await knowledgeApi.saveScenario(v);
          setSOpen(false); fetchS(); message.success('保存成功');
        }}>
          <Form.Item name="scenarioCode" label="场景编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="scenarioName" label="场景名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="场景描述"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
