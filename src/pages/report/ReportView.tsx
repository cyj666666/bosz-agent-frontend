/**
 * 报告详情页 —— 从 V5.2 HTML Demo 完整移植到 React + Vite 架构。
 *
 * 设计要点：
 * - CSS Grid 三栏布局（260 / 1fr / 390），左右栏 sticky 悬浮
 * - 章节正文用 dangerouslySetInnerHTML 注入 HTML，再由 useEffect 扫描段落并按 keywords 挂 ai-risk-paragraph class
 * - AI 风险表格"采纳 / 无效"按钮联动正文段落 class + toast + 滚动 + 高亮
 * - 点击 AI 风险段落进入编辑模式（textarea + 保存 / 取消）
 * - 侧栏三状态机（normal / expanded / collapsed） + 浮动 launcher 按钮
 * - 3 种面板：AI 风险识别 / 章节溯源 / AI 分析全文
 * - 滚动联动目录 / 回到顶部 / Word 下载 / 关键字过滤
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Select } from 'antd';
import { useReportInstanceApi } from '../../hooks/useReportInstanceApi';
import {
  type AIRiskItem,
  type AIRiskStatus,
  type SectionItem,
  type SourceGroup,
} from '../../hooks/useReportApi';

type SidePanelMode = 'normal' | 'expanded' | 'collapsed';
type SidePanelContent =
  | { type: 'aiRisk' }
  | { type: 'aiFull' }
  | { type: 'source'; moduleId: string; moduleTitle: string };

/* =============================================================================
 * 全部 CSS —— 从 V5.2 移植
 * ========================================================================== */
