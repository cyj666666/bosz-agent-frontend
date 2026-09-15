/**
 * agent 模块 — 知识配置管理接口
 *
 * 对应源工程 `amar-agent-admin/src/api/knowledge.js`。
 *
 * ── URL 规则（**以本条为准，勿按"源URL加前缀"推导**）──
 * 前端 axios 的 baseURL 是 `/api`，所以：
 *
 *     前端写什么        →  实际请求            →  对应后端
 *     /agent/rule/list  →  /api/agent/rule/list  →  AgentRuleController base=/api/agent/rule
 *
 * 即 **前端 URL = 后端真实路径去掉开头的 `/api`**。
 *
 * ⚠️ 常见误区：源工程里有些 api 的 URL 自带 `agent` 段（如 `/agent/rule/list`、
 * `/agent/largeModelConfig/list`），有些没有（如 `/KnowledgeBase/config/queryInfo`、
 * `/index/config/all/queryList`）。若按「`/agent` + 源 URL」机械拼接，前者会拼成
 * `/agent/agent/rule/list`（双 agent）而 404。**逐条对照后端 Controller 的类级路径最稳。**
 */
import { agentGet, agentPost } from './agentRequest';
import agentRequest from './agentRequest';
import type { AgentListResult } from '../types';

/* ---------------- 分组（知识库目录树） ---------------- */

/**
 * 知识库分组树
 *
 * 源工程 `KnownGroupManage.vue` 就是用这个接口取树的（不是单独的 group/query 语义），
 * 返回结构同样落在 `list` 上。
 */
export function queryGroupTree(params: Record<string, unknown> = {}): Promise<AgentListResult<KnowledgeGroupNode>> {
  return agentGet<AgentListResult<KnowledgeGroupNode>>('/agent/KnowledgeBase/config/group/query', params);
}

/** 新增分组 */
export function addGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/group/add', params);
}

/** 分组更新 */
export function updateGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/group/update', params);
}

/** 分组删除（连同子分组） */
export function deleteGroup(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/group/delete', params);
}

/* ---------------- 知识库列表 / 明细 ---------------- */

/**
 * 知识库分页列表
 *
 * 入参（源工程筛选项）：`paramNo` / `paramName` / `paramStatus` / `online` + 分页 + `parentParamNo`(分组)
 */
export function pageKnowledgeList(params: Record<string, unknown>): Promise<AgentListResult<KnowledgeParamRow>> {
  return agentPost<AgentListResult<KnowledgeParamRow>>('/agent/KnowledgeBase/config/pageList', params, 100 * 1000);
}

/** 知识库列表（不分页口径，源工程 queryList） */
export function queryKnowledgeList(params: Record<string, unknown>): Promise<AgentListResult<KnowledgeParamRow>> {
  return agentPost<AgentListResult<KnowledgeParamRow>>('/agent/KnowledgeBase/config/queryList', params, 100 * 1000);
}

/** 知识库详情 */
export function queryInfo(params: Record<string, unknown>): Promise<KnowledgeParamDetail> {
  return agentPost<KnowledgeParamDetail>('/agent/KnowledgeBase/config/queryInfo', params);
}

/* ---------------- 知识库增删改 ---------------- */

export function addKnowledge(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/add', params);
}

export function updateKnowledge(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/update', params);
}

export function deleteKnowledge(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/delete', params);
}

export function copyKnowledge(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/copy', params);
}

export function moveKnowledge(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/move', params);
}

/* ---------------- 其它 ---------------- */

/** 知识库细类参数（配置弹窗里选参数用） */
export function getSourceParamList(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/getSourceParamList', params);
}

/** 分组下知识库参数列表（黑盒参数配置用） */
export function getKnowledgeParamsList(params: Record<string, unknown>): Promise<AgentListResult<KnowledgeParamRow>> {
  return agentPost<AgentListResult<KnowledgeParamRow>>('/agent/KnowledgeBase/config/getKnowledgeParamsList', params);
}

/**
 * 补充分析下拉（`/KnowledgeBase/config/simplePageList`）
 *
 * 契约：**返回数组**。详见 `api/rule.ts` 里同名函数的说明——
 * 源实现在空结果时返回 Map、有结果时返回 List，已修后端统一为 List。
 */
