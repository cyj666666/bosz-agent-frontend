/**
 * 报告详情数据 hook —— 对接后端"模板化报告实例"接口
 *
 * 入参为「日检流水号 checkTaskNo」：
 *   · 先调 GET /api/report/instance/versions?checkTaskNo=… 拿该流水号下所有版本
 *     （含进行中 000 与已完成 888）
 *   · 默认选中「最新已完成版本」，再调 GET /api/report/instance/{reportNo} 拿详情
 *   · 切换版本时用选中版本的 reportNo 重新加载详情
 *   · 存在进行中版本时轮询版本列表，检测到生成完成后回调（供页面弹框 + 刷新）
 *
 * 本 hook 负责把后端的"目录 + 内容块"结构，适配成报告详情页需要的"章节数组"结构：
 *   · 每个目录 → 一个章节（id=catalogCode，title=目录名）
 *   · 目录下的内容块按 sortNo 顺序渲染成 HTML：
 *       TITLE(titleLevel=3) → <h4>；TITLE(1/2) → 章节标题，正文不再重复渲染
 *       TEXT / TABLE        → 内容原样注入
 *       SOURCE_LINK         → 渲染成外链按钮（新开浏览器标签页）
 *     内容为空的块按 emptyStrategy 处理：HIDE 不渲染，PLACEHOLDER 显示"暂无数据"
 *   · 每个块包一层 <div id=anchorCode>，供块间锚点跳转（滚动定位）定位
 *   · RULE 类内容块的内容即风险正文，与 AI 风险列表的 riskDesc 是同一份文案，
 *     故用该文案全量文本作为 keywords，正文段落据此自动挂上 ai-risk-paragraph
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportApi, type ReportAiAnalysisItem, type ReportInstanceBlock, type ReportInstanceCatalog, type ReportInstanceDetail, type ReportVersionItem, type ReportWarningAdviceVO } from '../api/report';
import type { AIRiskItem, AIRiskStatus, ReportMeta, SectionItem, SourceTemplateMap } from './useReportApi';

/** 章节（带"是否有溯源按钮"标记，供目录过滤与标识使用） */
export interface SectionWithSource extends SectionItem {
  hasSourceLink?: boolean;
}

const EMPTY_META: ReportMeta = { companyName: '', subtitle: '', sampleText: '' };

/** 去标签取纯文本 */
function stripHtml(html: string | undefined | null): string {
  return String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** 属性值转义 */
function escapeAttr(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 常用实体解码（keywords 与 DOM 文本比对前用） */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, '→')
    .replace(/&amp;/g, '&');
}

/** 内容块 / 目录统一排序：sortNo 升序，其次按编号 */
function bySortNo(a: { sortNo?: number; blockCode?: string; catalogCode?: string | null },
                    b: { sortNo?: number; blockCode?: string; catalogCode?: string | null }): number {
  const sa = a.sortNo ?? 0;
  const sb = b.sortNo ?? 0;
  if (sa !== sb) return sa - sb;
  return String(a.blockCode ?? a.catalogCode ?? '').localeCompare(String(b.blockCode ?? b.catalogCode ?? ''));
}

/** 渲染单个内容块为 HTML */
function renderBlock(block: ReportInstanceBlock): string {
  const anchor = block.anchorCode || block.blockCode;
  const attrs = [`id="${escapeAttr(anchor)}"`, 'class="rpt-block"'];
  if (block.jumpAnchorCode) attrs.push(`data-jump-anchor="${escapeAttr(block.jumpAnchorCode)}"`);
  const wrapper = attrs.join(' ');
  const content = (block.content ?? '').trim();

  if (!content) {
    // 空内容：按空数据策略处理（PLACEHOLDER 显示占位，HIDE 整块不渲染）
    return (block.emptyStrategy ?? 'PLACEHOLDER').toUpperCase() === 'HIDE'
      ? ''
      : `<div ${wrapper}><p class="empty-state">暂无数据</p></div>`;
  }
  if (block.fillType === 'TITLE') {
    // 章节标题已作为章节标题渲染（titleLevel=1/2），此处只渲染小节标题
    return block.titleLevel === 3 ? `<h4>${content}</h4>` : '';
  }
  if (block.fillType === 'SOURCE_LINK') {
    // 溯源按钮：块本身即按钮，content 存外部跳转链接，点击新开浏览器标签页
    return `<div ${wrapper}><a class="source-link-btn" href="${escapeAttr(content)}"`
      + ` target="_blank" rel="noopener noreferrer">查看溯源信息</a></div>`;
  }
  return `<div ${wrapper}>${content}</div>`;
}

