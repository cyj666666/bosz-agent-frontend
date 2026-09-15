/**
 * 知识库「配置参数」弹窗（黑盒参数的参数表）
 *
 * React 重写自源工程 `knowledge/components/ConfigParams.vue`（209 行）
 * 与它的子弹窗 `SelectParams.vue`（209 行，已内联为本文件的 `SelectParamsModal`）。
 *
 * ── 契约（逐条对齐）──
 * 列表：`getKnowledgeParamsList({ relateKnowledgeId })` → `result.list`
 * 字典下拉：`getDictList()` → `result.records`（已由后端 `AgentDictController` 在
 *          `/api/agent/sys/dict/list` 补齐，对应源工程的 Jeecg `/sys/dict/list`）
 * 选字典联动：`getDictItems(dictCode)` → 取 `[0].fieldAttr` 写入 `relateDictValue`
 *            （源 `changeRelat` 就是这么做的；该值是"表单结构 JSON 串"，
 *             黑盒配置弹窗会 `JSON.parse` 后当动态表单的 options 用）
 * 行内保存：`updateKnowledgeParams({ id, relateDictId, showName, paramDesc, relateDictValue })`
 * 删除：`deleteKnowledgeParams({ id })`；批量：`batchDeleteKnowledgeParams(ids)`
 * 选择参数：`getParamSelectList({ relateKnowledgeId })` → 勾选 → `batchAddKnowledgeParams(数组)`
 *
 * ── 行内编辑状态说明 ──
 * 源工程把 `allowEdit` 挂在行对象上（Vue 的可变对象直接改），React 侧改为
 * `editingId` 单值状态——**同一时刻只允许编辑一行**，这正是源工程
 * `editItem` 的行为（`dataSource.map(i => (i.allowEdit = false))` 先把别的行全关掉）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, Popconfirm, Select, Space, Table, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  batchAddKnowledgeParams,
  batchDeleteKnowledgeParams,
  deleteKnowledgeParams,
  getDictItems,
  getDictList,
  getKnowledgeParamsList,
  getParamSelectList,
  updateKnowledgeParams,
} from '../../api/knowledgeConfig';
import type { DictRow, ParamSelectRow } from '../../api/knowledgeConfig';

/** 行数据（源工程列定义的数据字段） */
interface ParamRow {
  id: string;
  paramCode?: string;
  paramName?: string;
  paramType?: string;
  relateSourceParam?: string;
  relateDictId?: string;
  /** 字典第一项的 fieldAttr（表单结构 JSON 串） */
  relateDictValue?: string;
  showName?: string;
  paramDesc?: string;
  [key: string]: unknown;
}

export interface ConfigParamsModalProps {
  open: boolean;
  knownId: string;
  onClose: () => void;
}

/* ==================== 子弹窗：选择参数 ==================== */

/** `getParamSelectList` 的返回项（外层按 paramNo 分组，内层 params 是字段行） */
interface ParamSelectGroup {
  paramNo: string;
  params?: (ParamSelectRow & {
    field?: string;
    fieldType?: string;
    fieldName?: string;
    isRequired?: boolean;
    defaultValue?: string;
    relateIndex?: string;
    sourceFlag?: boolean;
    sourceField?: string;
    isSelect?: boolean;
  })[];
}

/** 扁平化后的可选参数行（原本嵌在分组里，需补 paramNo 与表格 rowKey） */
type FlatSelectRow = NonNullable<ParamSelectGroup['params']>[number] & {
  /** 所属 paramNo（源工程在 getList 里回填到每个 item 上） */
  paramNo: string;
  /** 表格 rowKey 用的唯一键 */
  rowKey: string;
};

