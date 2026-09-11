/**
 * 报告详情数据 hook —— 对接后端"模板化报告实例"接口
 *
 * 数据来源：GET /api/report/instance/{reportNo}
 *   · reportNo  报告编号（路由参数）
 *   · 返回       报告头内容块 + 目录树（含内容块）+ AI 风险列表
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
import { useEffect, useState } from 'react';
import { reportApi, type ReportInstanceBlock, type ReportInstanceCatalog, type ReportInstanceDetail } from '../api/report';
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

export function useReportInstanceApi(reportNo: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportMeta, setReportMeta] = useState<ReportMeta>(EMPTY_META);
  const [sections, setSections] = useState<SectionWithSource[]>([]);
  const [aiRiskList, setAIRiskList] = useState<AIRiskItem[]>([]);
  const [sourceTemplates] = useState<SourceTemplateMap>({});
  const [aiFullAnalysisHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!reportNo) {
      setError('缺少报告编号');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    reportApi.instanceDetail(reportNo)
      .then(res => {
        if (cancelled) return;
        const detail = (res.data ?? {}) as ReportInstanceDetail;

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
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || '报告加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reportNo]);

  return {
    loading,
    error,
    reportMeta,
    sections,
    aiRiskList,
    sourceTemplates,
    aiFullAnalysisHtml,
    setAIRiskList,
  };
}
