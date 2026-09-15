/**
 * agent 模块 — 可编辑的溯源表格（「列表配置」用）
 *
 * React 重写自源工程 `knowledge/components/EditTable.vue`（176 行）。
 *
 * ══════════ 源件是 vxe-table，本项目没有该依赖 ══════════
 * 源件靠 `vxe-table` 白拿了四个能力：单元格双击编辑、表头双击改名、**列拖拽排序**、
 * 表头右键「删除列」。本项目（React 19 + antd v6）没有 vxe-table，也没有装 dnd 库，
 * 所以这里用**原生 HTML5 拖拽**实现列排序，其余用受控 state + Input 实现，
 * **不引入新依赖**。
 *
 * ══════════ 数据形状 ══════════
 * 入参 `tableListData = { paramType, children:[{columnTitle, paramNo, paramName}] }`；
 * 内部转成「列 + 单行数据」（`createTraceTableDataList`）：列 = `{dataIndex: paramNo, title}`，
 * 行 = `{ [paramNo]: '{{名称||编号}}' }`。
 * 任何一次改动都重建 `tableListData` 与 `html` 并回调 `onChange`（源件 `changeTable` 同）。
 *
 * ══════════ 🔴 与源件的一处**纠错** ══════════
 * 源件 `cellChange` 直接 `const { name, id } = parseNameIdString(值)` ——
 * `parseNameIdString` 在格式不匹配时返回 `null`，于是**解构会抛 TypeError**：
 * 只要有人在单元格里手输普通文本（而不是粘 `{{名称||编号}}`），整个编辑就崩。
 * 这里改为：**解析不出来就原样保留**（不改 dataIndex、不改值），并且不静默——
 * 提示用户「请粘贴 `{{指标名称||指标编号}}` 格式」。
 * 这样既不会崩，也不会把用户的输入悄悄改掉。
 *
 * ══════════ 另一个差异：表头右键菜单 ══════════
 * 源件用 vxe 的 `menu-config`（右键表头弹「删除列」）。这里用 antd `Dropdown` 的
 * `trigger={['contextMenu']}` 挂在表头上，交互一致。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown, Input, message } from 'antd';
import {
  createTraceTableDataList,
  parseNameIdString,
  rebuildTableListData,
  toNameIdString,
} from '../utils/traceHtml';
import type { TraceTableListData, TraceTableRow } from '../utils/traceHtml';

interface EditableColumn {
  dataIndex: string;
  title: string;
}

export interface EditableTraceTableProps {
  /** 源件 props.tableListData */
  tableListData?: TraceTableListData;
  /** 变更回调（源件 emit('changeTable', { html, tableListData })） */
  onChangeTable: (payload: { html: string; tableListData: TraceTableListData }) => void;
  /** 生成 html 的函数（由调用方注入，避免本组件依赖 traceHtml 的具体实现） */
  buildHtml: (data: TraceTableListData) => string;
  /** 只读（例如指标类型不是 LIST/OBJECT 时不该出现这张表；此处留给将来复用） */
  disabled?: boolean;
}