function SelectParamsModal({
  open,
  knownId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  knownId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rows, setRows] = useState<FlatSelectRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedKeys([]);
    setLoading(true);
    getParamSelectList({ relateKnowledgeId: knownId })
      .then((res) => {
        // res.list 的元素是「按 paramNo 分组」的，内层 params 才是字段行；
        // 源工程在 getList 里把外层 paramNo 回填到每个 item 上，这里同样处理。
        const groups = (res?.list ?? []) as unknown as ParamSelectGroup[];
        const flat: FlatSelectRow[] = [];
        groups.forEach((group) => {
          (group.params ?? []).forEach((item, idx) => {
            flat.push({ ...item, paramNo: group.paramNo, rowKey: `${group.paramNo}_${idx}` });
          });
        });
        setRows(flat);
      })
      .catch((err: unknown) => {
        setRows([]);
        message.error(err instanceof Error ? err.message : '可选参数加载失败');
      })
      .finally(() => setLoading(false));
  }, [open, knownId]);

  const handleOk = async () => {
    const selected = rows.filter((row) => selectedKeys.includes(row.rowKey));
    // 入参形状逐条对齐源工程 handleOk 的映射
    const params = selected.map((i) => ({
      paramCode: i.field,
      paramName: i.fieldName,
      paramType: i.fieldType,
      relateSourceParam: i.sourceField,
      paramNo: i.paramNo,
      paramValue: '',
      relateKnowledgeId: knownId,
    }));
    if (!params.length) {
      message.warning('未选择参数！');
      return;
    }
    setSaving(true);
    try {
      const res = (await batchAddKnowledgeParams(params)) as unknown as { code?: number; success?: boolean };
      if (res?.success || res?.code === 200) {
        message.success('新增参数成功！');
        onSuccess();
        onClose();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '新增参数失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<FlatSelectRow> = [
    { title: '序号', width: 80, align: 'center', render: (_v, _r, index) => index + 1 },
    { title: '字段', width: 160, dataIndex: 'field' },
    { title: '字段类型', width: 80, dataIndex: 'fieldType' },
    { title: '字段名称', width: 160, dataIndex: 'fieldName' },
    {
      title: '是否必填',
      width: 80,
      align: 'center',
      dataIndex: 'isRequired',
      render: (text: unknown) => (text === true ? '是' : text === false ? '否' : String(text ?? '')),
    },
    { title: '默认值', dataIndex: 'defaultValue' },
    { title: '关联指标', dataIndex: 'relateIndex' },
    { title: '是否细分', width: 150, align: 'center', dataIndex: 'sourceFlag' },
    { title: '细项名称', dataIndex: 'sourceField', width: 250 },
  ];

  return (
    <Modal
      open={open}
      title="选择参数"
      width={1200}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={saving}
      destroyOnClose
    >
      <Table<FlatSelectRow>
        rowKey="rowKey"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1200 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys),
          getCheckboxProps: (record) => ({ disabled: record.isSelect === true }),
        }}
      />
    </Modal>
  );
}

/* ==================== 主弹窗：配置参数 ==================== */

