/**
 * 报告 API — 模板化报告实例（后端 report 主表 + 模板/实例表）
 * <p>报告记录由上游预生成（report 表，status=111 待开始），
 * 本模块接口负责：加工生成（instance/generate|process）、列表（instance/page）、详情（instance/{reportNo}）。</p>
 */
import { get, post } from './request';
import type { ApiResponse, PageResult } from '../types';

/**
 * 校验后端业务响应码
 * <p>响应拦截器只解包 res.data，不校验响应体里的 code；后端业务失败（Result.fail）时
 * HTTP 仍是 200，若不显式判断会被当成成功。故写接口统一包一层：
 * code != 200 时抛出业务错误信息，交由调用方提示并回滚。</p>
 */
async function expectOk<T>(p: Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
  const res = await p;
  if (res && res.code !== 200) {
    throw new Error(res.message || '操作失败');
  }
  return res;
}

/* =============================================================================
 * 模板化报告实例（模板驱动生成，后端 report + app_report_* 表）
 * ========================================================================== */

/** 报告记录（report 表） */
export interface ReportInstanceSummary {
  id: number;
  /** 报告编号（详情接口入参） */
  reportNo: string;
  /** 客户编号 */
  customerId?: string;
  /** 客户名称 */
  customerName?: string;
  reportTitle?: string;
  reportType?: string;
  /** 日检流水号（同一流水号下多个版本） */
  checkTaskNo?: string;
  /** 用户编号（用户账号） */
  userNo?: string;
  /** 版本号（整数 1/2/3…，展示时前端拼 V 前缀） */
  version?: number;
  /** 111-待开始 000-进行中 888-已完成 999-失败 */
  status?: string;
  /** 失败原因（999 时记录技术类/业务类异常详情） */
  failReason?: string;
  createdAt?: string;
  /** 更新时间（状态流转/失败原因写入时刷新，即"生成时间"） */
  updatedAt?: string;
}

/**
 * 报告列表检索条件（与表格列一一对应）
 * <p>文本列后端按「包含」匹配；status 精确匹配；省略的字段即不过滤。</p>
 */
export interface ReportPageQuery {
  page: number;
  size: number;
  checkTaskNo?: string;
  customerId?: string;
  customerName?: string;
  reportNo?: string;
  reportTitle?: string;
  /** 精确匹配：111 / 000 / 888 / 999 */
  status?: string;
  userNo?: string;
  /** 创建时间范围（yyyy-MM-dd，含当天） */
  createdBegin?: string;
  createdEnd?: string;
  /** 生成（更新）时间范围（yyyy-MM-dd，含当天） */
  updatedBegin?: string;
  updatedEnd?: string;
}

/** 发起报告入参（其余字段由服务端补全） */
export interface ReportCreatePayload {
  /** 客户编号 */
  customerId: string;
  /** 客户名称 */
  customerName: string;
  /** 日检流水号（详情页入口键，同一流水号下不可重复发起） */
  checkTaskNo: string;
  /** 报告标题 */
  reportTitle: string;
  /** 报告类型 */
  reportType: string;
}

/** 报告内容块（实例层） */
export interface ReportInstanceBlock {
  blockCode: string;
  catalogCode?: string | null;
  /** TITLE / TEXT / TABLE / SOURCE_LINK */
  fillType: string;
  /** RULE / ANALYSIS */
  analysisType?: string;
  agentCode?: string;
  /** 内容块名称（analysisType=RULE 时即规则名称） */
  blockName?: string;
  titleLevel?: number;
  sortNo?: number;
  /** HIDE / PLACEHOLDER */
  emptyStrategy?: string;
  anchorCode?: string;
  jumpAnchorCode?: string;
  content?: string;
  empty?: boolean;
}

/** 目录节点（含内容块与子目录） */
export interface ReportInstanceCatalog {
  catalogCode: string;
  catalogName: string;
  catalogLevel?: number;
  parentCode?: string;
  sortNo?: number;
  blocks?: ReportInstanceBlock[];
  children?: ReportInstanceCatalog[];
}

