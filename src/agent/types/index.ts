/**
 * agent 模块 — 类型定义
 *
 * 本模块自带返回体类型，不依赖宿主工程的 src/types。
 * 字段与宿主 Result 保持同构（code/message/data），便于两端共存而不混淆。
 */

/** 统一返回体（对应后端 com.suzhou.bank.agent.common.AgentResult） */
export interface AgentResult<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页返回体（对应后端 AgentPageResult / MyBatis-Plus Page） */
export interface AgentPageResult<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
}

/** 通用分页查询入参 */
export interface AgentPageQuery {
  pageIndex?: number;
  pageSize?: number;
  [key: string]: unknown;
}

/**
 * 源工程（JeecgBoot）风格的分页返回体
 *
 * 对应后端 `com.suzhou.bank.agent.common.ListResult`。
 * **⚠️ 与上面的 {@link AgentPageResult} 是两个不同的结构**，不要混用：
 *   - `ListResult`      → `totalCount / pageSize / pageIndex / columnList / list`
 *   - `AgentPageResult` → `records / total / size / current`（MyBatis-Plus Page）
 *
 * 后端为什么并存两套：从源工程平移过来的 Service 方法签名大量使用 `ListResult`，
 * 强行统一要改上百处调用。所以约定：**前端按接口实际返回的结构分别解析**。
 * 当前 agent 模块的列表接口（如 `/agent/rule/list`）返回的是本结构。
 */
export interface AgentListResult<T> {
  totalCount: number;
  pageSize: number;
  pageIndex: number;
  columnList: string[] | null;
  list: T[];
}

/* ==================== 智策引擎（检查项 / 规则） ==================== */

/** 检查项（对应后端 AgentRuleEntity） */
export interface RuleItem {
  id: number;
  ruleCode: string;
  ruleName: string;
  topic1: string;
  topic2: string;
  ruleText: string;
  parsedExpression: string;
  promptKey: string;
  thresholdConfig: string;
  factAnalysis: string;
  riskRemark: string;
  disposalAdvice: string;
  additionalAnalysis: string;
  additionalAnalysisName: string;
  requestParams: string;
  ruleStatus: string;
  updateTime: string;
  [key: string]: unknown;
}

/** 主题二级联动项（`/agent/rule/topicSelect` 返回） */
export interface TopicOption {
  topic1: string;
  topic2List: string[];
}

/** 主题筛选对（一级 + 二级） */
export interface TopicPair {
  topic1: string;
  topic2: string;
}

/** 检查项列表查询入参（对应后端 AgentRuleReq） */
export interface RuleListQuery {
  id?: number;
  ruleName?: string;
  ruleCode?: string;
  ruleStatus?: string;
  startTime?: string;
  endTime?: string;
  topicPairList?: TopicPair[];
  pageIndex: number;
  pageSize: number;
}

/** 检查项保存入参（对应后端 AgentRuleSaveReq） */
export interface RuleSaveParams {
  id: number | null;
  ruleCode: string;
  ruleName: string;
  topic1: string;
  topic2: string;
  ruleText: string;
  parsedExpression: string;
  promptKey: string;
  thresholdConfig: string;
  factAnalysis: string;
  riskRemark: string;
  disposalAdvice: string;
  additionalAnalysis: string;
  additionalAnalysisName: string;
  requestParams: string;
}

/** 检查项解析结果（对应后端 AgentRuleParseVO） */
export interface RuleParseResult {
  parsedExpression: string;
  promptKey: string;
  /** `error` 表示解析失败（阈值解析用于区分成功/失败） */
  parseCode?: string;
}

/** 检查项校验入参（对应后端 AgentRuleExecuteReq） */
export interface RuleExecuteParams {
  entName: string;
  requestParams: Record<string, unknown>;
  parsedExpression: string;
  promptKey: string;
  thresholdConfig: string;
  factAnalysis: string;
}

/** 校验溯源的单条指标（对应后端 AgentRuleMetricVO） */
export interface RuleMetricItem {
  indexCode: string;
  indexName: string;
  actualValue: string;
  dataUnit: string;
}

/** 检查项校验结果（对应后端 AgentRuleExecuteVO） */
export interface RuleExecuteResult {
  /** 可能是布尔值，也可能是"命中"/"未命中"这类字符串 */
  resultStatus: boolean | string | null;
  matchedMetrics: RuleMetricItem[];
  factExpression: string;
}

/** 指标树节点（`/index/config/all/queryList` 返回的树） */
export interface IndexTreeNode {
  paramNo: string;
  paramName: string;
  parentParamName?: string;
  children?: IndexTreeNode[];
}

/** 补充分析下拉项（`/KnowledgeBase/config/simplePageList` 返回） */
export interface SupplementaryOption {
  paramNo: string;
  paramName: string;
  [key: string]: unknown;
}
