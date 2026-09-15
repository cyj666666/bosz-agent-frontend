/**
 * 指标「数据源配置」— 参数映射表格
 *
 * React 重写自源工程 `views/index/DataSourceCard.vue` 里内嵌的参数表
 * （`paramsTableData` + `paramsColumns`，模板见其 50-127 行；约 90 行逻辑）。
 * 它最终会被 `getValue()` 收进指标的 `script.paramData` 字段，后端按此解析取数参数。
 *
 * 抽成独立组件的理由：这块本身自洽（自己管增删改与单行编辑态），
 * 与 `IndexDataSourceCard` 的 SQL/知识库分支没有耦合。
 *
 * ══════════ 列与字段（逐项照抄源工程）══════════
 *   name         参数名        Input
 *   type         参数类型      Select（'1' 字符串 / '2' 整数 / '3' 布尔类型 / '4' 对象 / '5' 列表）
 *   defaultValue 默认值        Input
 *   isSync       是否同步      Select（Y 是 / N 否）
 *   desc         参数描述      Input
 *   relateIndex  关联指标编号  Select —— **存的是对象**，显示时取 `.name`
 *                                （对应源工程 `record.relateIndex ? record.relateIndex.name : ''`
 *                                 与 `amar-index-select` 的绑定方式）
 *
 * ══════════ 交互（逐项照抄）══════════
 *   新增 → push 一行 `{ id, name:'', desc:'', type:'', isSync:'Y', defaultValue:'', relateIndex:null }`
 *          并**直接进入编辑态**（源 `addParam` 末行 `editRowKey.value = id`）
 *   编辑 → 同一时刻只允许一行处于编辑态（`editRowKey`）
 *   确认/取消 → 两者都只是退出编辑态（源 `confirmRow` 对两个按钮是同一个处理）
 *   删除 → 直接移除该行
 *
 * ══════════ 一处刻意的稳健性处理 ══════════
 *   `relateIndex` 若已存在（历史数据），选择新指标时用 `{ ...旧值, ...新值 }` 合并，
 *   而不是整体替换 —— 避免把后端可能写入的其他字段抹掉。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { queryAllList } from '../../api/indexConfig';

/** 参数映射行（源工程 `paramsTableData` 的元素） */
export interface ParamMappingRow {
  id: string;
  name?: string;
  type?: string;
  defaultValue?: string;
  isSync?: string;
  desc?: string;
  /** 关联指标：对象形态（显示 `.name`） */
  relateIndex?: { paramNo?: string; name?: string; [key: string]: unknown } | null;
  [key: string]: unknown;
}

/** 参数类型选项（源 `@api/extintf.js` 的 paramTypeOptions，5 项） */
const PARAM_TYPE_OPTIONS = [
  { value: '1', label: '字符串' },
  { value: '2', label: '整数' },
  { value: '3', label: '布尔类型' },
  { value: '4', label: '对象' },
  { value: '5', label: '列表' },
];

/** 是否同步选项（源 `isSyncOptions`） */
const IS_SYNC_OPTIONS = [
  { value: 'Y', label: '是' },
  { value: 'N', label: '否' },
];

/** 源工程用 `createUUID()`；这里生成一个稳定够用的本地 id */
function createRowId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ParamMappingTableProps {
  value: ParamMappingRow[];
  onChange: (rows: ParamMappingRow[]) => void;
  disabled?: boolean;
}