/** 目录 → 章节 */
function renderSection(node: ReportInstanceCatalog): SectionWithSource {
  const blocks = [...(node.blocks ?? [])].sort(bySortNo);
  return {
    id: node.catalogCode,
    title: node.catalogName,
    contentHtml: blocks.map(renderBlock).join(''),
    hasSourceLink: blocks.some(b => b.fillType === 'SOURCE_LINK' && (b.content ?? '').trim() !== ''),
  };
}

/** 目录树拍平（深度优先，保持 sortNo 顺序） */
function flattenCatalogs(nodes: ReportInstanceCatalog[], out: ReportInstanceCatalog[] = []): ReportInstanceCatalog[] {
  [...(nodes ?? [])].sort(bySortNo).forEach(node => {
    out.push(node);
    if (node.children?.length) flattenCatalogs(node.children, out);
  });
  return out;
}

/** 后端处置状态 → 前端状态 */
function toRiskStatus(status?: string): AIRiskStatus {
  const value = (status ?? '').toUpperCase();
  if (value === 'ADOPTED') return 'adopted';
  if (value === 'INVALID') return 'invalid';
  return 'pending';
}

/**
 * 取定位关键词
 * <p>风险正文可能由多个段落组成，取其中最长的段落文本作为关键词，
 * 保证能在正文段落中命中（比整块拼接文本更稳）。</p>
 */
function riskKeyword(riskDesc?: string): string {
  const html = String(riskDesc ?? '');
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (paragraphs?.length) {
    const longest = paragraphs
      .map(p => decodeEntities(stripHtml(p)))
      .sort((a, b) => b.length - a.length)[0];
    if (longest) return longest;
  }
  return decodeEntities(stripHtml(html));
}

/** 把详情数据映射成页面所需的 reportMeta / sections / aiRiskList */
function applyDetail(
  detail: ReportInstanceDetail,
  setReportMeta: (m: ReportMeta) => void,
  setSections: (s: SectionWithSource[]) => void,
  setAIRiskList: (r: AIRiskItem[]) => void,
) {
  // ---- 报告头：主标题块 + 其余文本块（副标题 / 说明） ----
  const headBlocks = [...(detail.headBlocks ?? [])].sort(bySortNo);
  const titleBlock = headBlocks.find(b => b.fillType === 'TITLE' && b.titleLevel === 1);
  const headTexts = headBlocks
    .filter(b => b !== titleBlock)
    .map(b => stripHtml(b.content))
    .filter(Boolean);
  setReportMeta({
    companyName: stripHtml(titleBlock?.content) || detail.customerName || '',
    subtitle: headTexts[0] ?? '',
    sampleText: headTexts[1] ?? '',
  });

  // ---- 目录树 → 章节数组 ----
  const catalogs = flattenCatalogs(detail.catalogs ?? []);
  setSections(catalogs.map(renderSection));
  const catalogNameOf = new Map(catalogs.map(c => [c.catalogCode, c.catalogName]));

  // ---- AI 风险列表 ----
  setAIRiskList((detail.risks ?? []).map((risk, index) => {
    const keyword = riskKeyword(risk.riskDesc);
    return {
      id: index + 1,
      // 硬关联键：规则类内容块编号（正文块的 DOM id = anchorCode = blockCode）
      blockCode: risk.blockCode || undefined,
      // 修改记录条数（同日检流水号下跨版本累计）；>0 时该行显示「修改记录(N)」按钮
      editCount: risk.editCount ?? 0,
      ruleName: risk.ruleName ?? '',
      riskDesc: stripHtml(risk.riskDesc),
      // 后端已移除 AI 解读 / 行动建议字段，列表不再展示这两列
      aiRead: '',
      suggestion: '',
      chapter: catalogNameOf.get(risk.catalogCode ?? '') ?? '',
      sectionId: risk.catalogCode ?? '',
      keywords: keyword ? [keyword] : [],
      status: toRiskStatus(risk.status),
    };
  }));
}

