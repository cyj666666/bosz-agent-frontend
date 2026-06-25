/**
 * 数据源配置页 — 采集器列表 + 子表解析器管理
 *
 * 交互：点击采集器行的"解析器"按钮 → 下方展开该采集器下的解析器列表
 */
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { dataConfigApi } from '../../api/dataConfig';

/** 采集器类型选项 */
const CT = [
  { label: 'HTTP API', value: 'HTTP_API' },
  { label: '数据库同步', value: 'DB_SYNC' },
  { label: 'SFTP 文件', value: 'SFTP_FILE' },
  { label: '文件上传', value: 'FILE_UPLOAD' },
  { label: 'Webhook', value: 'WEBHOOK' },
];
/** 解析器类型选项 */
const PT = [
  { label: 'JSONPath 提取', value: 'JSON_PATH' },
  { label: 'Excel 模板', value: 'EXCEL_TEMPLATE' },
  { label: 'OCR 文本', value: 'OCR_TEXT' },
  { label: 'Groovy 脚本', value: 'GROOVY_SCRIPT' },
];
/** 采集类型枚举 → 中文映射 */
const CT_MAP: Record<string, string> = {};
CT.forEach(c => { CT_MAP[c.value] = c.label; });
/** 解析类型枚举 → 中文映射 */
const PT_MAP: Record<string, string> = {};
PT.forEach(c => { PT_MAP[c.value] = c.label; });

/** 数据域列表 */
const DM = [
  'FINANCE', 'CREDIT', 'TAX', 'JUDICIAL', 'SETTLEMENT',
  'INDUSTRY_COMMERCE', 'SOCIAL_SECURITY', 'CUSTOMS', 'UTILITY',
  'PROPERTY', 'GRAPH', 'MANAGEMENT',
];

/** 各采集类型的配置 JSON 示例 */
const COLLECTOR_EXAMPLES: Record<string, string> = {
  HTTP_API: `{
  "url": "https://api.example.com/data",
  "method": "GET",
  "headers": {"Authorization": "Bearer xxx"},
  "params": {"pageSize": 100, "pageNum": 1},
  "responseType": "JSON"
}`,
  DB_SYNC: `{
  "dbType": "MySQL",
  "host": "192.168.1.100",
  "port": 3306,
  "database": "source_db",
  "username": "readonly_user",
  "password": "***",
  "querySql": "SELECT * FROM financial_report WHERE update_time > ?",
  "incrementalColumn": "update_time"
}`,
  SFTP_FILE: `{
  "host": "sftp.example.com",
  "port": 22,
  "username": "data_user",
  "password": "***",
  "remotePath": "/data/reports/",
  "filePattern": "*.xlsx",
  "deleteAfterDownload": false
}`,
  FILE_UPLOAD: `{
  "allowedExtensions": [".xlsx", ".csv", ".pdf"],
  "maxFileSizeMB": 50,
  "templateId": "financial_report_template"
}`,
  WEBHOOK: `{
  "listenPath": "/webhook/data-push",
  "secret": "your_webhook_secret",
  "validateSignature": true,
  "dataFormat": "JSON"
}`,
};

/** 各解析类型的配置 JSON 示例 */
const PARSER_EXAMPLES: Record<string, string> = {
  JSON_PATH: `{
  "mappings": [
    {"key": "total_assets", "name": "总资产", "path": "$.data.totalAssets"},
    {"key": "revenue", "name": "营业收入", "path": "$.data.revenue"}
  ]
}`,
  EXCEL_TEMPLATE: `{
  "sheetName": "Sheet1",
  "startRow": 3,
  "columnMapping": {
    "A": "total_assets",
    "B": "revenue",
    "C": "net_profit"
  }
}`,
  OCR_TEXT: `{
  "keywords": ["资产总额", "营业收入", "净利润"],
  "extractPattern": "keyValue",
  "valuePosition": "right"
}`,
  GROOVY_SCRIPT: `{
  "script": "def result = [:]\\ndef json = new groovy.json.JsonSlurper().parseText(rawData)\\nresult.total_assets = json.data.totalAssets\\nreturn result"
}`,
};

