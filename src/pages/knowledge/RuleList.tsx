/**
 * 知识库管理页 — 规则列表 + 场景管理 + 条件/标签完整 CRUD
 */
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Drawer, Form, Input, Select, Space, message, Tag, Popconfirm, Descriptions, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { knowledgeApi } from '../../api/knowledge';

const TAG_TYPES = [
  { label: '场景', value: 'SCENARIO' },
  { label: '行业', value: 'INDUSTRY' },
  { label: '产品', value: 'PRODUCT' },
  { label: '风险类型', value: 'RISK_TYPE' },
];

const TAG_TYPE_MAP: Record<string, string> = {
  SCENARIO: '场景',
  INDUSTRY: '行业',
  PRODUCT: '产品',
  RISK_TYPE: '风险类型',
};

/** 运算符全集（用于表格列映射显示） */
const OPERATORS = [
  { label: '大于 >', value: '>' },
  { label: '大于等于 ≥', value: '>=' },
  { label: '小于 <', value: '<' },
  { label: '小于等于 ≤', value: '<=' },
  { label: '等于 =', value: '=' },
  { label: '不等于 ≠', value: '!=' },
  { label: '包含', value: 'CONTAINS' },
  { label: '存在', value: 'EXISTS' },
  { label: '不存在', value: 'NOT_EXISTS' },
];

/** 按规则类型限定运算符 */
const OPS_BY_TYPE: Record<string, { label: string; value: string }[]> = {
  THRESHOLD: [
    { label: '大于 >', value: '>' },
    { label: '大于等于 ≥', value: '>=' },
    { label: '小于 <', value: '<' },
    { label: '小于等于 ≤', value: '<=' },
    { label: '等于 =', value: '=' },
    { label: '不等于 ≠', value: '!=' },
    { label: '包含', value: 'CONTAINS' },
  ],
  BOOLEAN: [
    { label: '等于 TRUE', value: '=' },
    { label: '不等于 TRUE', value: '!=' },
    { label: '存在', value: 'EXISTS' },
    { label: '不存在', value: 'NOT_EXISTS' },
  ],
  COMPOSITE: [
    { label: '大于 >', value: '>' },
    { label: '大于等于 ≥', value: '>=' },
    { label: '小于 <', value: '<' },
    { label: '小于等于 ≤', value: '<=' },
    { label: '等于 =', value: '=' },
    { label: '不等于 ≠', value: '!=' },
    { label: '包含', value: 'CONTAINS' },
    { label: '存在', value: 'EXISTS' },
    { label: '不存在', value: 'NOT_EXISTS' },
  ],
};

const RULE_TYPE_MAP: Record<string, string> = {
  THRESHOLD: '阈值判断',
  BOOLEAN: '布尔判断',
  COMPOSITE: '复合规则',
};

const LOGIC_MAP: Record<string, string> = {
  AND: '且',
  OR: '或',
};

