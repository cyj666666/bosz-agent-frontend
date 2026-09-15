/**
 * 指标配置 — 数据源配置卡片
 *
 * React 重写自源工程 `views/index/DataSourceCard.vue`（1237 行）+ 其子弹窗
 * `SqlPreviewModal.vue`（119 行）。用于指标为「LIST + Auto」时的取数来源配置。
 *
 * ══════════ 契约（**输出格式必须一致**，它会被写进指标的 `script` 字段）══════════
 * 源工程 `getValue()` 返回 `JSON.stringify({ dataSource, sql, paramData, moduleCode,
 * knowledgeCode, knowledgeName, knowledgeGroupInfo, withModelSummary, knowledgeParamList, entName? })`，
 * 后端按这个结构解析。本组件保持**同样的字段名与嵌套**。
 *
 * 三种数据源类型（源工程用三个字面量 `'Sql'` / `'Api'` / `'KnowledgeCode'`）：
 *   Sql            数据源下拉 + 选表 + SQL 编辑 + 预览 + 参数映射（本文件完整实现）
 *   Api            接口参数由外层「接口脚本相关字段」与参数映射表格描述。
 *                  **本文件只做类型选择与提示**——真正的接口字段在 `IndexEditorModal` 里，
 *                  源工程也是把 `DataSourceApi.vue` 的取值交给外层合并的。
 *   KnowledgeCode  知识库取值：**4 步向导**（选择知识库 → 配置参数 → 是否启用大模型 → 预览）
 *
 * ══════════ KnowledgeCode 4 步向导（2026-09-15 补齐，源 `DataSourceCard.vue` 的 KnowledgeCode 分支）══════════
 * 由 `kbStep`（源 `currentKnowledgeStep`，0..3）驱动：
 *   ① 选择知识库   分组级联 + 知识库下拉（值取 `paramNo`）。下一步需先选中知识库
 *   ② 配置参数     `knowledgeParamList` 参数表（参数名称 / 参数值 / 操作），单行编辑 + 增删
 *   ③ 是否启用大模型 `withModelSummary` 开关
 *   ④ 预览         调 `POST /agent/get`（源 `knowledgeBasePreviewNew`）取回文案
 *
 * 🔴 **参数落库的真实形态（照抄公司库 `index_params.script` 实测数据，别按想当然实现）**
 *   参数**不是只存在 `knowledgeParamList` 里**。后端 `getKnowledgeCode` 是把 **script 的顶层键**
 *   当作知识库入参用的，所以参数会**平铺在 script 顶层**：
 *     `{"moduleCode":"jyk-sfczxianzhiquanli","knowledgeName":"…","withModelSummary":true,
 *       "entName":"苏州XX精密机械制造有限公司","clrId":"002"}`   ← 没有任何 knowledgeParamList
 *   而另一批（Sql 类型，131 条）是两种都有：
 *     `{…,"knowledgeParamList":[{"key":"1","paramName":"entName","paramValue":"…"}],"entName":"…"}`
 *   → 本组件的做法：**载入时**「`knowledgeParamList` + script 顶层的非保留键」合并成参数行
 *     （`entName` / `clrId` 这类会直接出现在表格里，可看可改可删）；**保存时**先删掉本次
 *     物化出来的顶层键、再按参数行重新平铺写回 —— 保证「不改就原样往返、删了才真的删掉」。
 *
 * ══════════ 与源工程的有意差异（逐条说明）══════════
 *   1. 🔴 **`knowledgeParamList` 默认值不再预置「科大讯飞股份有限公司」**。
 *      源工程把它写成了 ref 初始值，结果是**厂商 demo 公司名被写进了行内真实数据**
 *      （实测 131 条 Sql 记录的 script 里都是这个值）。本实现新建时给**空参数表**，
 *      由用户显式「添加参数」。**已存在的值不受影响**（载入时原样读出、原样写回）。
 *   2. 🔴 **`knowledgeGroupInfo` 过滤下拉时不清空已选知识库**。源工程
 *      `filterKnowledgeCodeByGroup()` 会在"已选 code 不在过滤结果里"时把
 *      `selectedKnowledgeCode`/`selectedKnowledgeName` 清空 —— 分组信息一旦与编号不一致，
 *      用户一保存就把 `moduleCode` 抹成空。本实现改为**把已选知识库补进选项列表**（可正常显示），
 *      不做静默清空。
 *   3. 「配置参数」的单行编辑：源工程 `cancelEditKnowledgeParam` 只是把 `editing` 置 false，
 *      **直接在 record 上改的值不会回滚**（取消等于没取消）。本实现用草稿副本，取消是真取消。
 *   4. **参数名撞上保留键时不平铺到顶层**（保留键见 `PERSISTED_KEYS`），避免把 `sql`/`paramData`
 *      这类结构字段覆盖掉。
 *   5. 参数映射表格（`paramData`）7 列 + 单行编辑 + 增删改见 `ParamMappingTable.tsx`；
 *      源工程它就在本组件的 SQL 分支里（`paramsTableData`），**并非由外层维护**（旧注释写错，已更正）。
 *   6. SQL 预览的单元格详情由"点击弹窗"改为 `Tooltip`（信息等价，少一层弹窗）。
 *   7. **`script` 为空串时不主动"补"成 JSON**（已核对：这是正确行为，勿改成"总是写回"）。
 *      实测公司库 **945/1086 条指标的 `script` 是空串**（87%），本组件**只在用户真正操作
 *      数据源配置时才写回**（`flush` 由交互触发，载入的 effect 不写回）——所以"打开一条空 script
 *      的指标、什么都不改就保存"仍提交空串。这样避免把 945 条空配置无端变成 `{dataSource:'',…}`。
 *      源工程 `getValue()` 反而是"总是返回那坨 JSON"，此处是有意收紧。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Cascader,
  Empty,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getDataSourceOptions, getSyncTableList, sqlPreviewList } from '../../api/dataSourceAgent';
import { useAgentTable } from '../../components/useAgentTable';
import type { DataSourceOption, SqlPreviewResult, SyncTableRow } from '../../api/dataSourceAgent';
import { previewKnowledgeCode, queryGroupTree, queryKnowledgeCodeOptions } from '../../api/knowledgeConfig';
import type { KnowledgeCodeOption, KnowledgeGroupNode } from '../../api/knowledgeConfig';
import { ParamMappingTable } from './ParamMappingTable';
import type { ParamMappingRow } from './ParamMappingTable';

/** 数据源类型（源工程用的三个字面量，不能改） */
const SCRIPT_TYPES = [
  { value: 'Sql', label: 'SQL 脚本' },
  { value: 'Api', label: '外部接口' },
  { value: 'KnowledgeCode', label: '知识库' },
];

