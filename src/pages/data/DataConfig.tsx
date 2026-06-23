import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { dataConfigApi } from '../../api/dataConfig';

const CT = [
  { label: 'HTTP API', value: 'HTTP_API' },
  { label: '数据库同步', value: 'DB_SYNC' },
  { label: 'SFTP 文件', value: 'SFTP_FILE' },
  { label: '文件上传', value: 'FILE_UPLOAD' },
  { label: 'Webhook', value: 'WEBHOOK' },
];
const PT = [
  { label: 'JSONPath 提取', value: 'JSON_PATH' },
  { label: 'Excel 模板', value: 'EXCEL_TEMPLATE' },
  { label: 'OCR 文本', value: 'OCR_TEXT' },
  { label: 'Groovy 脚本', value: 'GROOVY_SCRIPT' },
];
const DM = [
  'FINANCE', 'CREDIT', 'TAX', 'JUDICIAL', 'SETTLEMENT',
  'INDUSTRY_COMMERCE', 'SOCIAL_SECURITY', 'CUSTOMS', 'UTILITY',
  'PROPERTY', 'GRAPH', 'MANAGEMENT',
];

export default function DataConfig() {
  const [cl, setCl] = useState<any[]>([]);
  const [pl, setPl] = useState<any[]>([]);
  const [cm, setCm] = useState(false);
  const [pm, setPm] = useState(false);
  const [sid, setSid] = useState<number | null>(null);
  const [f] = Form.useForm();
  const [pf] = Form.useForm();

  const fc = async () => {
    const r = await dataConfigApi.pageCollector(1, 100);
    setCl(r.data.records || []);
  };
  const fp = async (id: number) => {
    setSid(id);
    const r = await dataConfigApi.listParser(id);
    setPl(r.data || []);
  };
  useEffect(() => { fc(); }, []);

  const cc = [
    { title: '配置名称', dataIndex: 'configName' },
    { title: '采集类型', dataIndex: 'collectorType' },
    { title: '定时表达式', dataIndex: 'cronExpression' },
    { title: '启用', dataIndex: 'enabled', render: (v: number) => v === 1 ? '是' : '否' },
    {
      title: '操作', render: (_: any, r: any) => (
        <Space>
          <Button type="link" onClick={() => fp(r.id)}>解析器</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={async () => { await dataConfigApi.deleteCollector(r.id); fc(); }} />
        </Space>
      ),
    },
  ];
  const pc = [
    { title: '解析类型', dataIndex: 'parserType' },
    { title: '数据域', dataIndex: 'domain' },
    { title: '执行顺序', dataIndex: 'sortOrder' },
    {
      title: '操作', render: (_: any, r: any) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={async () => { await dataConfigApi.deleteParser(r.id); sid && fp(sid); }} />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '16px 0' }}>
        <h2>数据源配置</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { f.resetFields(); setCm(true); }}>
          新增采集器
        </Button>
      </div>
      <Table columns={cc} dataSource={cl} rowKey="id" />
      {sid && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3>解析器列表</h3>
            <Button onClick={() => { pf.resetFields(); setPm(true); }}>新增解析器</Button>
          </div>
          <Table columns={pc} dataSource={pl} rowKey="id" pagination={false} />
        </div>
      )}

      <Modal title="新增采集器" open={cm} onCancel={() => setCm(false)} onOk={() => f.submit()}>
        <Form form={f} layout="vertical" onFinish={async (v: any) => {
          await dataConfigApi.saveCollector(v);
          setCm(false); fc(); message.success('保存成功');
        }}>
          <Form.Item name="configName" label="配置名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="collectorType" label="采集类型" rules={[{ required: true }]}><Select options={CT} /></Form.Item>
          <Form.Item name="configJson" label="配置JSON" rules={[{ required: true }]}><Input.TextArea rows={4} placeholder='{"url":"https://..."}' /></Form.Item>
          <Form.Item name="cronExpression" label="定时表达式"><Input placeholder="0 0 6 * * ?" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增解析器" open={pm} onCancel={() => setPm(false)} onOk={() => pf.submit()}>
        <Form form={pf} layout="vertical" onFinish={async (v: any) => {
          await dataConfigApi.saveParser({ ...v, collectorId: sid!, sortOrder: pl.length + 1 });
          setPm(false); fp(sid!); message.success('保存成功');
        }}>
          <Form.Item name="parserType" label="解析类型" rules={[{ required: true }]}><Select options={PT} /></Form.Item>
          <Form.Item name="domain" label="数据域" rules={[{ required: true }]}>
            <Select options={DM.map(d => ({ label: d, value: d }))} />
          </Form.Item>
          <Form.Item name="configJson" label="配置JSON" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder='{"mappings":[...]}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
