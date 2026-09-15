/**
 * 知识库「溯源配置」弹窗
 *
 * React 重写自源工程**活代码** `knowledge/components/TargetTraceConfig.vue`（300 行）
 * 及其每行卡片 `TargetTraceItem.vue`（572 行）。
 *
 * ⚠️ 源端同目录还有 `TraceabilityConfigModal.vue` / `ConfigTraceability.vue` 两个同名近义的
 * 「溯源配置」——它们只被 **V1** `KnownConfigModal.vue` 引用（= 死代码），活编辑器是
 * `KnownList.vue` → `KnownConfigModalV2.vue` → **TargetTraceConfig**。本文件以活代码为源。
 *
 * ══════════ 形态（与源逐条对齐）══════════
 * · **全屏弹框**：`width=100vw`、贴顶、body 高度 `calc(100vh - 108px)`；
 * · 左栏（span 6）：「指标」卡片 = 指标树 + 右上角**折叠按钮**（贴边小箭头）+ **「复制」开关**，
 *   开关打开后点指标即把 `{{指标名称||指标编号}}` 复制到剪贴板（方便粘到右侧列表里）；
 * · 右栏（span 18/24）：「添加新指标」→ 4 条件筛选（指标id / 指标名称 / 开启溯源 / 开启溯源卡片）
 *   → **卡片列表** → **服务端分页**；
 * · 每张卡片：指标名称（可编辑 + **支持从左侧拖指标进来**）、指标id（**只读**）、
 *   开启溯源 Switch、溯源卡片 Switch（仅 `addType==='bland'` 时显示）、保存图标、删除、预览、
 *   展开箭头（仅 `traceCardStatus==='Y'` 时可展开）；
 * · 展开后是 **traceConfig 三段式**：列表（可编辑表格）/ 卡片（两张参数表 + 添加参数）/ 原始文本。
 *
 * ══════════ 🔴 保存模型（照抄源端，但要比源端说清楚）══════════
 * 源端 `:footer="null"` ⇒ **没有底部保存按钮**，所有落库都是**逐行即时**发生的：
 *   · 切换「开启溯源 / 溯源卡片」→ 立即 `editIndex([单行])`；
 *   · 点保存图标 → `editIndex([单行])`；
 *   · 删除 → `deleteIndex([单行 id])`；
 *   · 把指标**拖进**卡片 → 新行走 `addIndex`、已有行走 `editIndex`。
 * 本工程保持同一模型（**不新增整表保存**，因为后端 `/relate/index/edit` 是 `updateBatchById`，
 * 无 id 的新行根本更新不到）。为了消除"找不到保存按钮"的困惑，底部加了一行**说明文字**而不是按钮。
 *
 * ══════════ 与源端的有意差异（3 处，都会在注释里说明）══════════
 * 1. **列拖拽排序**：源端靠 `vxe-table` 免费拿到；本项目无该依赖，用**原生 HTML5 拖拽**实现（见 `EditableTraceTable`）。
 * 2. **容器不可用的兜底**：源端 `JSON.parse(traceConfig)` 无 try/catch（脏数据会白屏），这里加了容错。
 * 3. **预览主体名**：源端把 `entName` **写死**成 `科大讯飞股份有限公司`（演示数据残留），
 *    这里收进常量 `PREVIEW_ENT_NAME` 并标注——行为一致，但现场要改只用改一处。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  Card,
  Col,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  EyeOutlined,
  QuestionCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { FilterForm } from '../../components/FilterForm';
import type { FilterField } from '../../components/FilterForm';
import { IndexTreePicker } from '../../components/IndexTreePicker';
import type { IndexTreePickerNode } from '../../components/IndexTreePicker';
import { EditableTraceTable } from '../../components/EditableTraceTable';
import { TracePreviewPanel } from '../../components/TracePreviewPanel';
import { createTraceHtml, toNameIdString } from '../../utils/traceHtml';
import type { TraceTableListData } from '../../utils/traceHtml';
import {
  addRelateIndex,
  deleteRelateIndex,
  editRelateIndex,
  queryRelateIndexList,
  resourcePreview,
} from '../../api/knowledgeConfig';
import { relateParams } from '../../api/indexConfig';

/**
 * 溯源预览用的主体名
 *
 * ⚠️ 源工程 `TargetTraceItem.previewHandle` 里**写死**了 `entName: '科大讯飞股份有限公司'`
 * （明显是演示数据残留）。这里保持行为一致（否则预览取数口径就变了），
 * 但集中到常量，现场要换成真实主体只改这一处。
 */