/** 写入 `script` 字段的结构（与源 `getValue()` 一致） */
interface DataSourcePayload {
  dataSource?: string;
  sql?: string;
  paramData?: unknown[];
  moduleCode?: string;
  knowledgeCode?: string;
  knowledgeName?: string;
  knowledgeGroupInfo?: string[];
  withModelSummary?: boolean;
  knowledgeParamList?: { key?: string; paramName?: string; paramValue?: string }[];
  entName?: string;
  [key: string]: unknown;
}

/** 解析已有的 script（兼容"非 JSON 的旧数据"） */
function parsePayload(raw?: string): DataSourcePayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as DataSourcePayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // 旧数据可能是裸 SQL 文本（源工程早期版本），保留在 sql 里不丢
    return { sql: raw };
  }
}

/* ---------------- 知识库参数表（源 `knowledgeParamList` + script 顶层参数键） ---------------- */

/**
 * 参数行（源 `knowledgeParamList` 的元素 + 编辑态）
 *
 * ⚠️ `key` 只是行标识（源工程用 `'1'` 或 `Date.now()`），**不是后端要求的字段**，
 * 但源工程会把它原样存进 `knowledgeParamList`，所以必须保留。
 */
interface KbParamRow {
  key: string;
  paramName: string;
  paramValue: string;
  /** 单行编辑态（源工程把 `editing` 挂在 record 上） */
  editing?: boolean;
}

/**
 * script 里的**结构字段**，不参与「参数平铺到顶层」。
 *
 * 这个清单决定了哪些顶层键会被识别成参数行（`entName` / `clrId` 就是靠它被识别出来的）——
 * 依据是公司库 `index_params.script` 的**实测数据**，不是推断。改之前先确认后端
 * `getKnowledgeCode` 的取参口径（它把 script 的顶层键当知识库入参）。
 */
const PERSISTED_KEYS = [
  'dataSource',
  'sql',
  'paramData',
  'moduleCode',
  'knowledgeCode',
  'knowledgeName',
  'knowledgeGroupInfo',
  'withModelSummary',
  'knowledgeParamList',
];

/** 4 步向导的标题（源 `<a-step>` 逐字一致） */
const KB_STEP_TITLES = ['选择知识库', '配置参数', '是否启用大模型', '预览'];

/** 参数行 → 写回 `knowledgeParamList` 的形态（源 `getValue()` 只留三列） */
function toParamListJson(rows: KbParamRow[]) {
  return rows
    .filter((r) => r.paramName.trim())
    .map((r) => ({ key: r.key, paramName: r.paramName, paramValue: r.paramValue }));
}

/**
 * 载入时把「`knowledgeParamList` + script 顶层参数键」合并成参数行。
 *
 * 两条来源都必须取：实测数据里既有**只存顶层键**的（KnowledgeCode 类型的
 * `entName` / `clrId`），也有**两种都存**的（Sql 类型 131 条）。只读一条就会丢参数。
 * 返回的 `topLevelNames` = 「本次从顶层键物化出的参数名」，保存时要先删掉它们再按当前行重写。
 */
function readParamRows(payload: DataSourcePayload): { rows: KbParamRow[]; topLevelNames: string[] } {
  const rows: KbParamRow[] = [];
  const seen = new Set<string>();

  if (Array.isArray(payload.knowledgeParamList)) {
    payload.knowledgeParamList.forEach((item, index) => {
      const name = String(item?.paramName ?? '');
      if (name) seen.add(name);
      rows.push({
        key: String(item?.key ?? `list-${index}`),
        paramName: name,
        paramValue: String(item?.paramValue ?? ''),
      });
    });
  }

  const topLevelNames: string[] = [];
  Object.keys(payload).forEach((k) => {
    if (PERSISTED_KEYS.includes(k)) return;
    const v = payload[k];
    // 对象/数组不是"知识库入参"，不当参数行（避免把嵌套结构摊平）
    if (v !== null && typeof v === 'object') return;
    topLevelNames.push(k);
    if (seen.has(k)) return; // 参数表里已有同名行，不重复建行
    seen.add(k);
    rows.push({ key: k, paramName: k, paramValue: String(v ?? '') });
  });

  return { rows, topLevelNames };
}