const REPORT_CSS = `
:root {
  --panel: rgba(255,255,255,.94);
  --line: rgba(31,90,181,.14);
  --text: #10233f;
  --muted: #5d7396;
  --accent: #1664ff;
  --accent-soft: #6d5dfc;
  --shadow: 0 20px 56px rgba(35,88,176,.12);
  --red: #b1342c;
  --bg-page: radial-gradient(circle at top left, rgba(84,160,255,.18), transparent 26%),
             radial-gradient(circle at 85% 18%, rgba(0,201,255,.12), transparent 18%),
             linear-gradient(180deg, #fdfefe 0%, #f3f8ff 58%, #eef5ff 100%);
}
.report-root * { box-sizing: border-box; }
.report-root {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--text);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}
/* report-shell 是唯一滚动容器：左侧目录 / 右侧溯源面板 用 sticky 浮在上面 */
.report-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);          /* 默认无右侧栏，铺满正文 */
  gap: 16px;
  align-items: start;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 24px;
}
.report-shell.with-side { grid-template-columns: 260px minmax(0, 1fr) 390px; }
.panel { border-radius: 24px; border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
.report-nav, .side-panel {
  position: sticky;
  top: 16px;
  /* 高度 = 容器高度(100vh-96) - report-shell 上下 padding(16+24) = 100vh-136 */
  height: calc(100vh - 136px);
  overflow: auto;
  padding: 18px;
}
.report-main { min-width: 0; }
.report-topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; padding: 18px 22px; flex-wrap: wrap; }
.report-company-title { margin: 0; font-size: clamp(1.45rem, 2.6vw, 2.05rem); line-height: 1.12; color: var(--text); font-weight: 800; }
.report-page-subtitle { margin: 8px 0 0; color: var(--muted); font-size: 1rem; letter-spacing: .18em; }
.sample-badge { margin: 10px 0 0; color: var(--muted); font-size: 13px; font-weight: 700; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.primary-btn, .ghost-btn, .icon-btn { border: 0; border-radius: 14px; padding: 10px 14px; cursor: pointer; transition: transform .18s ease; font: inherit; color: var(--text); }
.primary-btn { color: #fff; background: var(--accent); box-shadow: 0 10px 24px rgba(22,100,255,.24); }
.ghost-btn, .icon-btn { background: #fff; border: 1px solid var(--line); }
.primary-btn:hover, .ghost-btn:hover, .icon-btn:hover { transform: translateY(-1px); }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.panel-head h2 { margin: 0; font-size: 1.15rem; }
.sticky-head { position: sticky; top: 0; z-index: 3; background: inherit; padding-bottom: 12px; }
.filter-box { margin-top: 8px; color: var(--muted); font-size: 14px; display: flex; align-items: center; gap: 6px; }
.chapter-nav { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.nav-item { display: block; padding: 10px 12px; border-radius: 14px; text-decoration: none; color: inherit; transition: background .18s ease; }
.nav-item:hover, .nav-item.active { background: rgba(227,239,255,.72); color: var(--accent); }
.nav-item strong { display: block; line-height: 1.45; font-weight: 700; }
.report-sections { display: grid; gap: 16px; }
.section-card { position: relative; padding: 22px; border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(247,251,255,.94)); border: 1px solid var(--line); box-shadow: var(--shadow); overflow: hidden; scroll-margin-top: 16px; }
.section-card h3 { margin: 0 0 10px; font-size: 1.32rem; }
.section-card h4 { margin: 16px 0 8px; font-size: 1.05rem; }
.section-body { line-height: 1.82; }
.section-body p { margin: 10px 0; }
.section-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px dashed rgba(67,97,238,.20); }
.empty-state, .muted { color: var(--muted); }
.rpt-block { scroll-margin-top: 16px; }
.rpt-block.anchor-flash { animation: anchorFlash 1.5s ease; }
@keyframes anchorFlash { 0% { background: rgba(255,214,102,.55); } 100% { background: transparent; } }
.source-link-btn { display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 4px; padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(67,97,238,.35); background: rgba(67,97,238,.08); color: var(--accent); font-weight: 600; text-decoration: none; cursor: pointer; }
.source-link-btn:hover { background: rgba(67,97,238,.16); }
.source-link-btn::after { content: "↗"; font-size: 12px; }
.report-error { max-width: 560px; padding: 28px 32px; border-radius: 18px; border: 1px solid var(--line); background: #fff; box-shadow: var(--shadow); text-align: center; }
.report-error p { margin: 0; line-height: 1.7; }
.table-title { margin: 14px 0 8px; display: flex; align-items: center; gap: 8px; font-weight: 800; color: #12315d; }
.table-title::before { content: ""; width: 4px; height: 16px; border-radius: 999px; background: var(--accent); display: inline-block; }
.table-subtitle { margin: -2px 0 8px; color: var(--muted); font-size: 13px; }
.table-wrap { overflow: auto; margin: 8px 0 14px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255,255,255,.76); }
table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { text-align: left; vertical-align: top; padding: 10px; border-bottom: 1px solid var(--line); word-break: break-word; overflow-wrap: anywhere; }
th { font-size: 13px; color: var(--muted); background: rgba(237,244,255,.92); font-weight: 700; }
tr:last-child td { border-bottom: 0; }
.risk-list { margin: 10px 0; padding-left: 0; line-height: 1.9; list-style: none; }
.risk-list li { margin: 6px 0; padding: 0; border: 0; }
.risk-list li::before { content: none; }
.risk-link { color: var(--text); text-decoration: none; cursor: pointer; }
.risk-link:hover { color: var(--accent); text-decoration: underline; }
.overview-box { padding: 14px 16px; border: 1px solid rgba(22,100,255,.14); border-radius: 18px; background: linear-gradient(180deg, rgba(245,249,255,.96), rgba(255,255,255,.96)); margin-bottom: 12px; }
.side-panel { transition: transform .28s ease, opacity .28s ease, box-shadow .28s ease; border: 1px solid rgba(106,90,249,.24); background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(244,248,255,.94)); }
.side-panel.collapsed { transform: translateX(calc(100% + 28px)); opacity: 0; pointer-events: none; }
.side-panel.expanded { position: fixed; inset: 16px 16px 16px auto; right: 16px; width: min(960px, calc(100vw - 200px)); max-height: calc(100vh - 32px); z-index: 32; box-shadow: 0 32px 80px rgba(13,31,62,.24); }
.source-block { padding: 14px; border: 1px solid var(--line); border-radius: 18px; background: rgba(248,251,255,.95); margin-bottom: 12px; }
.source-block h4 { margin: 0 0 8px; }
.source-note { margin: 0 0 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
.side-panel-launcher, .back-to-top { position: fixed; right: 18px; width: 48px; height: 48px; border: 1px solid rgba(22,100,255,.26); border-radius: 50%; background: linear-gradient(135deg, #edf4ff, #e9e3ff); color: var(--accent); font-size: 1.2rem; font-weight: 800; box-shadow: 0 16px 40px rgba(22,100,255,.16); cursor: pointer; z-index: 31; display: flex; align-items: center; justify-content: center; }
.side-panel-launcher { top: 50%; transform: translateY(-50%); }
.back-to-top { bottom: 22px; font-size: 1.35rem; }
.panel-backdrop { position: fixed; inset: 0; background: rgba(6,12,25,.28); backdrop-filter: blur(3px); z-index: 30; }
.hidden { display: none !important; }
.ai-risk-btn { color: #fff; background: linear-gradient(135deg, #6d5dfc, #1664ff); border: 0; box-shadow: 0 10px 24px rgba(79,70,229,.22); }
.ai-risk-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; padding: 12px; border: 1px solid rgba(22,100,255,.12); border-radius: 16px; background: rgba(248,251,255,.9); }
.ai-risk-summary { color: var(--muted); font-size: 13px; line-height: 1.7; }
.ai-risk-table table { min-width: 1180px; }
.ai-risk-op { position: sticky; left: 0; z-index: 2; background: inherit; min-width: 116px; }
.ai-risk-table th.ai-risk-op { z-index: 4; background: rgba(237,244,255,.96); }
.ai-risk-row { cursor: pointer; transition: background .18s ease; }
.ai-risk-row:hover { background: rgba(227,239,255,.45); }
.ai-risk-row.adopted { background: rgba(236,253,245,.86); }
.ai-risk-row.adopted .ai-risk-op { border-left: 5px solid #16a34a; }
.ai-risk-row.invalid { background: rgba(243,244,246,.95); color: #7d8798; }
.ai-risk-row.invalid .ai-risk-op { border-left: 5px solid #9ca3af; }
.ai-risk-row.invalid .risk-desc, .ai-risk-row.invalid .risk-ai-read { text-decoration: line-through; }
.ai-risk-row.active { outline: 2px solid rgba(22,100,255,.35); outline-offset: -2px; }
.ai-risk-mini-btn { border: 0; border-radius: 10px; padding: 6px 9px; cursor: pointer; color: #fff; font-size: 12px; font-weight: 800; margin: 2px; }
.ai-risk-adopt-btn { background: #16a34a; }
.ai-risk-invalid-btn { background: #8a94a6; }
.ai-risk-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 800; white-space: nowrap; }
.ai-risk-badge.pending { color: #92400e; background: #fef3c7; }
.ai-risk-badge.adopted { color: #065f46; background: #d1fae5; }
.ai-risk-badge.invalid { color: #4b5563; background: #e5e7eb; }
.ai-risk-paragraph { position: relative; border-radius: 14px; padding: 10px 12px; border: 1px solid rgba(22,100,255,.14); background: rgba(246,250,255,.72); cursor: pointer; transition: background .18s ease, border .18s ease, box-shadow .18s ease; }
.ai-risk-paragraph:hover { border-color: rgba(22,100,255,.35); box-shadow: 0 8px 22px rgba(22,100,255,.08); }
.ai-risk-paragraph::before { content: "AI风险"; display: inline-block; margin-right: 8px; padding: 1px 7px; border-radius: 999px; color: #fff; background: linear-gradient(135deg, #6d5dfc, #1664ff); font-size: 12px; font-weight: 900; vertical-align: 1px; }
.ai-risk-paragraph.adopted { background: rgba(236,253,245,.65); border-color: rgba(22,163,74,.26); }
.ai-risk-paragraph.invalid { display: none; }
.ai-risk-paragraph.editing { cursor: auto; background: #fff; border-color: rgba(22,100,255,.42); }
.ai-risk-edit-textarea { width: 100%; min-height: 120px; border: 1px solid rgba(22,100,255,.22); border-radius: 14px; padding: 10px 12px; outline: none; line-height: 1.75; color: var(--text); background: #fff; resize: vertical; font: inherit; }
.ai-risk-edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.ai-risk-edit-actions button { border: 0; border-radius: 10px; padding: 7px 12px; cursor: pointer; font-weight: 800; font: inherit; }
.ai-risk-save { color: #fff; background: #16a34a; }
.ai-risk-cancel { color: var(--text); background: #fff; border: 1px solid var(--line) !important; }
.ai-risk-flash { animation: aiRiskFlash 1.4s ease; }
@keyframes aiRiskFlash {
  0%, 100% { box-shadow: 0 0 0 rgba(22,100,255,0); }
  30% { box-shadow: 0 0 0 6px rgba(22,100,255,.18); }
  60% { box-shadow: 0 0 0 9px rgba(22,100,255,.08); }
}
.ai-risk-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 10px 16px; border-radius: 999px; color: #fff; background: rgba(17,24,39,.92); box-shadow: 0 16px 40px rgba(0,0,0,.18); z-index: 60; font-size: 14px; }
.ai-full-report-wrap { min-height: 100%; padding: 8px; background: radial-gradient(circle at top left, rgba(84,160,255,.14), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%); border-radius: 14px; }
.ai-full-report-card { max-width: 1000px; margin: 0 auto; background: #ffffff; border-radius: 22px; box-shadow: 0 20px 56px rgba(35,88,176,.12); border: 1px solid rgba(31,90,181,.14); padding: 30px 34px; }
.ai-full-report-header { display: flex; justify-content: space-between; align-items: center; gap: 14px; border-bottom: 2px solid #e6edf4; padding-bottom: 14px; margin-bottom: 20px; }
.ai-full-report-header h1 { margin: 0; font-size: 22px; font-weight: 800; color: #0b2b44; letter-spacing: 1px; display: flex; align-items: center; gap: 10px; }
.ai-full-report-header h1 span { background: linear-gradient(135deg, #6d5dfc, #1664ff); color: #fff; font-size: 14px; font-weight: 500; padding: 3px 12px; border-radius: 999px; }
.ai-full-report-badge { background: #eef3f9; color: #1e4b6a; font-size: 13px; padding: 5px 14px; border-radius: 999px; border: 1px solid #cbd8e6; white-space: nowrap; }
.ai-full-title { font-size: 20px; font-weight: 800; color: #143750; border-left: 5px solid #1664ff; padding-left: 16px; margin-bottom: 18px; line-height: 1.4; }
.ai-full-content p { font-size: 15px; line-height: 1.9; color: #1e2e3f; margin: 0 0 16px; text-align: justify; }
.ai-full-section-head { font-size: 17px; font-weight: 800; color: #0b2b44; margin-top: 24px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px dashed #d4e0ea; }
.ai-full-sub-item { padding-left: 28px; margin-bottom: 8px; font-size: 15px; line-height: 1.9; color: #1e2e3f; text-align: justify; }
.ai-full-sub-item strong { color: #0f3b57; }
.ai-full-conclusion-box { background: linear-gradient(180deg, #f4f9ff, #ffffff); border-left: 6px solid #1664ff; padding: 16px 20px; border-radius: 14px; margin-top: 22px; margin-bottom: 8px; box-shadow: 0 10px 26px rgba(22,100,255,.08); }
.ai-full-conclusion-box p { margin-bottom: 6px; font-size: 15px; line-height: 1.9; color: #0b2b44; }
.ai-full-highlight { font-weight: 800; color: #004b7a; }
.ai-full-report-footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e6edf4; font-size: 13px; color: #6b7f93; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.report-loading { display: flex; align-items: center; justify-content: center; min-height: 360px; }
@media (max-width: 1180px) {
  .report-shell, .report-shell.with-side { grid-template-columns: 1fr; }
  .report-nav, .side-panel { position: relative; top: 0; height: auto; }
  .side-panel.collapsed { transform: none; opacity: 1; pointer-events: auto; }
  .side-panel.expanded { position: relative; inset: auto; height: auto; width: auto; }
  .side-panel-launcher { display: none; }
}
@media (max-width: 860px) {
  .report-root { padding: 12px; }
  .report-topbar, .panel-head { flex-direction: column; align-items: stretch; }
  .toolbar { justify-content: flex-start; }
}
@media print {
  body { background: #fff; }
  .report-shell { display: block; padding: 0; }
  .report-nav, .side-panel, .side-panel-launcher, .back-to-top, .toolbar, .section-actions, .panel-backdrop { display: none !important; }
  .report-topbar, .section-card { box-shadow: none; border: 0; border-radius: 0; }
  .table-wrap { overflow: visible; }
  table { min-width: 0; }
}
`;