export function simplePageList(params: Record<string, unknown>): Promise<KnowledgeParamRow[]> {
  return agentPost<KnowledgeParamRow[]>('/agent/KnowledgeBase/config/simplePageList', params);
}

/** 智能体下拉项（`agent_config` 的投影） */
export interface AgentOptionRow {
  id: number;
  agentName: string;
  agentCode?: string;
  agentStatus?: string;
  largeModelCode?: string;
  [key: string]: unknown;
}

/**
 * 智能体下拉（源工程 `getAgentList`）
 *
 * 对应源 `/agent/agentConfig/list`。需要说明的是：这份数据**并不需要跨系统取**——
 * `agent_config` 表就在本工程库里（随源库迁移一并带过来），
 * 只是本工程此前没有为它写 Mapper/Controller。现已补只读的 `AgentConfigController`，
 * 故「关联 Agent」恢复为下拉（源工程的形态）。
 */
export function getAgentList(): Promise<AgentListResult<AgentOptionRow>> {
  return agentPost<AgentListResult<AgentOptionRow>>('/agent/agentConfig/list', {});
}

/** 大模型配置下拉（知识库要绑定大模型） */
export function getLargeModelList(params: Record<string, unknown> = {}): Promise<AgentListResult<LargeModelRow>> {
  return agentPost<AgentListResult<LargeModelRow>>('/agent/largeModelConfig/list', params);
}

/** 批量同步（与指标配置共用一个接口） */
export function intfSync(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/knowledge/sync/execute', params, 10 * 60 * 1000);
}

/* ==================== 配置弹窗（全屏三栏）所需的扩展接口 ==================== */
/*
 * 说明：以下接口在源工程分散于 `api/knowledge.js`、`api/agent.js`、`api/api.js` 三处，
 * 这里按「用途」归拢到本文件，避免 React 侧一个组件要 import 三个 api 文件。
 * URL 一律按本文件开头的规则（后端路径去掉 `/api`）书写。
 */

/** 大模型下拉：源 `getLargeModelList2` 把 list 映射成 `{title, value}`，此处保持同形态 */
export async function getLargeModelOptions(
  params: Record<string, unknown> = { pageIndex: 1, pageSize: 200 },
): Promise<SelectOption[]> {
  const res = await agentPost<AgentListResult<LargeModelRow>>('/agent/largeModelConfig/list', params);
  return (res?.list ?? []).map((i) => ({ title: i.lmName, value: i.lmCode }));
}

/** 规则树（配置弹窗左栏「规则」tab，源 `getAgentRuleTree`） */
export function getRuleTree(params?: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/rule/tree', params ?? {});
}

/* ---------------- 指标配置的「知识库」数据源（DataSourceCard） ---------------- */

/**
 * 知识库下拉（指标配置「知识库取值」用）
 *
 * ⚠️ **与上面 `getKnowledgeOptions` 不是同一个选择口径，别复用**：
 *   - `getKnowledgeOptions`（条件组的「引用知识库」块）→ 值取 `paramId`
 *   - 本函数（指标 script 的 `moduleCode`）→ **值取 `paramNo`**
 *   依据：真实数据 `index_params.script.moduleCode` 存的是 `jyk-yszk-AI` 这种**编号**，
 *   而不是 paramId；源工程 `DataSourceCard.vue` 也是 `value: item.paramNo`。
 *
 * 源 `knowledgeBaseList({pageIndex:1,pageSize:200,online:'Y',paramStatus:'Y'})` —— **不传 groupId**，
 * 分组过滤在**前端**按 `groupId` 做（源工程 `filterKnowledgeCodeByGroup` 同此口径）。
 * `online` / `paramStatus` 两个过滤条件必须保留，否则会把下线/停用的知识库列出来。
 */
export interface KnowledgeCodeOption {
  /** `paramNo` —— 写进 `script.moduleCode` */
  value: string;
  /** `paramNo-paramName`（与源工程下拉显示一致） */
  label: string;
  paramName: string;
  groupId: string;
  groupName: string;
}