/** 预览返回体的取值（源 `dataPreview` 的优先级：answer → content → result.content → result） */
function pickPreviewText(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') return body;
  if (typeof body !== 'object') return String(body);
  const b = body as Record<string, unknown>;
  // 兼容"被 Result 包了一层"的情况（后端当前不包，但别把话说死）
  if (typeof b.code === 'number' && b.code !== 200) return String(b.message ?? '');
  const result = b.result as Record<string, unknown> | undefined;
  const candidates = [b.answer, b.content, result?.content, result, b.data];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
    if (c !== null && c !== undefined && typeof c === 'object') return JSON.stringify(c, null, 2);
  }
  return JSON.stringify(b, null, 2);
}

export interface IndexDataSourceCardProps {
  /** 数据源类型（受控，源工程由外层或本卡片修改） */
  scriptType: string;
  onScriptTypeChange: (next: string) => void;
  /** 指标的 script 字段（JSON 串） */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function IndexDataSourceCard({
  scriptType,
  onScriptTypeChange,
  value,
  onChange,
  disabled,
}: IndexDataSourceCardProps) {
  const payload = useMemo(() => parsePayload(value), [value]);

  const [dataSourceId, setDataSourceId] = useState<string>('');
  const [sqlStr, setSqlStr] = useState<string>('');
  const [knowledgeCode, setKnowledgeCode] = useState<string>('');
  const [knowledgeName, setKnowledgeName] = useState<string>('');
  /** 参数映射行（对应源 `paramsTableData`，最终写进 `script.paramData`） */
  const [paramsRows, setParamsRows] = useState<ParamMappingRow[]>([]);

  /* ---- 知识库取值（4 步向导）的状态 ---- */
  /** 当前步骤（源 `currentKnowledgeStep`，0..3） */
  const [kbStep, setKbStep] = useState(0);
  /** 分组级联值 = groupId 路径数组（源 `knowledgeGroupInfo`） */
  const [kbGroupPath, setKbGroupPath] = useState<string[]>([]);
  /** 参数表（源 `knowledgeParamList` + script 顶层参数键） */
  const [kbRows, setKbRows] = useState<KbParamRow[]>([]);
  /** 参数表里正在编辑的行 key（源把 `editing` 挂在 record 上，这里用 key 便于做"真取消"） */
  const [kbEditingKey, setKbEditingKey] = useState<string>('');
  const [kbDraft, setKbDraft] = useState<{ paramName: string; paramValue: string }>({ paramName: '', paramValue: '' });
  /** 源 `knowledgeParams.withModelSummary` */
  const [kbWithModelSummary, setKbWithModelSummary] = useState<boolean>(false);
  /** 第 4 步预览结果（源 `previewContent`） */
  const [kbPreviewText, setKbPreviewText] = useState('');
  const [kbPreviewing, setKbPreviewing] = useState(false);
  /** 本次从 script 顶层键物化出来的参数名 —— 保存时先删它们，再按当前参数行重写 */
  const kbTopLevelNamesRef = useRef<string[]>([]);

  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  /**
   * 表列表 —— 用通用分页 hook（**服务端分页**，与源工程该表格的 `useAntdTable` 同形）：
   *   · 分页器自带「共 N 条」（`totalCount` 来自后端 ListResult，不是当页条数）；
   *   · 关键字检索同样是**服务端模糊过滤**（后端 `LIKE 百分号关键字`）→ 每次改关键字都要重查；
   *   · hook 里带了"过期响应丢弃"，快速敲字/翻页不会出现"结果和关键字对不上"。
   */
  const {
    rows: tables,
    loading: tablesLoading,
    pagination: tablesPagination,
    refresh: refreshTables,
    setRows: setTableRows,
  } = useAgentTable<SyncTableRow, { dataSourceId: string; tableName: string }>(getSyncTableList, {
    immediate: false,
    errorText: '表列表加载失败',
  });
  /** 表名检索框的值（源 `a-input-search placeholder="请输入表名"` + `params.tableName`） */
  const [tableKeyword, setTableKeyword] = useState('');
  /** 供 `loadTables` 读取最新关键字（它是 useCallback，直接闭包会拿到旧值） */
  const tableKeywordRef = useRef('');
  /** 输入即搜的防抖计时器 */
  const searchTimerRef = useRef<number | null>(null);
  const [groupOptions, setGroupOptions] = useState<KnowledgeGroupNode[]>([]);
  /** 全部「在线且启用」的知识库（**不按分组过滤**，源工程也是全量拉下来前端过滤） */
  const [knowledgeOptions, setKnowledgeOptions] = useState<KnowledgeCodeOption[]>([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<SqlPreviewResult>({});

  /* ---- 外部值 → 内部状态 ---- */
  useEffect(() => {
    setDataSourceId(String(payload.dataSource ?? ''));
    setSqlStr(String(payload.sql ?? ''));
    setKnowledgeCode(String(payload.knowledgeCode ?? payload.moduleCode ?? ''));
    setKnowledgeName(String(payload.knowledgeName ?? ''));
    setParamsRows(Array.isArray(payload.paramData) ? (payload.paramData as ParamMappingRow[]) : []);
    // 知识库取值的四项：参数表由「knowledgeParamList + 顶层参数键」合并而来（见 readParamRows）
    const { rows, topLevelNames } = readParamRows(payload);
    kbTopLevelNamesRef.current = topLevelNames;
    setKbRows(rows.map((r) => ({ ...r, editing: false })));
    setKbWithModelSummary(payload.withModelSummary === true);
    setKbGroupPath(
      Array.isArray(payload.knowledgeGroupInfo) ? payload.knowledgeGroupInfo.map((g) => String(g)) : [],
    );
    // payload 是每次 value 变化后重新解析出来的对象，这里只做同步，不做依赖收敛
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /**
   * 序列化回 `script`
   *
   * 步骤：
   *   ① 先铺上已解析的 payload（**保留所有未知字段**，避免丢数据）
   *   ② 覆盖本组件负责的字段
   *   ③ 删掉「本次物化出来的顶层参数键」→ 再按当前参数行平铺回顶层
   *      （后端 `getKnowledgeCode` 把 script 顶层键当知识库入参，实测数据也是这么存的；
   *        删了才真的删掉，不删就原样往返）
   *
   * @param kbRowsOverride 参数表刚改完时传入**新值**——React 的 setState 是异步的，
   *   用闭包里的旧 `kbRows` 会少写一行（踩点），所以这里显式覆盖。
   */
  const flush = useCallback(
    (patch: Partial<DataSourcePayload>, kbRowsOverride?: KbParamRow[]) => {
      const rows = kbRowsOverride ?? kbRows;
      const next: DataSourcePayload = {
        ...payload,
        dataSource: dataSourceId,
        sql: sqlStr,
        moduleCode: knowledgeCode,
        knowledgeCode,
        paramData: paramsRows,
        knowledgeName,
        knowledgeGroupInfo: kbGroupPath,
        withModelSummary: kbWithModelSummary,
        knowledgeParamList: toParamListJson(rows),
        ...patch,
      };

      kbTopLevelNamesRef.current.forEach((name) => {
        delete next[name];
      });
      rows.forEach((r) => {
        const name = r.paramName.trim();
        // 参数名撞上结构字段时不平铺（否则会把 sql / paramData 这类字段覆盖成字符串）
        if (!name || PERSISTED_KEYS.includes(name)) return;
        next[name] = r.paramValue;
      });

      onChange(JSON.stringify(next));
    },
    [
      payload,
      dataSourceId,
      sqlStr,
      knowledgeCode,
      knowledgeName,
      paramsRows,
      kbGroupPath,
      kbWithModelSummary,
      kbRows,
      onChange,
    ],
  );

  /* ---- 下拉数据 ---- */
  useEffect(() => {
    if (scriptType !== 'Sql') return;
    getDataSourceOptions()
      .then(setDataSources)
      .catch(() => setDataSources([]));
  }, [scriptType]);

  /** 「知识库」数据源的两份下拉数据：分组树（级联）+ 全部在线启用的知识库 */
  useEffect(() => {
    if (scriptType !== 'KnowledgeCode') return;
    // 源工程 `knowledgeBaseVersionList({ modelFlag: 1, authFlag: false })`（同一个接口）
    queryGroupTree({ modelFlag: 1, authFlag: false })
      .then((res) => setGroupOptions((res?.list ?? []) as KnowledgeGroupNode[]))
      .catch(() => setGroupOptions([]));
    // 源工程 `changeKnowledgeGroup()`：全量拉取，分组过滤放在前端
    queryKnowledgeCodeOptions()
      .then(setKnowledgeOptions)
      .catch(() => setKnowledgeOptions([]));
  }, [scriptType]);

  /** 选了数据源就拉表列表（源 `dataSourceChangeHandle`） */
  /**
   * 加载表列表（服务端分页 + 服务端模糊过滤）
   *
   * @param dsId    数据源 id（为空则清空列表，不发注定返回 null 的请求）
   * @param keyword 表名关键字；不传则沿用检索框里的（**切换数据源时源工程也保留关键字**：
   *                `dataSourceChangeHandle` 只改 `params.dataSourceId` 后 refresh）
   */
  const loadTables = useCallback(
    async (dsId: string, keyword?: string) => {
      const kw = keyword ?? tableKeywordRef.current;
      if (!dsId) {
        setTableRows([]);
        return;
      }
      await refreshTables({ dataSourceId: dsId, tableName: kw });
    },
    [refreshTables, setTableRows],
  );

  /** 回车 / 点放大镜：立即按关键字重查（顺带取消防抖，避免重复请求） */
  const onTableSearch = (value: string) => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    tableKeywordRef.current = value;
    setTableKeyword(value);
    void loadTables(dataSourceId, value);
  };

  /**
   * 输入即搜（模糊过滤）：400ms 防抖后按新关键字重查
   *
   * 源工程只认 `@search`（回车/点按钮才查）；用户要求"支持模糊检索"，这里做成了边输边筛。
   * 清空输入框（点 X 或删完）会立刻按空关键字查一次，恢复全量。
   */
  const onKeywordChange = (next: string) => {
    setTableKeyword(next);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(
      () => {
        tableKeywordRef.current = next;
        void loadTables(dataSourceId, next);
      },
      next ? 400 : 0,
    );
  };

  useEffect(() => {
    // 切换类型/数据源都要重拉表；数据源为空时 loadTables 会清空列表
    if (scriptType === 'Sql') void loadTables(dataSourceId);
    // 仅在类型/数据源变化时重新拉表（关键字变化走 onKeywordChange 的防抖）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptType, dataSourceId]);

  /** 卸载时清掉未触发的防抖计时器 */
  useEffect(
    () => () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    },
    [],
  );

  /**
   * 选中一张表 → 生成 `select * from 表名`（源 `customRow`：**点击整行**触发，无提示）
   *
   * 源工程没有「用作查询」按钮，就是点行直接填 SQL；本工程由下方 Table 的 `onRow.onClick` 调用。
   */
  const pickTable = (row: SyncTableRow) => {
    if (disabled) return;
    const name = String(row.tableName ?? '');
    if (!name) return;
    const nextSql = `select * from ${name}`;
    setSqlStr(nextSql);
    flush({ sql: nextSql });
  };

  /* ==================== 知识库取值（4 步向导） ==================== */

  /** 级联路径末级 groupId（源 `filterKnowledgeCodeByGroup` 取 `knowledgeGroupInfo[length - 1]`） */
  const kbSelectedGroupId = kbGroupPath.length ? kbGroupPath[kbGroupPath.length - 1] : '';

  /**
   * 知识库下拉选项（按分组过滤）
   *
   * ⚠️ **与源工程的关键差异**：源工程在"已选编号不在过滤结果里"时会**清空**已选
   * （`filterKnowledgeCodeByGroup` 里的 `selectedKnowledgeCode = ''`）。一旦 `knowledgeGroupInfo`
   * 与 `moduleCode` 不一致（分组被挪动、历史数据），用户一保存就把 `moduleCode` 抹成空 —— 那是数据损失。
   * 本实现改为**把已选知识库补进选项列表**，保证能正常显示、不会被静默清掉。
   */
  const kbOptions = useMemo(() => {
    const base = kbSelectedGroupId
      ? knowledgeOptions.filter((o) => o.groupId === kbSelectedGroupId)
      : knowledgeOptions;
    if (knowledgeCode && !base.some((o) => o.value === knowledgeCode)) {
      return [
        {
          value: knowledgeCode,
          label: knowledgeName || knowledgeCode,
          paramName: knowledgeName,
          groupId: '',
          groupName: '',
        },
        ...base,
      ];
    }
    return base;
  }, [knowledgeOptions, kbSelectedGroupId, knowledgeCode, knowledgeName]);

  /** 步骤推进（源 `handleKnowledgeNextStep` / `handleKnowledgePrevStep`，边界 0..3） */
  const kbGoNext = () => setKbStep((s) => (s < 3 ? s + 1 : s));
  const kbGoPrev = () => setKbStep((s) => (s > 0 ? s - 1 : s));

  /** 选中知识库（源 `changed` 的 watcher：名称取 label 去掉 `paramNo-` 前缀） */
  const kbPickKnowledge = (code: string) => {
    const hit = knowledgeOptions.find((o) => o.value === code);
    let name = hit?.paramName ?? '';
    if (!name && hit) {
      const prefix = `${code}-`;
      name = hit.label.startsWith(prefix) ? hit.label.slice(prefix.length) : hit.label;
    }
    setKnowledgeCode(code);
    setKnowledgeName(name);
    flush({ moduleCode: code, knowledgeCode: code, knowledgeName: name });
  };

  /* ---- 参数表（源「配置参数」步骤） ---- */

  const kbAddRow = () => {
    const key = `row-${Date.now()}`;
    setKbRows((prev) => [...prev, { key, paramName: '', paramValue: '', editing: true }]);
    setKbEditingKey(key);
    setKbDraft({ paramName: '', paramValue: '' });
  };

  const kbStartEdit = (row: KbParamRow) => {
    setKbEditingKey(row.key);
    // 用草稿副本：源工程是直接在 record 上改，导致"取消"回滚不了（取消等于没取消）
    setKbDraft({ paramName: row.paramName, paramValue: row.paramValue });
  };

  /** 保存该行：草稿写回 → 同步 script（`knowledgeParamList` + 顶层平铺） */
  const kbCommitEdit = () => {
    const next = kbRows.map((r) => (r.key === kbEditingKey ? { ...r, ...kbDraft, editing: undefined } : r));
    setKbRows(next);
    setKbEditingKey('');
    flush({}, next);
  };

  const kbDeleteRow = (row: KbParamRow) => {
    const next = kbRows.filter((r) => r.key !== row.key);
    setKbRows(next);
    if (kbEditingKey === row.key) setKbEditingKey('');
    flush({}, next);
  };

  /**
   * 第 4 步「预览」（源 `dataPreview` 的 KnowledgeCode 分支）
   *
   * 入参就是源 `getKnowledgeParams()` 的形状：固定三项 + **把参数表每一行摊成入参**。
   */
  const kbPreview = async () => {
    if (!knowledgeCode) {
      message.warning('请先选择知识库');
      return;
    }
    setKbPreviewing(true);
    setKbPreviewText('');
    try {
      const params: Record<string, unknown> = {
        moduleCode: knowledgeCode,
        knowledgeName,
        withModelSummary: kbWithModelSummary,
        stream: false,
      };
      kbRows.forEach((r) => {
        const name = r.paramName.trim();
        if (name) params[name] = r.paramValue;
      });
      setKbPreviewText(pickPreviewText(await previewKnowledgeCode(params)));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '预览失败');
    } finally {
      setKbPreviewing(false);
    }
  };

  /** 参数表列（源 `knowledgeParamColumns`：参数名称 / 参数值 / 操作 + 单行编辑） */
  const kbParamColumns: ColumnsType<KbParamRow> = [
    {
      title: '参数名称',
      dataIndex: 'paramName',
      key: 'paramName',
      render: (text: string, row) =>
        kbEditingKey === row.key ? (
          <Input
            value={kbDraft.paramName}
            placeholder="参数名（会成为知识库入参）"
            onChange={(e) => setKbDraft((d) => ({ ...d, paramName: e.target.value }))}
          />
        ) : (
          <span>{text}</span>
        ),
    },
    {
      title: '参数值',
      dataIndex: 'paramValue',
      key: 'paramValue',
      render: (text: string, row) =>
        kbEditingKey === row.key ? (
          <Input
            value={kbDraft.paramValue}
            onChange={(e) => setKbDraft((d) => ({ ...d, paramValue: e.target.value }))}
          />
        ) : (
          <span>{text}</span>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_t, row) =>
        kbEditingKey === row.key ? (
          <Space>
            <Button size="small" type="primary" onClick={kbCommitEdit}>
              保存
            </Button>
            <Button size="small" onClick={() => setKbEditingKey('')}>
              取消
            </Button>
          </Space>
        ) : (
          <Space>
            <Button size="small" onClick={() => kbStartEdit(row)}>
              编辑
            </Button>
            <Button size="small" danger onClick={() => kbDeleteRow(row)}>
              删除
            </Button>
          </Space>
        ),
    },
  ];

  /** 分组级联的配置（源 `ad-cascader` 的 fieldNames 逐字一致） */
  const kbCascaderFieldNames = { label: 'groupName', value: 'groupId', children: 'children' };

  /** SQL 预览（源 `SqlPreviewModal` 的 onMounted 逻辑） */
  const doPreview = async () => {
    if (!dataSourceId) {
      message.warning('请先选择数据源');
      return;
    }
    if (!sqlStr.trim()) {
      message.warning('请先填写 SQL');
      return;
    }
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewResult({});
    try {
      // 🔴 sqlParam 必须传「取数参数行数组」（源工程传的也是参数表 `paramsTableData`）：
      //    后端 DTO 是 JSONArray，传空字符串会让 Jackson 反序列化失败 → HTTP 400。
      const res = await sqlPreviewList({ dataSourceId, sqlContent: sqlStr, sqlParam: paramsRows });
      setPreviewResult(res);
      if (!res?.tableHeaders?.length) {
        // 空结果不是错误（源工程也没提示），但用户会以为坏了，这里给个明确说明
        message.info('查询执行成功，但没有返回任何列/行');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  /* 说明：原先这里还有一个「按表名直接预览」（调 `dataPreviewList`）的行内按钮 —— 已删除。
     源工程 `DataSourceCard.vue` 没有这个入口，`dataPreviewList` 只被
     `views/DataSourceManager/TableIntroduce/TableDataModal.vue`（数据源管理 → 表说明）使用；
     指标配置里的「数据预览」就是执行 SQL 文本框里的 SQL（本组件的「执行预览」按钮）。 */

  /**
   * 表列表列 —— **源工程只有「表名」一列**（`DataSourceCard.vue:494` 的 `columns = [{title:'表名'}]`），
   * 且**没有操作列/行内按钮**：
   *   · 「用作查询」= 源 `customRow` 的**点击整行** → `sqlStr = 'select * from ' + tableName`；
   *   · 「数据预览」= 右侧工具栏按钮（本组件即「执行预览」），执行的是 SQL 文本框里的 SQL。
   * 本工程原先自创了「操作」列（用作查询 / 预览数据 两个 `<a>`）—— 已按源工程去掉：
   *   行内按钮既不是源行为，`dataPreviewList`（按表名预览）在源工程里也只被
   *   `views/DataSourceManager/TableIntroduce/TableDataModal.vue`（数据源管理→表说明）使用，与指标配置无关。
   */
  const tableColumns: ColumnsType<SyncTableRow> = [{ title: '表名', dataIndex: 'tableName', ellipsis: true }];

  /** 预览结果的列（源工程按 `tableHeaders` 动态生成） */
  const previewColumns: ColumnsType<Record<string, unknown>> = (previewResult.tableHeaders ?? []).map((h) => ({
    title: h,
    dataIndex: h,
    key: h,
    // ⚠️ 每列**不要写死宽度**（原先统一 `width: 250`）：列少时整张表只有几百像素宽，
    //    塞在很宽的弹框里就是一条细长条，看着很"扁"（用户 2026-09-16 反馈）。
    //    这里交给表格按容器宽度自适应（配合 `scroll.x='max-content'`：内容真的更宽时才横向滚动）。
    //    `ellipsis` + 下面的 Tooltip 保证单个超长值不会把列撑爆。
    ellipsis: true,
    render: (text: unknown) => (
      <Tooltip title={String(text ?? '')}>
        <span>{text === null || text === undefined || text === '' ? '（空值）' : String(text)}</span>
      </Tooltip>
    ),
  }));

  return (
    <div>
      <Radio.Group
        value={scriptType}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value as string;
          onScriptTypeChange(next);
          // 源工程切换类型时会把已有的 sql / 知识库选择一起带走，这里保持一致（只改类型字段）
          flush({});
        }}
      >
        {SCRIPT_TYPES.map((t) => (
          <Radio key={t.value} value={t.value}>
            {t.label}
          </Radio>
        ))}
      </Radio.Group>

      {/* ===== Sql ===== */}
      {scriptType === 'Sql' && (
        <div style={{ marginTop: 12 }}>
          <Space style={{ marginBottom: 8 }}>
            <span>数据源：</span>
            <Select
              allowClear
              showSearch
              style={{ width: 280 }}
              placeholder="请选择数据源"
              disabled={disabled}
              optionFilterProp="label"
              value={dataSourceId || undefined}
              options={dataSources.map((d) => ({
                // 实测后端返回 value/label/text（见 api/dataSourceAgent.ts 的说明），这里同时兼容 id/name
                value: String(d.value ?? d.id ?? ''),
                label: String(d.label ?? d.text ?? d.name ?? d.value ?? ''),
              }))}
              onChange={(v) => {
                const next = v ?? '';
                setDataSourceId(next);
                flush({ dataSource: next });
                void loadTables(next);
              }}
            />
          </Space>
          {/* 表名检索（源 `a-input-search`：`enter-button` + `allowClear`；
              本工程加了**输入即搜**：400ms 防抖后按新关键字重查）
              ⚠️ 未选数据源时**禁用**（2026-09-16）：此前输入框可点，但后端拿不到 dataSourceId
              会直接清空列表、前端连请求都不发 —— 表现就是"输了没反应"，像检索坏了。 */}
          <Input.Search
            allowClear
            enterButton
            disabled={disabled || !dataSourceId}
            placeholder={dataSourceId ? '请输入表名' : '请先选择数据源'}
            style={{ width: '100%', marginBottom: 8 }}
            value={tableKeyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onSearch={onTableSearch}
          />
          <Table<SyncTableRow>
            rowKey={(row) => String(row.tableName ?? Math.random())}
            size="small"
            loading={tablesLoading}
            columns={tableColumns}
            dataSource={tables}
            /* 服务端分页：分页器自带「共 N 条」（totalCount 来自后端） */
            pagination={tablesPagination}
            scroll={{ y: 220 }}
            /* 源工程是「点击整行即生成 select * from 表名」 */
            onRow={(row) => ({ onClick: () => pickTable(row) })}
            rowClassName={() => (disabled ? '' : 'agent-table-row-clickable')}
            locale={{
              /* ⚠️ 空态文案要分情况（2026-09-16 修）：
                 原先无论什么原因空列表都显示「请先选择数据源」——
                 首次**冷启动加载中**、检索没命中时都这么说，用户会以为"数据源丢了 / 检索坏了"。
                 （"首次进入要等一会"= 后端第一次用到该数据源要现建连接池，
                   日志实证：`创建新的DB数据库连接` → 连续 5 次握手 → `{dataSource-2} inited` ≈0.6s，
                   之后每次都是 `从缓存中获取DB连接`，毫秒级。） */
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    !dataSourceId
                      ? '请先选择数据源'
                      : tablesLoading
                        ? '正在加载表列表…'
                        : tableKeyword
                          ? `无匹配的表（关键字「${tableKeyword}」）`
                          : '该数据源下没有可用的表'
                  }
                />
              ),
            }}
          />
          <div style={{ marginTop: 8, marginBottom: 4 }}>SQL 脚本</div>
          <Input.TextArea
            rows={5}
            disabled={disabled}
            placeholder="可直接写 SQL，或点击上方表名自动生成「select * from 表名」"
            value={sqlStr}
            onChange={(e) => {
              setSqlStr(e.target.value);
              flush({ sql: e.target.value });
            }}
          />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" disabled={disabled} onClick={() => void doPreview()}>
              执行预览
            </Button>
          </Space>
          <div style={{ marginTop: 14, marginBottom: 4 }}>参数映射</div>
          <ParamMappingTable
            value={paramsRows}
            disabled={disabled}
            onChange={(rows) => {
              setParamsRows(rows);
              flush({ paramData: rows });
            }}
          />
        </div>
      )}

      {/* ===== Api ===== */}
      {scriptType === 'Api' && (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          message="接口数据源"
          description="接口编号、供应商、请求/响应参数映射请在下方「接口脚本相关字段」与参数映射表格中填写；本区域只负责选择数据源类型。"
        />
      )}

      {/* ===== KnowledgeCode（4 步向导） ===== */}
      {scriptType === 'KnowledgeCode' && (
        <div style={{ marginTop: 12 }}>
          <Steps
            size="small"
            current={kbStep}
            style={{ marginBottom: 16 }}
            items={KB_STEP_TITLES.map((t) => ({ title: t }))}
          />

          {/* 步骤 1：选择知识库 */}
          {kbStep === 0 && (
            <div>
              <Space style={{ marginBottom: 8 }} wrap>
                <span>知识库分组：</span>
                <Cascader
                  allowClear
                  showSearch
                  disabled={disabled}
                  style={{ width: 320 }}
                  placeholder="请选择知识库分组"
                  fieldNames={kbCascaderFieldNames}
                  options={groupOptions as unknown as Record<string, unknown>[]}
                  value={kbGroupPath.length ? kbGroupPath : undefined}
                  onChange={(v) => {
                    const path = Array.isArray(v) ? v.map((x) => String(x)) : [];
                    setKbGroupPath(path);
                    flush({ knowledgeGroupInfo: path });
                  }}
                />
                <span>知识库：</span>
                <Select
                  allowClear
                  showSearch
                  disabled={disabled}
                  style={{ width: 320 }}
                  placeholder="请选择知识库"
                  optionFilterProp="label"
                  value={knowledgeCode || undefined}
                  options={kbOptions.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(v) => kbPickKnowledge(v ?? '')}
                />
              </Space>
              <div style={{ marginTop: 8 }}>
                <Button type="primary" disabled={disabled || !knowledgeCode} onClick={kbGoNext}>
                  下一步
                </Button>
                {!knowledgeCode && (
                  <span style={{ marginLeft: 8, color: '#999' }}>请先选中一个知识库</span>
                )}
              </div>
            </div>
          )}

          {/* 步骤 2：配置参数 */}
          {kbStep === 1 && (
            <div>
              <Table<KbParamRow>
                rowKey="key"
                size="small"
                bordered
                columns={kbParamColumns}
                dataSource={kbRows}
                pagination={false}
                locale={{
                  emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无参数，可点下方「添加参数」" />,
                }}
              />
              <div style={{ marginTop: 12 }}>
                <Button type="dashed" disabled={disabled} onClick={kbAddRow}>
                  + 添加参数
                </Button>
              </div>
              <div style={{ marginTop: 12 }}>
                <Button disabled={disabled} onClick={kbGoPrev}>
                  上一步
                </Button>
                <Button type="primary" style={{ marginLeft: 10 }} disabled={disabled} onClick={kbGoNext}>
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* 步骤 3：是否启用大模型 */}
          {kbStep === 2 && (
            <div>
              <Card size="small">
                <Space>
                  <span>是否启用大模型：</span>
                  <Switch
                    disabled={disabled}
                    checked={kbWithModelSummary}
                    checkedChildren="启用"
                    unCheckedChildren="禁用"
                    onChange={(checked) => {
                      setKbWithModelSummary(checked);
                      flush({ withModelSummary: checked });
                    }}
                  />
                </Space>
              </Card>
              <div style={{ marginTop: 12 }}>
                <Button disabled={disabled} onClick={kbGoPrev}>
                  上一步
                </Button>
                <Button type="primary" style={{ marginLeft: 10 }} disabled={disabled} onClick={kbGoNext}>
                  下一步
                </Button>
              </div>
            </div>
          )}

          {/* 步骤 4：预览 */}
          {kbStep === 3 && (
            <div>
              <Card size="small" title="预览结果">
                <pre style={{ maxHeight: 400, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {kbPreviewText || '暂无预览内容'}
                </pre>
              </Card>
              <div style={{ marginTop: 12 }}>
                <Button disabled={disabled} onClick={kbGoPrev}>
                  上一步
                </Button>
                <Button
                  type="primary"
                  style={{ marginLeft: 10 }}
                  loading={kbPreviewing}
                  disabled={disabled}
                  onClick={() => void kbPreview()}
                >
                  预览
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 预览 =====
          尺寸优化（2026-09-16 用户反馈"弹框太小、看数据不方便"）：
          - 宽度 1200 → **90vw（上限 1680px）**：列多时不再一屏只挤下四五列；
          - 高度不再写死 `y: 600`，改为 **随视口自适应** `calc(100vh - 220px)`；
          - 弹框贴顶 24px（antd 默认 100px，高弹框会白占一截，底部容易被挤到屏幕外）；
          - 表体上下留白收窄，把纵向空间让给数据；
          - 标题带**行列数**，列宽用 `max-content`（按内容自适应，真放不下才横向滚动）。
          ⚠️ 源工程 `SqlPreviewModal.vue` 是固定 `width=1200` + `scroll={x:1000, y:600}`，
             也即"小弹框"是源设计；本次是**用户明确要求的放宽**，非移植偏差。 */}
      <Modal
        open={previewOpen}
        title={
          <Space size={10}>
            <span>查询结果</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(0, 0, 0, 0.45)' }}>
              共 {(previewResult.dataList ?? []).length} 行 · {(previewResult.tableHeaders ?? []).length} 列
            </span>
          </Space>
        }
        /* 宽度：铺满视口（96vw），并在 `style` 里**再显式写一遍 + maxWidth:none** ——
           inline style 优先级最高，避免任何全局/主题 CSS 的 `max-width` 把宽度压回去
           （早先是源工程那样的固定 1200；用户两次要求放宽，本次再加大）。
           高度：弹框贴顶 `top:24`；表体按视口自适应，且**最大/最小高度都给**——
           行多时不越屏，行少时（哪怕只有 1 行）也铺满，不再缩成一条。 */
        width="96vw"
        style={{ top: 24, width: '96vw', maxWidth: 'none', paddingBottom: 0 }}
        styles={{ body: { padding: '12px 16px 0' } }}
        footer={<Button onClick={() => setPreviewOpen(false)}>关闭</Button>}
        onCancel={() => setPreviewOpen(false)}
        destroyOnHidden
      >
        {/* 高度：`scroll.y` 是**最大高度**语义（antd 给表体挂的是 max-height），
            所以数据只有 1~2 行时表体会缩成那么高，弹框整体跟着变"扁"（用户 2026-09-16 反馈：
            "就只有一条数据，整个框扁扁的"）。这里补一层**最小高度**，让数据少时也铺满屏幕。
            外层 div 的 minHeight 是兜底：万一目标类名在 antd 版本间有差异，弹框高度仍够。 */}
        <div className="agent-preview-grid" style={{ minHeight: 'calc(100vh - 300px)' }}>
          <style>{`
            .agent-preview-grid .ant-table-body,
            .agent-preview-grid .ant-table-content { min-height: calc(100vh - 260px); }
          `}</style>
          <Table<Record<string, unknown>>
            rowKey={(_row, index) => String(index)}
            size="small"
            loading={previewLoading}
            columns={previewColumns}
            dataSource={(previewResult.dataList ?? []) as Record<string, unknown>[]}
            pagination={false}
            scroll={{ x: 'max-content', y: 'calc(100vh - 260px)' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据" /> }}
          />
        </div>
      </Modal>
    </div>
  );
}