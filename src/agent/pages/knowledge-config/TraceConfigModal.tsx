/**
 * 知识库「溯源配置」弹窗
 *
 * React 重写自源工程 `knowledge/components/TargetTraceConfig.vue`（304 行）。
 *
 * ── 契约（逐条对齐）──
 * 列表：`queryRelateIndexList({ knowledgeId })` → `result.list`
 *      每行源工程会补一个客户端 `uuid`（用于表格 key 与新增行标识），这里用 `_key` 承担同样职责。
 * 保存：`editRelateIndex(targetList)` —— **整个数组一次性提交**（不是逐行）。
 * 新增：`unshift({ indexParam: '', indexNo: '', knowledgeId })`（源工程的行为，新行插到最前）
 * 行字段：`indexNo`（指标id）/ `indexName`（指标名称）/ `traceStatus`（开启溯源 Y|N）/
 *        `traceCardStatus`（开启溯源卡片 Y|N）
 * 左侧指标树拖节点到「指标id」输入框即填入（同 TargetConfigModal）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Input, Modal, Popconfirm, Row, Select, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Table } from 'antd';
import { IndexTreePicker } from '../../components/IndexTreePicker';
import { editRelateIndex, queryRelateIndexList } from '../../api/knowledgeConfig';

/** 溯源行（字段名与源工程一致） */
interface TraceRow {
  _key: string;
  id?: string;
  indexNo: string;
  indexName: string;
  indexParam?: string;
  knowledgeId?: string;
  traceStatus?: string;
  traceCardStatus?: string;
  [key: string]: unknown;
}

export interface TraceConfigModalProps {
  open: boolean;
  knownId: string;
  onClose: () => void;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readDragPayload(e: React.DragEvent): { label?: string; value?: string } | null {
  try {
    const raw = e.dataTransfer.getData('attr');
    if (!raw) return null;
    return JSON.parse(raw) as { label?: string; value?: string };
  } catch {
    return null;
  }
}

const YN_OPTIONS = [
  { value: 'Y', label: '是' },
  { value: 'N', label: '否' },
];

export function TraceConfigModal({ open, knownId, onClose }: TraceConfigModalProps) {
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!knownId) return;
    setLoading(true);
    try {
      const res = await queryRelateIndexList({ knowledgeId: knownId });
      const list = (res?.list ?? []) as unknown as TraceRow[];
      setRows(list.map((item) => ({ ...item, _key: item._key || uid() })));
    } catch (err) {
      setRows([]);
      message.error(err instanceof Error ? err.message : '溯源列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [knownId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const patch = (key: string, p: Partial<TraceRow>) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...p } : r)));
  };

  const handleOk = async () => {
    setSaving(true);
    try {
      const res = (await editRelateIndex(rows)) as unknown as { code?: number; success?: boolean; message?: string };
      if (res?.success || res?.code === 200) {
        message.success(res?.message ?? '保存成功');
        onClose();
      } else {
        message.error(res?.message ?? '保存失败');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<TraceRow> = [
    {
      title: '指标id',
      width: 220,
      dataIndex: 'indexNo',
      render: (_t, record) => (
        <Input
          allowClear
          placeholder="请输入指标id"
          value={record.indexNo}
          onChange={(e) => patch(record._key, { indexNo: e.target.value })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const payload = readDragPayload(e);
            if (!payload) return;
            patch(record._key, { indexNo: payload.value ?? '', indexName: payload.label ?? '' });
          }}
        />
      ),
    },
    {
      title: '指标名称',
      width: 220,
      dataIndex: 'indexName',
      render: (_t, record) => (
        <Input
          allowClear
          placeholder="请输入指标名称"
          value={record.indexName}
          onChange={(e) => patch(record._key, { indexName: e.target.value })}
        />
      ),
    },
    {
      title: '开启溯源',
      width: 140,
      dataIndex: 'traceStatus',
      render: (_t, record) => (
        <Select
          allowClear
          placeholder="请选择是否开启溯源"
          style={{ width: 120 }}
          value={record.traceStatus}
          options={YN_OPTIONS}
          onChange={(v) => patch(record._key, { traceStatus: v })}
        />
      ),
    },
    {
      title: '开启溯源卡片',
      width: 160,
      dataIndex: 'traceCardStatus',
      render: (_t, record) => (
        <Select
          allowClear
          placeholder="请选择是否开启溯源卡片"
          style={{ width: 140 }}
          value={record.traceCardStatus}
          options={YN_OPTIONS}
          onChange={(v) => patch(record._key, { traceCardStatus: v })}
        />
      ),
    },
    {
      title: '操作',
      width: 80,
      fixed: 'right',
      render: (_t, record) => (
        <Popconfirm
          title="确定删除该指标吗？"
          okText="确认"
          cancelText="取消"
          onConfirm={() => setRows((prev) => prev.filter((r) => r._key !== record._key))}
        >
          <a>删除</a>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title="溯源配置"
      width={1200}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={saving}
      destroyOnClose
    >
      <Row gutter={12}>
        <Col span={8}>
          <Card title="指标" size="small">
            <IndexTreePicker height={420} />
          </Card>
        </Col>
        <Col span={16}>
          <Button
            type="primary"
            size="small"
            style={{ marginBottom: 8 }}
            onClick={() =>
              setRows((prev) => [
                { _key: uid(), indexParam: '', indexNo: '', indexName: '', knowledgeId: knownId },
                ...prev,
              ])
            }
          >
            添加
          </Button>
          <Table<TraceRow>
            rowKey="_key"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 900, y: 380 }}
            pagination={false}
          />
        </Col>
      </Row>
    </Modal>
  );
}