export async function queryKnowledgeCodeOptions(): Promise<KnowledgeCodeOption[]> {
  const res = await agentPost<AgentListResult<KnowledgeParamRow>>('/agent/KnowledgeBase/config/queryList', {
    pageIndex: 1,
    pageSize: 200,
    online: 'Y',
    paramStatus: 'Y',
  });
  return (res?.list ?? []).map((i) => {
    const row = i as Record<string, unknown>;
    return {
      value: String(i.paramNo ?? ''),
      label: `${i.paramNo}-${i.paramName}`,
      paramName: String(i.paramName ?? ''),
      groupId: String(row.groupId ?? ''),
      groupName: String(row.groupName ?? ''),
    };
  });
}

/**
 * 知识库取值「预览」（源工程 `knowledgeBasePreviewNew` → `POST /get`）
 *
 * 🔴 **必须用未经业务码校验的原始实例**：该接口直接返回大模型/知识库的裸 JSON，
 * **不走统一 `Result` 包装**（后端 `KnowledgeBaseConfigServiceImpl#getPromptContent`
 * 返回的是 `promptObject` / `llmResult` 本身），用 `agentPost` 会因 `code !== 200` 被误判为失败。
 * 取值优先级（源 `dataPreview`）由调用方按 `answer → content → result.content → result` 处理。
 */
export function previewKnowledgeCode(params: Record<string, unknown>): Promise<unknown> {
  return agentRequest.post('/agent/get', params, { timeout: 200 * 1000 });
}

/**
 * 知识库下拉（条件组的「引用知识库」块用）
 *
 * 源 `KnowledgePiece.vue` 的 getOptions：按级联选中的分组查**在线且启用**的知识库，
 * 取 `result.list`，选项显示 `paramNo-paramName`、值取 `paramId`。
 * 过滤条件（`online: 'Y'`、`paramStatus: 'Y'`）必须保留——去掉会把下线的知识库也列出来。
 */
export async function getKnowledgeOptions(params: {
  groupId?: string;
  parentGroupId?: string;
}): Promise<SelectOption[]> {
  const res = await agentPost<AgentListResult<KnowledgeParamRow>>('/agent/KnowledgeBase/config/queryList', {
    groupId: params.groupId ?? '',
    parentGroupId: params.parentGroupId ?? '',
    pageIndex: 1,
    pageSize: 100,
    online: 'Y',
    paramStatus: 'Y',
  });
  return (res?.list ?? []).map((i) => ({ title: `${i.paramNo}-${i.paramName}`, value: i.paramId }));
}

/* ---------------- 溯源配置（指标 ↔ 溯源点绑定） ---------------- */

export function queryRelateIndexList(params: Record<string, unknown>): Promise<AgentListResult<RelateIndexRow>> {
  return agentPost<AgentListResult<RelateIndexRow>>('/agent/KnowledgeBase/config/relate/index/list', params);
}

export function addRelateIndex(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/relate/index/add', params);
}

export function editRelateIndex(params: unknown): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/relate/index/edit', params);
}

/**
 * 知识库关联指标 - 按 id 删除
 *
 * ⚠️ 请求体是**裸数组** `[1,2]`（后端 `@RequestBody List<Integer>`），与新增/编辑不同，
 * 所以入参类型是 `unknown`（和 `editRelateIndex` 同理）。
 */
export function deleteRelateIndex(params: unknown): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/relate/index/delete', params);
}

/* ---------------- 测试集（右栏「请求参数」） ---------------- */

export function getTestSetList(params: Record<string, unknown>): Promise<AgentListResult<TestSetRow>> {
  return agentPost<AgentListResult<TestSetRow>>('/agent/knowledgeRelateInputParam/list', params);
}

export function addTestSet(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/knowledgeRelateInputParam/add', params);
}

export function editTestSet(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/knowledgeRelateInputParam/edit', params);
}

export function deleteTestSet(ids: string[]): Promise<unknown> {
  return agentPost('/agent/knowledgeRelateInputParam/deleteBatch', ids);
}

/* ---------------- 版本（发布 / 历史 / 回看某一版） ---------------- */

export function listVersions(params: Record<string, unknown>): Promise<AgentListResult<KnowledgeVersionRow>> {
  return agentPost<AgentListResult<KnowledgeVersionRow>>('/agent/knowledgeBaseVersion/list', params);
}

export function publishVersion(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/knowledgeBaseVersion/public', params);
}

export function editVersion(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/knowledgeBaseVersion/edit', params);
}

export function queryVersionById(id: string): Promise<KnowledgeParamDetail> {
  return agentGet<KnowledgeParamDetail>('/agent/knowledgeBaseVersion/queryById', { id });
}