export function ConfigParamsModal({ open, knownId, onClose }: ConfigParamsModalProps) {
  const [rows, setRows] = useState<ParamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dictOptions, setDictOptions] = useState<DictRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [selectParamsOpen, setSelectParamsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!knownId) return;
    setLoading(true);
    try {
      const res = await getKnowledgeParamsList({ relateKnowledgeId: knownId });
      setRows((res?.list ?? []) as unknown as ParamRow[]);
      setEditingId(null);
    } catch (err) {
      setRows([]);
      message.error(err instanceof Error ? err.message : '参数列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [knownId]);

  const loadDicts = useCallback(async () => {
    try {
      const res = await getDictList();
      setDictOptions(res?.records ?? []);
    } catch {
      setDictOptions([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    void loadDicts();
  }, [open, load, loadDicts]);

  /** 选中字典后把第一项的 fieldAttr 写进 relateDictValue（与源 changeRelat 一致） */
  const changeRelat = async (dictCode: string | undefined, record: ParamRow) => {
    setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, relateDictId: dictCode } : r)));
    if (!dictCode) return;
    try {
      const items = await getDictItems(dictCode);
      const fieldAttr = items?.[0]?.fieldAttr ?? '';
      setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, relateDictValue: fieldAttr } : r)));
    } catch {
      // 字典项取不到时不阻塞编辑，保持 relateDictValue 为空
    }
  };

  const saveEdit = async (record: ParamRow) => {
    try {
      await updateKnowledgeParams({
        id: record.id,
        relateDictId: record.relateDictId,
        showName: record.showName,
        paramDesc: record.paramDesc,
        relateDictValue: record.relateDictValue,
      });
      message.success('保存成功！');
      setEditingId(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const columns: ColumnsType<ParamRow> = [
    { title: '参数编码', width: 160, dataIndex: 'paramCode' },
    { title: '参数名称', width: 160, dataIndex: 'paramName' },
    { title: '参数类型', width: 140, dataIndex: 'paramType' },
    {
      title: '关联细类名称',
      width: 200,
      ellipsis: true,
      dataIndex: 'relateSourceParam',
      render: (text: unknown) =>
        text ? (
          <Tooltip title={String(text)}>
            <span>{String(text)}</span>
          </Tooltip>
        ) : null,
    },
    {
      title: '关联数据字典',
      width: 180,
      dataIndex: 'relateDictId',
      render: (_text: unknown, record) => {
        const editable = editingId === record.id;
        return (
          <Select
            allowClear
            showSearch
            style={{ width: 180 }}
            disabled={!editable}
            value={record.relateDictId}
            optionFilterProp="label"
            options={dictOptions.map((d) => ({ value: d.dictCode, label: d.dictName }))}
            onChange={(v) => void changeRelat(v, record)}
          />
        );
      },
    },
    {
      title: '前端展示参数',
      width: 160,
      dataIndex: 'showName',
      render: (_text: unknown, record) => (
        <Input
          allowClear
          disabled={editingId !== record.id}
          value={record.showName}
          onChange={(e) =>
            setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, showName: e.target.value } : r)))
          }
        />
      ),
    },
    {
      title: '参数说明',
      width: 160,
      dataIndex: 'paramDesc',
      render: (_text: unknown, record) => (
        <Input
          allowClear
          disabled={editingId !== record.id}
          value={record.paramDesc}
          onChange={(e) =>
            setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, paramDesc: e.target.value } : r)))
          }
        />
      ),
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_text: unknown, record) => (
        <Space>
          {editingId === record.id ? (
            <a onClick={() => void saveEdit(record)}>保存</a>
          ) : (
            <a onClick={() => setEditingId(record.id)}>编辑</a>
          )}
          <Popconfirm
            title="是否要删除此项参数?"
            okText="确认"
            cancelText="取消"
            onConfirm={async () => {
              try {
                await deleteKnowledgeParams({ id: record.id });
                message.success('删除成功！');
                void load();
              } catch (err) {
                message.error(err instanceof Error ? err.message : '删除失败');
              }
            }}
          >
            <a>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const deleteBatch = async () => {
    if (!selectedKeys.length) {
      message.warning('请选择要删除的参数！');
      return;
    }
    try {
      await batchDeleteKnowledgeParams(selectedKeys.map(String));
      setSelectedKeys([]);
      message.success('删除成功！');
      void load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量删除失败');
    }
  };

  return (
    <>
      <Modal open={open} title="配置参数" width={1400} footer={null} onCancel={onClose} destroyOnClose>
        <Space style={{ marginBottom: 10 }}>
          <Button type="primary" onClick={() => setSelectParamsOpen(true)}>
            选择参数
          </Button>
          <Button danger onClick={() => void deleteBatch()}>
            删除
          </Button>
        </Space>
        <Table<ParamRow>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1200 }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys) }}
        />
      </Modal>

      {selectParamsOpen && (
        <SelectParamsModal
          open={selectParamsOpen}
          knownId={knownId}
          onClose={() => setSelectParamsOpen(false)}
          onSuccess={() => void load()}
        />
      )}
    </>
  );
}
