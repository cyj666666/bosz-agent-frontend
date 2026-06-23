// 通用响应
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// 分页
export interface PageResult<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
}

// 客户
export interface Customer {
  id?: number;
  companyName: string;
  creditCode: string;
  legalPerson: string;
  actualController: string;
  registeredCapital: string;
  paidCapital: string;
  establishDate: string;
  industry: string;
  bizScope: string;
  registerAddress: string;
  holdingType: string;
  shareholder: string;
  groupName: string;
  customerType: string;
  firstLoanDate: string;
  lastApprovalDate: string;
  mainBank: string;
  settlementBank: string;
  status: string;
}

// 数据域
export type DataDomain = 'FINANCE' | 'CREDIT' | 'TAX' | 'JUDICIAL' | 'SETTLEMENT' | 'INDUSTRY_COMMERCE' | 'SOCIAL_SECURITY' | 'CUSTOMS' | 'UTILITY' | 'PROPERTY' | 'GRAPH' | 'MANAGEMENT';

// 采集器配置
export interface CollectorConfig {
  id?: number;
  configName: string;
  collectorType: 'HTTP_API' | 'DB_SYNC' | 'SFTP_FILE' | 'FILE_UPLOAD' | 'WEBHOOK';
  configJson: string;
  cronExpression?: string;
  enabled: number;
}

// 解析器配置
export interface ParserConfig {
  id?: number;
  collectorId: number;
  parserType: 'JSON_PATH' | 'EXCEL_TEMPLATE' | 'OCR_TEXT' | 'GROOVY_SCRIPT';
  configJson: string;
  domain: DataDomain;
  sortOrder: number;
}

// 指标数据
export interface IndicatorData {
  id?: number;
  customerId: number;
  indicatorKey: string;
  indicatorName: string;
  currentValue: string;
  previousValue: string;
  changeDesc: string;
  dataUnit: string;
  domain: DataDomain;
  period: string;
}

// 规则
export interface KnowledgeRule {
  id?: number;
  ruleCode: string;
  ruleName: string;
  ruleType: 'THRESHOLD' | 'BOOLEAN' | 'COMPOSITE';
  description: string;
  enabled: number;
}

export interface RuleCondition {
  id?: number;
  ruleId?: number;
  indicatorKey: string;
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'NEQ' | 'CONTAINS';
  threshold: string;
  logicOrder: number;
  logicConnector: 'AND' | 'OR';
}

export interface RuleTag {
  id?: number;
  ruleId?: number;
  tagType: 'SCENARIO' | 'INDUSTRY' | 'PRODUCT' | 'RISK_TYPE';
  tagValue: string;
}

export interface RuleScenario {
  id?: number;
  scenarioCode: string;
  scenarioName: string;
  description: string;
}

// KnowKit
export interface KnowKitTask {
  id?: number;
  customerId: number;
  scenarioTags: string;
  requestJson: string;
  responseJson: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  errorMsg?: string;
}

// 报告
export interface Report {
  id?: number;
  customerId: number;
  reportTitle: string;
  reportType: string;
  status: 'DRAFT' | 'GENERATED' | 'PUBLISHED';
  knowKitTaskId?: number;
  contentHtml: string;
}