/* ---------------- 黑盒参数配置 ---------------- */

export function getParamSelectList(params: Record<string, unknown>): Promise<AgentListResult<ParamSelectRow>> {
  return agentPost<AgentListResult<ParamSelectRow>>('/agent/KnowledgeBase/config/getParamSelectList', params);
}

/**
 * 批量新增参数配置
 *
 * ⚠️ 入参是**数组本身**（源工程 `batchAddKnowledgeParams(params)` 直接传数组，
 * 每项 `{ paramCode, paramName, paramType, relateSourceParam, paramNo, paramValue, relateKnowledgeId }`），
 * 不是包装对象。故签名用 `unknown` 而非 `Record`。
 */
export function batchAddKnowledgeParams(params: unknown): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/batchAddKnowledgeParams', params);
}

export function updateKnowledgeParams(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/updateKnowledgeParams', params);
}

export function deleteKnowledgeParams(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/deleteKnowledgeParams', params);
}

export function batchDeleteKnowledgeParams(ids: string[]): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/batchDeleteKnowledgeParams', ids);
}

export function saveBlackParam(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/saveBlackParam', params);
}

/* ---------------- 数据字典（黑盒参数的「关联数据字典」下拉） ----------------
 * 源工程用的是 Jeecg 的 `/sys/dict/list` 与 `/sys/dict/getDictItems/{code}`，
 * 宿主没有这两个接口；后端已用 agent 自己的 `AgentDictMapper` 在
 * `/api/agent/sys/dict/**` 下补齐（见 AgentDictController）。
 */

export function getDictList(
  params: Record<string, unknown> = { pageNo: 1, pageSize: 100 },
): Promise<{ records?: DictRow[] }> {
  return agentGet<{ records?: DictRow[] }>('/agent/sys/dict/list', params);
}

export function getDictItems(dictCode: string): Promise<DictItemRow[]> {
  return agentGet<DictItemRow[]>(`/agent/sys/dict/getDictItems/${encodeURIComponent(dictCode)}`);
}

/**
 * 分类字典根列表（对应源 `loadTreeRoot(pcode, async)`）
 *
 * 源工程「细分参数配置」用它取 `X02` 分类下的细项，做「细项名称」下拉。
 * 返回 `TreeSelectModel`：`{ key, title, value, isLeaf, children }`。
 *
 * 🔴 2026-09-16 修正：原先指向 `GET /sys/category/rootList` —— **接口打错了**。
 * 源工程与后端真正对应的是 `GET /sys/category/loadTreeRoot?pcode=&async=`（[SysCategoryController#loadTreeRoot]，
 * 返回 `List<TreeSelectModel>`）；而 `rootList` 那支返回的是 **`IPage<SysCategory>`（一个分页对象）**，
 * 前端按数组收 → 恒为空数组 ⇒ **「细项名称」下拉永远是空的**（且不报错）。
 */
export function loadCategoryTreeRoot(pcode: string, async = true): Promise<CategoryNode[]> {
  return agentGet<CategoryNode[]>('/agent/sys/category/loadTreeRoot', { pcode, async });
}

/** 分类节点（源工程用到 `key` / `title` / `value`，并在前端补 `label` / `descValue`） */
export interface CategoryNode {
  /** 节点主键（`TreeSelectModel.key`） */
  key?: string;
  id?: string;
  title?: string;
  value?: string;
  label?: string;
  descValue?: string;
  children?: CategoryNode[];
  [key: string]: unknown;
}

/* ---------------- 预览 / 校验（长超时，注意与源工程一致） ---------------- */

export function previewKnowledge(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/preview', params, 200 * 1000);
}

