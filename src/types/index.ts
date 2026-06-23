/**
 * 全局类型定义 — 与后端 bosz-agent-backend 实体类对齐
 *
 * 修改类型时必须同步检查后端对应实体，保持前后端契约一致。
 */

/** 通用 API 响应结构，T 为 data 字段类型 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页结果，对应后端 MyBatis-Plus Page */
export interface PageResult<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
}

/** 客户实体 */
export interface Customer {
  id?: number;
  companyName: string;       // 企业名称
  creditCode: string;        // 统一社会信用代码
  legalPerson: string;       // 法定代表人
  actualController: string;  // 实际控制人
  registeredCapital: string; // 注册资本
  paidCapital: string;       // 实缴资本
  establishDate: string;     // 成立日期
  industry: string;          // 所属行业
  bizScope: string;          // 经营范围
  registerAddress: string;   // 注册地址
  holdingType: string;       // 控股类型
  shareholder: string;       // 股东
  groupName: string;         // 集团名称
  customerType: string;      // 客户类型
  firstLoanDate: string;     // 首次贷款日期
  lastApprovalDate: string;  // 最近审批日期
  mainBank: string;          // 主办银行
  settlementBank: string;    // 结算银行
  status: string;            // 状态
}

/** 数据域枚举 — 12 个维度的数据来源 */
export type DataDomain = 'FINANCE' | 'CREDIT' | 'TAX' | 'JUDICIAL' | 'SETTLEMENT' | 'INDUSTRY_COMMERCE' | 'SOCIAL_SECURITY' | 'CUSTOMS' | 'UTILITY' | 'PROPERTY' | 'GRAPH' | 'MANAGEMENT';

/** 采集器配置 — 定义数据采集方式和定时策略 */
export interface CollectorConfig {
  id?: number;
  configName: string;
  collectorType: 'HTTP_API' | 'DB_SYNC' | 'SFTP_FILE' | 'FILE_UPLOAD' | 'WEBHOOK';
  configJson: string;        // 采集器配置 JSON（连接串、地址等）
  cronExpression?: string;   // 定时采集 cron 表达式
  enabled: number;           // 0=禁用 1=启用
}

/** 解析器配置 — 定义采集到的原始数据如何解析为指标 */
export interface ParserConfig {
  id?: number;
  collectorId: number;       // 关联的采集器 ID
  parserType: 'JSON_PATH' | 'EXCEL_TEMPLATE' | 'OCR_TEXT' | 'GROOVY_SCRIPT';
  configJson: string;        // 解析配置 JSON（mappings 映射等）
  domain: DataDomain;        // 解析结果归属的数据域
  sortOrder: number;         // 多解析器时的执行顺序
}

/** 指标数据 — 采集+解析后的结构化指标 */
export interface IndicatorData {
  id?: number;
  customerId: number;
  indicatorKey: string;      // 指标编码
  indicatorName: string;     // 指标名称
  currentValue: string;      // 当前值
  previousValue: string;     // 上期值
  changeDesc: string;        // 变动描述
  dataUnit: string;          // 单位
  domain: DataDomain;        // 所属数据域
  period: string;            // 数据周期（如 "2025Q1"）
}

/** 知识库规则 — 风险判定规则定义 */
export interface KnowledgeRule {
  id?: number;
  ruleCode: string;
  ruleName: string;
  ruleType: 'THRESHOLD' | 'BOOLEAN' | 'COMPOSITE';
  description: string;       // 规则的自然语言说明
  enabled: number;           // 0=禁用 1=启用
}

/** 规则条件 — 指标的阈值/布尔判断 */
export interface RuleCondition {
  id?: number;
  ruleId?: number;
  indicatorKey: string;
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'NEQ' | 'CONTAINS';
  threshold: string;
  logicOrder: number;        // 条件间的逻辑执行顺序
  logicConnector: 'AND' | 'OR'; // 与下一个条件的连接方式
}

/** 规则标签 — 用于场景匹配的标签 */
export interface RuleTag {
  id?: number;
  ruleId?: number;
  tagType: 'SCENARIO' | 'INDUSTRY' | 'PRODUCT' | 'RISK_TYPE';
  tagValue: string;
}

/** 规则场景 — Know-Kit 分析时选择的场景标签组 */
export interface RuleScenario {
  id?: number;
  scenarioCode: string;
  scenarioName: string;
  description: string;
}

/** Know-Kit 分析任务 — 调用智能体生成分析结果 */
export interface KnowKitTask {
  id?: number;
  customerId: number;
  scenarioTags: string;      // 逗号分隔的场景标签
  requestJson: string;       // 发送给 Know-Kit 的请求体
  responseJson: string;      // Know-Kit 返回的原始响应
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  errorMsg?: string;
}

/** 报告 — Know-Kit 分析结果生成的结构化报告 */
export interface Report {
  id?: number;
  customerId: number;
  reportTitle: string;
  reportType: string;
  status: 'DRAFT' | 'GENERATED' | 'PUBLISHED';
  knowKitTaskId?: number;    // 关联的 Know-Kit 任务 ID
  contentHtml: string;       // 报告正文 HTML
}