export function ParamMappingTable({ value, onChange, disabled = false }: ParamMappingTableProps) {
  /** 当前处于编辑态的行 id（源 `editRowKey`） */
  const [editRowKey, setEditRowKey] = useState<string>('');
  /** 关联指标下拉选项 */
  const [indexOptions, setIndexOptions] = useState<{ value: string; label: string }[]>([]);

  const rows = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  useEffect(() => {
    queryAllList({ filters: [], pageIndex: 1, pageSize: 500 })
      .then((res) => {
        const list = (res?.list ?? []) as unknown as { paramNo?: string; paramName?: string }[];
        setIndexOptions(
          list
            .filter((i) => i.paramNo)
            .map((i) => ({ value: String(i.paramNo), label: String(i.paramName ?? i.paramNo) })),
        );
      })
      .catch(() => setIndexOptions([]));
  }, []);

  const patchRows = useCallback((next: ParamMappingRow[]) => onChange(next), [onChange]);

  const updateCell = useCallback(
    (id: string, patch: Partial<ParamMappingRow>) => {
      patchRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [rows, patchRows],
  );

  /** 源 `addParam()` */
  const addRow = () => {
    if (disabled) return;
    const id = createRowId();
    patchRows([
      ...rows,
      { id, name: '', desc: '', type: '', isSync: 'Y', defaultValue: '', relateIndex: null },
    ]);
    setEditRowKey(id); // 新行直接进编辑态
  };

  /** 源 `delRow(id)` */
  const delRow = (id: string) => {
    patchRows(rows.filter((r) => r.id !== id));
    if (editRowKey === id) setEditRowKey('');
  };

  const typeName = (v?: string) => PARAM_TYPE_OPTIONS.find((o) => o.value === String(v))?.label ?? v ?? '';
  const isSyncName = (v?: string) => IS_SYNC_OPTIONS.find((o) => o.value === String(v))?.label ?? v ?? '';

  const columns: ColumnsType<ParamMappingRow> = useMemo(
    () => [
      {
        title: '参数名',
        dataIndex: 'name',
        width: 150,
        render: (text: unknown, record) =>
          record.id === editRowKey ? (
            <Input value={record.name} onChange={(e) => updateCell(record.id, { name: e.target.value })} />
          ) : (
            <span>{text as string}</span>
          ),
      },
      {
        title: '参数类型',
        dataIndex: 'type',
        width: 130,
        render: (_text: unknown, record) =>
          record.id === editRowKey ? (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择"
              value={record.type || undefined}
              options={PARAM_TYPE_OPTIONS}
              onChange={(v) => updateCell(record.id, { type: v ?? '' })}
            />
          ) : (
            <span>{typeName(record.type)}</span>
          ),
      },
      {
        title: '默认值',
        dataIndex: 'defaultValue',
        width: 130,
        render: (text: unknown, record) =>
          record.id === editRowKey ? (
            <Input
              value={record.defaultValue}
              onChange={(e) => updateCell(record.id, { defaultValue: e.target.value })}
            />
          ) : (
            <span>{text as string}</span>
          ),
      },
      {
        title: '是否同步',
        dataIndex: 'isSync',
        width: 110,
        align: 'center',
        render: (_text: unknown, record) =>
          record.id === editRowKey ? (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择"
              value={record.isSync || undefined}
              options={IS_SYNC_OPTIONS}
              onChange={(v) => updateCell(record.id, { isSync: v ?? '' })}
            />
          ) : (
            <span>{isSyncName(record.isSync)}</span>
          ),
      },
      {
        title: '参数描述',
        dataIndex: 'desc',
        width: 180,
        render: (text: unknown, record) =>
          record.id === editRowKey ? (
            <Input value={record.desc} onChange={(e) => updateCell(record.id, { desc: e.target.value })} />
          ) : (
            <span>{text as string}</span>
          ),
      },
      {
        title: '关联指标编号',
        dataIndex: 'relateIndex',
        width: 190,
        render: (_text: unknown, record) =>
          record.id === editRowKey ? (
            <Select
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="请选择指标"
              value={record.relateIndex?.paramNo || undefined}
              options={indexOptions}
              onChange={(v) => {
                const picked = indexOptions.find((o) => o.value === v);
                // 合并而非整体替换：不抹掉后端可能写入的其他字段
                updateCell(record.id, {
                  relateIndex: v && picked ? { ...(record.relateIndex ?? {}), paramNo: v, name: picked.label } : null,
                });
              }}
            />
          ) : (
            <span>{record.relateIndex?.name ?? ''}</span>
          ),
      },
      {
        title: '操作',
        dataIndex: 'action',
        width: 150,
        fixed: 'right',
        align: 'center',
        render: (_text: unknown, record) =>
          record.id === editRowKey ? (
            <Space>
              <Button size="small" type="primary" onClick={() => setEditRowKey('')}>
                确认
              </Button>
              {/* 源工程「取消」也走 confirmRow（同样只是退出编辑态），这里保持一致 */}
              <Button size="small" onClick={() => setEditRowKey('')}>
                取消
              </Button>
            </Space>
          ) : (
            <Space>
              <Button size="small" disabled={disabled} onClick={() => setEditRowKey(record.id)}>
                编辑
              </Button>
              <Button size="small" danger disabled={disabled} onClick={() => delRow(record.id)}>
                删除
              </Button>
            </Space>
          ),
      },
    ],
    [editRowKey, disabled, indexOptions, updateCell],
  );

  return (
    <>
      <Space style={{ marginBottom: 8 }}>
        <Button type="primary" disabled={disabled} onClick={addRow}>
          添加参数
        </Button>
        {rows.length > 0 && (
          <span style={{ color: '#8c8c8c' }}>
            共 {rows.length} 个参数
          </span>
        )}
      </Space>
      <Table<ParamMappingRow>
        rowKey="id"
        size="small"
        bordered
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1040 }}
        locale={{ emptyText: '暂无参数，点「添加参数」新增' }}
        onRow={() => ({ onClick: () => undefined })}
      />
    </>
  );
}

export default ParamMappingTable;

/** 供调用方做「空值检查」时复用（避免各自写一遍 message） */
export function warnIfEmpty(rows: ParamMappingRow[]): boolean {
  if (!rows.length) {
    message.info('当前没有参数映射');
    return true;
  }
  return false;
}
