/**
 * 指标数据管理页 — 按客户/数据域筛选，分页展示采集解析后的结构化指标
 */
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { indicatorApi } from '../../api/indicator';
import { customerApi } from '../../api/customer';
import type { IndicatorData } from '../../types';

/** 数据域选项（12 个维度） */
const DOMAINS = [
  { label: '财务', value: 'FINANCE' },
  { label: '征信', value: 'CREDIT' },
  { label: '税务', value: 'TAX' },
  { label: '司法', value: 'JUDICIAL' },
  { label: '结算', value: 'SETTLEMENT' },
  { label: '工商', value: 'INDUSTRY_COMMERCE' },
  { label: '社保', value: 'SOCIAL_SECURITY' },
  { label: '海关', value: 'CUSTOMS' },
  { label: '水电', value: 'UTILITY' },
  { label: '资产', value: 'PROPERTY' },
  { label: '图谱', value: 'GRAPH' },
  { label: '经营', value: 'MANAGEMENT' },
];
const DOMAIN_MAP: Record<string, string> = {};
DOMAINS.forEach(d => { DOMAIN_MAP[d.value] = d.label; });

export default function IndicatorList() {
  const [data, setData] = useState<IndicatorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [domain, setDomain] = useState<string | undefined>();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IndicatorData | null>(null);
  const [form] = Form.useForm();

  /** 加载客户下拉选项 */
  const loadCustomers = async () => {
    try {
      const r = await customerApi.page(1, 500);
      setCustomers((r.data.records || []).map((c: any) => ({
        label: c.companyName,
        value: c.id,
      })));
    } catch { /* ignore */ }
  };

  /** 加载指标列表 */
  const fetch = async (p = 1) => {
    setLoading(true);
    try {
      const r = await indicatorApi.page(p, pageSize, customerId, domain);
      setData(r.data.records || []);
      setTotal(r.data.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadCustomers(); }, []);
  useEffect(() => { fetch(1); setPage(1); }, [customerId, domain]);

  /** 表格列定义 */
  const cols = [
    { title: '指标编码', dataIndex: 'indicatorKey', width: 140 },
    { title: '指标名称', dataIndex: 'indicatorName', width: 140 },
    { title: '当前值', dataIndex: 'currentValue', width: 120 },
    { title: '上期值', dataIndex: 'previousValue', width: 120 },
    { title: '变动', dataIndex: 'changeDesc', width: 100 },
    { title: '单位', dataIndex: 'dataUnit', width: 80 },
    {
      title: '数据域', dataIndex: 'domain', width: 80,
      render: (v: string) => DOMAIN_MAP[v] || v,
    },
    { title: '数据周期', dataIndex: 'period', width: 100 },
    {
      title: '操作',
      width: 120,
      render: (_: any, r: IndicatorData) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => {
            setEditing(r);
            form.setFieldsValue(r);
            setModalOpen(true);
          }}>编辑</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={async () => {
            await indicatorApi.delete(r.id!);
            message.success('删除成功');
            fetch(page);
          }}>删除</Button>
        </Space>
      ),
    },
  ];

  /** 保存指标（新增/编辑共用） */
  const handleSave = async (v: any) => {
    if (editing?.id) {
      await indicatorApi.update({ ...editing, ...v });
    } else {
      await indicatorApi.save(v);
    }
    message.success('保存成功');
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    fetch(page);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>指标数据</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditing(null);
          form.resetFields();
          setModalOpen(true);
        }}>新增指标</Button>
      </div>

      {/* 筛选栏 */}
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="选择客户"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          options={customers}
          value={customerId}
          onChange={(v) => setCustomerId(v)}
        />
        <Select
          placeholder="选择数据域"
          allowClear
          style={{ width: 160 }}
          options={DOMAINS}
          value={domain}
          onChange={(v) => setDomain(v)}
        />
      </Space>

      <Table
        columns={cols}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: false,
          onChange: (p) => { setPage(p); fetch(p); },
        }}
      />

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editing ? '编辑指标' : '新增指标'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={() => form.submit()}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="customerId" label="所属客户" rules={[{ required: true }]}>
            <Select placeholder="选择客户" showSearch optionFilterProp="label" options={customers} />
          </Form.Item>
          <Form.Item name="indicatorKey" label="指标编码" rules={[{ required: true }]}
            help="唯一标识，对应 indicator_data.indicator_key，如 total_assets">
            <Input placeholder="如 total_assets" />
          </Form.Item>
          <Form.Item name="indicatorName" label="指标名称" rules={[{ required: true }]}>
            <Input placeholder="如 总资产" />
          </Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="currentValue" label="当前值" style={{ flex: 1 }}><Input placeholder="如 5000000.00" /></Form.Item>
            <Form.Item name="previousValue" label="上期值" style={{ flex: 1 }}><Input placeholder="如 4500000.00" /></Form.Item>
            <Form.Item name="changeDesc" label="变动描述" style={{ flex: 1 }}><Input placeholder="如 ↑11.1%" /></Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="dataUnit" label="单位" style={{ flex: 1 }}><Input placeholder="如 元、万元、人" /></Form.Item>
            <Form.Item name="domain" label="数据域" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select options={DOMAINS} placeholder="选择数据域" />
            </Form.Item>
            <Form.Item name="period" label="数据周期" style={{ flex: 1 }}><Input placeholder="如 2025Q1" /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