/** AI 风险列表项 */
export interface ReportInstanceRisk {
  blockCode: string;
  agentCode?: string;
  ruleName?: string;
  riskDesc?: string;
  /** PENDING / ADOPTED / INVALID */
  status?: string;
  jumpAnchorCode?: string;
  sortNo?: number;
  catalogCode?: string;
  /** 该风险要点在当前日检流水号下的修改记录条数（跨版本累计）；>0 时前端显示「修改记录(N)」 */
  editCount?: number;
}

/** AI 全文分析记录（详情页「智能体分析」面板数据源） */
export interface ReportAiAnalysisItem {
  id?: number;
  reportNo?: string;
  checkTaskNo?: string;
  /** RUNNING-进行中 / DONE-已完成 / FAILED-失败 */
  status?: 'RUNNING' | 'DONE' | 'FAILED';
  /** 分析正文（成品 HTML 片段，直接渲染） */
  analysisContent?: string;
  /** 综合结论摘要 */
  summary?: string;
  /** 大模型给出的总体风险等级 */
  riskLevel?: string;
  /** 实际调用的模型名 */
  modelName?: string;
  operatorName?: string;
  operatorNo?: string;
  /** 大模型调用耗时（毫秒） */
  costMillis?: number;
  /** 失败原因（status=FAILED 时有值） */
  failReason?: string;
  /** 完成时间 */
  generateTime?: string;
  /** 触发时间 */
  inputtime?: string;
}

/** 预警建议 · 单条预警信号（表格一行） */
export interface ReportWarningAdviceItem {
  id?: number;
  batchId?: number;
  /** 序号（模型输出顺序，已按红>橙>黄排序） */
  seqNo?: number;
  /** 建议预警等级：RED-红色 / ORANGE-橙色 / YELLOW-黄色 */
  warningLevel?: 'RED' | 'ORANGE' | 'YELLOW';
  /** 预警信号描述 */
  signalDesc?: string;
  /** 触发条件/判断依据 */
  triggerCondition?: string;
  /** 原文依据（引用原文关键句） */
  sourceText?: string;
  /** 风险点描述（未关联到风险点时为空） */
  riskDesc?: string;
  /** 所在章节/段落 */
  chapter?: string;
  /** 处理状态：PENDING-待处理 / ADOPTED-已采纳 / INVALID-无效 */
  status?: 'PENDING' | 'ADOPTED' | 'INVALID';
  operatorName?: string;
  operatorNo?: string;
  operateTime?: string;
}

/** 预警建议（批次 + 明细 + 红橙黄统计） */
export interface ReportWarningAdviceVO {
  id?: number;
  reportNo?: string;
  checkTaskNo?: string;
  /** 基于哪一次全文分析生成 */
  analysisId?: number;
  /** PENDING-排队中（链式触发已预插，等全文分析完成）/ RUNNING-进行中 / DONE-已完成 / FAILED-失败 */
  status?: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  /** 核心提示（模型总结，1~3 句话） */
  coreTip?: string;
  promptCode?: string;
  modelName?: string;
  operatorName?: string;
  operatorNo?: string;
  costMillis?: number;
  failReason?: string;
  generateTime?: string;
  inputtime?: string;
  /** 逐条预警信号 */
  advices?: ReportWarningAdviceItem[];
  /** 红色预警条数 */
  redCount?: number;
  /** 橙色预警条数 */
  orangeCount?: number;
  /** 黄色预警条数 */
  yellowCount?: number;
}

/** 风险要点修改记录项（详情页「修改记录」弹窗数据源） */
export interface ReportRiskEditLogItem {
  /** 是否为「原始版本」（AI 生成的第一版内容）；后端置顶补的人造条目，仅首条可能为 true */
  original?: boolean;
  /** 修改人姓名（取不到 real_name 时回落账号；原始版本条目为空） */
  operatorName?: string;
  operatorNo?: string;
  /** 修改时间（原始版本条目为空） */
  inputtime?: string;
  /** 修改后文案（原始版本条目即 AI 生成的第一版内容） */
  contentAfter?: string;
  /** 修改前文案（审计对比用） */
  contentBefore?: string;
  /** 该次修改发生在哪一版报告上 */
  reportNo?: string;
}

