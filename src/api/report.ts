/**
 * 报告 API — 报告生成、查询、删除
 * <p>含两套：既有 report 表接口；模板化报告实例接口（/report/instance/**，对应 app_report_info + 实例表）。</p>
 */
import { get, post, del } from './request';
import type { Report, PageResult } from '../types';

/* =============================================================================
 * 模板化报告实例（模板驱动生成，后端 app_report_* 表）
 * ========================================================================== */

/** 报告记录（app_report_info） */
export interface ReportInstanceSummary {
  id: number;
  /** 报告编号（详情接口入参） */
  reportNo: string;
  customerId?: string;
  customerName?: string;
  reportTitle?: string;
  checkTaskNo?: string;
  reportDate?: string;
  /** 111-待开始 000-进行中 888-已完成 999-失败 */
  reportStatus?: string;
  generatorName?: string;
  generateTime?: string;
  /** 失败原因（999 时记录技术类/业务类异常详情） */
  failReason?: string;
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
  reportDate?: string;
  reportStatus?: string;
  generateTime?: string;
  headBlocks?: ReportInstanceBlock[];
  catalogs?: ReportInstanceCatalog[];
  risks?: ReportInstanceRisk[];
  riskPending?: number;
  riskAdopted?: number;
  riskInvalid?: number;
}

export const reportApi = {
  /** 一键生成报告：采集数据 → Know-Kit分析 → 生成HTML */
  create: (customerId: number) =>
    post<Report>(`/report/create?customerId=${customerId}`),

  /** 基于已有分析任务生成报告（单独重生成场景） */
  generate: (customerId: number, knowKitTaskId: number) =>
    post<Report>(`/report/generate?customerId=${customerId}&knowKitTaskId=${knowKitTaskId}`),

  /** 分页查询报告列表，可选按客户筛选 */
  page: (page: number, size: number, customerId?: number) =>
    get<PageResult<Report>>('/report/page', { page, size, customerId }),

  /** 按 ID 查报告元数据 */
  getById: (id: number) => get<Report>(`/report/${id}`),

  /** 按 ID 查报告 HTML 正文 */
  getHtml: (id: number) => get<string>(`/report/${id}/html`),

  /** 删除报告 */
  delete: (id: number) => del(`/report/${id}`),

  /** 获取报告结构化数据（供前端渲染三栏式报告页） */
  getData: (customerId: number) => get<any>(`/report/data/${customerId}`),

  /* ---------------- 模板化报告实例 ---------------- */

  /** 报告记录分页查询（模板化报告列表） */
  instancePage: (page: number, size: number, customerId?: string) =>
    get<PageResult<ReportInstanceSummary>>('/report/instance/page', { page, size, customerId }),

  /** 报告详情（报告头 + 目录树含内容块 + AI 风险列表） */
  instanceDetail: (reportNo: string) =>
    get<ReportInstanceDetail>(`/report/instance/${encodeURIComponent(reportNo)}`),

  /** 按模板加工生成报告实例（含状态流转） */
  instanceGenerate: (reportNo: string) =>
    post<any>(`/report/instance/generate?reportNo=${encodeURIComponent(reportNo)}`),

  /** 纯加工报告实例（不改状态） */
  instanceProcess: (reportNo: string) =>
    post<any>(`/report/instance/process?reportNo=${encodeURIComponent(reportNo)}`),
};
