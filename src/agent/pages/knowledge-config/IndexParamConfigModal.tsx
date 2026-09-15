/**
 * 知识库「细分参数配置」弹窗
 *
 * React 重写自源工程 `knowledge/components/IndexParamConfigModal.vue`（197 行）。
 *
 * ── 契约（逐条对齐）──
 * 数据来源：**不是接口**，而是父弹窗 `configInfo.relateIndexSet`（一个 JSON 串）
 *          → 解析成行数组；保存成功后 `emit('success', JSON.stringify(arr))` 回写父级
 * 细项名称下拉：`loadTreeRoot('X02', true)` → `result`，前端补 `label = title`（源工程做法）
 * 保存：`updateKnowledge({ paramId, relateIndexSet: JSON.stringify(arr) })`
 * 行字段：`field / fieldType / isRequired / fieldName / defaultValue / relateIndex /
 *         sourceFlag（是否细分） / sourceField（细项名称）`
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox, Input, Modal, Popconfirm, Select, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getCategoryRootList, updateKnowledge } from '../../api/knowledgeConfig';
import type { CategoryNode } from '../../api/knowledgeConfig';

/** 细分参数行（字段名与源工程列定义一致） */
interface SubParamRow {
  _key: string;
  field?: string;
  fieldType?: string;
  isRequired?: boolean;
  fieldName?: string;
  defaultValue?: string;
  relateIndex?: string;
  sourceFlag?: boolean;
  sourceField?: string;
  [key: string]: unknown;
}

export interface IndexParamConfigModalProps {
  open: boolean;
  /** 知识库 id（源工程从 configInfo.paramId 取） */
  paramId: string;
  /** 父级持有的 relateIndexSet（JSON 串） */
  relateIndexSet?: string;
  onClose: () => void;
  /** 保存成功后把新的 JSON 串交回父级 */
  onSuccess?: (nextJson: string) => void;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function IndexParamConfigModal({
  open,
  paramId,
  relateIndexSet,
  onClose,
  onSuccess,
}: IndexParamConfigModalProps) {
  const [rows, setRows] = useState<SubParamRow[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryNode[]>([]);
  const [saving, setSaving] = useState(false);

  /** 解析父级传入的 relateIndexSet */
  useEffect(() => {
    if (!open) return;
    let parsed: SubParamRow[] = [];
    if (relateIndexSet) {
      try {
        const arr = JSON.parse(relateIndexSet) as SubParamRow[];
        parsed = Array.isArray(arr) ? arr : [];
      } catch {
        parsed = [];
      }
    }
    setRows(parsed.map((item) => ({ ...item, _key: item._key || uid() })));
  }, [open, relateIndexSet]);

  /** 分类字典（细项名称下拉） */
  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategoryRootList('X02', true);
      const list = Array.isArray(res) ? res : [];
      // 源工程补 label / descValue 两个字段，这里只补 label（descValue 未在本弹窗用到）
      setCategoryOptions(list.map((item) => ({ ...item, label: item.title ?? item.label })));
    } catch {
      setCategoryOptions([]);
    }
  }, []);

  useEffect(() => {
    if (open) void loadCategories();
  }, [open, loadCategories]);

  const patch = (key: string, p: Partial<SubParamRow>) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...p } : r)));
  };

  const handleOk = async () => {
    setSaving(true);
    try {
      // 提交时剔掉客户端辅助字段 _key（源工程提交的是原数组，没有这个字段）
      const payload = rows.map(({ _key, ...rest }) => rest);
      const json = JSON.stringify(payload);
      await updateKnowledge({ paramId, relateIndexSet: json });
      message.success('保存成功!');
      onSuccess?.(json);
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<SubParamRow> = useMemo(
    () => [
      { title: '序号', width: 80, align: 'center', render: (_v, _r, index) => index + 1 },
      { title: '字段', width: 160, dataIndex: 'field' },
      { title: '字段类型', width: 80, dataIndex: 'fieldType' },
      {
        title: '是否必填',
        width: 80,
        align: 'center',
        dataIndex: 'isRequired',
        render: (text: unknown) => (text === true ? '是' : text === false ? '否' : String(text ?? '')),
      },
      { title: '字段名称', width: 160, dataIndex: 'fieldName' },
      { title: '默认值', width: 160, dataIndex: 'defaultValue' },
      { title: '关联指标', dataIndex: 'relateIndex' },
      {
        title: '是否细分',
        align: 'center',
        width: 150,
        dataIndex: 'sourceFlag',
        render: (_t, record) => (
          <Checkbox checked={record.sourceFlag} onChange={(e) => patch(record._key, { sourceFlag: e.target.checked })} />
        ),
      },
      {
        title: '细项名称',
        dataIndex: 'sourceField',
        width: 250,
        render: (_t, record) =>
          record.sourceFlag ? (
            <Select
              allowClear
              showSearch
              style={{ width: 230 }}
              placeholder="请选择细项"
              optionFilterProp="label"
              value={record.sourceField}
              options={categoryOptions.map((c) => ({
                value: String(c.value ?? c.id ?? ''),
                label: String(c.label ?? c.title ?? ''),
              }))}
              onChange={(v) => patch(record._key, { sourceField: v })}
            />
          ) : (
            <Input
              allowClear
              placeholder="请输入细项名称"
              value={record.sourceField}
              onChange={(e) => patch(record._key, { sourceField: e.target.value })}
            />
          ),
      },
      {
        title: '操作',
        width: 80,
        fixed: 'right',
        render: (_t, record) => (
          <Popconfirm
            title="确定删除该行吗？"
            okText="确认"
            cancelText="取消"
            onConfirm={() => setRows((prev) => prev.filter((r) => r._key !== record._key))}
          >
            <a>删除</a>
          </Popconfirm>
        ),
      },
    ],
    [categoryOptions],
  );

  return (
    <Modal
      open={open}
      title="指标参数细类配置"
      width={1400}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={saving}
      destroyOnClose
    >
      <Table<SubParamRow>
        rowKey="_key"
        size="small"
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1300, y: 420 }}
        pagination={false}
      />
    </Modal>
  );
}