export default function RuleList() {
  const [rules, setRules] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mOpen, setMOpen] = useState(false);        // 规则 Modal
  const [sOpen, setSOpen] = useState(false);        // 场景 Modal
  const [sEditing, setSEditing] = useState<any>(null); // 当前编辑的场景
  const [editing, setEditing] = useState<any>(null); // 当前编辑的规则
  const [conds, setConds] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [did, setDid] = useState<number | null>(null);
  const [f] = Form.useForm();
  const [sf] = Form.useForm();
  const [cf] = Form.useForm();   // 条件表单
  const [tf] = Form.useForm();   // 标签表单
  const [cOpen, setCOpen] = useState(false);  // 条件 Modal
  const [tOpen, setTOpen] = useState(false);  // 标签 Modal
  const [dOpen, setDOpen] = useState(false);   // 详情 Drawer
  const [detailRule, setDetailRule] = useState<any>(null); // 当前查看的规则

  /** 加载数据 */
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

  /** 保存规则 */
  const handleSave = async (v: any) => {
    editing?.id ? await knowledgeApi.updateRule({ ...editing, ...v }) : await knowledgeApi.saveRule(v);
    message.success('保存成功'); setMOpen(false); setEditing(null); f.resetFields(); fetch();
  };

  /** 删除规则 */
  const handleDelete = async (id: number) => {
    await knowledgeApi.deleteRule(id); message.success('已删除'); fetch();
  };

  /** 保存条件 */
  const handleSaveCondition = async (v: any) => {
    await knowledgeApi.saveConditions(did!, [v]);
    message.success('条件已添加'); setCOpen(false); cf.resetFields(); loadD(did!);
  };

  /** 删除条件 */
  const handleDeleteCondition = async (cid: number) => {
    const remaining = conds.filter(c => c.id !== cid);
    await knowledgeApi.saveConditions(did!, remaining);
    message.success('条件已删除'); loadD(did!);
  };

  /** 保存标签（合并已有标签+新标签一起提交，后端先删后插） */
  const handleSaveTag = async (v: any) => {
    const merged = [...tags, v];
    await knowledgeApi.saveTags(did!, merged);
    message.success('标签已添加'); setTOpen(false); tf.resetFields(); loadD(did!);
  };

  /** 删除标签 */
  const handleDeleteTag = async (tid: number) => {
    const remaining = tags.filter(t => t.id !== tid);
    await knowledgeApi.saveTags(did!, remaining);
    message.success('标签已删除'); loadD(did!);
  };

  /** 场景保存（新增/编辑） */
  const handleSaveScenario = async (v: any) => {
    sEditing?.id ? await knowledgeApi.updateScenario({ ...sEditing, ...v }) : await knowledgeApi.saveScenario(v);
    message.success('保存成功'); setSOpen(false); setSEditing(null); sf.resetFields(); fetchS();
  };

  /** 场景删除 */
  const handleDeleteScenario = async (id: number) => {
    await knowledgeApi.deleteScenario(id); message.success('已删除'); fetchS();
  };

  /** 规则表格列 */
  const sCols = [
    { title: '场景编码', dataIndex: 'scenarioCode' },
    { title: '场景名称', dataIndex: 'scenarioName' },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作',
      render: (_: any, s: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />}
            onClick={() => { setSEditing(s); sf.setFieldsValue(s); setSOpen(true); }}>编辑</Button>
          <Popconfirm title="确认删除此场景？" onConfirm={() => handleDeleteScenario(s.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /** 规则表格列 */
  const cols = [
    { title: '规则编号', dataIndex: 'ruleCode' },
    { title: '规则名称', dataIndex: 'ruleName' },
    { title: '规则类型', dataIndex: 'ruleType', render: (t: string) => <Tag>{RULE_TYPE_MAP[t] || t}</Tag> },
    {
      title: '状态', dataIndex: 'enabled',
      render: (v: number) => v === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
    },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => { setEditing(r); f.setFieldsValue(r); setMOpen(true); }}>编辑</Button>
          <Button type="link" onClick={() => { setDetailRule(r); loadD(r.id); setDOpen(true); }}>详情</Button>
          <Popconfirm title="确认删除此规则？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>知识库管理</h2>
      <Tabs items={[
        {
          key: 'rules',
          label: '规则管理',
          children: (
            <>
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />}
                  onClick={() => { setEditing(null); f.resetFields(); setMOpen(true); }}>新增规则</Button>
              </div>
              <Table columns={cols} dataSource={rules} rowKey="id" loading={loading} />
            </>
          ),
        },
        {/* TODO: 场景管理后续重新设计后再放开
        {
          key: 'scenarios',
          label: '场景管理',
          children: (
            <>
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button onClick={() => { setSEditing(null); sf.resetFields(); setSOpen(true); }}>新增场景</Button>
              </div>
              <Table columns={sCols} dataSource={scenarios} rowKey="id" size="small"
                locale={{ emptyText: '暂无场景，点击"新增场景"添加' }} />
            </>
          ),
        },
        */}
      ]} />

      {/* 规则详情 Drawer */}
      <Drawer
        title={detailRule ? `规则详情 — ${detailRule.ruleCode}` : '规则详情'}
        open={dOpen}
        onClose={() => { setDOpen(false); setDetailRule(null); }}
        width={640}
      >
        {detailRule && (
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 24 }}>
            <Descriptions.Item label="规则编号">{detailRule.ruleCode}</Descriptions.Item>
            <Descriptions.Item label="规则名称">{detailRule.ruleName}</Descriptions.Item>
            <Descriptions.Item label="规则类型"><Tag>{RULE_TYPE_MAP[detailRule.ruleType] || detailRule.ruleType}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态">
              {detailRule.enabled === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="规则说明" span={2}>{detailRule.description || '-'}</Descriptions.Item>
          </Descriptions>
        )}

        {/* 条件列表 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>条件列表</h4>
          <Button size="small" type="primary" onClick={() => { cf.resetFields(); setCOpen(true); }}>新增条件</Button>
        </div>
        <Table dataSource={conds} rowKey="id" pagination={false} size="small"
          columns={[
            { title: '指标编码', dataIndex: 'indicatorKey' },
            { title: '运算符', dataIndex: 'operator', render: (v: string) => {
              const opt = OPERATORS.find(o => o.value === v);
              return opt ? opt.label : v;
            }},
            { title: '阈值', dataIndex: 'threshold' },
            { title: '顺序', dataIndex: 'logicOrder' },
            { title: '连接符', dataIndex: 'logicConnector', render: (v: string) => <Tag>{LOGIC_MAP[v] || v}</Tag> },
            {
              title: '操作',
              render: (_: any, c: any) => (
                <Popconfirm title="确认删除此条件？" onConfirm={() => handleDeleteCondition(c.id)}>
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              ),
            },
          ]}
          locale={{ emptyText: '暂无条件，点击"新增条件"添加' }}
        />

        {/* 标签列表 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>标签列表</h4>
          <Button size="small" type="primary" onClick={() => { tf.resetFields(); setTOpen(true); }}>新增标签</Button>
        </div>
        <Table dataSource={tags} rowKey="id" pagination={false} size="small"
          columns={[
            { title: '标签类型', dataIndex: 'tagType', render: (v: string) => <Tag color="blue">{TAG_TYPE_MAP[v] || v}</Tag> },
            { title: '标签值', dataIndex: 'tagValue' },
            {
              title: '操作',
              render: (_: any, t: any) => (
                <Popconfirm title="确认删除此标签？" onConfirm={() => handleDeleteTag(t.id)}>
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              ),
            },
          ]}
          locale={{ emptyText: '暂无标签，点击"新增标签"添加' }}
        />
      </Drawer>

      {/* 规则 Modal */}
      <Modal title={editing ? '编辑规则' : '新增规则'} open={mOpen} width={640}
        onCancel={() => { setMOpen(false); setEditing(null); }} onOk={() => f.submit()}>
        <Form form={f} layout="vertical" onFinish={handleSave}>
          <Form.Item name="ruleCode" label="规则编号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select options={[
              { label: '阈值判断', value: 'THRESHOLD' },
              { label: '布尔判断', value: 'BOOLEAN' },
              { label: '复合规则', value: 'COMPOSITE' },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="规则说明（自然语言描述）" help="Know-Kit 大模型据此理解规则意图">
            <Input.TextArea rows={4} placeholder="例：企业资产负债率超过70%且营收连续两期下降，判定为高风险" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增条件 Modal（运算符按规则类型限定） */}
      <Modal title="新增条件" open={cOpen} onCancel={() => setCOpen(false)} onOk={() => cf.submit()}>
        <Form form={cf} layout="vertical" onFinish={handleSaveCondition}>
          <Form.Item name="indicatorKey" label="指标编码" rules={[{ required: true }]}
            help="对应 indicator_data.indicator_key"><Input placeholder="如 total_assets" /></Form.Item>
          <Form.Item name="operator" label="运算符" rules={[{ required: true }]}>
            <Select options={OPS_BY_TYPE[detailRule?.ruleType] || OPERATORS} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.operator !== cur.operator}>
            {({ getFieldValue }) => {
              const op = getFieldValue('operator');
              const noThreshold = op === 'EXISTS' || op === 'NOT_EXISTS';
              const isBoolean = detailRule?.ruleType === 'BOOLEAN';
              const help = noThreshold
                ? 'EXISTS / NOT_EXISTS 无需填写阈值'
                : isBoolean ? '建议填 TRUE / FALSE' : '如 70';
              return (
                <Form.Item name="threshold" label="阈值" rules={[{ required: !noThreshold }]}
                  help={help}>
                  <Input disabled={noThreshold} placeholder={isBoolean && !noThreshold ? 'TRUE' : '如 70'} />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="logicOrder" label="逻辑顺序"><Input type="number" placeholder="1" /></Form.Item>
          <Form.Item name="logicConnector" label="连接符">
            <Select options={[{ label: '且 (AND)', value: 'AND' }, { label: '或 (OR)', value: 'OR' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增标签 Modal */}
      <Modal title="新增标签" open={tOpen} onCancel={() => setTOpen(false)} onOk={() => tf.submit()}>
        <Form form={tf} layout="vertical" onFinish={handleSaveTag}>
          <Form.Item name="tagType" label="标签类型" rules={[{ required: true }]}><Select options={TAG_TYPES} /></Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.tagType !== cur.tagType}>
            {({ getFieldValue }) => {
              const tagType = getFieldValue('tagType');
              return tagType === 'SCENARIO' ? (
                <Form.Item name="tagValue" label="标签值（场景）" rules={[{ required: true }]}
                  help="从已有场景中选择">
                  <Select placeholder="选择场景..."
                    options={scenarios.map(s => ({ label: s.scenarioName, value: s.scenarioName }))} />
                </Form.Item>
              ) : (
                <Form.Item name="tagValue" label="标签值" rules={[{ required: true }]}
                  help="用于 Know-Kit 规则匹配，如行业名称、产品名称等">
                  <Input placeholder="如 制造业" />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 场景 Modal（新增/编辑） */}
      <Modal title={sEditing ? '编辑场景' : '新增场景'} open={sOpen}
        onCancel={() => { setSOpen(false); setSEditing(null); }} onOk={() => sf.submit()}>
        <Form form={sf} layout="vertical" onFinish={handleSaveScenario}>
          <Form.Item name="scenarioCode" label="场景编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="scenarioName" label="场景名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="场景描述"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