/** 报告详情（三栏渲染数据源） */
export interface ReportInstanceDetail {
  reportNo: string;
  customerId?: string;
  customerName?: string;
  reportTitle?: string;
  /** 日检流水号 */
  checkTaskNo?: string;
  /** 版本号（整数 1/2/3…，展示时前端拼 V 前缀） */
  version?: number;
  /** 111-待开始 000-进行中 888-已完成 999-失败 */
  status?: string;
  /** 更新时间（即"生成时间"） */
  updatedAt?: string;
  headBlocks?: ReportInstanceBlock[];
  catalogs?: ReportInstanceCatalog[];
  risks?: ReportInstanceRisk[];
  riskPending?: number;
  riskAdopted?: number;
  riskInvalid?: number;
}

/** 报告版本项（版本下拉框数据源） */
export interface ReportVersionItem {
  /** 报告编号（详情接口入参） */
  reportNo: string;
  /** 版本号（整数 1/2/3…，展示时前端拼 V 前缀） */
  version?: number;
  /** 报告状态：000-进行中 888-已完成 999-失败 */
  status?: string;
  /** 失败原因（status=999 时有值） */
  failReason?: string;
  /** 更新时间 */
  updatedAt?: string;
}

export const reportApi = {
  /* ---------------- 模板化报告实例 ---------------- */

  /** 报告记录分页查询（模板化报告列表，支持全部列检索；返回体带 total） */
  instancePage: (query: ReportPageQuery) =>
    expectOk(get<PageResult<ReportInstanceSummary>>('/report/instance/page', { ...query })),

  /** 发起报告：创建一条 report 记录（status=111 待开始，reportNo 由服务端生成） */
  instanceCreateReport: (payload: ReportCreatePayload) =>
    expectOk(post<ReportInstanceSummary>('/report/instance/create', payload)),

  /** 报告详情（报告头 + 目录树含内容块 + AI 风险列表） */
  instanceDetail: (reportNo: string) =>
    expectOk(get<ReportInstanceDetail>(`/report/instance/${encodeURIComponent(reportNo)}`)),

  /** 某日检流水号下的所有版本（版本下拉框） */
  instanceVersions: (checkTaskNo: string) =>
    expectOk(get<ReportVersionItem[]>('/report/instance/versions', { checkTaskNo })),

  /** 某日检流水号下最新版本的报告详情 */
  instanceLatest: (checkTaskNo: string) =>
    expectOk(get<ReportInstanceDetail>('/report/instance/latest', { checkTaskNo })),

  /** 更新报告：在日检流水号下新建一份报告（新版本，后端异步生成） */
  instanceRenew: (checkTaskNo: string) =>
    expectOk(post<ReportVersionItem>(`/report/instance/renew?checkTaskNo=${encodeURIComponent(checkTaskNo)}`)),

  /** 按模板加工生成报告实例（含状态流转） */
  instanceGenerate: (reportNo: string) =>
    expectOk(post<any>(`/report/instance/generate?reportNo=${encodeURIComponent(reportNo)}`)),

  /** 纯加工报告实例（不改状态） */
  instanceProcess: (reportNo: string) =>
    expectOk(post<any>(`/report/instance/process?reportNo=${encodeURIComponent(reportNo)}`)),

  /** 更新 AI 风险处置状态（采纳 / 无效 / 待处理），行身份 = reportNo + blockCode */
  instanceRiskStatus: (reportNo: string, blockCode: string, status: string) =>
    expectOk(post<void>('/report/instance/risk/status', { reportNo, blockCode, status })),

  /** 修改规则类正文内容（后端同事务同步风险列表文案 + 写入修改记录，并把状态置为已采纳） */
  instanceBlockContent: (reportNo: string, blockCode: string, content: string) =>
    expectOk(post<void>('/report/instance/block/content', { reportNo, blockCode, content })),

  /** 查询某风险要点的修改记录（归档维度：同日检流水号 + 同风险要点；
   *  时间正序返回，首位为置顶的「原始版本」条目，其后按修改时间从早到晚） */
  instanceBlockEditHistory: (checkTaskNo: string, blockCode: string) =>
    expectOk(get<ReportRiskEditLogItem[]>(
      `/report/instance/block/edit-history?checkTaskNo=${encodeURIComponent(checkTaskNo)}`
      + `&blockCode=${encodeURIComponent(blockCode)}`)),

  /* ---------------- AI 全文分析（前端手动触发，后台异步执行，前端按状态轮询） ---------------- */

  /** 取某日检流水号下「最新版本报告」的最新一次全文分析；从未分析过 data 为 null */
  instanceAiAnalysis: (checkTaskNo: string) =>
    expectOk(get<ReportAiAnalysisItem | null>(
      `/report/instance/ai-analysis?checkTaskNo=${encodeURIComponent(checkTaskNo)}`)),

  /** 某份报告的全部全文分析记录（保留多次，最新在上） */
  instanceAiAnalysisList: (reportNo: string) =>
    expectOk(get<ReportAiAnalysisItem[]>(
      `/report/instance/ai-analysis/list?reportNo=${encodeURIComponent(reportNo)}`)),

  /** 触发一次全文分析（异步）；同一报告已有进行中的分析时后端返回 code!=200 */
  instanceAiAnalysisGenerate: (reportNo: string) =>
    expectOk(post<ReportAiAnalysisItem>('/report/instance/ai-analysis/generate', { reportNo })),

  /** 重新分析（失败重试 / 再跑一次），新增一条记录、保留历史 */
  instanceAiAnalysisRetry: (reportNo: string) =>
    expectOk(post<ReportAiAnalysisItem>('/report/instance/ai-analysis/retry', { reportNo })),

  /** 查单次全文分析详情 */
  instanceAiAnalysisDetail: (id: number) =>
    expectOk(get<ReportAiAnalysisItem | null>(`/report/instance/ai-analysis/${id}`)),

  /* ---------------- AI 预警建议（依赖全文分析，前端手动触发 + 按状态轮询） ---------------- */

  /** 取某份报告最新一批预警建议（含明细与红橙黄统计）；从未生成过 data 为 null */
  instanceWarningAdvice: (reportNo: string) =>
    expectOk(get<ReportWarningAdviceVO | null>(
      `/report/instance/warning-advice?reportNo=${encodeURIComponent(reportNo)}`)),

  /** 触发一次预警建议生成（异步）；需先有成功的全文分析，且同一报告同时只允许一个批次 */
  instanceWarningAdviceGenerate: (reportNo: string) =>
    expectOk(post<ReportWarningAdviceVO>('/report/instance/warning-advice/generate', { reportNo })),

  /** 更新某条预警建议的处理状态（采纳 / 无效 / 待处理） */
  instanceWarningAdviceStatus: (id: number, status: string) =>
    expectOk(post<void>('/report/instance/warning-advice/status', { id, status })),

  /* ---------------- 一键串行：全文分析 → 预警建议 ---------------- */

  /**
   * 一键串行触发：先全文分析，结束后自动接着跑预警建议
   * - 唯一入口是详情页标题右侧的「智能体分析」按钮
   * - 该报告存在进行中的全文分析、或排队中/进行中的预警建议批次时，后端返回 code!=200（「分析进行中，请稍后再试」）
   * - 返回的是新建的全文分析记录（status=RUNNING），预警建议批次已排队（status=PENDING）
   */
  instanceAiChainGenerate: (reportNo: string) =>
    expectOk(post<ReportAiAnalysisItem>('/report/instance/ai-chain/generate', { reportNo })),
};