export function useReportInstanceApi(checkTaskNo: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportMeta, setReportMeta] = useState<ReportMeta>(EMPTY_META);
  const [sections, setSections] = useState<SectionWithSource[]>([]);
  const [aiRiskList, setAIRiskList] = useState<AIRiskItem[]>([]);
  const [sourceTemplates] = useState<SourceTemplateMap>({});
  /** AI 全文分析：最近一次分析记录（null = 该报告从未分析过）+ 首次加载态 */
  const [aiAnalysis, setAiAnalysis] = useState<ReportAiAnalysisItem | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);

  /** AI 预警建议（批次 + 明细），跟着当前版本走 */
  const [warningAdvice, setWarningAdvice] = useState<ReportWarningAdviceVO | null>(null);
  const [warningAdviceLoading, setWarningAdviceLoading] = useState(false);

  // 版本相关：版本列表 + 当前查看的报告编号 + 更新报告状态
  const [versions, setVersions] = useState<ReportVersionItem[]>([]);
  const [currentReportNo, setCurrentReportNo] = useState<string>('');
  const [renewing, setRenewing] = useState(false);
  const [completedVersion, setCompletedVersion] = useState<string | null>(null);
  const [failedVersion, setFailedVersion] = useState<{ reportNo: string; failReason: string } | null>(null);

  // 进行中的版本（status=000）：存在时表示"新报告生成中"
  const runningVersion = useMemo(
    () => versions.find(v => v.status === '000') ?? null,
    [versions],
  );

  // ① 先查版本列表（checkTaskNo 变化时），默认选中「最新已完成版本」
  useEffect(() => {
    let cancelled = false;
    if (!checkTaskNo) {
      setError('缺少日检流水号（checkTaskNo）');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setVersions([]);
    setCurrentReportNo('');
    setCompletedVersion(null);
    setFailedVersion(null);
    reportApi.instanceVersions(checkTaskNo)
      .then(res => {
        if (cancelled) return;
        const list = res.data ?? [];
        setVersions(list);
        // 默认展示「最新已完成版本」（进行中的版本无详情，不可选中）
        const latestDone = list.find(v => v.status === '888');
        if (!latestDone) {
          setError('该日检流水号下暂无已完成版本的报告');
          setLoading(false);
          return;
        }
        setCurrentReportNo(latestDone.reportNo);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message || '版本列表加载失败');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [checkTaskNo]);

  // ② 再查详情（currentReportNo 变化时）
  useEffect(() => {
    let cancelled = false;
    if (!currentReportNo) return;
    setLoading(true);
    setError(null);
    reportApi.instanceDetail(currentReportNo)
      .then(res => {
        if (cancelled) return;
        const detail = (res.data ?? {}) as ReportInstanceDetail;
        applyDetail(detail, setReportMeta, setSections, setAIRiskList);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || '报告加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentReportNo]);

  // ③ AI 全文分析：跟着当前版本走，取该份报告「最近一次」分析（保留多次，列表最新在上）
  useEffect(() => {
    let cancelled = false;
    if (!currentReportNo) {
      setAiAnalysis(null);
      return;
    }
    setAiAnalysisLoading(true);
    reportApi.instanceAiAnalysisList(currentReportNo)
      .then(res => {
        if (!cancelled) setAiAnalysis((res.data ?? [])[0] ?? null);
      })
      .catch(() => { /* 静默：分析面板不可用不应影响报告阅读 */ })
      .finally(() => {
        if (!cancelled) setAiAnalysisLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentReportNo]);

  /** 重新拉取当前报告的分析状态（手动刷新 / 轮询用） */
  const reloadAiAnalysis = useCallback(async () => {
    if (!currentReportNo) return;
    try {
      const res = await reportApi.instanceAiAnalysisList(currentReportNo);
      setAiAnalysis((res.data ?? [])[0] ?? null);
    } catch {
      /* 轮询失败静默，下次再试 */
    }
  }, [currentReportNo]);

  // ④ 分析进行中时按 10s 轮询，感知「完成 / 失败」（用户关掉面板也照跑，重启后凭状态判断）
  useEffect(() => {
    if (aiAnalysis?.status !== 'RUNNING' || !currentReportNo) return;
    const timer = window.setInterval(() => { reloadAiAnalysis(); }, 10000);
    return () => window.clearInterval(timer);
  }, [aiAnalysis?.status, currentReportNo, reloadAiAnalysis]);

  // ⑤ AI 预警建议：跟着当前版本走，取该份报告「最近一批」（保留多次，列表按批次倒序）
  useEffect(() => {
    let cancelled = false;
    if (!currentReportNo) {
      setWarningAdvice(null);
      return;
    }
    setWarningAdviceLoading(true);
    reportApi.instanceWarningAdvice(currentReportNo)
      .then(res => {
        if (!cancelled) setWarningAdvice(res.data ?? null);
      })
      .catch(() => { /* 静默：预警建议面板不可用不应影响报告阅读 */ })
      .finally(() => {
        if (!cancelled) setWarningAdviceLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentReportNo]);

  /** 重新拉取当前报告的预警建议（手动刷新 / 轮询用） */
  const reloadWarningAdvice = useCallback(async () => {
    if (!currentReportNo) return;
    try {
      const res = await reportApi.instanceWarningAdvice(currentReportNo);
      setWarningAdvice(res.data ?? null);
    } catch {
      /* 轮询失败静默，下次再试 */
    }
  }, [currentReportNo]);

  // ⑥ 预警建议生成中时按 10s 轮询
  useEffect(() => {
    if (warningAdvice?.status !== 'RUNNING' || !currentReportNo) return;
    const timer = window.setInterval(() => { reloadWarningAdvice(); }, 10000);
    return () => window.clearInterval(timer);
  }, [warningAdvice?.status, currentReportNo, reloadWarningAdvice]);

  // ⑤ 有进行中版本时轮询版本列表（感知生成完成）
  useEffect(() => {
    if (!checkTaskNo || !runningVersion) return;
    const timer = window.setInterval(() => {
      reportApi.instanceVersions(checkTaskNo)
        .then(res => setVersions(res.data ?? []))
        .catch(() => { /* 轮询失败静默 */ });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [checkTaskNo, runningVersion]);

  // ④ 生成结果检测：原进行中的版本变为已完成（888）或失败（999）→ 置标志（供页面弹框）
  const prevRunningRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevRunningRef.current;
    const curr = runningVersion?.reportNo ?? null;
    if (prev && !curr) {
      const result = versions.find(v => v.reportNo === prev);
      if (result?.status === '888') {
        setCompletedVersion(prev);
      } else if (result?.status === '999') {
        setFailedVersion({ reportNo: prev, failReason: result.failReason ?? '' });
      }
    }
    prevRunningRef.current = curr;
  }, [versions, runningVersion]);

  /** 切换版本：重新按 reportNo 加载详情 */
  const selectVersion = useCallback((reportNo: string) => {
    setCurrentReportNo(reportNo);
  }, []);

  /** 更新报告：新建版本（后端异步生成），成功后刷新版本列表 */
  const renew = useCallback(async () => {
    if (!checkTaskNo) return;
    setRenewing(true);
    try {
      const created = (await reportApi.instanceRenew(checkTaskNo)).data;
      // 先用接口返回的新版本（status=000 生成中）占位，保证"生成中"选项立刻出现在下拉首位，
      // 不依赖"再拉一次列表"的时序（生成耗时可能只有几百毫秒）
      if (created?.reportNo) {
        setVersions(prev => [created, ...prev.filter(v => v.reportNo !== created.reportNo)]);
      }
      // 再以服务端为准刷新一次（若生成已结束，此处会直接变为已完成）
      const list = (await reportApi.instanceVersions(checkTaskNo)).data ?? [];
      setVersions(list);
    } finally {
      setRenewing(false);
    }
  }, [checkTaskNo]);

  /** 刷新：重新拉版本列表并切到最新已完成版本（生成完成弹框确认后调用） */
  const reload = useCallback(() => {
    if (!checkTaskNo) return;
    setCompletedVersion(null);
    setFailedVersion(null);
    reportApi.instanceVersions(checkTaskNo)
      .then(res => {
        const list = res.data ?? [];
        setVersions(list);
        const latestDone = list.find(v => v.status === '888');
        if (latestDone) setCurrentReportNo(latestDone.reportNo);
      })
      .catch(() => { /* 忽略 */ });
  }, [checkTaskNo]);

  /** 关闭"生成失败"提示 */
  const clearFailed = useCallback(() => setFailedVersion(null), []);

  /**
   * 触发一次全文分析（后台异步跑）。
   * <p>后端会先落一条 RUNNING 记录再交给线程池，所以这里直接用返回值更新 UI，
   * 不用再查一次（避免"查得比写入早"的时序问题）。</p>
   * <p>同一报告已有进行中的分析时，后端返回业务错误「全文分析进行中，请稍后再试」，
   * 由 expectOk 抛出，调用方捕获后提示即可。</p>
   */
  const startAiAnalysis = useCallback(async () => {
    if (!currentReportNo) throw new Error('缺少报告编号，无法发起分析');
    const res = await reportApi.instanceAiAnalysisGenerate(currentReportNo);
    setAiAnalysis(res.data ?? null);
  }, [currentReportNo]);

  /**
   * 触发一次预警建议生成（后台异步跑）。
   * <p>依赖该报告已有成功的全文分析，否则后端返回业务错误，由 expectOk 抛出。</p>
   * <p>同一报告已有进行中的批次时，后端返回「预警建议生成中，请稍后再试」。</p>
   */
  const startWarningAdvice = useCallback(async () => {
    if (!currentReportNo) throw new Error('缺少报告编号，无法生成预警建议');
    const res = await reportApi.instanceWarningAdviceGenerate(currentReportNo);
    setWarningAdvice(res.data ?? null);
  }, [currentReportNo]);

  /**
   * 一键串行：全文分析 → 预警建议（详情页标题右侧「智能体分析」按钮的唯一入口）。
   *
   * <p>后端会先预插一条 {@code PENDING} 的预警建议批次、再启动全文分析，
   * 所以这里立刻刷一次预警建议，让面板马上显示「等待全文分析完成」，
   * 而不是等全文分析跑完才看见第二段。</p>
   *
   * <p>链级防重：该报告已有进行中的分析时，后端返回业务错误
   * 「分析进行中，请稍后再试」，由 expectOk 抛出、调用方提示。</p>
   */
  const startAiChain = useCallback(async () => {
    if (!currentReportNo) throw new Error('缺少报告编号，无法发起分析');
    const res = await reportApi.instanceAiChainGenerate(currentReportNo);
    setAiAnalysis(res.data ?? null);
    try {
      await reloadWarningAdvice();
    } catch {
      /* 拉取失败不影响「链已启动」这个事实，下一次轮询会补上 */
    }
  }, [currentReportNo, reloadWarningAdvice]);

  const currentVersion = versions.find(v => v.reportNo === currentReportNo)?.version;

  return {
    loading,
    error,
    reportMeta,
    sections,
    aiRiskList,
    sourceTemplates,
    aiAnalysis,
    aiAnalysisLoading,
    startAiAnalysis,
    reloadAiAnalysis,
    startAiChain,
    warningAdvice,
    warningAdviceLoading,
    startWarningAdvice,
    reloadWarningAdvice,
    setWarningAdvice,
    setAIRiskList,
    versions,
    currentReportNo,
    currentVersion,
    selectVersion,
    runningVersion,
    renewing,
    renew,
    reload,
    completedVersion,
    failedVersion,
    clearFailed,
  };
}