export function EditableTraceTable({
  tableListData,
  onChangeTable,
  buildHtml,
  disabled = false,
}: EditableTraceTableProps) {
  const [columns, setColumns] = useState<EditableColumn[]>([]);
  const [row, setRow] = useState<TraceTableRow>({});
  /** 正在编辑的单元格列下标（源件 vxe 的"单元格编辑"是整格进入编辑态） */
  const [editingCell, setEditingCell] = useState<number | null>(null);
  /** 正在编辑的表头下标（源件 `startEditHeader`） */
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  /** 拖拽中的列下标（列排序） */
  const dragFrom = useRef<number | null>(null);

  /**
   * 上次**由本组件回传出去**的 tableListData 序列化值
   *
   * 用途：父级拿到新值后会 setState 再传回来，若无条件重建内部状态，
   * 正在输入的表头/单元格会被"用旧值重置"（光标跳出、输入丢失）。
   * 所以只在**外部传入的值与本组件上次回传的不一致**时才重建。
   */
  const lastEmittedRef = useRef<string>('');

  useEffect(() => {
    const incoming = tableListData ?? { children: [] };
    const serialized = JSON.stringify(incoming);
    if (serialized === lastEmittedRef.current) return;
    const { columns: cols, data } = createTraceTableDataList(incoming);
    setColumns(cols);
    setRow(data[0] ?? {});
    setEditingCell(null);
    setEditingHeader(null);
  }, [tableListData]);

  /** 重建并回传（源件 `changeTable`） */
  const emitChange = useCallback(
    (nextColumns: EditableColumn[], nextRow: TraceTableRow) => {
      const nextData = rebuildTableListData(tableListData?.paramType, nextColumns, nextRow);
      lastEmittedRef.current = JSON.stringify(nextData);
      onChangeTable({ html: buildHtml(nextData), tableListData: nextData });
    },
    [tableListData?.paramType, onChangeTable, buildHtml],
  );

  /** 提交单元格：解析 `{{名称||编号}}` → 列 dataIndex 换成编号、值规整（源件 `cellChange` 的语义） */
  const commitCell = (index: number) => {
    const col = columns[index];
    if (!col) {
      setEditingCell(null);
      return;
    }
    const parsed = parseNameIdString(draft);
    if (!parsed) {
      // 源件在这里会崩；本工程选择"原样保留 + 明确提示"
      message.warning('请使用「{{指标名称||指标编号}}」格式（可直接从左侧指标树拖入）');
      setEditingCell(null);
      return;
    }
    const nextColumns = columns.map((c, i) => (i === index ? { ...c, dataIndex: parsed.id } : c));
    const nextRow: TraceTableRow = { ...row };
    delete nextRow[col.dataIndex];
    nextRow[parsed.id] = toNameIdString(parsed.name, parsed.id);
    setColumns(nextColumns);
    setRow(nextRow);
    setEditingCell(null);
    emitChange(nextColumns, nextRow);
  };

  /** 提交表头改名（源件 `finishEditHeader` + `changeHeader`） */
  const commitHeader = (index: number) => {
    const nextColumns = columns.map((c, i) => (i === index ? { ...c, title: draft } : c));
    setColumns(nextColumns);
    setEditingHeader(null);
    emitChange(nextColumns, row);
  };

  /** 删除列（源件表头右键菜单的 'delete'） */
  const deleteColumn = (index: number) => {
    const col = columns[index];
    const nextColumns = columns.filter((_c, i) => i !== index);
    const nextRow: TraceTableRow = { ...row };
    if (col) delete nextRow[col.dataIndex];
    setColumns(nextColumns);
    setRow(nextRow);
    emitChange(nextColumns, nextRow);
  };

  /** 列排序：把 from 列插到 to 列之前（源件 vxe 的 column-dragend） */
  const moveColumn = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setColumns(next);
    emitChange(next, row);
  };

  if (columns.length === 0) {
    return <div style={{ padding: '12px 0', color: '#8c8c8c' }}>该指标暂无可用字段（无可配置的列）</div>;
  }

  return (
    <>
      {/* 样式随组件注入（agent 模块要求自包含，不新增全局 css 文件） */}
      <style>{`
        .agent-trace-editor { width: 100%; border-collapse: collapse; }
        .agent-trace-editor th, .agent-trace-editor td {
          border: 1px solid #e8e8e8;
          padding: 6px 8px;
          text-align: center;
          font-size: 13px;
          word-break: break-all;
        }
        .agent-trace-editor th { background: #fafafa; font-weight: 500; }
        .agent-trace-editor td:hover { background: #fafafa; }
      `}</style>
      <table className="agent-trace-editor">
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th
                key={`${col.dataIndex}-${index}`}
                draggable={!disabled && editingHeader !== index}
                onDragStart={() => {
                  dragFrom.current = index;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  if (from !== null) moveColumn(from, index);
                }}
                title={disabled ? undefined : '拖动可调整列顺序 · 双击改名 · 右键删除'}
                style={{ cursor: disabled ? 'default' : 'grab' }}
              >
                {editingHeader === index ? (
                  <Input
                    autoFocus
                    size="small"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitHeader(index)}
                    onPressEnter={() => commitHeader(index)}
                  />
                ) : (
                  <Dropdown
                    trigger={['contextMenu']}
                    disabled={disabled}
                    menu={{
                      items: [{ key: 'delete', label: '删除列' }],
                      onClick: ({ key }) => {
                        if (key === 'delete') deleteColumn(index);
                      },
                    }}
                  >
                    <span
                      onDoubleClick={() => {
                        if (disabled) return;
                        setDraft(col.title);
                        setEditingHeader(index);
                      }}
                    >
                      {col.title}
                    </span>
                  </Dropdown>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map((col, index) => (
              <td
                key={`${col.dataIndex}-${index}`}
                onDoubleClick={() => {
                  if (disabled) return;
                  setDraft(row[col.dataIndex] ?? '');
                  setEditingCell(index);
                }}
              >
                {editingCell === index ? (
                  <Input
                    autoFocus
                    size="small"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitCell(index)}
                    onPressEnter={() => commitCell(index)}
                  />
                ) : (
                  <span>{row[col.dataIndex] ?? ''}</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  );
}
