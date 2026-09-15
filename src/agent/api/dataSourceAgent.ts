/**
 * agent 模块 — 数据源（取数源）接口
 *
 * 对应源工程 `amar-agent-admin/src/api/dataSource.js`。
 * URL 规则：**前端 URL = 后端路径去掉开头的 `/api`**（后端 `SysDataSourceController` 的
 * 类级路径是 `/api/agent/sys/dataSource`）。
 */
import { agentGet, agentPost } from './agentRequest';

/**
 * 数据源下拉项
 *
 * ⚠️ **字段名以实测为准**：`/api/agent/sys/dataSource/options` 实际返回
 * `{"value":"boszLocal","label":"苏州银行本地库","text":"苏州银行本地库"}`——
 * 是 Jeecg 风格的 `value`/`label`/`text`，**不是** `id`/`name`。
 * 而 `getSyncTableList` 的入参叫 `dataSourceId`，取的就是这里的 `value`。
 */
export interface DataSourceOption {
  /** 数据源编码（即 `getSyncTableList` 的 `dataSourceId`） */
  value?: string;
  /** 显示名 */
  label?: string;
  text?: string;
  /** 兼容形态：万一后端后续改为返回 id/name 也能识别 */
  id?: string;
  name?: string;
  [key: string]: unknown;
}

/** 表元数据行（`getSyncTableList` 的元素） */
export interface SyncTableRow {
  tableName?: string;
  tableComment?: string;
  [key: string]: unknown;
}

/** 字段元数据行（`getSyncTabInfo` 的元素） */
export interface TabFieldRow {
  columnName?: string;
  columnComment?: string;
  columnType?: string;
  columnLength?: number | string;
  [key: string]: unknown;
}

/** SQL 预览结果 */
export interface SqlPreviewResult {
  tableHeaders?: string[];
  dataList?: Record<string, unknown>[];
  [key: string]: unknown;
}

/** 两端兼容：后端可能把数组放在 `list`/`records` 里，也可能直接返回数组 */
function pickList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    for (const key of ['list', 'records', 'dataList'] as const) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

/** 数据源下拉（源 `getDataSourceList`） */
export async function getDataSourceOptions(): Promise<DataSourceOption[]> {
  const res = await agentGet<unknown>('/agent/sys/dataSource/options');
  return pickList<DataSourceOption>(res);
}

/** 可选表列表（源 `getSyncTableList`） */
export async function getSyncTableList(params: {
  dataSourceId: string;
  pageNo?: number;
  pageSize?: number;
}): Promise<SyncTableRow[]> {
  const res = await agentPost<unknown>('/agent/sys/dataSource/getSyncTableList', {
    pageNo: 1,
    pageSize: 200,
    ...params,
  });
  return pickList<SyncTableRow>(res);
}

/** 表字段元数据（用于生成 SQL 时参考字段名） */
export async function getSyncTabInfo(params: {
  dataSourceId: string;
  tableName: string;
}): Promise<TabFieldRow[]> {
  const res = await agentPost<unknown>('/agent/sys/dataSource/getSyncTabInfo', params);
  return pickList<TabFieldRow>(res);
}

/**
 * SQL 预览（源 `SqlPreviewModal` 用的接口）
 *
 * 入参字段名与源工程一致：`dataSourceId` / `sqlContent` / `sqlParam`。
 */
export async function sqlPreviewList(params: {
  dataSourceId: string;
  sqlContent: string;
  sqlParam?: string;
}): Promise<SqlPreviewResult> {
  const res = await agentPost<unknown>('/agent/sys/dataSource/sqlPreviewList', params);
  return (res ?? {}) as SqlPreviewResult;
}

/** 按表名做数据预览（源工程 DataSourceCard 的另一条预览路径） */
export async function dataPreviewList(params: {
  dataSourceId: string;
  tableName: string;
  pageSize?: number;
}): Promise<SqlPreviewResult> {
  const res = await agentPost<unknown>('/agent/sys/dataSource/dataPreviewList', {
    pageSize: 20,
    ...params,
  });
  return (res ?? {}) as SqlPreviewResult;
}