/**
 * ⚠️ 下面 4 个「溯源 / 图片 / 全源」预览接口：**源端实际上从未被触发**（2026-09-15 已核查，
 * 详见 `bosz-agent-backend/doc/知识配置_预览类接口_源端使用情况核查.md`），故本工程**有意不接线**，
 * 保留定义只为将来要么启用、要么清理。**不要把它们当成"漏做"去补 UI。**
 *
 * | 接口 | 源端情况 |
 * |---|---|
 * | `tracePreview` / `imagePreview` / `wholeSourcePreview` | **死代码** —— 只被源端已废弃的 V1 弹窗<br>`KnownConfigModal.vue`（线上用的是 `KnownConfigModalV2.vue`）调用 |
 * | `resourcePreview` | **活代码但零数据** —— 入口标签靠条件组里的 `resourceFlag=true` 渲染，<br>而公司库/本地库 `knowledge_base_params.prompt` 里 `resourceFlag` **86/86 全是 false** → 永不触发 |
 *
 * 数据层佐证（公司库与本地库逐条一致）：`trace_config` / `image_config` / `whole_source_config`
 * 非空 **0 / 86**；`knowledge_relate_index` 493 行中 `trace_status='Y'`、`trace_card_status='Y'` 均 **0**。
 */

/** 溯源配置预览 —— 源端死代码（V1 专用），本工程不接线 */
export function tracePreview(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/tracePreview', params);
}

/** 图片溯源预览 —— 源端死代码（V1 专用），本工程不接线 */
export function imagePreview(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/imagePreview', params);
}

/** 全部来源预览 —— 源端死代码（V1 专用），本工程不接线 */
export function wholeSourcePreview(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/wholeSourcePreview', params);
}

/** 溯源配置预览 —— 源端活代码但零数据（依赖 `resourceFlag=true`，实测 0/86），暂不接线 */
export function resourcePreview(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/resource/preview', params);
}

export function checkResult(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/resultCheck', params, 5 * 60 * 1000);
}

export function jsExceptionPreview(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/jsException/preview', params);
}

export function getAiAnswerMsgNo(params: Record<string, unknown>): Promise<unknown> {
  return agentPost('/agent/KnowledgeBase/config/getAiAnswerMsgNo', params);
}

/* ---------------- 类型 ---------------- */

/** 知识库分组树节点 */
export interface KnowledgeGroupNode {
  groupId: string;
  groupName: string;
  groupValue?: string;
  parentGroupId?: string;
  children?: KnowledgeGroupNode[];
  [key: string]: unknown;
}

/** 知识库列表行（列定义见源工程 KnownList.vue 的 columns） */
export interface KnowledgeParamRow {
  paramId: string;
  paramNo: string;
  paramName: string;
  largeModelCode: string;
  isMarkdownDesc: string;
  onlineDesc: string;
  paramStatusDesc?: string;
  blackContentDesc?: string;
  blackModelCode?: string;
  [key: string]: unknown;
}

/** 知识库详情 */
export interface KnowledgeParamDetail extends Partial<KnowledgeParamRow> {
  parentParamNo?: string;
  groupValue?: string;
  groupName?: string;
  /** prompt / 溯源等配置的 JSON 串 */
  promptConfig?: string;
  sourceConfig?: string;
  [key: string]: unknown;
}

/** 大模型配置行 */
export interface LargeModelRow {
  id: number;
  lmCode: string;
  lmName: string;
  model: string;
  url?: string;
  [key: string]: unknown;
}

/** 通用下拉项（源工程 `largeModelCodeOptions` / `casOptions` 的统一形态） */
export interface SelectOption {
  title: string;
  value: string;
}

/** 溯源行（知识库 ↔ 指标 的绑定记录） */
export interface RelateIndexRow {
  id?: number | string;
  knowledgeId?: string;
  indexNo?: string;
  indexName?: string;
  [key: string]: unknown;
}

/** 测试集行（右栏「请求参数」） */
export interface TestSetRow {
  id?: number | string;
  knowledgeId?: string;
  paramName?: string;
  paramValue?: string;
  [key: string]: unknown;
}

/** 版本行（发布历史） */
export interface KnowledgeVersionRow {
  id: string;
  versionNo?: string;
  versionName?: string;
  createTime?: string;
  [key: string]: unknown;
}

/** 黑盒参数可选行（「选择参数」弹窗的数据源） */
export interface ParamSelectRow {
  paramCode?: string;
  paramName?: string;
  paramType?: string;
  [key: string]: unknown;
}

/** 字典主表行 */
export interface DictRow {
  dictCode: string;
  dictName: string;
}

/** 字典项（`fieldAttr` 即源工程前端取的那个值 → 写入 relateDictValue） */
export interface DictItemRow {
  value: string;
  text: string;
  fieldAttr?: string;
  [key: string]: unknown;
}
