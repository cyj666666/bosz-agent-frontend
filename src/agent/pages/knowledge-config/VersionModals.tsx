/**
 * 知识库「发布」与「历史版本」弹窗
 *
 * React 重写自源工程 `knowledge/components/PublishVersion.vue`（114 行）
 * 与 `HistoryVersion.vue`（142 行）。
 *
 * ── 契约（逐条对齐）──
 * 发布：`publishVersion({ ...configInfo, versionNo, versionName, paramId })`
 * 编辑版本信息：`editVersion({ versionNo, versionName, paramId, id })`
 * 历史列表：`listVersions({ paramId, pageIndex: 1, pageSize: 500 })`
 * 回看某一版：把版本 id 交回父级 → 父级调 `queryVersionById(id)` 覆盖当前配置
 */
import { useCallback, useEffect, useState } from 'react';
import { Form, Input, Modal, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { editVersion, listVersions, publishVersion } from '../../api/knowledgeConfig';
import type { KnowledgeVersionRow } from '../../api/knowledgeConfig';

/* ==================== 发布 / 编辑版本 ==================== */

export interface PublishVersionModalProps {
  open: boolean;
  paramId: string;
  /** 当前完整配置（源工程把整个 configInfo 一起提交） */
  configInfo: Record<string, unknown>;
  /** 有值表示「编辑已有版本信息」而不是新建发布 */
  editId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PublishVersionModal({
  open,
  paramId,
  configInfo,
  editId,
  onClose,
  onSuccess,
}: PublishVersionModalProps) {
  const [form] = Form.useForm<{ versionNo: string; versionName: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editId) {
        await editVersion({ ...values, paramId, id: editId });
        message.success('修改成功');
      } else {
        await publishVersion({ ...configInfo, ...values, paramId });
        message.success('发布成功');
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editId ? '编辑版本信息' : '发布'}
      width={520}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={saving}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item label="版本号" name="versionNo" rules={[{ required: !editId, message: '请输入版本号' }]}>
          <Input placeholder="请输入版本号" />
        </Form.Item>
        <Form.Item label="版本描述" name="versionName">
          <Input.TextArea rows={4} placeholder="请输入版本描述" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ==================== 历史版本 ==================== */

export interface HistoryVersionModalProps {
  open: boolean;
  paramId: string;
  onClose: () => void;
  /** 选中某一版后交回父级（父级去查详情并覆盖编辑器） */
  onSelectVersion: (versionId: string) => void;
}

export function HistoryVersionModal({ open, paramId, onClose, onSelectVersion }: HistoryVersionModalProps) {
  const [rows, setRows] = useState<KnowledgeVersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<KnowledgeVersionRow | null>(null);

  const load = useCallback(async () => {
    if (!paramId) return;
    setLoading(true);
    try {
      const res = await listVersions({ paramId, pageIndex: 1, pageSize: 500 });
      // 后端可能返回 `{list: [...]}`，也可能直接是数组（不同包装层），两种都接住
      const raw = res as unknown;
      const list = Array.isArray(raw)
        ? (raw as KnowledgeVersionRow[])
        : ((raw as { list?: KnowledgeVersionRow[] })?.list ?? []);
      setRows(list);
    } catch (err) {
      setRows([]);
      message.error(err instanceof Error ? err.message : '历史版本加载失败');
    } finally {
      setLoading(false);
    }
  }, [paramId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const columns: ColumnsType<KnowledgeVersionRow> = [
    { title: '版本号', dataIndex: 'versionNo', width: 160 },
    { title: '版本描述', dataIndex: 'versionName' },
    { title: '创建时间', dataIndex: 'createTime', width: 200 },
    {
      title: '操作',
      width: 160,
      render: (_t, record) => (
        <>
          <a
            onClick={() => {
              onSelectVersion(record.id);
              onClose();
            }}
          >
            回看此版本
          </a>
          <span style={{ margin: '0 8px', color: '#d9d9d9' }}>|</span>
          <a onClick={() => setEditTarget(record)}>编辑</a>
        </>
      ),
    },
  ];

  return (
    <>
      <Modal open={open} title="历史版本" width={900} footer={null} onCancel={onClose} destroyOnClose>
        <Table<KnowledgeVersionRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
      {editTarget && (
        <PublishVersionModal
          open
          paramId={paramId}
          configInfo={{}}
          editId={editTarget.id}
          onClose={() => setEditTarget(null)}
          onSuccess={() => void load()}
        />
      )}
    </>
  );
}