/* =============================================================================
 * 工具函数
 * ========================================================================== */
function statusBadge(status: 'pending' | 'adopted' | 'invalid'): string {
  if (status === 'adopted') return '<span class="ai-risk-badge adopted">已采纳</span>';
  if (status === 'invalid') return '<span class="ai-risk-badge invalid">无效</span>';
  return '<span class="ai-risk-badge pending">待处理</span>';
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function aiRiskTableHTML(list: AIRiskItem[]): string {
  const adopted = list.filter(i => i.status === 'adopted').length;
  const invalid = list.filter(i => i.status === 'invalid').length;
  const pending = list.filter(i => i.status === 'pending').length;
  return `
    <div class="ai-risk-toolbar">
      <div>
        <strong>AI风险识别</strong>
        <div class="ai-risk-summary">点击"采纳"正文保留；点击"无效"正文对应段落移除且表格行置灰；点击正文风险段可修改。</div>
      </div>
      <div class="ai-risk-summary">总数：${list.length}　已采纳：${adopted}　无效：${invalid}　待处理：${pending}</div>
    </div>
    <div class="table-wrap ai-risk-table">
      <table>
        <thead>
          <tr>
            <th class="ai-risk-op">操作</th>
            <th style="width:58px;text-align:center">序号</th>
            <th style="width:180px">规则名称</th>
            <th>风险描述</th>
            <th style="width:110px">对应章节</th>
            <th style="width:80px">状态</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              item => `
            <tr class="ai-risk-row ${item.status}" data-ai-risk-row="${item.id}">
              <td class="ai-risk-op" data-stop="1">
                <button class="ai-risk-mini-btn ai-risk-adopt-btn" data-ai-risk-action="adopt" data-ai-risk-id="${item.id}" type="button">采纳</button>
                <button class="ai-risk-mini-btn ai-risk-invalid-btn" data-ai-risk-action="invalid" data-ai-risk-id="${item.id}" type="button">无效</button>
              </td>
              <td style="text-align:center;font-weight:800">${item.id}</td>
              <td><strong>${escapeHtml(item.ruleName)}</strong></td>
              <td class="risk-desc">${escapeHtml(item.riskDesc)}</td>
              <td>${escapeHtml(item.chapter)}</td>
              <td>${statusBadge(item.status)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function sourcePanelHtml(groups: SourceGroup[]): string {
  if (!groups.length) return '<p class="empty-state">当前模块暂无溯源数据。</p>';
  return groups.map(item => `<section class="source-block"><h4>${escapeHtml(item.groupTitle)}</h4>${item.html}</section>`).join('');
}

function downloadWord(filename: string, title: string, bodyHtml: string) {
  const content = `<html><head><meta charset="utf-8"><style>
    body{font-family:"Microsoft YaHei",sans-serif;color:#10233f;line-height:1.7}
    h1{font-size:22pt}h2,h3{margin-top:18pt}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin:10pt 0}
    th,td{border:1px solid #cbd5e1;padding:7pt;vertical-align:top;word-break:break-word;font-size:10.5pt}
    th{background:#eff6ff}button,input{display:none!important}.table-title{font-weight:bold;margin-top:14pt}
  </style></head><body><h1>${escapeHtml(title)}</h1>${bodyHtml}</body></html>`;
  const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* =============================================================================
 * 主组件
 * ========================================================================== */
export default function ReportView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  // 路由参数即日检流水号 checkTaskNo（详情按该流水号下最新版本渲染，顶部下拉可切历史版本）
  const checkTaskNo = params.id;

  const {
    loading,
    error,
    reportMeta,
    sections,
    aiRiskList,
    sourceTemplates,
    aiFullAnalysisHtml,
    setAIRiskList,
    versions,
    currentReportNo,
    selectVersion,
  } = useReportInstanceApi(checkTaskNo);

  /* ---- 状态 ---- */
  const [filterDynamicOnly, setFilterDynamicOnly] = useState(false);
  const [activeSectionKey, setActiveSectionKey] = useState<string>(sections[0]?.id ?? '');
  // 默认收起右侧栏（按需求 #1：默认不展示）
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>('collapsed');
  const [sidePanelContent, setSidePanelContent] = useState<SidePanelContent>({ type: 'aiRisk' });
  const [editingAIRiskId, setEditingAIRiskId] = useState<number | null>(null);
  const [activeAIRiskId, setActiveAIRiskId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  /* 滚动容器（report-shell） — 全报告的滚动只发生在这里 */
  const shellRef = useRef<HTMLDivElement | null>(null);

  /* collapsed：完全隐藏，grid 不留空。normal：嵌入网格第三列。
     expanded：作为 fixed 浮层覆盖正文，不需要占第三列空间。 */
  const sidePanelEmbedded = sidePanelMode === 'normal';
  const sidePanelFloating = sidePanelMode === 'expanded';

  /* ---- 渲染 ---- */

  /* 过滤后章节（"只看有溯源按钮"）—— 溯源按钮 = 内容块中配置了 SOURCE_LINK 块 */
  const visibleSections: SectionItem[] = useMemo(() => {
    if (!filterDynamicOnly) return sections;
    return sections.filter(item => item.hasSourceLink);
  }, [sections, filterDynamicOnly]);

  /* ---- 滚动联动目录 + 回到顶部显示 ---- */
  useEffect(() => {
    const container = shellRef.current;
    if (!container) return;
    const onScroll = () => {
      const scrollTop = container.scrollTop;
      // 章节高亮：用 getBoundingClientRect 相对于滚动容器顶部
      const containerRect = container.getBoundingClientRect();
      let activeId = visibleSections[0]?.id ?? '';
      visibleSections.forEach(section => {
        const el = document.getElementById(section.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // 当章节顶部进入容器顶部 200px 以内，认为激活
        if (rect.top - containerRect.top <= 200) activeId = section.id;
      });
      setActiveSectionKey(activeId);
      setShowBackToTop(scrollTop > 400);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, [visibleSections]);

  /* ---- AI 风险段落绑定 ---- */
  useEffect(() => {
    aiRiskList.forEach(item => {
      const section = document.getElementById(item.sectionId);
      if (!section) return;
      const paragraphs = Array.from(section.querySelectorAll('.section-body p'));
      const target = paragraphs.find(p => {
        const text = p.textContent ?? '';
        return item.keywords.some(kw => text.includes(kw));
      });
      if (!target) return;
      if (!item.bodyHtml) {
        item.bodyHtml = target.innerHTML;
        item.bodyText = target.textContent ?? '';
      }
      target.classList.add('ai-risk-paragraph');
      target.setAttribute('data-ai-risk-id', String(item.id));
      target.classList.remove('adopted', 'invalid', 'editing');
      if (item.status === 'adopted') target.classList.add('adopted');
      if (item.status === 'invalid') target.classList.add('invalid');
    });
  }, [aiRiskList, visibleSections]);

  /* ---- Toast ---- */
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 1600);
  }, []);

  /* ---- AI 风险状态切换 ---- */
  const setAIRiskStatus = useCallback(
    (id: number, status: AIRiskStatus) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item) return;
      item.status = status;

      // 段落 class 联动
      const body = document.querySelector(`.ai-risk-paragraph[data-ai-risk-id="${id}"]`);
      if (body) {
        body.classList.remove('adopted', 'invalid', 'editing');
        if (status === 'adopted') body.classList.add('adopted');
        if (status === 'invalid') body.classList.add('invalid');
        // 退出编辑态
        if (editingAIRiskId === id) setEditingAIRiskId(null);
      }

      // 触发 react state 更新（拷贝数组让 useEffect 重新跑）
      setAIRiskList(prev => [...prev]);

      if (status === 'adopted') {
        showToast('已采纳：正文保留，表格行标记为绿色');
        // 滚到正文段落 + 高亮
        const el = document.querySelector(`.ai-risk-paragraph[data-ai-risk-id="${id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ai-risk-flash');
          window.setTimeout(() => el.classList.remove('ai-risk-flash'), 1500);
        }
      } else if (status === 'invalid') {
        showToast('已置为无效：正文对应风险段落已移除，表格行置灰');
      }
    },
    [aiRiskList, editingAIRiskId, setAIRiskList, showToast],
  );

  /* ---- 表格行点击：定位到正文 ---- */
  const locateAIRisk = useCallback(
    (id: number, flash = true) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item) return;
      if (item.status === 'invalid') {
        showToast('该风险已置为无效，正文段落已移除');
        return;
      }
      const body = document.querySelector(`.ai-risk-paragraph[data-ai-risk-id="${id}"]`);
      if (body) {
        body.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (flash) {
          body.classList.add('ai-risk-flash');
          window.setTimeout(() => body.classList.remove('ai-risk-flash'), 1500);
        }
      }
      setActiveAIRiskId(id);
    },
    [aiRiskList, showToast],
  );

  /* ---- 段落点击进入编辑 ---- */
  const editAIRiskParagraph = useCallback(
    (id: number) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item || item.status === 'invalid') return;
      const para = document.querySelector<HTMLElement>(`.ai-risk-paragraph[data-ai-risk-id="${id}"]`);
      if (!para || para.classList.contains('editing')) return;

      const currentText = (para.textContent ?? '').trim();
      para.classList.add('editing');
      para.innerHTML = `
        <textarea class="ai-risk-edit-textarea">${escapeHtml(currentText)}</textarea>
        <div class="ai-risk-edit-actions">
          <button class="ai-risk-cancel" data-ai-risk-edit="cancel" data-ai-risk-id="${id}" type="button">取消</button>
          <button class="ai-risk-save" data-ai-risk-edit="save" data-ai-risk-id="${id}" type="button">保存</button>
        </div>
      `;
      const textarea = para.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
      setEditingAIRiskId(id);
    },
    [aiRiskList],
  );

  const saveAIRiskParagraph = useCallback(
    (id: number) => {
      const para = document.querySelector<HTMLElement>(`.ai-risk-paragraph[data-ai-risk-id="${id}"]`);
      const item = aiRiskList.find(r => r.id === id);
      if (!para || !item) return;
      const textarea = para.querySelector<HTMLTextAreaElement>('textarea');
      if (!textarea) return;
      const value = textarea.value.trim();
      if (!value) {
        showToast('正文内容不能为空');
        return;
      }
      item.bodyText = value;
      item.bodyHtml = escapeHtml(value);
      item.status = 'adopted';
      para.classList.remove('editing', 'invalid');
      para.classList.add('adopted');
      para.textContent = value;
      setAIRiskList(prev => [...prev]);
      setEditingAIRiskId(null);
      showToast('正文已修改并采纳');
    },
    [aiRiskList, setAIRiskList, showToast],
  );

  const cancelAIRiskParagraph = useCallback(
    (id: number) => {
      const para = document.querySelector<HTMLElement>(`.ai-risk-paragraph[data-ai-risk-id="${id}"]`);
      const item = aiRiskList.find(r => r.id === id);
      if (!para || !item) return;
      para.classList.remove('editing');
      // 恢复原文
      if (item.status === 'invalid') {
        para.classList.add('invalid');
      } else if (item.status === 'adopted') {
        para.classList.add('adopted');
      }
      para.innerHTML = item.bodyHtml ?? escapeHtml(item.bodyText ?? '');
      setEditingAIRiskId(null);
    },
    [aiRiskList],
  );

  /* ---- 侧栏操作 ---- */
  const openSidePanel = useCallback((mode: SidePanelMode, content: SidePanelContent) => {
    setSidePanelMode(mode);
    setSidePanelContent(content);
  }, []);

  const showAIRiskPanel = useCallback(
    (fullscreen = true) => {
      openSidePanel(fullscreen ? 'expanded' : 'normal', { type: 'aiRisk' });
    },
    [openSidePanel],
  );

  const showAIFullAnalysis = useCallback(() => {
    openSidePanel('expanded', { type: 'aiFull' });
  }, [openSidePanel]);

  const showProvenance = useCallback(
    (moduleId: string, moduleTitle: string) => {
      openSidePanel('expanded', { type: 'source', moduleId, moduleTitle });
    },
    [openSidePanel],
  );

  const collapsePanel = useCallback(() => {
    setSidePanelMode('collapsed');
  }, []);

  const togglePanelSize = useCallback(() => {
    setSidePanelMode(prev => (prev === 'expanded' ? 'normal' : 'expanded'));
  }, []);

  const launchPanel = useCallback(() => {
    if (sidePanelContent.type === 'source' || sidePanelContent.type === 'aiFull') {
      setSidePanelMode('expanded');
    } else {
      setSidePanelMode('normal');
      setSidePanelContent({ type: 'aiRisk' });
    }
  }, [sidePanelContent]);

  /* ---- 顶栏按钮：word 下载 ---- */
  const handleDownload = useCallback(() => {
    const bodyHtml = Array.from(document.querySelectorAll<HTMLElement>('.section-card'))
      .map(section => section.innerHTML)
      .join('<hr />');
    downloadWord(`${reportMeta.companyName}-日常贷后检查报告.doc`, `${reportMeta.companyName} ${reportMeta.subtitle}`, bodyHtml);
  }, [reportMeta]);

  /* ---- 章节内容 DOM 事件代理 ---- */
  const onSectionClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // 编辑模式按钮
      const editBtn = target.closest<HTMLElement>('[data-ai-risk-edit]');
      if (editBtn) {
        event.stopPropagation();
        const id = Number(editBtn.getAttribute('data-ai-risk-id'));
        const action = editBtn.getAttribute('data-ai-risk-edit');
        if (action === 'save') saveAIRiskParagraph(id);
        if (action === 'cancel') cancelAIRiskParagraph(id);
        return;
      }
      // AI 风险段落：进入编辑
      const para = target.closest<HTMLElement>('.ai-risk-paragraph');
      if (para) {
        const id = Number(para.getAttribute('data-ai-risk-id'));
        editAIRiskParagraph(id);
        return;
      }
      // 块间锚点跳转（单向）：点击带 data-jump-anchor 的内容块 → 滚动定位到目标块
      const jumpable = target.closest<HTMLElement>('[data-jump-anchor]');
      if (jumpable) {
        const anchor = jumpable.getAttribute('data-jump-anchor');
        const targetEl = anchor ? document.getElementById(anchor) : null;
        if (targetEl) {
          event.stopPropagation();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          targetEl.classList.add('anchor-flash');
          window.setTimeout(() => targetEl.classList.remove('anchor-flash'), 1500);
        }
        return;
      }
      // 溯源按钮
      const btn = target.closest<HTMLElement>('.quick-action');
      if (btn && btn.getAttribute('data-action') === 'provenance') {
        const moduleId = btn.getAttribute('data-module-id');
        const section = sections.find(s => s.id === moduleId);
        if (moduleId && section) showProvenance(moduleId, section.title);
      }
    },
    [editAIRiskParagraph, saveAIRiskParagraph, cancelAIRiskParagraph, sections, showProvenance],
  );

  /* ---- 侧栏事件代理 ---- */
  const onSidePanelClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const actionBtn = target.closest<HTMLElement>('[data-ai-risk-action]');
      if (actionBtn) {
        const id = Number(actionBtn.getAttribute('data-ai-risk-id'));
        const action = actionBtn.getAttribute('data-ai-risk-action');
        setAIRiskStatus(id, action === 'adopt' ? 'adopted' : 'invalid');
        return;
      }
      const row = target.closest<HTMLElement>('[data-ai-risk-row]');
      if (row && !target.closest('[data-stop]')) {
        const id = Number(row.getAttribute('data-ai-risk-row'));
        locateAIRisk(id, true);
      }
    },
    [setAIRiskStatus, locateAIRisk],
  );

  /* ---- 侧栏标题与内容 ---- */
  const sidePanelTitle = useMemo(() => {
    if (sidePanelContent.type === 'aiRisk') return 'AI风险识别';
    if (sidePanelContent.type === 'aiFull') return 'AI 分析全文';
    return `${sidePanelContent.moduleTitle} / 溯源信息`;
  }, [sidePanelContent]);

  const sidePanelBody = useMemo(() => {
    if (sidePanelContent.type === 'aiRisk') return aiRiskTableHTML(aiRiskList);
    if (sidePanelContent.type === 'aiFull') return aiFullAnalysisHtml;
    return sourcePanelHtml(sourceTemplates[sidePanelContent.moduleId] ?? []);
  }, [sidePanelContent, aiRiskList, aiFullAnalysisHtml, sourceTemplates]);

  /* ---- 行高亮（点击表格行后） ---- */
  useEffect(() => {
    document.querySelectorAll('.ai-risk-row').forEach(row => {
      const id = Number(row.getAttribute('data-ai-risk-row'));
      row.classList.toggle('active', id === activeAIRiskId);
    });
  }, [activeAIRiskId, aiRiskList, sidePanelContent]);

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="report-loading">
        <Spin size="large" tip="报告加载中..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-loading">
        <div className="report-error">
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>报告加载失败</p>
          <p className="muted">{error}</p>
          <p className="muted" style={{ marginTop: 10 }}>
            请确认后端已启动、该日检流水号（checkTaskNo={checkTaskNo}）下已有报告记录，且已完成生成加工。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="report-root">
      {/* 全局 CSS 注入 */}
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />

      <div ref={shellRef} className={`report-shell ${sidePanelEmbedded ? 'with-side' : ''}`}>
        {/* 左：目录 */}
        <aside className="report-nav panel">
          <div className="panel-head sticky-head">
            <h2>报告目录</h2>
          </div>
          {/* "只看有溯源模块" 过滤：暂时隐藏（保留逻辑，后续需要时去掉 style 即可恢复） */}
          <div className="filter-box" style={{ display: 'none' }}>
            <input
              id="toggle-dynamic-only"
              type="checkbox"
              checked={filterDynamicOnly}
              onChange={e => setFilterDynamicOnly(e.target.checked)}
            />
            <label htmlFor="toggle-dynamic-only">只看有溯源模块</label>
          </div>
          <nav className="chapter-nav">
            {visibleSections.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`nav-item ${activeSectionKey === item.id ? 'active' : ''}`}
                onClick={() => setActiveSectionKey(item.id)}
              >
                <strong>{item.title}</strong>
              </a>
            ))}
          </nav>
        </aside>

        {/* 中：报告主体 */}
        <main className="report-main">
          <header className="report-topbar panel">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <h1 className="report-company-title">{reportMeta.companyName}</h1>
                {versions.length > 1 && (
                  <Select
                    value={currentReportNo}
                    onChange={selectVersion}
                    style={{ minWidth: 240 }}
                    placeholder="选择版本"
                    options={versions.map(v => ({
                      value: v.reportNo,
                      label: v.version ? `${v.version}（${v.reportNo}）` : v.reportNo,
                    }))}
                  />
                )}
              </div>
              <p className="report-page-subtitle">{reportMeta.subtitle}</p>
              <div className="sample-badge">{reportMeta.sampleText}</div>
            </div>
            <div className="toolbar">
              <button className="ghost-btn" type="button" style={{ marginRight: 'auto' }} onClick={() => navigate('/reports')}>
                ← 返回列表
              </button>
              <button className="ghost-btn ai-risk-btn" type="button" onClick={() => showAIRiskPanel(true)}>
                AI风险识别
              </button>
              <button className="ghost-btn" type="button" onClick={showAIFullAnalysis}>
                AI分析全文
              </button>
              <button className="primary-btn" type="button" onClick={handleDownload}>
                下载 Word
              </button>
            </div>
          </header>

          <section className="report-sections" onClick={onSectionClick}>
            {visibleSections.map(item => (
              <article key={item.id} id={item.id} className="section-card" data-module-id={item.id}>
                <h3>{item.title}</h3>
                {/* 溯源按钮不再单独渲染：它本身就是内容块（SOURCE_LINK），已在正文中渲染为外链按钮 */}
                <div className="section-body" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
              </article>
            ))}
          </section>
        </main>

        {/* 右：侧栏（仅 normal 时嵌入网格；expanded 时作为 floating 浮层在外侧） */}
        {sidePanelEmbedded && (
          <aside id="side-panel" className="side-panel panel">
            <div className="panel-head sticky-head">
              <h2>{sidePanelTitle}</h2>
              <div className="toolbar">
                <button className="icon-btn" type="button" title="全屏" onClick={togglePanelSize}>
                  ⤢
                </button>
                <button className="icon-btn" type="button" title="收起" onClick={collapsePanel}>
                  ×
                </button>
              </div>
            </div>
            <div
              id="side-panel-content"
              className="side-panel-body"
              onClick={onSidePanelClick}
              dangerouslySetInnerHTML={{ __html: sidePanelBody }}
            />
          </aside>
        )}

        {/* 浮层侧栏（expanded 模式，position: fixed 全屏覆盖） */}
        {sidePanelFloating && (
          <>
            <aside id="side-panel" className="side-panel panel expanded">
              <div className="panel-head sticky-head">
                <h2>{sidePanelTitle}</h2>
                <div className="toolbar">
                  <button className="icon-btn" type="button" title="还原" onClick={togglePanelSize}>
                    ⤡
                  </button>
                  <button className="icon-btn" type="button" title="收起" onClick={collapsePanel}>
                    ×
                  </button>
                </div>
              </div>
              <div
                id="side-panel-content"
                className="side-panel-body"
                onClick={onSidePanelClick}
                dangerouslySetInnerHTML={{ __html: sidePanelBody }}
              />
            </aside>
            {/* Backdrop：点击关闭浮层 */}
            <div className="panel-backdrop" onClick={collapsePanel} />
          </>
        )}

        {/* Launcher 浮动按钮（仅 collapsed 时显示） */}
        <button
          id="side-panel-launcher"
          className={`side-panel-launcher ${sidePanelMode === 'collapsed' ? '' : 'hidden'}`}
          type="button"
          title="打开右侧栏"
          onClick={launchPanel}
        >
          ◧
        </button>

        {/* 回到顶部（向 ReportView 内部滚动） */}
        <button
          id="back-to-top"
          className={`back-to-top ${showBackToTop ? '' : 'hidden'}`}
          type="button"
          title="回到顶部"
          onClick={() => shellRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="ai-risk-toast" role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
}