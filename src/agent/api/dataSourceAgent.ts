/**
 * agent 模块 — 数据源（取数源）接口
 *
 * 对应源工程 `amar-agent-admin/src/api/dataSource.js`。
 * URL 规则：**前端 URL = 后端路径去掉开头的 `/api`**（后端 `SysDataSourceController` 的
 * 类级路径是 `/api/agent/sys/dataSource`）。
 */
import { agentGet, agentPost } from './agentRequest';
import type { AgentListResult } from '../types';

/**
 * 数据源下拉项
 *
 * 🔴 **`value` 必须是 `sys_data_source.id`（主键），不是 `code`。**
 *
 * 为什么：后端所有取数路径都按**主键**解析 —— `SysDataSourceServiceImpl#getDynamicDbSourceById`
 * → `getById(id)`，被「表列表 / 表字段 / SQL 预览 / 数据预览」以及运行时取数 `SqlDataSetBuilder`
 * 全部复用；`index_params.script.dataSource` 里存的也是 id
 * （公司库实测：`2095447359636992001` 正是该公司 `sys_data_source` 的主键）。
 * `code`（`boszLocal` / `openGauss`）只在 `getDynamicDbSourceByCode`（动态连接池缓存 key）里用，
 * **不能**写进 `script`。
 *
 * 🔴 2026-09-16 实锤的坑：本文件原先接的是 `/sys/dataSource/options`，而该接口是
 * `option.put("value", item.getCode())` → 返回 **code**（`boszLocal`）。
 * 于是「配置 → 数据源配置 → 改成 SQL 脚本 → 选数据源」立刻报
 * `ERROR ... 数据源信息不存在,dataSourceId:boszLocal`（后端 `WHERE id=?` 查不到）。
 *
 * 源工程 `views/index/DataSourceCard.vue` 用的是 `getDataSourceList('/sys/dataSource/list')`
 * 再 `map(item => ({ value: item.id, label: item.name }))` —— 本文件对齐之，别再用 `/options` 做下拉。
 */
export interface DataSourceOption {
  /** `sys_data_source.id`（主键，即 `getSyncTableList` / `sqlPreviewList` 的 `dataSourceId`） */
  value?: string;
  /** 显示名（`sys_data_source.name`） */
  label?: string;
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

/**
 * 归一成完整的 `AgentListResult`（**保留 `totalCount`**）
 *
 * 与 `pickList` 的区别：`pickList` 只取数组、丢掉总数；分页场景必须留总数
 * （表列表要显示「共 N 条」，且 N 是**服务端过滤后的总数**，不是当页条数）。
 */
function toListResult<T>(res: unknown): AgentListResult<T> {
  const list = pickList<T>(res);
  const obj = (res ?? {}) as Record<string, unknown>;
  return {
    list,
    totalCount: typeof obj.totalCount === 'number' ? obj.totalCount : list.length,
    pageSize: Number(obj.pageSize ?? 0),
    pageIndex: Number(obj.pageIndex ?? 1),
    columnList: Array.isArray(obj.columnList) ? (obj.columnList as string[]) : null,
  };
}

/**
 * 数据源下拉（源 `getDataSourceList` → `/sys/dataSource/list`）
 *
 * 🔴 **不要换成 `/sys/dataSource/options`**：那个接口的 `value` 是 `code`，
 * 而后端按主键解析 → 选完就报「数据源信息不存在」（详见 `DataSourceOption` 的说明）。
 *
 * 源工程同样一次性拉全（`DataSourceCard.vue` onMounted 传 `pageSize: 999`）。
 * ⚠️ `/list` 会把 `db_password` **解密后**一起返回，所以这里**只取 id/name 两项**，
 * 不要把整条实体塞进组件状态。
 */
export async function getDataSourceList(): Promise<DataSourceOption[]> {
  const res = await agentGet<unknown>('/agent/sys/dataSource/list', { pageNo: 1, pageSize: 999 });
  return pickList<Record<string, unknown>>(res).map((item) => ({
    value: String(item.id ?? ''),
    label: String(item.name ?? item.code ?? ''),
  }));
}

/**
 * 可选表列表（源 `getSyncTableList`）
 *
 * 支持按表名/表注释检索（源 `DataSourceCard.vue` 的「请输入表名」搜索框：
 * `params.tableName = value; refresh()`）—— 后端 `TableListQueryReq` 有 `tableName` / `tableNote`，
 * PG 分支用 `AND c.relname LIKE ?`（**百分号包裹 = 模糊匹配**）在**服务端**过滤，所以改动关键字要重新请求。
 *
 * 返回**完整 ListResult**（含 `totalCount`），供表列表分页显示「共 N 条」——
 * 不能只取 list 长度：分页时每页只有 pageSize 条，长度当总数是错的。
 */
export async function getSyncTableList(params: {
  dataSourceId: string;
  /** 表名（模糊匹配，服务端过滤） */
  tableName?: string;
  /** 表注释（模糊匹配，服务端过滤） */
  tableNote?: string;
  /** ⚠️ 后端 `TableListQueryReq extends PageBaseParam`，分页字段是 **pageIndex**（不是 pageNo） */
  pageIndex?: number;
  pageSize?: number;
}): Promise<AgentListResult<SyncTableRow>> {
  const res = await agentPost<unknown>('/agent/sys/dataSource/getSyncTableList', {
    pageIndex: 1,
    pageSize: 10,
    ...params,
  });
  return toListResult<SyncTableRow>(res);
}

/** 表字段元数据（用于生成 SQL 时参考字段名） */
export async function getSyncTabInfo(params: {
  dataSourceId: string;
  tableName: string;
}): Promise<TabFieldRow[]> {
  const res = await agentPost<unknown>('/agent/sys/dataSource/getSyncTabInfo', params);
  return pickList<TabFieldRow>(res);
}

/** SQL 预览时的取数参数行（= 参数映射表格的行） */
export interface SqlPreviewParam {
  /** 参数名，后端用它在 SQL 里替换 `:name` 占位符 */
  name?: string;
  /** 参数默认值（非 null 才会参与替换） */
  defaultValue?: unknown;
  [key: string]: unknown;
}

/**
 * SQL 预览（源 `SqlPreviewModal` 用的接口）
 *
 * 入参字段名与源工程一致：`dataSourceId` / `sqlContent` / `sqlParam`。
 *
 * 🔴 `sqlParam` **必须是数组**（取数参数行），不能传空字符串：
 * 后端 `DataSourceDataPreviewReq.sqlParam` 的类型是 `com.alibaba.fastjson.JSONArray`，
 * 传 `''` 会让 Jackson 反序列化失败 → **HTTP 400**（2026-09-15 自测实测）。
 * 之所以在源工程里没暴露：源前端 `SqlPreviewModal` 的 prop 类型虽写成 String，
 * 但实际传的是 `paramsTableData` 数组（Vue 只告警不报错），且 Jeecg 侧用的是 fastjson 转换器、更宽容。
 * 服务端消费方式（`SysDataSourceServiceImpl#sqlPreviewList`）：遍历数组取 `name` + `defaultValue`，
 * 用 `defaultValue` 替换 SQL 里的 `:name`。
 */
export async function sqlPreviewList(params: {
  dataSourceId: string;
  sqlContent: string;
  sqlParam?: SqlPreviewParam[];
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
