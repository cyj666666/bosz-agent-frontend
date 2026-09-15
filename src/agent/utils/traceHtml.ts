/**
 * agent 模块 — 溯源卡片「列表配置」的 HTML / 数据构造
 *
 * React 等价物，对应源工程 `knowledge/components/insertRich.js` 里的
 * `createHtml(index)` 与 `createTableDataList(index)` 两支（其余 `insertRichText` /
 * `insertImageArea` 是给富文本编辑器用的，本项目不用）。
 *
 * ══════════ 为什么要把这段单独抽出来 ══════════
 * 这两个函数产出的是 **`knowledge_relate_index.trace_config` 的正式数据**：
 * 后端 `KnowledgeBaseConfigServiceImpl#parseTraceConfig` 会：
 *   1. 把 `html` 里带 `data-param-no` 的节点全部抽出来当"涉及的指标"（配合 `source_anchor` 的 `{{名||号}}`）；
 *   2. 用 `ParamUtil.insteadPrompt` 把 `{{名||号}}` 替换成实际取值；
 *   3. `sourceType='cardType'` 时按 `defaultParams` / `inputParam` 去取数。
 * ⇒ 所以**产出的字符串结构必须与源端逐字一致**（属性名、值、嵌套层级），
 *   改这里等于改落库数据格式，会直接影响报告里的溯源渲染。
 *
 * ══════════ 与源件的两点差异（有意）══════════
 *   1. **HTML 转义**：源件用 `document.createElement` + `innerText` 赋值，浏览器自动转义；
 *      这里是字符串拼接，必须自己转（否则指标名里出现 `<` `&` 会破坏 HTML）。
 *   2. **属性顺序**按源件 `setAttribute` 的先后写成 `data-mce-annotation` → `data-expand` → `class`，
 *      与浏览器 `outerHTML` 的输出一致（后端按属性名解析，顺序本身不敏感，但不留意外差异）。
 */

/** 「列表配置」里的一列（对应后端 / `relateParams` 返回的一个字段） */
export interface TraceTableChild {
  /** 表头显示名 */
  columnTitle: string;
  /** 指标编号（也是列的 dataIndex） */
  paramNo: string;
  /** 指标名称 */
  paramName: string;
}

/** `traceConfig[].tableListData` 的形状 */
export interface TraceTableListData {
  /** 指标类型：LIST / OBJECT / CHAR …（决定 span 的 `data-expand`） */
  paramType?: string;
  children: TraceTableChild[];
}

/** 表格里的一行：`{ [paramNo]: '{{名称||编号}}' }` */
export type TraceTableRow = Record<string, string>;

/** HTML 文本转义（等价源件 `innerText` 赋值的效果） */
export function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** HTML 属性值转义 */
function escapeAttr(text: unknown): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * 解析 `{{名称||编号}}`（源件 `EditTable.parseNameIdString`）
 *
 * ⚠️ 源件在格式不匹配时返回 `null`，调用处直接 `const { name, id } = ...` 解构 →
 * **会抛 TypeError**。这里保留"返回 null"的语义，但要求调用方判空（本工程调用处已判）。
 */
export function parseNameIdString(str: unknown): { name: string; id: string } | null {
  if (typeof str !== 'string') return null;
  const match = /^\{\{(.+?)\|\|(.*?)\}\}$/.exec(str);
  if (!match) return null;
  return { name: match[1], id: match[2] };
}

/** 由名称+编号拼 `{{名称||编号}}` */
export function toNameIdString(paramName: string, paramNo: string): string {
  return `{{${paramName}||${paramNo}}}`;
}

/** 一个指标占位 span 的 outerHTML（源件 `createIndexSpan`） */
function buildIndexSpan(child: TraceTableChild, paramType?: string): string {
  return (
    `<span data-mce-annotation="agent" data-expand="${paramType === 'LIST' ? 'row' : 'no'}" ` +
    `class="mce-annotation">${escapeHtml(toNameIdString(child.paramName, child.paramNo))}</span>`
  );
}

/**
 * 由 `tableListData` 生成溯源卡片 HTML（源件 `createHtml`）
 *
 * 结构：一行表头的单行表格；每个单元格是一个带 `mce-annotation` 类的 span。
 */
export function createTraceHtml(data: TraceTableListData): string {
  const children = data?.children ?? [];
  const th = children.map((c) => `<th>${escapeHtml(c.columnTitle)}</th>`).join('');
  const td = children.map((c) => `<td>${buildIndexSpan(c, data?.paramType)}</td>`).join('');
  return (
    '<table class="traceability-table">' +
    `<thead><tr>${th}</tr></thead>` +
    `<tbody><tr>${td}</tr></tbody>` +
    '</table>'
  );
}

/**
 * 由 `tableListData` 生成可编辑表格用的 `{columns, data}`（源件 `createTableDataList`）
 *
 * 注意是**单行**数据：一列一格，格子里的值就是 `{{名称||编号}}` 原文。
 */
export function createTraceTableDataList(data: TraceTableListData): {
  columns: { dataIndex: string; title: string }[];
  data: TraceTableRow[];
} {
  const children = data?.children ?? [];
  const obj: TraceTableRow = {};
  const columns = children.map((c) => {
    obj[c.paramNo] = toNameIdString(c.paramName, c.paramNo);
    return { dataIndex: c.paramNo, title: c.columnTitle };
  });
  return { columns, data: [obj] };
}

/**
 * 反向：由「可编辑表格的列 + 第一行数据」重建 `tableListData`（源件 `EditTable.changeTable`）
 *
 * 注意 `paramName` 取的是**单元格文本里解析出来的名称**；解析不出来时退化为列标题
 * （源件这里会直接崩，本工程做了兜底，见 `EditableTraceTable` 的说明）。
 */
export function rebuildTableListData(
  paramType: string | undefined,
  columns: { dataIndex: string; title: string }[],
  firstRow: TraceTableRow,
): TraceTableListData {
  const children: TraceTableChild[] = columns.map((col) => {
    const parsed = parseNameIdString(firstRow?.[col.dataIndex]);
    return {
      columnTitle: col.title,
      paramNo: col.dataIndex,
      paramName: parsed ? parsed.name : col.title,
    };
  });
  return { paramType, children };
}

// `escapeAttr` / `buildIndexSpan` 暂不外用，保留是为了下次改属性时不用重新推导转义口径
export { escapeAttr, buildIndexSpan };