const PREVIEW_ENT_NAME = '科大讯飞股份有限公司';
/** 预览请求的版本号（源工程写死 'V2'） */
const PREVIEW_VERSION = 'V2';

/** 是否 Y/N 下拉（源 `options` 里 traceStatus / traceCardStatus 两支） */
const YN_OPTIONS = [
  { label: '是', value: 'Y' },
  { label: '否', value: 'N' },
];

/** 4 条件筛选（源 `FilterForm` 的 options，字段名与后端 `KnowledgeRelateIndexReq` 一致） */
const FILTER_FIELDS: FilterField[] = [
  { field: 'indexNo', label: '指标id', type: 'input', placeholder: '请输入指标id', width: 200 },
  { field: 'indexName', label: '指标名称', type: 'input', placeholder: '请输入指标名称', width: 200 },
  { field: 'traceStatus', label: '开启溯源', type: 'select', placeholder: '请选择是否开启溯源', options: YN_OPTIONS },
  {
    field: 'traceCardStatus',
    label: '开启溯源卡片',
    type: 'select',
    placeholder: '请选择是否开启溯源卡片',
    options: YN_OPTIONS,
  },
];

/** 「卡片」tab 的固定参数初值（源 `js/config.js` 的 `DEFAULT_DATASOURCE`） */
const DEFAULT_DATASOURCE: TraceParamRow[] = [
  { urlParam: 'desc' },
  { urlParam: 'content' },
  { urlParam: 'siteName' },
  { urlParam: 'url' },
];

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 一行关联指标（= 后端 `KnowledgeRelateIndexEntity` 的字段 + 客户端 `_key`） */
interface TraceRow {
  _key: string;
  id?: number | string;
  knowledgeId?: string;
  indexNo?: string;
  indexName?: string;
  indexParam?: string;
  indexType?: string;
  addType?: string;
  supplierId?: string;
  intfNo?: string;
  parentIndexNo?: string;
  traceStatus?: string;
  traceCardStatus?: string;
  traceConfig?: string;
  [key: string]: unknown;
}

/** 「卡片」tab 参数表的一行（源 `DEFAULT_COLUMNS` 的四个字段） */
interface TraceParamRow {
  id?: string;
  /** 固定参数（url 参数名） */
  urlParam?: string;
  /** 参数名称 */
  paramName?: string;
  /** 参数映射 */
  paramMapping?: string;
  [key: string]: unknown;
}

/** 一张溯源卡片（= 源 `traceInfo`） */
interface TraceInfo {
  /** listType / cardType / originType */
  sourceType?: string;
  /** 原始文本：`{{指标名称||指标编号}}`（源件同时写进 source_anchor） */
  originText?: string;
  title?: string;
  site?: string;
  html?: string;
  paramType?: string;
  tableListData?: TraceTableListData;
  relateParamsOptions?: { label: string; value: string }[];
  defaultParams?: TraceParamRow[];
  inputParam?: TraceParamRow[];
  [key: string]: unknown;
}

/** 去掉客户端辅助字段（后端实体没有 `_key`） */
function cleanRow(row: TraceRow): Omit<TraceRow, '_key'> {
  const { _key, ...rest } = row;
  void _key;
  return rest;
}

/* ==================== 卡片内：参数表（卡片 tab 的两张表） ==================== */

/**
 * 「卡片」tab 里的参数表（源 `TargetTraceItem` 里那两张 `a-table`）
 *
 * 源端两张表共用一套列定义（`DEFAULT_COLUMNS`，顺序是 **固定参数 / 参数映射 / 参数名称 / 操作**），
 * 区别只有两点：
 *   · `defaultParams`（默认参数）的「固定参数」列**编辑时禁用**；
 *   · 只有 `inputParam`（输入参数）的操作列带「删除」。
 * 编辑是**行级**的（`editRowKey`，同一时刻只有一行可编辑），与源端一致。
 */
