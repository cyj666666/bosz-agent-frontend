/**
 * 报告 API — 模板化报告实例（后端 report 主表 + 模板/实例表）
 * <p>报告记录由上游预生成（report 表，status=111 待开始），
 * 本模块接口负责：加工生成（instance/generate|process）、列表（instance/page）、详情（instance/{reportNo}）。</p>
 */
import { get, post } from './request';
import type { PageResult } from '../types';

/* =============================================================================
 * 模板化报告实例（模板驱动生成，后端 report + app_report_* 表）
 * ========================================================================== */

/** 报告记录（report 表） */
export interface ReportInstanceSummary {
  id: number;
  /** 报告编号（详情接口入参） */
  reportNo: string;
  customerId?: string;
  customerName?: string;
  reportTitle?: string;
  reportType?: string;
  /** 日检流水号（同一流水号下多个版本） */
  checkTaskNo?: string;
  /** 版本号（V1/V2/V3） */
  version?: string;
  /** 111-待开始 000-进行中 888-已完成 999-失败 */
  status?: string;
  /** 失败原因（999 时记录技术类/业务类异常详情） */
  failReason?: string;
  createdAt?: string;
  /** 更新时间（状态流转/失败原因写入时刷新，即"生成时间"） */
  updatedAt?: string;
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
}

/** 报告详情（三栏渲染数据源） */
export interface ReportInstanceDetail {
  reportNo: string;
  customerId?: string;
  customerName?: string;
  reportTitle?: string;
  /** 日检流水号 */
  checkTaskNo?: string;
  /** 版本号（V1/V2/V3） */
  version?: string;
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
  /** 版本号（V1/V2/V3） */
  version?: string;
  /** 报告状态 */
  status?: string;
  /** 更新时间 */
  updatedAt?: string;
}

export const reportApi = {
  /* ---------------- 模板化报告实例 ---------------- */

  /** 报告记录分页查询（模板化报告列表） */
  instancePage: (page: number, size: number, customerId?: string) =>
    get<PageResult<ReportInstanceSummary>>('/report/instance/page', { page, size, customerId }),

  /** 报告详情（报告头 + 目录树含内容块 + AI 风险列表） */
  instanceDetail: (reportNo: string) =>
    get<ReportInstanceDetail>(`/report/instance/${encodeURIComponent(reportNo)}`),

  /** 某日检流水号下的所有版本（版本下拉框） */
  instanceVersions: (checkTaskNo: string) =>
    get<ReportVersionItem[]>('/report/instance/versions', { checkTaskNo }),

  /** 某日检流水号下最新版本的报告详情 */
  instanceLatest: (checkTaskNo: string) =>
    get<ReportInstanceDetail>('/report/instance/latest', { checkTaskNo }),

  /** 按模板加工生成报告实例（含状态流转） */
  instanceGenerate: (reportNo: string) =>
    post<any>(`/report/instance/generate?reportNo=${encodeURIComponent(reportNo)}`),

  /** 纯加工报告实例（不改状态） */
  instanceProcess: (reportNo: string) =>
    post<any>(`/report/instance/process?reportNo=${encodeURIComponent(reportNo)}`),
};