export default function DataConfig() {
  const [cl, setCl] = useState<any[]>([]);         // 采集器列表
  const [pl, setPl] = useState<any[]>([]);         // 当前选中采集器的解析器列表
  const [cm, setCm] = useState(false);             // 采集器 Modal 开关
  const [pm, setPm] = useState(false);             // 解析器 Modal 开关
  const [sid, setSid] = useState<number | null>(null); // 当前选中的采集器 ID
  const [f] = Form.useForm();
  const [pf] = Form.useForm();

  /** 监听表单中选择的采集类型，动态切换 JSON 占位示例 */
  const watchedCollectorType = Form.useWatch('collectorType', f);
  const collectorPlaceholder = watchedCollectorType
    ? `请按「${CT.find(c => c.value === watchedCollectorType)?.label || watchedCollectorType}」格式填写：
${COLLECTOR_EXAMPLES[watchedCollectorType] || '{}'}`
    : '请先选择采集类型，再填写对应 JSON 配置';

  /** 监听表单中选择的解析类型，动态切换 JSON 占位示例 */
  const watchedParserType = Form.useWatch('parserType', pf);
  const parserPlaceholder = watchedParserType
    ? `请按「${PT.find(p => p.value === watchedParserType)?.label || watchedParserType}」格式填写：
${PARSER_EXAMPLES[watchedParserType] || '{}'}`
    : '请先选择解析类型，再填写对应 JSON 配置';

  /** 加载采集器列表 */
  const fc = async () => {
    const r = await dataConfigApi.pageCollector(1, 100);
    setCl(r.data.records || []);
  };
  /** 加载指定采集器的解析器列表 */
  const fp = async (id: number) => {
    setSid(id);
    const r = await dataConfigApi.listParser(id);
    setPl(r.data || []);
  };
  useEffect(() => { fc(); }, []);

  /** 采集器表格列 */
  const cc = [
    { title: '配置名称', dataIndex: 'configName' },
    { title: '采集类型', dataIndex: 'collectorType', render: (v: string) => CT_MAP[v] || v },
    { title: '定时表达式', dataIndex: 'cronExpression' },
    { title: '启用', dataIndex: 'enabled', render: (v: number) => v === 1 ? '是' : '否' },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" onClick={() => fp(r.id)}>解析器</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={async () => { await dataConfigApi.deleteCollector(r.id); fc(); }} />
        </Space>
      ),
    },
  ];
  /** 解析器表格列 */
  const pc = [
    { title: '解析类型', dataIndex: 'parserType', render: (v: string) => PT_MAP[v] || v },
    { title: '数据域', dataIndex: 'domain' },
    { title: '执行顺序', dataIndex: 'sortOrder' },
    {
      title: '操作',
      render: (_: any, r: any) => (
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

      {/* 选中采集器后展开解析器子表 */}
      {sid && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3>解析器列表</h3>
            <Button onClick={() => { pf.resetFields(); setPm(true); }}>新增解析器</Button>
          </div>
          <Table columns={pc} dataSource={pl} rowKey="id" pagination={false} />
        </div>
      )}

      {/* 新增采集器 Modal */}
      <Modal title="新增采集器" open={cm} onCancel={() => setCm(false)} onOk={() => f.submit()}>
        <Form form={f} layout="vertical" onFinish={async (v: any) => {
          await dataConfigApi.saveCollector(v);
          setCm(false); fc(); message.success('保存成功');
        }}>
          <Form.Item name="configName" label="配置名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="collectorType" label="采集类型" rules={[{ required: true }]}><Select options={CT} /></Form.Item>
          <Form.Item name="configJson" label="配置JSON" rules={[{ required: true }]}
            help="根据采集类型填写对应配置（JSON 格式）">
            <Input.TextArea rows={6} placeholder={collectorPlaceholder} />
          </Form.Item>
          <Form.Item name="cronExpression" label="定时表达式"
            help="Cron 表达式，控制采集任务的执行频率。留空则仅手动触发。">
            <Input placeholder="0 0 6 * * ?（每天早6点执行）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增解析器 Modal — sortOrder 自动递增 */}
      <Modal title="新增解析器" open={pm} onCancel={() => setPm(false)} onOk={() => pf.submit()}>
        <Form form={pf} layout="vertical" onFinish={async (v: any) => {
          await dataConfigApi.saveParser({ ...v, collectorId: sid!, sortOrder: pl.length + 1 });
          setPm(false); fp(sid!); message.success('保存成功');
        }}>
          <Form.Item name="parserType" label="解析类型" rules={[{ required: true }]}><Select options={PT} /></Form.Item>
          <Form.Item name="domain" label="数据域" rules={[{ required: true }]}>
            <Select options={DM.map(d => ({ label: d, value: d }))} />
          </Form.Item>
          <Form.Item name="configJson" label="配置JSON" rules={[{ required: true }]}
            help="根据解析类型填写对应配置（JSON 格式）">
            <Input.TextArea rows={4} placeholder={parserPlaceholder} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