function TraceParamTable({
  rows,
  editRowKey,
  setEditRowKey,
  onChangeRow,
  onDeleteRow,
  mappingOptions,
  disableUrlParam,
}: {
  rows: TraceParamRow[];
  editRowKey: string;
  setEditRowKey: (key: string) => void;
  onChangeRow: (rowKey: string, patch: Partial<TraceParamRow>) => void;
  onDeleteRow?: (rowKey: string) => void;
  mappingOptions: { label: string; value: string }[];
  disableUrlParam?: boolean;
}) {
  const columns: ColumnsType<TraceParamRow> = [
    {
      title: '固定参数',
      dataIndex: 'urlParam',
      width: 90,
      render: (_v, record) => {
        const editing = record.id === editRowKey;
        if (!editing) return <span>{record.urlParam ?? ''}</span>;
        return (
          <Input
            size="small"
            disabled={disableUrlParam}
            value={record.urlParam ?? ''}
            onChange={(e) => onChangeRow(String(record.id), { urlParam: e.target.value })}
          />
        );
      },
    },
    {
      title: '参数映射',
      dataIndex: 'paramMapping',
      width: 120,
      render: (_v, record) => {
        const editing = record.id === editRowKey;
        if (!editing) return <span>{record.paramMapping ?? ''}</span>;
        return (
          <Select
            allowClear
            showSearch
            size="small"
            style={{ width: 280, maxWidth: '100%' }}
            placeholder="请选择参数映射"
            optionFilterProp="label"
            value={record.paramMapping || undefined}
            options={mappingOptions}
            onChange={(v) => onChangeRow(String(record.id), { paramMapping: v ?? '' })}
          />
        );
      },
    },
    {
      title: '参数名称',
      dataIndex: 'paramName',
      width: 100,
      render: (_v, record) => {
        const editing = record.id === editRowKey;
        if (!editing) return <span>{record.paramName ?? ''}</span>;
        return (
          <Input
            size="small"
            value={record.paramName ?? ''}
            onChange={(e) => onChangeRow(String(record.id), { paramName: e.target.value })}
          />
        );
      },
    },
    {
      title: '操作',
      width: 110,
      align: 'center',
      render: (_v, record) => {
        const editing = record.id === editRowKey;
        if (editing) {
          return (
            <Space size={4}>
              <Button size="small" type="primary" onClick={() => setEditRowKey('')}>
                确认
              </Button>
            </Space>
          );
        }
        return (
          <Space size={4}>
            <Button size="small" onClick={() => setEditRowKey(String(record.id))}>
              编辑
            </Button>
            {onDeleteRow && (
              <Popconfirm title="确认要删除此项吗？" onConfirm={() => onDeleteRow(String(record.id))}>
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Table<TraceParamRow>
      rowKey={(record) => String(record.id ?? '')}
      size="small"
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 620 }}
    />
  );
}

/* ==================== 卡片本体 ==================== */

function TraceCard({
  row,
  knownId,
  onPatch,
  onRemove,
  onReload,
}: {
  row: TraceRow;
  knownId: string;
  onPatch: (key: string, patch: Partial<TraceRow>) => void;
  onRemove: (key: string) => void;
  onReload: () => void;
}) {
  const [expand, setExpand] = useState(false);
  const [traceInfo, setTraceInfo] = useState<TraceInfo>({});
  const [saving, setSaving] = useState(false);
  /** 行级编辑：两张参数表共用（源 `editRowKey`） */
  const [editRowKey, setEditRowKey] = useState('');
  /** 预览 html（字符串化 JSON 数组） */
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  /** 本组件**最后一次写出去**的 traceConfig / 本行的 id，用于避免自我回灌 */
  const lastWrittenRef = useRef<string>('');
  const lastIdRef = useRef<string>('');

  /** 写回本行（源 `changeHandle`：只改 sigleTarget.traceConfig，不落库） */
  const writeTraceInfo = useCallback(
    (next: TraceInfo) => {
      setTraceInfo(next);
      const json = JSON.stringify(next);
      lastWrittenRef.current = json;
      onPatch(row._key, { traceConfig: json });
    },
    [onPatch, row._key],
  );

  /**
   * 重建 `traceConfig` 的 html / tableListData（源 `getListData` + `insertAndRefresh`）
   *
   * 只处理 LIST / OBJECT：其它类型（CHAR/NUMBER…）源端直接切到「原始文本」tab，不拉字段列表。
   */
  const rebuildFromIndex = useCallback(
    (base: TraceInfo, indexName: string, indexNo: string, indexType?: string) => {
      const next: TraceInfo = { ...base, originText: toNameIdString(indexName, indexNo) };
      if (indexType !== 'LIST' && indexType !== 'OBJECT') {
        writeTraceInfo({ ...next, sourceType: 'originType' });
        return;
      }
      writeTraceInfo({ ...next, sourceType: 'listType' });
      relateParams({ paramNo: indexNo })
        .then((res) => {
          const list = Array.isArray(res)
            ? (res as unknown as { label: string; paramNo: string; value: string; paramType?: string }[])
            : [];
          const tableData: TraceTableListData = {
            paramType: indexType,
            children: list.map((i) => ({
              columnTitle: i.label,
              paramNo: i.paramNo,
              paramName: i.label,
            })),
          };
          writeTraceInfo({
            ...next,
            sourceType: 'listType',
            relateParamsOptions: list.map((i) => ({ label: i.label, value: i.value })),
            tableListData: tableData,
            html: createTraceHtml(tableData),
          });
        })
        .catch(() => {
          // 取不到字段列表时不阻塞（源端同样只是静默失败）
        });
    },
    [writeTraceInfo],
  );

  /** 外部 traceConfig 变化 → 同步进内部状态（源 `watch(props.item)`） */
  useEffect(() => {
    const raw = typeof row.traceConfig === 'string' ? row.traceConfig : '';
    const idKey = String(row.id ?? '');
    const sameRaw = raw === lastWrittenRef.current;
    const sameId = idKey === lastIdRef.current;
    if (sameRaw && sameId) return;

    lastIdRef.current = idKey;
    lastWrittenRef.current = raw;
    let parsed: TraceInfo = {};
    if (raw) {
      try {
        const obj = JSON.parse(raw) as TraceInfo;
        if (obj && typeof obj === 'object') parsed = obj;
      } catch {
        // 源端这里没有 try/catch，脏数据会直接白屏；本工程退化为"当作空配置"
        parsed = {};
      }
    }
    setTraceInfo(parsed);
    setEditRowKey('');
    // 源端：traceConfig 里没有 originText 时重新拉一次字段并重建 html（**不落库**）
    if (!parsed.originText && row.indexNo) {
      rebuildFromIndex(parsed, String(row.indexName ?? ''), String(row.indexNo), row.indexType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.traceConfig, row.id, row.indexNo]);

  /** 单行落库（源 `saveSigle` / `changeStatus` / `changeCard` 都走这里） */
  const persist = useCallback(
    async (patch: Partial<TraceRow>, traceConfigOverride?: string) => {
      if (!row.id) {
        message.warning('该指标尚未落库，请先把指标从左侧拖到「指标名称」上');
        return;
      }
      setSaving(true);
      try {
        const next = cleanRow({
          ...row,
          ...patch,
          traceConfig: traceConfigOverride ?? row.traceConfig,
        });
        const res = await editRelateIndex([next]);
        message.success(typeof res === 'string' ? res : '保存成功！');
        onPatch(row._key, patch);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '保存失败');
      } finally {
        setSaving(false);
      }
    },
    [row, onPatch],
  );

  /** 删除（源 `deleteHandle`：无 id 只删本地行，有 id 先调删除接口） */
  const doDelete = useCallback(async () => {
    if (!row.id) {
      onRemove(row._key);
      message.success('删除成功');
      return;
    }
    try {
      const res = await deleteRelateIndex([Number(row.id)]);
      message.success(typeof res === 'string' ? res : '删除成功');
      onRemove(row._key);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  }, [row.id, row._key, onRemove]);

  /** 拖入指标（源 `drop`：先确认，再按是否有 id 决定 addIndex / editIndex） */
  const handleDropIndicator = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      let payload: { label?: string; value?: string; paramType?: string } | null = null;
      try {
        const raw = e.dataTransfer.getData('attr');
        if (raw) payload = JSON.parse(raw) as { label?: string; value?: string; paramType?: string };
      } catch {
        payload = null;
      }
      if (!payload?.value) return;
      const indexName = payload.label ?? '';
      const indexNo = payload.value;
      const indexType = payload.paramType ?? '';
      Modal.confirm({
        title: '您要使用该指标吗？',
        onOk: () => {
          // 与源端同序：先落本行的名称/编号，再重建 traceConfig（内存态），最后按有无 id 决定 add / edit
          onPatch(row._key, { indexName, indexNo, indexType });
          rebuildFromIndex({ ...traceInfo }, indexName, indexNo, indexType);
          if (row.id) {
            // ⚠️ 这里**不传 traceConfig**：源端 `editTarget` 只提交 knowledgeId/indexNo/indexName/id，
            //    重建出来的 html 属于"内存态"，要用户点保存图标才落库（保持同一保存模型）。
            void editRelateIndex([{ knowledgeId: knownId, indexNo, indexName, id: row.id }])
              .then(() => {
                message.success('保存成功！');
                onReload();
              })
              .catch((err: unknown) => message.error(err instanceof Error ? err.message : '保存失败'));
          } else {
            void addRelateIndex({ knowledgeId: knownId, indexNo, indexName })
              .then(() => {
                message.success('新增成功！');
                onReload();
              })
              .catch((err: unknown) => message.error(err instanceof Error ? err.message : '新增失败'));
          }
        },
      });
    },
    [traceInfo, row, onPatch, rebuildFromIndex, knownId, onReload],
  );

  /** 预览（源 `previewHandle`） */
  const doPreview = useCallback(() => {
    setPreviewOpen(true);
    setPreviewHtml('');
    const { originText, ...rest } = traceInfo;
    const config = {
      paramItem: {},
      defaultParams: [],
      inputParam: [],
      ...rest,
      source_anchor: originText,
    };
    void resourcePreview({
      paramId: knownId,
      resourceContent: [
        {
          config,
          paramType: row.indexType ?? '',
          id: row.id ?? '',
          output: { [String(row.indexNo ?? '')]: [] },
        },
      ],
      params: { entName: PREVIEW_ENT_NAME, version: PREVIEW_VERSION },
    })
      .then((res) => {
        setPreviewHtml(typeof res === 'string' ? res : JSON.stringify(res ?? []));
      })
      .catch(() => setPreviewHtml(''));
  }, [traceInfo, knownId, row.indexType, row.id, row.indexNo]);

  const isListLike = row.indexType === 'LIST' || row.indexType === 'OBJECT';
  const canExpand = row.traceCardStatus === 'Y';
  const isNewRow = !row.id;

  /** 「卡片」tab 两张参数表的数据操作 */
  const patchParam = (field: 'defaultParams' | 'inputParam', rowKey: string, patch: Partial<TraceParamRow>) => {
    const rows = (traceInfo[field] ?? []).map((r) => (String(r.id) === rowKey ? { ...r, ...patch } : r));
    writeTraceInfo({ ...traceInfo, [field]: rows });
  };
  const deleteInputParam = (rowKey: string) => {
    const rows = (traceInfo.inputParam ?? []).filter((r) => String(r.id) !== rowKey);
    writeTraceInfo({ ...traceInfo, inputParam: rows });
  };
  const addParam = () => {
    const id = uid();
    writeTraceInfo({
      ...traceInfo,
      inputParam: [...(traceInfo.inputParam ?? []), { id, urlParam: '', paramName: '', paramMapping: '' }],
    });
    setEditRowKey(id);
  };

  const tabItems = useMemo(() => {
    const items = [] as { key: string; label: string; children: ReactNode }[];
    if (isListLike) {
      items.push({
        key: 'listType',
        label: '列表',
        children: (
          <div>
            <Space style={{ marginBottom: 12 }} size={16} wrap>
              <span>
                标题：
                <Input
                  style={{ width: 280 }}
                  value={traceInfo.title ?? ''}
                  onChange={(e) => writeTraceInfo({ ...traceInfo, title: e.target.value })}
                />
              </span>
              <span>
                来源：
                <Input
                  style={{ width: 280 }}
                  value={traceInfo.site ?? ''}
                  onChange={(e) => writeTraceInfo({ ...traceInfo, site: e.target.value })}
                />
              </span>
            </Space>
            <EditableTraceTable
              tableListData={traceInfo.tableListData}
              buildHtml={createTraceHtml}
              onChangeTable={({ html, tableListData }) => writeTraceInfo({ ...traceInfo, html, tableListData })}
            />
          </div>
        ),
      });
      items.push({
        key: 'cardType',
        label: '卡片',
        children: (
          <div>
            {/* 源端两张表都没有标题（容易看混），这里各加一行灰色小标 —— 唯一的展示性增补 */}
            <div style={{ margin: '4px 0 8px', color: '#8c8c8c', fontSize: 12 }}>默认参数</div>
            <TraceParamTable
              rows={traceInfo.defaultParams ?? []}
              editRowKey={editRowKey}
              setEditRowKey={setEditRowKey}
              onChangeRow={(key, patch) => patchParam('defaultParams', key, patch)}
              mappingOptions={traceInfo.relateParamsOptions ?? []}
              disableUrlParam
            />
            <div style={{ margin: '16px 0 8px', color: '#8c8c8c', fontSize: 12 }}>输入参数</div>
            <TraceParamTable
              rows={traceInfo.inputParam ?? []}
              editRowKey={editRowKey}
              setEditRowKey={setEditRowKey}
              onChangeRow={(key, patch) => patchParam('inputParam', key, patch)}
              onDeleteRow={deleteInputParam}
              mappingOptions={traceInfo.relateParamsOptions ?? []}
            />
            <Button type="primary" size="small" style={{ marginTop: 12 }} onClick={addParam}>
              添加参数
            </Button>
          </div>
        ),
      });
    }
    items.push({
      key: 'originType',
      label: '原始文本',
      children: (
        <div>
          <Space style={{ marginBottom: 12 }} size={16} wrap>
            <span>
              标题：
              <Input
                style={{ width: 280 }}
                value={traceInfo.title ?? ''}
                onChange={(e) => writeTraceInfo({ ...traceInfo, title: e.target.value })}
              />
            </span>
            <span>
              来源：
              <Input
                style={{ width: 280 }}
                value={traceInfo.site ?? ''}
                onChange={(e) => writeTraceInfo({ ...traceInfo, site: e.target.value })}
              />
            </span>
          </Space>
          <div style={{ height: 400, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: 8 }}>
            {traceInfo.originText ?? ''}
          </div>
        </div>
      ),
    });
    return items;
  }, [isListLike, traceInfo, editRowKey, writeTraceInfo, patchParam, deleteInputParam, addParam]);

  return (
    <>
      <div
        style={{
          padding: 10,
          marginBottom: 8,
          borderRadius: 4,
          border: '1px solid #f0f0f0',
          boxShadow: '0 1px 4px rgba(51, 58, 72, 0.12)',
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 28, flex: '0 0 auto' }}>
            {canExpand && (
              <a onClick={() => setExpand((v) => !v)} style={{ color: '#315590' }}>
                {expand ? '▲' : '▼'}
              </a>
            )}
          </span>
          <span style={{ flex: '1 1 240px', minWidth: 240 }}>
            指标名称：
            <Input
              style={{ width: 220 }}
              placeholder="请输入指标名称（可从左侧指标树拖入）"
              value={row.indexName ?? ''}
              onChange={(e) => onPatch(row._key, { indexName: e.target.value })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropIndicator}
            />
          </span>
          <span style={{ flex: '1 1 240px', minWidth: 240 }}>
            指标id：
            <Input style={{ width: 220 }} disabled placeholder="请选择指标id" value={row.indexNo ?? ''} />
          </span>
          <span style={{ fontSize: 12, flex: '0 0 auto' }}>
            开启溯源：
            <Switch
              size="small"
              checked={row.traceStatus === 'Y'}
              onChange={(checked) => {
                const next = checked ? 'Y' : 'N';
                onPatch(row._key, { traceStatus: next });
                void persist({ traceStatus: next });
              }}
            />
          </span>
          {row.addType === 'bland' && (
            <span style={{ fontSize: 12, flex: '0 0 auto' }}>
              溯源卡片：
              <Switch
                size="small"
                checked={row.traceCardStatus === 'Y'}
                onChange={(checked) => {
                  const next = checked ? 'Y' : 'N';
                  onPatch(row._key, { traceCardStatus: next });
                  void persist({ traceCardStatus: next });
                }}
              />
            </span>
          )}
          <Space size={12} style={{ flex: '0 0 auto' }}>
            <Tooltip title="保存本行">
              <a
                style={{ color: '#315590' }}
                onClick={() => {
                  const json = JSON.stringify(traceInfo);
                  // patch 里也带上 traceConfig：让父级持有的行数据与落库值保持一致
                  // （否则 reload 前再次解析本行会拿到旧的 traceConfig）
                  void persist({ traceConfig: json }, json);
                }}
                aria-busy={saving}
              >
                <SaveOutlined spin={saving} />
              </a>
            </Tooltip>
            <Popconfirm title="是否要删除该条数据?" onConfirm={() => void doDelete()}>
              <a style={{ color: '#8c8c8c' }}>
                <DeleteOutlined />
              </a>
            </Popconfirm>
            <a style={{ color: '#315590' }} onClick={doPreview}>
              <EyeOutlined />
            </a>
          </Space>
        </div>
        {isNewRow && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#faad14' }}>
            未落库：把左侧指标树里的指标**拖到「指标名称」输入框**上即会自动保存
          </div>
        )}
        {canExpand && expand && (
          <div style={{ marginTop: 12 }}>
            <Tabs
              size="small"
              activeKey={traceInfo.sourceType || (isListLike ? 'listType' : 'originType')}
              onChange={(key) => {
                const next: TraceInfo = { ...traceInfo, sourceType: key };
                if (key === 'cardType') {
                  if (!next.defaultParams?.length) {
                    next.defaultParams = DEFAULT_DATASOURCE.map((i) => ({ ...i, id: uid() }));
                  }
                  if (!next.inputParam) next.inputParam = [];
                }
                writeTraceInfo(next);
              }}
              items={tabItems}
            />
          </div>
        )}
      </div>
      <TracePreviewPanel open={previewOpen} html={previewHtml} onClose={() => setPreviewOpen(false)} />
    </>
  );
}

/* ==================== 主弹窗 ==================== */

export interface TraceConfigModalProps {
  open: boolean;
  knownId: string;
  onClose: () => void;
}

export function TraceConfigModal({ open, knownId, onClose }: TraceConfigModalProps) {
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filter, setFilter] = useState<Record<string, unknown>>({});
  const [treeVisible, setTreeVisible] = useState(true);
  /** 「复制」开关：打开后点指标即把 {{名称||编号}} 复制到剪贴板（源 `allowCopy`） */
  const [allowCopy, setAllowCopy] = useState(false);

  const load = useCallback(
    async (page: number, size: number, cond: Record<string, unknown>) => {
      if (!knownId) return;
      setLoading(true);
      try {
        const res = await queryRelateIndexList({
          knowledgeId: knownId,
          pageIndex: page,
          pageSize: size,
          ...cond,
        });
        setRows((res?.list ?? []).map((r) => ({ ...(r as unknown as TraceRow), _key: uid() })));
        setTotal(res?.totalCount ?? 0);
      } catch (err) {
        setRows([]);
        setTotal(0);
        message.error(err instanceof Error ? err.message : '溯源列表加载失败');
      } finally {
        setLoading(false);
      }
    },
    [knownId],
  );

  /** 打开时从第一页拉（源 `useAntdTable` 的初始加载） */
  useEffect(() => {
    if (!open) return;
    setPageIndex(1);
    setFilter({});
    setTreeVisible(true);
    setAllowCopy(false);
    void load(1, pageSize, {});
    // 只在"打开"这一次重新拉取；pageSize 的变更是走 onShowSizeChange 显式调 load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, knownId]);

  const doQuery = () => {
    setPageIndex(1);
    void load(1, pageSize, filter);
  };
  const doReset = () => {
    setFilter({});
    setPageIndex(1);
    void load(1, pageSize, {});
  };

  const patchRow = useCallback((key: string, patch: Partial<TraceRow>) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }, []);
  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r._key !== key));
  }, []);
  const reload = useCallback(() => void load(pageIndex, pageSize, filter), [load, pageIndex, pageSize, filter]);

  /** 左侧指标树被点击 → 开启「复制」时复制 `{{名称||编号}}`（源 `onSelect`） */
  const handleTreeSelect = useCallback(
    (node: IndexTreePickerNode) => {
      if (!allowCopy) return;
      const text = toNameIdString(node.paramName, node.paramNo);
      const write = navigator.clipboard?.writeText(text);
      if (write) {
        write
          .then(() => message.success('复制成功'))
          .catch(() => message.error('该浏览器不支持复制'));
      } else {
        message.error('该浏览器不支持复制');
      }
    },
    [allowCopy],
  );

  return (
    <>
      <Modal
        open={open}
        title="溯源配置"
        width="100vw"
        style={{ top: 0, margin: 0, maxWidth: '100%', paddingBottom: 0 }}
        styles={{ body: { height: 'calc(100vh - 108px)', overflow: 'auto' } }}
        onCancel={onClose}
        maskClosable={false}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              所有修改都是**按行即时保存**：切换开关、点保存图标、删除、拖入指标都会立刻落库
            </span>
            <Button onClick={onClose}>关闭</Button>
          </div>
        }
        destroyOnClose
      >
        <Row gutter={12}>
          {treeVisible && (
            <Col span={6}>
              <Card
                title="指标"
                size="small"
                extra={
                  <Space size={4}>
                    <Tooltip title="开启后可点击指标，把 {{指标名称||指标编号}} 复制到剪贴板，用于在右侧列表里编辑">
                      <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                        <QuestionCircleOutlined /> 复制
                      </span>
                    </Tooltip>
                    <Switch size="small" checked={allowCopy} onChange={setAllowCopy} />
                  </Space>
                }
              >
                <IndexTreePicker height="calc(100vh - 260px)" onSelect={handleTreeSelect} />
              </Card>
            </Col>
          )}
          <Col span={treeVisible ? 18 : 24}>
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => setTreeVisible((v) => !v)}
                title={treeVisible ? '收起指标树' : '展开指标树'}
                style={{
                  position: 'absolute',
                  left: treeVisible ? -26 : 0,
                  top: '50%',
                  width: 12,
                  height: 60,
                  marginTop: -30,
                  borderRadius: treeVisible ? '20px 0 0 20px' : '0 20px 20px 0',
                  background: '#e2e9f5',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: 'rgba(74,73,73,0.65)',
                  zIndex: 2,
                }}
              >
                {treeVisible ? <DoubleLeftOutlined /> : <DoubleRightOutlined />}
              </div>

              <Button
                type="primary"
                onClick={() =>
                  setRows((prev) => [
                    { _key: uid(), indexParam: '', indexNo: '', indexName: '', knowledgeId: knownId },
                    ...prev,
                  ])
                }
              >
                添加新指标
              </Button>

              <div style={{ marginTop: 12 }}>
                <FilterForm
                  fields={FILTER_FIELDS}
                  value={filter}
                  onChange={setFilter}
                  onQuery={doQuery}
                  onReset={doReset}
                  loading={loading}
                />
              </div>

              <div style={{ height: 'calc(100vh - 350px)', overflow: 'auto', paddingRight: 12 }}>
                {rows.map((row) => (
                  <TraceCard
                    key={row._key}
                    row={row}
                    knownId={knownId}
                    onPatch={patchRow}
                    onRemove={removeRow}
                    onReload={reload}
                  />
                ))}
                {rows.length === 0 && !loading && (
                  <div style={{ padding: '60px 0', textAlign: 'center', color: '#8c8c8c' }}>
                    暂无关联指标（可由提示词里引用的指标自动生成，或点「添加新指标」后拖入）
                  </div>
                )}
              </div>

              <div style={{ paddingTop: 10, textAlign: 'right' }}>
                <Pagination
                  size="small"
                  showSizeChanger
                  showTotal={(t) => `共 ${t} 条`}
                  current={pageIndex}
                  pageSize={pageSize}
                  total={total}
                  pageSizeOptions={['10', '20', '50']}
                  onChange={(page, size) => {
                    setPageIndex(page);
                    setPageSize(size);
                    void load(page, size, filter);
                  }}
                  onShowSizeChange={(page, size) => {
                    setPageIndex(page);
                    setPageSize(size);
                    void load(page, size, filter);
                  }}
                />
              </div>
            </div>
          </Col>
        </Row>
      </Modal>
    </>
  );
}
