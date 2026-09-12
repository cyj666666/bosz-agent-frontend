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

  /** 报告记录分页查询（模板化报告列表） */
  instancePage: (page: number, size: number, customerId?: string) =>
    expectOk(get<PageResult<ReportInstanceSummary>>('/report/instance/page', { page, size, customerId })),

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

  /** 修改规则类正文内容（后端同事务同步风险列表文案，并把状态置为已采纳） */
  instanceBlockContent: (reportNo: string, blockCode: string, content: string) =>
    expectOk(post<void>('/report/instance/block/content', { reportNo, blockCode, content })),
};
