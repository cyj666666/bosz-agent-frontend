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
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Select, Modal } from 'antd';
import { CopyOutlined, CheckOutlined, HistoryOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useReportInstanceApi } from '../../hooks/useReportInstanceApi';
import { reportApi, type ReportAiAnalysisItem, type ReportRiskEditLogItem, type ReportWarningAdviceVO } from '../../api/report';
import {
  type AIRiskItem,
  type AIRiskStatus,
  type SectionItem,
  type SourceGroup,
} from '../../hooks/useReportApi';

type SidePanelMode = 'normal' | 'expanded' | 'collapsed';
/** 轻提示语义：成功 / 中性说明 / 失败 */
type ToastType = 'success' | 'info' | 'error';
type SidePanelContent =
  | { type: 'aiRisk' }
  | { type: 'aiFull' }
  | { type: 'source'; moduleId: string; moduleTitle: string };

/** 版本号展示：后端存整数（1/2/3），前端拼 "V" 前缀；空值返回空串 */
const fmtVersion = (v?: number | null): string => (v == null ? '' : `V${v}`);

/** 左侧目录收起状态的 localStorage 键（收起后刷新仍保持收起） */
const NAV_COLLAPSED_KEY = 'bosz_report_nav_collapsed';

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
/* 展开侧栏时第三列 390 → 600 → 720：预警建议表列多，600 只能靠横向滚动看，
   加宽到 720（内容区 ~667）配合列宽收窄后，7 列一屏可见。
   侧栏加宽会挤占正文，故把左侧目录同时由 260 压到 200（仅展开侧栏时生效），
   1600 窗口实测：正文 403 → 343，不至于被压得不像样。 */
.report-shell.with-side { grid-template-columns: 200px minmax(0, 1fr) 720px; }
/* 目录收起：整列不渲染，grid 直接少一列，200px 全部让给正文。
   ⚠️ 必须连 .with-side 一起覆盖 —— 否则会退回「正文 + 720」两列（目录列虽空洞仍占位）。 */
.report-shell.nav-collapsed { grid-template-columns: minmax(0, 1fr); }
.report-shell.nav-collapsed.with-side { grid-template-columns: minmax(0, 1fr) 720px; }
.panel { border-radius: 24px; border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
.report-nav {
  position: sticky;
  top: 16px;
  /* 高度 = 容器高度(100vh-96) - report-shell 上下 padding(16+24) = 100vh-136 */
  height: calc(100vh - 136px);
  overflow: auto;
  padding: 18px;
}
/* 右侧栏：面板本身不滚动，只有内容区（.side-panel-body）滚动，标题栏与工具条固定 */
.side-panel {
  position: sticky;
  top: 16px;
  height: calc(100vh - 136px);
  padding: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.side-panel-body { flex: 1; min-height: 0; overflow: auto; }
.report-main { min-width: 0; }
.report-topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; padding: 18px 22px; flex-wrap: wrap; }
.report-company-title { margin: 0; font-size: clamp(1.45rem, 2.6vw, 2.05rem); line-height: 1.12; color: var(--text); font-weight: 800; }
.report-page-subtitle { margin: 8px 0 0; color: var(--muted); font-size: 1rem; letter-spacing: .18em; }
/* 复制报告编号：图标按钮（无文字），复制成功后短暂变绿并显示 ✓ */
.copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: 0 0 auto; border-radius: 12px; border: 1px solid var(--line); background: #fff; color: var(--muted); cursor: pointer; padding: 0; font-size: 15px; transition: color .18s ease, border-color .18s ease, background .18s ease, transform .18s ease; }
.copy-btn:hover { color: var(--accent); border-color: rgba(22,100,255,.34); transform: translateY(-1px); }
.copy-btn.copied { color: #16a34a; border-color: rgba(22,163,74,.36); background: rgba(236,253,245,.92); }
/* 「智能体分析」：一键串行（全文分析 → 预警建议），位于侧边面板顶部（该面板已不显示标题） */
.chain-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; padding: 0 15px; flex: 0 0 auto; border: 0; border-radius: 12px; color: #fff; font-size: 13.5px; font-weight: 700; letter-spacing: .3px; white-space: nowrap; cursor: pointer; background: linear-gradient(135deg, #4f95ff, #1664ff 58%, #6d5dfc); box-shadow: 0 7px 18px rgba(22,100,255,.28); transition: transform .18s ease, box-shadow .18s ease, filter .18s ease, opacity .18s ease; }
.chain-btn-sm { height: 30px; padding: 0 13px; border-radius: 9px; gap: 6px; font-size: 12.5px; box-shadow: 0 4px 12px rgba(22,100,255,.24); }
.chain-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(22,100,255,.34); filter: brightness(1.04); }
.chain-btn:disabled { cursor: not-allowed; opacity: .72; }
.chain-btn.is-running { background: linear-gradient(135deg, #93bbff, #7aa6f7); box-shadow: 0 5px 14px rgba(22,100,255,.20); }
.chain-btn-spinner { width: 13px; height: 13px; flex: 0 0 auto; border-radius: 50%; border: 2px solid rgba(255,255,255,.5); border-top-color: #fff; animation: reportStateSpin .85s linear infinite; }
.chain-btn-sm .chain-btn-spinner { width: 11px; height: 11px; border-width: 1.5px; }
.sample-badge { margin: 10px 0 0; color: var(--muted); font-size: 13px; font-weight: 700; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.primary-btn, .ghost-btn, .icon-btn { border: 0; border-radius: 14px; padding: 10px 14px; cursor: pointer; transition: transform .18s ease; font: inherit; color: var(--text); }
.primary-btn { color: #fff; background: var(--accent); box-shadow: 0 10px 24px rgba(22,100,255,.24); }
.ghost-btn, .icon-btn { background: #fff; border: 1px solid var(--line); }
.primary-btn:hover, .ghost-btn:hover, .icon-btn:hover { transform: translateY(-1px); }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.panel-head h2 { margin: 0; font-size: 1.15rem; }
/* 标题 + 紧跟其右的操作按钮（如「智能体分析」），整体靠左，不挤压右侧 toolbar */
.panel-head-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.panel-head-left h2 { white-space: nowrap; }
.sticky-head { position: sticky; top: 0; z-index: 3; background: inherit; padding-bottom: 12px; }
.filter-box { margin-top: 8px; color: var(--muted); font-size: 14px; display: flex; align-items: center; gap: 6px; }
.chapter-nav { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
/* 目录标题右侧的收起按钮：做成小圆角方形，和侧栏标题栏的 ⤢ / × 同一套语言 */
.nav-toggle-btn { flex: 0 0 auto; width: 26px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--muted); font-size: 15px; font-weight: 800; line-height: 1; cursor: pointer; transition: color .16s ease, border-color .16s ease, background .16s ease; }
.nav-toggle-btn:hover { color: var(--accent); border-color: rgba(22,100,255,.34); background: rgba(240,246,253,.9); }
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
.report-running-tip { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding: 12px 18px; border-radius: 14px; border: 1px solid rgba(22,100,255,.22); background: linear-gradient(180deg, rgba(237,244,255,.96), rgba(255,255,255,.94)); color: #124a91; font-size: 14px; font-weight: 600; }
.report-running-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(22,100,255,.25); border-top-color: var(--accent); animation: reportRunningSpin .8s linear infinite; flex: 0 0 auto; }
@keyframes reportRunningSpin { to { transform: rotate(360deg); } }
/* ---- 结果提示弹框（生成完成 / 生成失败）：居中 + 自定义样式 ---- */
.report-result-modal .ant-modal-content { padding: 0; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 64px rgba(24,56,120,.20); }
.report-result-body { padding: 32px 30px 26px; text-align: center; }
.report-result-icon { width: 64px; height: 64px; margin: 0 auto 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 700; line-height: 1; color: #fff; user-select: none; }
.report-result-body.is-success .report-result-icon { background: linear-gradient(135deg, #35bd85, #16915a); box-shadow: 0 14px 28px rgba(23,160,95,.30); }
.report-result-body.is-failed .report-result-icon { background: linear-gradient(135deg, #f2817a, #d9453d); box-shadow: 0 14px 28px rgba(217,69,61,.28); }
.report-result-title { font-size: 19px; font-weight: 800; letter-spacing: .5px; color: var(--text); }
.report-result-desc { margin-top: 10px; color: var(--muted); font-size: 14px; line-height: 1.8; }
.report-result-reason { margin-top: 14px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(217,69,61,.18); background: rgba(217,69,61,.06); color: #a3352d; font-size: 13px; line-height: 1.7; text-align: left; word-break: break-word; overflow-wrap: anywhere; max-height: 180px; overflow: auto; }
.report-result-actions { margin-top: 24px; }
.report-result-actions .primary-btn { min-width: 132px; }
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
.side-panel.expanded { position: fixed; inset: 16px 16px 16px auto; right: 16px; width: min(1180px, calc(100vw - 200px)); max-height: calc(100vh - 32px); z-index: 32; box-shadow: 0 32px 80px rgba(13,31,62,.24); }
.source-block { padding: 14px; border: 1px solid var(--line); border-radius: 18px; background: rgba(248,251,255,.95); margin-bottom: 12px; }
.source-block h4 { margin: 0 0 8px; }
.source-note { margin: 0 0 12px; color: var(--muted); font-size: 13px; line-height: 1.7; }
/* 回到顶部：底部居中悬浮胶囊（带文案），淡色玻璃质感 */
.back-to-top { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 20px; border: 1px solid rgba(22,100,255,.20); border-radius: 999px; background: rgba(255,255,255,.90); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #4a6ea8; font-size: 14px; font-weight: 600; letter-spacing: .5px; white-space: nowrap; box-shadow: 0 10px 26px rgba(22,100,255,.14); cursor: pointer; z-index: 40; transition: transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease, border-color .18s ease; animation: reportToTopIn .2s ease-out; }
.back-to-top::before { content: "↑"; font-size: 15px; font-weight: 800; line-height: 1; }
.back-to-top:hover { transform: translateX(-50%) translateY(-2px); background: #fff; border-color: rgba(22,100,255,.34); color: var(--accent); box-shadow: 0 14px 32px rgba(22,100,255,.22); }
.back-to-top:active { transform: translateX(-50%) translateY(0); }
@keyframes reportToTopIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
.panel-backdrop { position: fixed; inset: 0; background: rgba(6,12,25,.28); backdrop-filter: blur(3px); z-index: 30; }
.hidden { display: none !important; }
.ai-risk-btn { color: #fff; background: linear-gradient(135deg, #6d5dfc, #1664ff); border: 0; box-shadow: 0 10px 24px rgba(79,70,229,.22); }
/* AI 风险工具条（标题 + 说明 + 统计）：吸附在内容区顶部，随滚动固定 */
.ai-risk-toolbar { position: sticky; top: 0; z-index: 4; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; padding: 12px; border: 1px solid rgba(22,100,255,.12); border-radius: 16px; background: #f7faff; box-shadow: 0 6px 16px rgba(35,88,176,.06); }
.ai-risk-summary { color: var(--muted); font-size: 13px; line-height: 1.7; }
/* 侧栏内 4 列表格自适应宽度（原为 6 列 + min-width:1180px，在窄侧栏里只能看到 sticky 的「操作」列） */
.ai-risk-table table { min-width: 0; }
.ai-risk-table th, .ai-risk-table td { padding: 8px; font-size: 13px; }
.ai-risk-op { white-space: normal; }
/* 操作列两个按钮改为竖排：横排会把该列撑到 108px，挤压右侧「风险描述」；
   竖排后列宽可收到 66px，省下的宽度全部给风险描述 */
.ai-risk-op-btns { display: flex; flex-direction: column; gap: 5px; }
.ai-risk-op-btns .ai-risk-mini-btn { width: 100%; margin: 0; }
/* 「修改记录(N)」按钮：挂在正文规则块末尾（右下角、随正文流），仅当该风险要点有历史修改时出现。
   注意：它是渲染后注入到 .ai-risk-paragraph 里的真实元素，编辑保存/取消后需重新注入；
   导出 Word 时统一隐藏（见 downloadWord 的 CSS）。 */
.rpt-history-btn { display: block; margin: 10px 0 0 auto; padding: 2px 10px; border-radius: 999px; border: 1px solid rgba(22,100,255,.26); background: rgba(240,246,255,.92); color: var(--accent); font-size: 12px; font-weight: 700; line-height: 1.7; cursor: pointer; white-space: nowrap; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
.rpt-history-btn:hover { background: rgba(22,100,255,.14); border-color: rgba(22,100,255,.44); transform: translateY(-1px); }
/* 修改记录弹窗（内容在 antd portal 里，:root 变量与类选择器同样生效）
   注意：antd 6 的弹窗容器类名是 .ant-modal-container（不再是 .ant-modal-content），
   必须把它的默认内边距（20px 24px）与圆角一起覆盖，否则头部渐变到不了边缘。 */
.report-history-modal .ant-modal-container,
.report-history-modal .ant-modal-content { padding: 0; border-radius: 20px; overflow: hidden; box-shadow: 0 32px 84px rgba(21,58,120,.26); }
.report-history-modal .ant-modal-body { padding: 0; }
/* ---- 以下 history-* 样式统一收在 .report-history-modal 作用域内（REPORT_CSS 是全局注入的） ---- */
/* 头部：渐变底 + 图标徽章 + 标题/风险要点副标题 */
.report-history-modal .history-head { position: relative; display: flex; align-items: center; gap: 14px; padding: 19px 22px; border-bottom: 1px solid var(--line); background: linear-gradient(135deg, #eaf3ff 0%, #f7fbff 58%, #ffffff 100%); }
.report-history-modal .history-head::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 6% 0%, rgba(22,100,255,.16), transparent 48%); }
.report-history-modal .history-head-icon { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 13px; font-size: 19px; color: #fff; background: linear-gradient(135deg, #4f95ff, #1664ff 55%, #6d5dfc); box-shadow: 0 9px 22px rgba(22,100,255,.34); }
.report-history-modal .history-head-txt { position: relative; flex: 1; min-width: 0; }
.report-history-modal .history-head-txt h4 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: .4px; line-height: 1.35; color: var(--text); }
.report-history-modal .history-head-txt p { margin: 3px 0 0; font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.report-history-modal .history-close { position: relative; flex: 0 0 auto; width: 30px; height: 30px; border: 0; border-radius: 9px; background: rgba(255,255,255,.72); color: var(--muted); font-size: 13px; line-height: 1; cursor: pointer; transition: background .18s ease, color .18s ease; }
.report-history-modal .history-close:hover { background: rgba(22,100,255,.13); color: var(--accent); }
/* 概览统计条 */
.report-history-modal .history-stats { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 22px 0; }
.report-history-modal .history-stat { display: inline-flex; align-items: baseline; gap: 5px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); background: rgba(246,250,255,.9); font-size: 12px; color: var(--muted); }
.report-history-modal .history-stat b { font-size: 13.5px; font-weight: 800; color: var(--accent); }
/* 列表：竖向时间轴 —— 序号圆点 + 卡片 */
.report-history-modal .history-list { margin: 0; padding: 14px 22px 16px; list-style: none; max-height: 56vh; overflow: auto; }
.report-history-modal .history-list li { position: relative; padding: 0 0 14px 30px; }
.report-history-modal .history-list li:last-child { padding-bottom: 0; }
.report-history-modal .history-list li::before { content: ""; position: absolute; left: 8px; top: 24px; bottom: -2px; width: 2px; border-radius: 2px; background: linear-gradient(180deg, rgba(22,100,255,.3), rgba(22,100,255,.05)); }
.report-history-modal .history-list li:last-child::before { display: none; }
.report-history-modal .history-index { position: absolute; left: 0; top: 12px; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #77adff, #1664ff); color: #fff; font-size: 10.5px; font-weight: 800; font-variant-numeric: tabular-nums; box-shadow: 0 3px 9px rgba(22,100,255,.32); }
.report-history-modal .history-card { padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(180deg, #ffffff, #f8fbff); transition: border-color .18s ease, box-shadow .18s ease; }
.report-history-modal .history-card:hover { border-color: rgba(22,100,255,.3); box-shadow: 0 10px 24px rgba(35,88,176,.1); }
.report-history-modal .history-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.report-history-modal .history-avatar { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #63a6ff, #1664ff); }
.report-history-modal .history-who { font-size: 13.5px; font-weight: 800; color: var(--text); }
.report-history-modal .history-report { padding: 1px 7px; border-radius: 6px; background: rgba(109,93,252,.1); color: #5b4bd6; font-size: 11px; font-weight: 700; }
.report-history-modal .history-time { margin-left: auto; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.report-history-modal .history-text { margin-top: 9px; padding: 9px 12px; border-left: 3px solid rgba(22,100,255,.34); border-radius: 0 10px 10px 0; background: rgba(238,245,255,.72); font-size: 13.5px; line-height: 1.85; color: var(--text); white-space: pre-wrap; word-break: break-word; }
.report-history-modal .history-label { font-weight: 800; color: var(--accent); }
/* 「原始版本」置顶条目：与人工修改记录做视觉区分（灰蓝 + 虚线边 + 「原」字序号） */
.report-history-modal .history-list li.is-origin .history-index { background: linear-gradient(135deg, #a9b6c9, #71829a); box-shadow: 0 3px 9px rgba(93,115,150,.3); }
.report-history-modal .history-list li.is-origin .history-card { border-style: dashed; border-color: rgba(93,115,150,.34); background: linear-gradient(180deg, #fcfdfe, #f4f7fb); }
.report-history-modal .history-list li.is-origin .history-card:hover { border-color: rgba(93,115,150,.5); box-shadow: 0 10px 24px rgba(35,88,176,.08); }
.report-history-modal .history-list li.is-origin .history-text { border-left-color: rgba(93,115,150,.42); background: rgba(240,244,249,.72); }
.report-history-modal .history-list li.is-origin .history-label { color: #5d7396; }
.report-history-modal .history-origin-badge { padding: 1px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 800; color: #40536e; background: rgba(93,115,150,.13); border: 1px solid rgba(93,115,150,.26); }
.report-history-modal .history-origin-hint { font-size: 12px; color: var(--muted); }
/* 底部说明 */
.report-history-modal .history-foot { display: flex; align-items: center; gap: 7px; padding: 11px 22px; border-top: 1px solid var(--line); background: rgba(247,251,255,.86); font-size: 12px; color: var(--muted); }
/* 空态 */
.report-history-modal .history-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 40px 0 46px; color: var(--muted); font-size: 13px; }
.report-history-modal .history-empty-icon { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; margin-bottom: 3px; border-radius: 15px; font-size: 21px; color: var(--accent); background: rgba(22,100,255,.08); }
.report-history-modal .history-empty strong { font-size: 14.5px; font-weight: 800; color: var(--text); }
.report-history-modal .history-status { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 34px 0; color: var(--muted); font-size: 14px; }
.report-history-modal .history-status.is-error { color: #c0392b; }
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
/* margin：与上下正文拉开空隙，避免规则块紧贴相邻段落显得拥挤（普通段落间距为 10px） */
.ai-risk-paragraph { position: relative; margin: 16px 0; border-radius: 14px; padding: 10px 12px; border: 1px solid rgba(22,100,255,.14); background: rgba(246,250,255,.72); cursor: pointer; transition: background .18s ease, border .18s ease, box-shadow .18s ease; }
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
  0%, 100% { box-shadow: 0 0 0 rgba(240,160,32,0); }
  30% { box-shadow: 0 0 0 7px rgba(240,160,32,.26); }
  60% { box-shadow: 0 0 0 12px rgba(240,160,32,.10); }
}
/* 角标（点击可编辑 / 当前定位）统一贴在「块体上边框之上」：
   top:-10px 让角标跨在上边框上——上半截落在块的 16px 上外边距里，下半截落在块的 10px 内边距里，
   两者都不含正文文字，因此长文本首行不会再从角标下面穿过（老写法 top:8px 会压住文字）。 */
.ai-risk-paragraph::after { content: "点击可编辑"; position: absolute; top: -11px; right: 10px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .3px; line-height: 1.5; color: var(--accent); background: #eef4ff; border: 1px solid rgba(22,100,255,.20); opacity: 0; transition: opacity .18s ease; pointer-events: none; z-index: 1; }
.ai-risk-paragraph:hover::after { opacity: 1; }
.ai-risk-paragraph.editing::after { display: none; }
/* ---- 「当前定位」：点击侧栏某行后，正文对应块进入常驻强调态 ----
   三等视觉层级：普通正文(白底) < 普通规则块(淡蓝) < 当前定位块(琥珀+左色条+外圈+角标) */
.ai-risk-paragraph.ai-risk-located {
  background: linear-gradient(180deg, rgba(255,247,226,.98), rgba(255,252,241,.98));
  border-color: #f0a020;
  border-left: 5px solid #e07c00;
  box-shadow: 0 0 0 3px rgba(240,160,32,.28), 0 16px 34px rgba(224,124,0,.18);
  animation: aiRiskLocatedIn .45s cubic-bezier(.22,1,.36,1);
}
.ai-risk-paragraph.ai-risk-located::before { background: linear-gradient(135deg, #f5a623, #e07c00); }
.ai-risk-paragraph.ai-risk-located::after { content: "当前定位"; opacity: 1; color: #96560a; background: linear-gradient(135deg, #ffe9b8, #fdd98a); border-color: rgba(224,124,0,.34); font-weight: 800; }
/* 编辑态下让位给编辑框，不显示「当前定位」角标 */
.ai-risk-paragraph.ai-risk-located.editing::after { display: none; }
@keyframes aiRiskLocatedIn { from { transform: scale(.985); } to { transform: scale(1); } }
/* 提示 toast：居中显示 + 卡片化样式 */
/* 轻提示 toast：屏幕居中 + 暗色玻璃卡 + 语义图标（成功 ✓ / 中性 i / 失败 !） */
.ai-risk-toast { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 12px; max-width: min(78vw, 460px); padding: 14px 22px 14px 16px; border-radius: 18px; border: 1px solid rgba(255,255,255,.12); color: #fff; font-size: 14px; font-weight: 600; letter-spacing: .2px; line-height: 1.6; background: linear-gradient(135deg, rgba(28,40,66,.96), rgba(13,21,38,.96)); box-shadow: 0 24px 56px rgba(10,22,45,.34); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); z-index: 2100; animation: reportToastIn .22s cubic-bezier(.22,1,.36,1); }
.ai-risk-toast-icon { width: 22px; height: 22px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 13px; font-weight: 900; font-style: normal; line-height: 1; color: #fff; }
.ai-risk-toast.success .ai-risk-toast-icon { background: linear-gradient(135deg, #35bd85, #16915a); box-shadow: 0 0 0 4px rgba(53,189,133,.20); }
.ai-risk-toast.info .ai-risk-toast-icon { background: linear-gradient(135deg, #93a6c2, #62748f); box-shadow: 0 0 0 4px rgba(147,166,194,.18); }
.ai-risk-toast.error .ai-risk-toast-icon { background: linear-gradient(135deg, #f2817a, #d9453d); box-shadow: 0 0 0 4px rgba(217,69,61,.20); }
@keyframes reportToastIn { from { opacity: 0; transform: translate(-50%, -46%) scale(.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
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
/* AI 分析面板默认开在窄侧栏里：收紧卡片内边距与字号，避免 30/34px 内边距把 390px 挤爆；
   expanded 全屏浮层保持原样（用 :not(.expanded) 限定） */
.side-panel:not(.expanded) .ai-full-report-wrap { padding: 0; }
.side-panel:not(.expanded) .ai-full-report-card { padding: 16px 14px; border-radius: 16px; }
.side-panel:not(.expanded) .ai-full-report-header { flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 14px; padding-bottom: 10px; }
.side-panel:not(.expanded) .ai-full-report-header h1 { font-size: 16px; letter-spacing: 0; flex-wrap: wrap; gap: 6px; }
.side-panel:not(.expanded) .ai-full-title { font-size: 15px; padding-left: 10px; border-left-width: 4px; margin-bottom: 12px; }
.side-panel:not(.expanded) .ai-full-content p,
.side-panel:not(.expanded) .ai-full-sub-item,
.side-panel:not(.expanded) .ai-full-conclusion-box p { font-size: 13.5px; line-height: 1.8; margin-bottom: 10px; }
.side-panel:not(.expanded) .ai-full-section-head { font-size: 14.5px; margin-top: 16px; margin-bottom: 8px; }
.side-panel:not(.expanded) .ai-full-sub-item { padding-left: 14px; }
.side-panel:not(.expanded) .ai-full-conclusion-box { padding: 12px 14px; margin-top: 14px; }
.side-panel:not(.expanded) .ai-full-report-footer { flex-direction: column; gap: 4px; margin-top: 16px; padding-top: 10px; }
/* ---- AI 分析全文面板：状态态（读取中 / 未分析 / 进行中 / 失败）与已完成结果 ---- */
.ai-full-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 330px; padding: 34px 26px; text-align: center; }
.ai-full-state-icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; margin-bottom: 16px; border-radius: 16px; font-size: 24px; font-weight: 800; color: var(--accent); background: rgba(22,100,255,.09); }
.ai-full-state.is-error .ai-full-state-icon { color: #c0392b; background: rgba(192,57,43,.09); }
.ai-full-spinner { width: 44px; height: 44px; margin-bottom: 18px; border-radius: 50%; border: 3px solid rgba(22,100,255,.16); border-top-color: var(--accent); animation: reportStateSpin .85s linear infinite; }
.ai-full-state-title { font-size: 15.5px; font-weight: 800; color: var(--text); }
.ai-full-state-desc { margin: 9px 0 0; max-width: 390px; font-size: 13px; line-height: 1.85; color: var(--muted); word-break: break-word; }
.ai-full-btn { margin-top: 18px; padding: 8px 22px; border: 1px solid transparent; border-radius: 10px; font-size: 13.5px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #4f95ff, #1664ff); cursor: pointer; box-shadow: 0 8px 20px rgba(22,100,255,.26); transition: transform .18s ease, box-shadow .18s ease; }
.ai-full-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(22,100,255,.32); }
.ai-full-btn.ghost { color: var(--accent); background: rgba(22,100,255,.08); border-color: rgba(22,100,255,.26); box-shadow: none; }
.ai-full-btn.ghost:hover { background: rgba(22,100,255,.14); box-shadow: none; }
/* 已完成：元信息条 + 模型输出的 HTML 片段 */
.ai-full-result { padding: 4px 0 10px; }
.ai-full-result-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line); background: rgba(246,250,255,.9); }
.ai-full-result-meta { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-full-result-bar .ai-full-btn { margin-top: 0; padding: 5px 14px; font-size: 12.5px; }
.ai-full-result-body { font-size: 13.5px; line-height: 1.9; color: var(--text); word-break: break-word; }
.ai-full-result-body h3 { margin: 18px 0 9px; padding-left: 11px; border-left: 4px solid var(--accent); font-size: 14.5px; font-weight: 800; color: #0b2b44; line-height: 1.5; }
.ai-full-result-body h3:first-child, .ai-full-result-body h4:first-child { margin-top: 0; }
.ai-full-result-body h4 { margin: 14px 0 7px; font-size: 13.5px; font-weight: 800; color: #143750; }
.ai-full-result-body p { margin: 0 0 11px; text-align: justify; }
.ai-full-result-body ul, .ai-full-result-body ol { margin: 0 0 12px; padding-left: 22px; }
.ai-full-result-body li { margin-bottom: 6px; text-align: justify; }
.ai-full-result-body strong { color: #0f3b57; }
.ai-full-result-body table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12.5px; }
.ai-full-result-body th, .ai-full-result-body td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; }
.ai-full-result-body th { background: rgba(237,244,255,.9); font-weight: 800; }
/* 全屏浮层下空间更宽，字号随之放大 */
.side-panel.expanded .ai-full-result-body { font-size: 14.5px; }
.side-panel.expanded .ai-full-result-body h3 { font-size: 16px; }
.side-panel.expanded .ai-full-result-body h4 { font-size: 15px; }

/* ---------- AI 面板页签（全文分析 / 预警建议） ---------- */
/* 与上方工具栏同为 sticky，滚动时页签始终可见 */
.ai-panel-tabs { position: sticky; top: 0; z-index: 3; display: flex; gap: 4px; margin: -2px 0 12px; padding: 4px; border-radius: 12px; background: rgba(240,246,253,.96); backdrop-filter: blur(8px); border: 1px solid var(--line); }
.ai-panel-tab { flex: 1; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 700; color: var(--muted); cursor: pointer; transition: background .18s ease, color .18s ease; }
.ai-panel-tab:hover { color: var(--accent); }
.ai-panel-tab.is-active { color: #fff; background: linear-gradient(135deg, #4f95ff, #1664ff); box-shadow: 0 6px 16px rgba(22,100,255,.24); }
.ai-panel-body { padding-bottom: 4px; }

/* ---------- 预警建议：核心提示 / 统计 / 表格 ---------- */
.wa-core-tip { margin: 0 0 12px; padding: 11px 13px; border-left: 4px solid #d98b0a; border-radius: 0 10px 10px 0; background: linear-gradient(180deg, #fffaf0, #fff4e0); font-size: 13px; line-height: 1.85; color: #6b4306; }
.wa-core-tip-label { display: inline-block; margin-right: 8px; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #f0a52a, #d98b0a); }
.wa-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.wa-stat { display: inline-flex; align-items: baseline; gap: 5px; padding: 5px 12px; border-radius: 999px; font-size: 12px; border: 1px solid var(--line); background: rgba(246,250,255,.9); color: var(--muted); }
.wa-stat b { font-size: 13.5px; font-weight: 800; }
.wa-stat.is-red { border-color: rgba(192,57,43,.28); }
.wa-stat.is-red b { color: #c0392b; }
.wa-stat.is-orange { border-color: rgba(217,139,10,.3); }
.wa-stat.is-orange b { color: #b4710a; }
.wa-stat.is-yellow { border-color: rgba(176,148,10,.3); }
.wa-stat.is-yellow b { color: #8d7607; }
/* 列多（操作 + 序号 + 等级 + 模型输出的 3 列 + 状态），侧栏放不下就横向滚动 */
/* 横向滚动条「常显」的实现：
   ① 表格区自己是滚动容器（overflow: auto），横条就归它渲染；
   ② 关键 —— 让表格区吃掉「页签 / 信息条 / 核心提示 / 统计」之后剩下的高度（见下方 :has() 那段），
      表格底边恒等于面板内容区底边，横条自然一直贴在看得见的位置。
   只写 max-height: calc(100vh - 430px) 是不够的：核心提示一长，底边照样被推到可视区外面，
   就回到「要拉到最下面才看得到横条」。下面这行是给不支持 :has() 的环境兜底。 */
.wa-table-wrap { overflow: auto; max-height: calc(100vh - 430px); min-height: 180px; padding-bottom: 2px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.side-panel-body:has(.wa-table-wrap) { display: flex; flex-direction: column; }
.side-panel-body:has(.wa-table-wrap) .ai-panel-tabs { flex: 0 0 auto; }
.side-panel-body:has(.wa-table-wrap) .ai-panel-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.side-panel-body:has(.wa-table-wrap) .ai-full-result { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.side-panel-body:has(.wa-table-wrap) .wa-table-wrap { flex: 1; max-height: none; }
.wa-table-wrap::-webkit-scrollbar { height: 12px; width: 10px; }
.wa-table-wrap::-webkit-scrollbar-track { background: rgba(226,236,248,.72); border-radius: 999px; }
.wa-table-wrap::-webkit-scrollbar-thumb { background: rgba(22,100,255,.44); border-radius: 999px; border: 2px solid rgba(255,255,255,.9); }
.wa-table-wrap::-webkit-scrollbar-thumb:hover { background: rgba(22,100,255,.66); }
/* table-layout: fixed —— 列宽严格按表头给的 width 走（auto 会被长文本顶宽，白给宽度也收不住）；
   文字一律允许换行，靠窄列 + 换行把列数压进侧栏可视宽度 */
.wa-table { min-width: 640px; width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12.5px; }
.wa-table th, .wa-table td { padding: 7px 8px; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); vertical-align: top; text-align: left; line-height: 1.7; }
.wa-table th { position: sticky; top: 0; z-index: 1; background: rgba(237,244,255,.98); font-weight: 800; color: #0f3b57; word-break: break-word; }
.wa-table tr:last-child td { border-bottom: 0; }
.wa-table th:last-child, .wa-table td:last-child { border-right: 0; }
.wa-op { width: 58px; background: #fff; }
/* 操作列压到 58px 后，「采纳/无效」按钮的左右内边距要收紧，否则两字会折行 */
.wa-op .ai-risk-mini-btn { padding-left: 4px; padding-right: 4px; }
.wa-seq { text-align: center; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.wa-text { word-break: break-word; }
.wa-row.is-adopted { background: rgba(232,247,238,.7); }
.wa-row.is-adopted .wa-text { color: #2f6b4f; }
.wa-row.is-invalid { background: rgba(246,247,249,.9); }
.wa-row.is-invalid .wa-text { color: #9aa5b1; text-decoration: line-through; }
/* 等级徽标：红 > 橙 > 黄。列压到 56px 后内边距要收紧，否则 nowrap 的徽标会溢出色块 */
.wa-level { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 11.5px; font-weight: 800; white-space: nowrap; border: 1px solid transparent; }
.wa-level.is-red { color: #fff; background: linear-gradient(135deg, #e05a4a, #c0392b); }
.wa-level.is-orange { color: #fff; background: linear-gradient(135deg, #f0a52a, #d98b0a); }
.wa-level.is-yellow { color: #6b5a06; background: linear-gradient(135deg, #fbe58a, #f2cf55); border-color: rgba(176,148,10,.4); }
.wa-badge { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 11.5px; font-weight: 800; white-space: nowrap; }
.wa-badge.is-pending { color: #7a6a3a; background: rgba(217,139,10,.12); border: 1px solid rgba(217,139,10,.3); }
.wa-badge.is-adopted { color: #1e7a4d; background: rgba(46,160,104,.12); border: 1px solid rgba(46,160,104,.3); }
.wa-badge.is-invalid { color: #7a8592; background: rgba(140,152,168,.14); border: 1px solid rgba(140,152,168,.3); }
.wa-empty { margin-top: 10px; padding: 26px 12px; border: 1px dashed var(--line); border-radius: 12px; text-align: center; font-size: 13px; color: var(--muted); }
/* 全屏展开时空间足够，字号放大一点 */
.side-panel.expanded .wa-table { min-width: 0; font-size: 13px; }
/* 加载态 / 错误态：占满内容区并居中。
   MainLayout 的 Content 高度 = calc(100vh - 96px)（Header 64 + margin 16×2），
   用同一个算式保证在「内容区正中」，而不是贴在顶部。 */
.report-state { flex: 1; display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 96px); padding: 24px; }
.report-state-card { display: flex; flex-direction: column; align-items: center; padding: 36px 56px; border-radius: 20px; border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow); }
.report-state-spinner { width: 44px; height: 44px; border-radius: 50%; border: 3px solid rgba(22,100,255,.16); border-top-color: var(--accent); animation: reportStateSpin .85s linear infinite; }
@keyframes reportStateSpin { to { transform: rotate(360deg); } }
.report-state-text { margin-top: 20px; font-size: 15px; font-weight: 800; letter-spacing: .6px; color: var(--text); }
.report-state-hint { margin-top: 7px; font-size: 12.5px; color: var(--muted); }
/* 合规提示条：正文最前面的固定文案。用「风险提示」惯用的暖琥珀色系 + 放大的实底图标 + 加粗文案，
   保证一眼可见；**不出现「免责声明」四个字**（客户要求），语义靠盾形图标 + 文案本身承载。 */
.report-disclaimer { display: flex; gap: 15px; align-items: center; padding: 15px 20px 15px 18px; border: 1px solid rgba(217,139,10,.36); border-left: 5px solid #d98b0a; border-radius: 12px; background: linear-gradient(180deg, #fffaf0, #fff2da); box-shadow: 0 6px 18px rgba(217,139,10,.10); }
.report-disclaimer-icon { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; font-size: 19px; color: #fff; background: linear-gradient(135deg, #f0a52a, #d98b0a); box-shadow: 0 5px 14px rgba(217,139,10,.32); }
.report-disclaimer-text { flex: 1; min-width: 0; margin: 0; font-size: 14.5px; font-weight: 700; line-height: 1.95; color: #6b4306; text-align: justify; }
/* 三栏（目录 260 + 正文 + 侧栏 600）需要相当宽的视口；且本页外层还有 MainLayout 的 Sider，
   实际可用宽度 ≈ 窗口 - 232，所以断点要比直觉更靠右，否则正文会被压到 2~300px。
   故断点 1180 → 1300 → 1500 */
@media (max-width: 1500px) {
  /* 窄屏一律单列堆叠：nav-collapsed 的两列规则特异性更高(0,3,0)，必须在这里显式覆盖，
     否则「收起目录 + 展开侧栏」会变成「正文 + 720」两列挤在小屏上 */
  .report-shell, .report-shell.with-side, .report-shell.nav-collapsed, .report-shell.nav-collapsed.with-side { grid-template-columns: 1fr; }
  .report-nav, .side-panel { position: relative; top: 0; height: auto; }
  /* ⚠️ 窄屏堆叠时目录/侧栏必须去掉自身滚动（overflow 非 visible）：
     带滚动条的 grid item 在 auto 行里的贡献高度会被算塌 —— 实测目录行高只剩 38px（首个子元素标题栏那么高），
     而目录卡片 638px → 溢出并盖住正文顶部；侧栏同理（行高 38 vs 卡片 743，页面滚动高度少算 24px）。
     改成 visible 后行高恢复为内容高（637.562 / 742.688），不再重叠、底部也滚得到。
     宽屏不受影响：那时目录/侧栏是独立列、有定高（100vh-136），靠 overflow 自己滚。 */
  .report-nav, .side-panel { overflow: visible; }
  .side-panel.collapsed { transform: none; opacity: 1; pointer-events: auto; }
  .side-panel.expanded { position: relative; inset: auto; height: auto; width: auto; }
}
@media (max-width: 860px) {
  .report-root { padding: 12px; }
  .report-topbar, .panel-head { flex-direction: column; align-items: stretch; }
  .toolbar { justify-content: flex-start; }
}
@media print {
  body { background: #fff; }
  .report-shell { display: block; padding: 0; }
  .report-nav, .side-panel, .back-to-top, .toolbar, .section-actions, .panel-backdrop { display: none !important; }
  .report-topbar, .section-card { box-shadow: none; border: 0; border-radius: 0; }
  .table-wrap { overflow: visible; }
  table { min-width: 0; }
}
`;

/**
 * 注入整站 CSS 的 `{__html}` 对象，**必须在模块级固定引用**（⚠️ 声明位置必须在 REPORT_CSS 之后，
 * 否则模块初始化时会因 TDZ 报 "Cannot access 'REPORT_CSS' before initialization" 直接白屏）。
 *
 * <p>React 对 `dangerouslySetInnerHTML` 是按**对象引用**比较的（react-dom `updateProperties`：
 * `propKey !== lastProp && setProp(...)`，`setProp` 里直接 `domElement.innerHTML = value.__html`）。
 * 写成字面量 `{{ __html: REPORT_CSS }}` 就等于「每次渲染都重设这 44KB 的 CSS」——
 * 本页滚动联动会高频重渲染，白白重解析样式表；同理，面板/正文的 innerHTML 也会被反复重设，
 * 把滚动位置、注入的 DOM 标记全冲掉。**凡是 dangerouslySetInnerHTML，入参一律 memo 化或提到模块级。**</p>
 */
const REPORT_CSS_HTML = { __html: REPORT_CSS };

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

/**
 * 解析风险对应的正文档位元素
 * <p>优先按 blockCode 命中**整个规则类内容块**（正文块渲染时 DOM id = anchorCode = blockCode，
 * 一条 RULE 块 ↔ 一条风险 1:1）；取不到时才退化为「在本章节目录内按关键词匹配段落」的历史逻辑。</p>
 */
function resolveRiskTarget(item: AIRiskItem): HTMLElement | null {
  if (item.blockCode) {
    const block = document.getElementById(item.blockCode);
    if (block) return block;
  }
  const section = document.getElementById(item.sectionId);
  if (!section) return null;
  const paragraphs = Array.from(section.querySelectorAll<HTMLElement>('.section-body p'));
  return paragraphs.find(p => {
    const text = p.textContent ?? '';
    return item.keywords.some(kw => text.includes(kw));
  }) ?? null;
}

/**
 * 同步正文规则块末尾的「修改记录(N)」按钮
 * <p>它是渲染后注入的**真实 DOM**（不是 pseudo，因为需要可点击），而编辑功能会把整块
 * innerHTML 换成 textarea、保存/取消时再整体写回，所以经手 innerHTML 的三处
 * （绑定、保存、取消）都必须重新同步一次；无修改记录时移除按钮。</p>
 * <p>注入时机必须在 {@code item.bodyHtml} 快照**之后**，否则按钮会被当成正文内容存进编辑快照。</p>
 */
function syncHistoryButton(item: AIRiskItem, block: HTMLElement): void {
  const count = item.editCount ?? 0;
  const existed = block.querySelector<HTMLButtonElement>(':scope > .rpt-history-btn');
  if (count <= 0) {
    existed?.remove();
    return;
  }
  const btn = existed ?? document.createElement('button');
  if (!existed) {
    btn.type = 'button';
    btn.className = 'rpt-history-btn';
    btn.setAttribute('data-ai-risk-history', String(item.id));
    block.appendChild(btn);
  }
  btn.textContent = `修改记录(${count})`;
}

/** 取元素的待编辑纯文本：块级子节点之间补换行，避免多段正文在 textarea 里被压成一行 */
function elementEditableText(el: HTMLElement): string {
  const blocks = Array.from(el.querySelectorAll<HTMLElement>('p, li, tr'));
  const parts = blocks.map(n => (n.textContent ?? '').trim()).filter(Boolean);
  if (parts.length) return parts.join('\n');
  // 兜底：整块 textContent。必须剔除渲染后注入的「修改记录」按钮文字，否则会被当成正文带进编辑框
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.rpt-history-btn').forEach(n => n.remove());
  return (clone.textContent ?? '').trim();
}

/** 编辑结果 → 正文 HTML：先转义，再把换行还原为 <br/>，保证多行内容渲染不塌成一行 */
function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

/**
 * 修改记录里的 contentAfter/contentBefore 存的是正文 HTML 片段（转义 + <br/>），
 * 弹窗里要按纯文本展示，故去掉标签并把常见实体还原回字符。
 */
function editLogPlainText(html: string | undefined): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** 修改时间展示：yyyy-MM-dd HH:mm */
function fmtDateTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * AI 风险表格 HTML
 * <p>行高亮（active）**由数据声明式生成**，不靠渲染后 toggle class ——
 * 该区域是 dangerouslySetInnerHTML，任何一次重渲染（跳转时正文滚动会触发
 * 目录高亮/回到顶部等 setState）都会重写 innerHTML，把命令式加的 class 冲掉。</p>
 */
function aiRiskTableHTML(list: AIRiskItem[], activeId: number | null = null): string {
  const adopted = list.filter(i => i.status === 'adopted').length;
  const invalid = list.filter(i => i.status === 'invalid').length;
  const pending = list.filter(i => i.status === 'pending').length;
  return `
    <div class="ai-risk-toolbar">
      <div>
        <strong>AI风险识别</strong>
        <div class="ai-risk-summary">点击"采纳"正文保留；点击"无效"正文对应内容块整块隐藏且表格行置灰；点击正文 AI 风险块可直接修改。</div>
      </div>
      <div class="ai-risk-summary">总数：${list.length}　已采纳：${adopted}　无效：${invalid}　待处理：${pending}</div>
    </div>
    <div class="table-wrap ai-risk-table">
      <table>
        <thead>
          <tr>
            <th class="ai-risk-op" style="width:66px">操作</th>
            <th style="width:42px;text-align:center">序号</th>
            <th style="width:88px">规则名称</th>
            <th>风险描述</th>
            <th style="width:80px">对应章节</th>
            <th style="width:68px">状态</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              item => `
            <tr class="ai-risk-row ${item.status}${item.id === activeId ? ' active' : ''}" data-ai-risk-row="${item.id}">
              <td class="ai-risk-op">
                <div class="ai-risk-op-btns">
                  <button class="ai-risk-mini-btn ai-risk-adopt-btn" data-ai-risk-action="adopt" data-ai-risk-id="${item.id}" type="button">采纳</button>
                  <button class="ai-risk-mini-btn ai-risk-invalid-btn" data-ai-risk-action="invalid" data-ai-risk-id="${item.id}" type="button">无效</button>
                </div>
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

/* =============================================================================
 * AI 分析全文面板（四种状态）
 * ---------------------------------------------------------------------------
 * 从未分析 → 空态（引导去点面板上方的「智能体分析」）
 * 进行中   → 转圈提示 + 「收起面板」（后台照跑，重新打开凭状态判断）
 * 失败     → 原因（重跑同样走「智能体分析」）
 * 已完成   → 元信息条 + 模型输出的成品 HTML 片段
 * ⚠️ 触发入口已统一到面板顶部的「智能体分析」按钮，面板内不再放任何触发按钮
 * ⚠️ 面板 body 是 dangerouslySetInnerHTML 注入的，按钮靠 data-ai-full-action 做事件委托。
 * ========================================================================== */
function aiFullPanelHTML(item: ReportAiAnalysisItem | null, reading: boolean): string {
  if (reading) {
    return `<div class="ai-full-state">
      <span class="ai-full-spinner"></span>
      <div class="ai-full-state-title">正在读取分析状态…</div>
    </div>`;
  }
  if (!item) {
    return `<div class="ai-full-state">
      <span class="ai-full-state-icon" aria-hidden>◎</span>
      <div class="ai-full-state-title">尚未进行全文分析</div>
      <p class="ai-full-state-desc">点击面板上方的「智能体分析」，将先由大模型输出一份全文分析结论，完成后自动接着生成预警建议。</p>
    </div>`;
  }
  if (item.status === 'RUNNING') {
    return `<div class="ai-full-state">
      <span class="ai-full-spinner"></span>
      <div class="ai-full-state-title">全文分析进行中…</div>
      <p class="ai-full-state-desc">分析在后台运行，收起面板不会中断；稍后重新打开即可查看结果。</p>
      <button class="ai-full-btn ghost" type="button" data-ai-full-action="close">收起面板</button>
    </div>`;
  }
  if (item.status === 'FAILED') {
    return `<div class="ai-full-state is-error">
      <span class="ai-full-state-icon" aria-hidden>!</span>
      <div class="ai-full-state-title">全文分析失败</div>
      <p class="ai-full-state-desc">${escapeHtml(item.failReason || '未返回失败原因')}</p>
      <p class="ai-full-state-desc">需要重跑时，点击面板上方的「智能体分析」。</p>
    </div>`;
  }
  const meta = [
    item.modelName ? `模型 ${escapeHtml(item.modelName)}` : '',
    item.costMillis ? `耗时 ${(item.costMillis / 1000).toFixed(1)}s` : '',
    item.generateTime ? `完成于 ${fmtDateTime(item.generateTime)}` : '',
    item.operatorName ? `由 ${escapeHtml(item.operatorName)} 触发` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="ai-full-result">
    <div class="ai-full-result-bar">
      <span class="ai-full-result-meta" title="${escapeHtml(meta)}">${meta}</span>
    </div>
    <div class="ai-full-result-body">${item.analysisContent ?? ''}</div>
  </div>`;
}

/* =============================================================================
 * AI 预警建议面板（四种状态 + 逐条采纳 / 不采纳）
 * ---------------------------------------------------------------------------
 * 排队中   → 转圈提示（链式触发已预插批次，等全文分析跑完才真正开始）
 * 从未生成 → 空态（引导去点面板上方的「智能体分析」）
 * 进行中   → 转圈提示 + 「收起面板」（后台照跑）
 * 失败     → 原因（重跑同样走「智能体分析」）
 * 已完成   → 核心提示 + 红橙黄统计 + 预警信号表（每行可采纳 / 不采纳）
 * ⚠️ 触发入口已统一到面板顶部的「智能体分析」按钮，面板内不再放任何触发按钮
 * ⚠️ 面板 body 是 dangerouslySetInnerHTML 注入的：
 *     · 按钮靠 data-wa-action / data-ai-full-action 事件委托；
 *     · 行状态用 class 声明式拼进 <tr>，不能在渲染后 toggle（会被重渲染冲掉）。
 * ⚠️ 表格列多（操作 + 模型输出的 7 列 + 状态），侧栏 600px 放不下 ——
 *    先按「横向可滚动」处理，展开（⤢）后基本能整屏看全。
 * ========================================================================== */
/* 等级标签只写颜色（红色/橙色/黄色），不带"预警"二字 */
const WA_LEVEL_TEXT: Record<string, string> = {
  RED: '红色',
  ORANGE: '橙色',
  YELLOW: '黄色',
};

function waStatusBadge(status: string): string {
  if (status === 'ADOPTED') return '<span class="wa-badge is-adopted">已采纳</span>';
  if (status === 'INVALID') return '<span class="wa-badge is-invalid">无效</span>';
  return '<span class="wa-badge is-pending">待处理</span>';
}

function warningAdvicePanelHTML(item: ReportWarningAdviceVO | null, reading: boolean): string {
  if (reading) {
    return `<div class="ai-full-state">
      <span class="ai-full-spinner"></span>
      <div class="ai-full-state-title">正在读取预警建议…</div>
    </div>`;
  }
  if (!item) {
    return `<div class="ai-full-state">
      <span class="ai-full-state-icon" aria-hidden>◈</span>
      <div class="ai-full-state-title">尚未生成预警建议</div>
      <p class="ai-full-state-desc">点击面板上方的「智能体分析」，会先做全文分析，再结合报告正文与风险要点，按《预警管理办法》逐条给出预警建议。</p>
    </div>`;
  }
  if (item.status === 'PENDING') {
    return `<div class="ai-full-state">
      <span class="ai-full-spinner"></span>
      <div class="ai-full-state-title">等待全文分析完成…</div>
      <p class="ai-full-state-desc">预警建议已排队，全文分析一结束就会自动开始；收起面板不会中断。</p>
      <button class="ai-full-btn ghost" type="button" data-ai-full-action="close">收起面板</button>
    </div>`;
  }
  if (item.status === 'RUNNING') {
    return `<div class="ai-full-state">
      <span class="ai-full-spinner"></span>
      <div class="ai-full-state-title">预警建议生成中…</div>
      <p class="ai-full-state-desc">生成在后台运行，收起面板不会中断；稍后重新打开即可查看结果。</p>
      <button class="ai-full-btn ghost" type="button" data-ai-full-action="close">收起面板</button>
    </div>`;
  }
  if (item.status === 'FAILED') {
    return `<div class="ai-full-state is-error">
      <span class="ai-full-state-icon" aria-hidden>!</span>
      <div class="ai-full-state-title">预警建议生成失败</div>
      <p class="ai-full-state-desc">${escapeHtml(item.failReason || '未返回失败原因')}</p>
      <p class="ai-full-state-desc">需要重跑时，点击面板上方的「智能体分析」。</p>
    </div>`;
  }

  const meta = [
    item.modelName ? `模型 ${escapeHtml(item.modelName)}` : '',
    item.costMillis ? `耗时 ${(item.costMillis / 1000).toFixed(1)}s` : '',
    item.generateTime ? `完成于 ${fmtDateTime(item.generateTime)}` : '',
    item.operatorName ? `由 ${escapeHtml(item.operatorName)} 触发` : '',
  ].filter(Boolean).join(' · ');

  const header = `<div class="ai-full-result-bar">
      <span class="ai-full-result-meta" title="${escapeHtml(meta)}">${meta}</span>
    </div>`;

  const coreTip = item.coreTip
    ? `<div class="wa-core-tip"><span class="wa-core-tip-label">核心提示</span>${escapeHtml(item.coreTip)}</div>`
    : '';

  const rows = item.advices ?? [];
  if (!rows.length) {
    return `<div class="ai-full-result">${header}${coreTip}
      <div class="wa-empty">本次未发现预警信号</div>
    </div>`;
  }

  const stats = `<div class="wa-stats">
      <span class="wa-stat is-red">红色预警 <b>${item.redCount ?? 0}</b></span>
      <span class="wa-stat is-orange">橙色预警 <b>${item.orangeCount ?? 0}</b></span>
      <span class="wa-stat is-yellow">黄色预警 <b>${item.yellowCount ?? 0}</b></span>
    </div>`;

  const body = rows
    .map(r => {
      const level = (r.warningLevel ?? '').toUpperCase();
      const status = (r.status ?? 'PENDING').toUpperCase();
      return `<tr class="wa-row is-${status.toLowerCase()}">
        <td class="wa-op" data-stop="1">
          <div class="ai-risk-op-btns">
            <button class="ai-risk-mini-btn ai-risk-adopt-btn" type="button" data-wa-action="adopt" data-wa-id="${r.id}">采纳</button>
            <button class="ai-risk-mini-btn ai-risk-invalid-btn" type="button" data-wa-action="invalid" data-wa-id="${r.id}">无效</button>
          </div>
        </td>
        <td class="wa-seq">${r.seqNo ?? ''}</td>
        <td><span class="wa-level is-${level.toLowerCase()}">${WA_LEVEL_TEXT[level] ?? escapeHtml(r.warningLevel ?? '')}</span></td>
        <td class="wa-text">${escapeHtml(r.signalDesc ?? '')}</td>
        <td class="wa-text">${escapeHtml(r.triggerCondition ?? '')}</td>
        <td class="wa-text">${escapeHtml(r.sourceText ?? '')}</td>
        <td>${waStatusBadge(status)}</td>
      </tr>`;
    })
    .join('');

  return `<div class="ai-full-result">${header}${coreTip}${stats}
    <div class="wa-table-wrap">
      <table class="wa-table">
        <thead>
          <tr>
            <th class="wa-op">操作</th>
            <th style="width:42px;text-align:center">序号</th>
            <th style="width:56px">等级</th>
            <th style="width:146px">预警信号描述</th>
            <th style="width:146px">触发条件/判断依据</th>
            <th style="width:132px">原文依据</th>
            <!-- 「风险点描述」「所在章节/段落」两列：按要求暂时隐藏。
                 7 列宽度合计 646 ≤ 侧栏内容区 ~667（720 − 左右内边距 36 − 竖滚动条），故不再溢出、不需要拖动。
                 恢复方法：去掉下面两个 th 的注释并在数据行补回对应 <td>，同时把 .wa-table 的 min-width 提到 900 左右 -->
            <th style="width:66px">状态</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
}

/* =============================================================================
 * AI 面板外壳：两个页签（全文分析 / 预警建议）
 * ⚠️ 页签按钮同样走事件委托（data-ai-panel-tab）。
 * ========================================================================== */
type AiPanelTab = 'analysis' | 'warning';

function aiPanelHTML(
  tab: AiPanelTab,
  analysis: ReportAiAnalysisItem | null,
  analysisLoading: boolean,
  advice: ReportWarningAdviceVO | null,
  adviceLoading: boolean,
): string {
  const tabBtn = (key: AiPanelTab, label: string) =>
    `<button class="ai-panel-tab${tab === key ? ' is-active' : ''}" type="button" data-ai-panel-tab="${key}">${label}</button>`;
  const body = tab === 'warning'
    ? warningAdvicePanelHTML(advice, adviceLoading)
    : aiFullPanelHTML(analysis, analysisLoading);
  return `<div class="ai-panel-tabs">${tabBtn('analysis', '全文分析')}${tabBtn('warning', '预警建议')}</div>
    <div class="ai-panel-body">${body}</div>`;
}

function downloadWord(filename: string, title: string, bodyHtml: string) {
  const content = `<html><head><meta charset="utf-8"><style>
    body{font-family:"Microsoft YaHei",sans-serif;color:#10233f;line-height:1.7}
    h1{font-size:22pt}h2,h3{margin-top:18pt}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin:10pt 0}
    th,td{border:1px solid #cbd5e1;padding:7pt;vertical-align:top;word-break:break-word;font-size:10.5pt}
    th{background:#eff6ff}button,input{display:none!important}.table-title{font-weight:bold;margin-top:14pt}
    /* 被置为「无效」的风险内容不参与导出（页面上是整块隐藏，导出需保持一致） */
    .ai-risk-paragraph.invalid{display:none!important}
    .ai-risk-paragraph{position:static;border:0;background:none;padding:0}
    .ai-risk-paragraph::before{content:none}
    .ai-risk-edit-actions{display:none!important}
    .rpt-history-btn{display:none!important}
    /* 合规提示条：Word 不认 flex/渐变，拉平为普通带框段落，隐藏图标（svg 渲染不可控）；文案保持加粗 */
    .report-disclaimer{display:block!important;border:1px solid #d9a13a;border-left:4px solid #d98b0a;background:#fff6e6;padding:9pt 11pt;margin:0 0 10pt}
    .report-disclaimer-icon{display:none!important}
    .report-disclaimer-text{margin:0;font-size:11pt;font-weight:bold;line-height:1.7;color:#6b4306}
  </style></head><body><h1>${escapeHtml(title)}</h1>${bodyHtml}</body></html>`;
  const blob = new Blob([content], { type: 'application/msword;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* =============================================================================
 * 加载态 / 错误态的共用外壳
 * ---------------------------------------------------------------------------
 * ⚠️ 必须在这里一并注入 REPORT_CSS：loading / error 两个分支是**提前 return**，
 * 主分支里的 `<style>` 根本不会渲染 → 样式完全不生效。
 * 历史上「报告加载中」没有居中、没有卡片样式，根因就是这个（不是 CSS 写错了）。
 * ========================================================================== */
function ReportStateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="report-root">
      <style dangerouslySetInnerHTML={REPORT_CSS_HTML} />
      <div className="report-state">{children}</div>
    </div>
  );
}

/* =============================================================================
 * 章节卡片（memo 化）
 * ---------------------------------------------------------------------------
 * ⚠️ 必须 memo：正文是通过 dangerouslySetInnerHTML 注入的，而「AI风险」标识 /
 * 采纳·无效状态 / 就地编辑态都是**渲染后按 blockCode 打在真实 DOM 上的**。
 * 若父组件每次状态变化（目录高亮 activeSectionKey、回到顶部 showBackToTop、
 * toast、侧栏开关、版本轮询等）都让本卡片重渲染，React 会重写 section-body 的
 * innerHTML，把这些标记整块冲掉 —— 这正是「正文规则块看不到 AI风险标识、
 * 点不动、编辑不了」的根因。
 * ========================================================================== */
const SectionCard = memo(function SectionCard({ item }: { item: SectionItem }) {
  // ⚠️ 同上：入参对象必须 memo 化（React 按引用比较 dangerouslySetInnerHTML），
  //    否则 item 引用一变、哪怕 HTML 一字未改也会重设 innerHTML，把注入的标记冲掉
  const bodyHtml = useMemo(() => ({ __html: item.contentHtml }), [item.contentHtml]);
  return (
    <article id={item.id} className="section-card" data-module-id={item.id}>
      <h3>{item.title}</h3>
      {/* 溯源按钮不再单独渲染：它本身就是内容块（SOURCE_LINK），已在正文中渲染为外链按钮 */}
      <div className="section-body" dangerouslySetInnerHTML={bodyHtml} />
    </article>
  );
});

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
    aiAnalysis,
    aiAnalysisLoading,
    startAiChain,
    reloadAiAnalysis,
    warningAdvice,
    warningAdviceLoading,
    reloadWarningAdvice,
    setWarningAdvice,
    setAIRiskList,
    versions,
    currentReportNo,
    selectVersion,
    runningVersion,
    renewing,
    renew,
    reload,
    completedVersion,
    failedVersion,
    clearFailed,
  } = useReportInstanceApi(checkTaskNo);

  // 版本下拉只展示"进行中 + 已完成"，过滤掉失败（999）的记录
  const displayVersions = useMemo(() => versions.filter(v => v.status !== '999'), [versions]);

  /* ---- 状态 ---- */
  const [filterDynamicOnly, setFilterDynamicOnly] = useState(false);
  const [activeSectionKey, setActiveSectionKey] = useState<string>(sections[0]?.id ?? '');
  // 默认收起右侧栏（按需求 #1：默认不展示）
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>('collapsed');
  const [sidePanelContent, setSidePanelContent] = useState<SidePanelContent>({ type: 'aiRisk' });
  const [editingAIRiskId, setEditingAIRiskId] = useState<number | null>(null);
  const [activeAIRiskId, setActiveAIRiskId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  /** 报告编号复制按钮的「已复制」瞬时反馈 */
  const [copiedReportNo, setCopiedReportNo] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  /** AI 面板当前页签：全文分析 / 预警建议（两个页签在同一侧栏面板内切换） */
  const [aiPanelTab, setAiPanelTab] = useState<AiPanelTab>('analysis');

  /** 「修改记录」弹窗状态（null = 关闭；懒加载，点开才请求） */
  const [editHistory, setEditHistory] = useState<{
    ruleName: string;
    loading: boolean;
    list: ReportRiskEditLogItem[];
    error?: string;
  } | null>(null);

  /** 更新报告的结果提示弹框（居中）：生成完成 / 生成失败 */
  const [resultModal, setResultModal] = useState<{ type: 'success' | 'failed'; failReason?: string } | null>(null);

  /* 滚动容器（report-shell） — 全报告的滚动只发生在这里 */
  const shellRef = useRef<HTMLDivElement | null>(null);

  /* 左侧目录是否收起：收起后 grid 不再留列，宽度全部让给正文（localStorage 记忆，刷新保持） */
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
    } catch {
      // 隐私模式 / 存储被禁用时读会抛，按展开处理
      return false;
    }
  });
  const toggleNav = useCallback(() => {
    setNavCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // 写失败只影响"记住状态"，不影响本次收起/展开
      }
      return next;
    });
  }, []);

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
      // 同时兼容"内部容器滚动"与"窗口滚动"两种情形（避免某层高度未被约束时按钮不出现）
      const scrollTop = Math.max(container.scrollTop, window.scrollY || document.documentElement.scrollTop || 0);
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
      // 下滑超过一屏的一小部分即出现"回到顶部"
      setShowBackToTop(scrollTop > 200);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [visibleSections]);

  /* ---- 回到顶部（同时兼容容器内滚动与整页滚动） ---- */
  const scrollToTop = useCallback(() => {
    shellRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ---- AI 风险正文定位绑定（按 blockCode 命中整个规则类内容块） ---- */
  useEffect(() => {
    // ⚠️ 必须等 loading 结束再绑定：loading 期间组件提前 return 加载态，章节还没挂到 DOM 上，
    // 此时绑定什么也命中不了；而 loading 结束后 aiRiskList / visibleSections 的引用不再变化，
    // 若依赖里不带 loading，本 effect 就不会重跑 → 正文规则块上永远不会出现「AI风险」标识与编辑入口。
    if (loading) return;
    aiRiskList.forEach(item => {
      const target = resolveRiskTarget(item);
      if (!target) return;
      // 正在编辑的块不动它，否则会把 textarea 的编辑态刷掉
      if (target.classList.contains('editing')) return;
      if (!item.bodyHtml) {
        item.bodyHtml = target.innerHTML;
        item.bodyText = elementEditableText(target);
      }
      target.classList.add('ai-risk-paragraph');
      target.setAttribute('data-ai-risk-id', String(item.id));
      target.setAttribute('title', '点击可直接修改该风险内容');
      target.classList.remove('adopted', 'invalid');
      if (item.status === 'adopted') target.classList.add('adopted');
      if (item.status === 'invalid') target.classList.add('invalid');
      // 放在 bodyHtml 快照之后注入，避免「修改记录」按钮被当成正文存进编辑快照
      syncHistoryButton(item, target);
    });
  }, [aiRiskList, visibleSections, loading]);

  /* ---- 「当前定位」常驻高亮：与侧栏选中行（activeAIRiskId）双向联动 ----
     点击侧栏某行 → 正文对应规则块加 .ai-risk-located（琥珀底 + 左色条 + 外圈 + “当前定位”角标），
     与“普通正文 / 普通淡蓝规则块”拉开层级；点另一行会自动把上一个的定位态摘掉。 */
  useEffect(() => {
    if (loading) return;
    document.querySelectorAll<HTMLElement>('.rpt-block.ai-risk-located')
      .forEach(el => el.classList.remove('ai-risk-located'));
    if (activeAIRiskId == null) return;
    const item = aiRiskList.find(r => r.id === activeAIRiskId);
    if (!item) return;
    resolveRiskTarget(item)?.classList.add('ai-risk-located');
  }, [activeAIRiskId, aiRiskList, loading]);

  /* ---- Toast（message + 语义类型，决定图标与配色） ---- */
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  /* ---- AI 风险状态切换（采纳 / 无效）：乐观更新 + 落库 + 失败回滚 ---- */
  const setAIRiskStatus = useCallback(
    async (id: number, status: AIRiskStatus) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item || !currentReportNo) return;

      const prevStatus = item.status;
      const target = resolveRiskTarget(item);

      /** 把状态落到 UI（内存 + DOM class），供乐观更新与回滚复用 */
      const applyStatus = (next: AIRiskStatus) => {
        item.status = next;
        if (target) {
          target.classList.remove('adopted', 'invalid', 'editing');
          if (next === 'adopted') target.classList.add('adopted');
          if (next === 'invalid') target.classList.add('invalid');
        }
        setAIRiskList(prev => [...prev]);
      };

      // ① 乐观更新：先反馈，再请求
      applyStatus(status);
      if (editingAIRiskId === id) setEditingAIRiskId(null);
      if (status === 'adopted' && target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('ai-risk-flash');
        window.setTimeout(() => target.classList.remove('ai-risk-flash'), 1500);
      }

      // ② 落库（行身份 = reportNo + blockCode）
      try {
        if (!item.blockCode) {
          throw new Error('该风险缺少内容块编号，无法保存');
        }
        await reportApi.instanceRiskStatus(currentReportNo, item.blockCode, status.toUpperCase());
        showToast(
          status === 'adopted' ? '已采纳' : '已标记为无效',
          status === 'adopted' ? 'success' : 'info',
        );
      } catch (e: any) {
        // ③ 失败回滚
        applyStatus(prevStatus);
        showToast(e?.message || '操作失败，请重试', 'error');
      }
    },
    [aiRiskList, editingAIRiskId, setAIRiskList, showToast, currentReportNo],
  );

  /* ---- 「修改记录」弹窗：点击行内按钮才拉取（）
     归档维度是「同日检流水号 + 同风险要点」，故用 checkTaskNo + blockCode 查询，
     同一日检流水号下各版本的修改历史都会返回（跨版本可追溯）。 ---- */
  const openEditHistory = useCallback(
    async (id: number) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item?.blockCode || !checkTaskNo) return;
      const ruleName = item.ruleName;
      setEditHistory({ ruleName, loading: true, list: [] });
      try {
        const res = await reportApi.instanceBlockEditHistory(checkTaskNo, item.blockCode);
        setEditHistory({ ruleName, loading: false, list: res.data ?? [] });
      } catch (e: any) {
        setEditHistory({ ruleName, loading: false, list: [], error: e?.message || '修改记录加载失败' });
      }
    },
    [aiRiskList, checkTaskNo],
  );

  /** 修改记录弹窗的概览统计（次数 / 人数 / 最近一次时间），仅用于弹窗头部展示。
   *  排除后端置顶补的「原始版本」条目 —— 它不是一次人工修改，不计入次数与人数。
   *  列表是「时间正序（最早在上）」，取"最近"不能靠下标，须按时间比较（避免顺序一变就取反）。 */
  const editHistorySummary = useMemo(() => {
    const list = (editHistory?.list ?? []).filter(l => l.original !== true);
    if (!list.length) return null;
    const people = new Set(list.map(l => l.operatorName || l.operatorNo || '未知用户'));
    const newest = [...list].sort(
      (a, b) => new Date(b.inputtime ?? 0).getTime() - new Date(a.inputtime ?? 0).getTime(),
    )[0];
    return {
      count: list.length,
      people: people.size,
      latest: fmtDateTime(newest?.inputtime),
    };
  }, [editHistory]);

  /* ---- 表格行点击：定位到正文 ---- */
  const locateAIRisk = useCallback(
    (id: number, flash = true) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item) return;
      if (item.status === 'invalid') {
        showToast('该风险已标记为无效，正文中不展示');
        return;
      }
      const body = resolveRiskTarget(item);
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

  /* ---- 规则类正文块点击进入编辑（整块为一个编辑单元） ---- */
  const editAIRiskParagraph = useCallback(
    (id: number) => {
      const item = aiRiskList.find(r => r.id === id);
      if (!item || item.status === 'invalid') return;
      const para = resolveRiskTarget(item);
      if (!para || para.classList.contains('editing')) return;

      const currentText = elementEditableText(para);
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

  /* 保存正文：落库（同事务同步 riskDesc）→ 成功保持乐观态，失败回滚为原文 */
  const saveAIRiskParagraph = useCallback(
    async (id: number) => {
      const item = aiRiskList.find(r => r.id === id);
      const para = item ? resolveRiskTarget(item) : null;
      if (!item || !para || !currentReportNo) return;
      const textarea = para.querySelector<HTMLTextAreaElement>('textarea');
      if (!textarea) return;
      const value = textarea.value.trim();
      if (!value) {
        showToast('正文内容不能为空', 'error');
        return;
      }

      const nextHtml = textToHtml(value);
      const prevHtml = item.bodyHtml;
      const prevText = item.bodyText;
      const prevStatus = item.status;
      const prevDesc = item.riskDesc;
      // 后端「内容没变则不写归档」，前端按同一口径决定是否给修改记录数 +1
      const contentChanged = nextHtml !== (prevHtml ?? '');

      // ① 乐观更新：先呈现新文案（列表与正文为同一份文案，一并更新）
      item.bodyText = value;
      item.bodyHtml = nextHtml;
      item.riskDesc = value;
      item.status = 'adopted';
      para.classList.remove('editing', 'invalid');
      para.classList.add('adopted');
      para.innerHTML = nextHtml;
      // innerHTML 被整体换掉，重新挂回「修改记录(N)」按钮
      syncHistoryButton(item, para);
      setAIRiskList(prev => [...prev]);
      setEditingAIRiskId(null);

      // ② 落库
      try {
        if (!item.blockCode) {
          throw new Error('该内容块缺少编号，无法保存');
        }
        await reportApi.instanceBlockContent(currentReportNo, item.blockCode, nextHtml);
        if (contentChanged) {
          item.editCount = (item.editCount ?? 0) + 1;
          syncHistoryButton(item, para);
          setAIRiskList(prev => [...prev]);
        }
        showToast('正文已保存', 'success');
      } catch (e: any) {
        // ③ 失败回滚为编辑前的内容与状态
        item.bodyHtml = prevHtml;
        item.bodyText = prevText;
        item.riskDesc = prevDesc;
        item.status = prevStatus;
        para.classList.remove('adopted');
        if (prevStatus === 'invalid') para.classList.add('invalid');
        para.innerHTML = prevHtml ?? '';
        syncHistoryButton(item, para);
        setAIRiskList(prev => [...prev]);
        showToast(e?.message || '正文保存失败，已恢复为修改前内容', 'error');
      }
    },
    [aiRiskList, setAIRiskList, showToast, currentReportNo],
  );

  const cancelAIRiskParagraph = useCallback(
    (id: number) => {
      const item = aiRiskList.find(r => r.id === id);
      const para = item ? resolveRiskTarget(item) : null;
      if (!para || !item) return;
      para.classList.remove('editing');
      // 恢复原文
      if (item.status === 'invalid') {
        para.classList.add('invalid');
      } else if (item.status === 'adopted') {
        para.classList.add('adopted');
      }
      para.innerHTML = item.bodyHtml ?? escapeHtml(item.bodyText ?? '');
      // innerHTML 被整体还原，重新挂回「修改记录(N)」按钮
      syncHistoryButton(item, para);
      setEditingAIRiskId(null);
    },
    [aiRiskList],
  );

  /* ---- 侧栏操作 ---- */
  const openSidePanel = useCallback((mode: SidePanelMode, content: SidePanelContent) => {
    setSidePanelMode(mode);
    setSidePanelContent(content);
  }, []);

  /* 顶栏两个入口默认都打开「侧边栏」（normal 嵌入第三列），不再直接铺成大浮层；
     需要全屏时点侧栏标题栏的 ⤢ 展开即可。 */
  const showAIRiskPanel = useCallback(() => {
    openSidePanel('normal', { type: 'aiRisk' });
  }, [openSidePanel]);

  const showAIFullAnalysis = useCallback(() => {
    openSidePanel('normal', { type: 'aiFull' });
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

  /* ---- 顶栏：复制当前版本的报告编号（图标按钮，无文字；成功后图标短暂变 ✓） ---- */
  const copyReportNo = useCallback(async () => {
    const value = currentReportNo;
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // 兜底：非安全上下文（http 非 localhost）下 Clipboard API 不可用
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedReportNo(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedReportNo(false), 1400);
    } catch {
      showToast('复制失败，请手动选择复制', 'error');
    }
  }, [currentReportNo, showToast]);

  /** 整条链是否有任务在跑：全文分析进行中，或预警建议排队中/进行中（链式触发会先排一条 PENDING） */
  const chainRunning = aiAnalysis?.status === 'RUNNING'
    || warningAdvice?.status === 'RUNNING'
    || warningAdvice?.status === 'PENDING';

  /* ---- 一键串行（侧边面板顶部的「智能体分析」按钮）----
   * 按钮就在面板里，点它即触发整条链（全文分析 → 预警建议），不需要再"打开面板"。
   * 进行中时按钮本身 disabled，这里再兜一道；已有成功结果时用确认框提示会重新生成，
   * 避免误点白跑一次模型调用（历史记录会保留，符合这批任务"保留多次"的一贯口径）。
   */
  const handleAiChain = useCallback(() => {
    if (chainRunning) {
      return;
    }

    const hasResult = aiAnalysis?.status === 'DONE';
    Modal.confirm({
      title: hasResult ? '重新进行智能体分析' : '智能体分析',
      centered: true,
      content: (hasResult
        ? '该报告已完成过智能体分析。重新执行会生成一份新的全文分析与预警建议（历史记录保留）。'
        : '将先对整份报告做全文分析，完成后自动接着依据《预警管理办法》生成预警建议。')
        + '两步都在后台运行、耗时可能较长，期间可收起面板继续浏览报告。确认开始吗？',
      okText: hasResult ? '重新分析' : '开始分析',
      cancelText: '取消',
      onOk: async () => {
        try {
          await startAiChain();
          showToast('已提交，智能体分析进行中', 'success');
        } catch (e: any) {
          // 链级防重时后端返回「分析进行中，请稍后再试」
          showToast(e?.message || '发起分析失败', 'error');
          // 顺手刷新，让面板切到真实状态
          void reloadAiAnalysis();
          void reloadWarningAdvice();
        }
      },
    });
  }, [chainRunning, aiAnalysis?.status, startAiChain,
    reloadAiAnalysis, reloadWarningAdvice, showToast]);

  /**
   * 采纳 / 无效 / 恢复待处理（乐观更新 + 失败回滚）
   * <p>面板 body 是 dangerouslySetInnerHTML 注入的，状态必须走 state 重渲染，
   * 不能在 DOM 上 command 式改 class（会被重渲染冲掉）。</p>
   */
  const setWarningAdviceStatus = useCallback(
    async (adviceId: number, status: 'adopted' | 'invalid' | 'pending') => {
      const current = warningAdvice;
      if (!current || !current.advices) return;
      const index = current.advices.findIndex(a => a.id === adviceId);
      if (index < 0) return;
      const target = current.advices[index];
      const prevStatus: 'ADOPTED' | 'INVALID' | 'PENDING' = target.status ?? 'PENDING';
      const nextCode: 'ADOPTED' | 'INVALID' | 'PENDING' =
        status === 'adopted' ? 'ADOPTED' : status === 'invalid' ? 'INVALID' : 'PENDING';
      if (prevStatus === nextCode) return;

      // ① 乐观更新：先改 UI
      setWarningAdvice({
        ...current,
        advices: current.advices.map(a => (a.id === adviceId ? { ...a, status: nextCode } : a)),
      });

      // ② 落库
      try {
        await reportApi.instanceWarningAdviceStatus(adviceId, nextCode);
        showToast(
          status === 'adopted' ? '已采纳' : status === 'invalid' ? '已标记为无效' : '已恢复为待处理',
          status === 'invalid' ? 'info' : 'success',
        );
      } catch (e: any) {
        // ③ 失败回滚
        setWarningAdvice({
          ...current,
          advices: current.advices.map(a => (a.id === adviceId ? { ...a, status: prevStatus } : a)),
        });
        showToast(e?.message || '操作失败，请重试', 'error');
      }
    },
    [warningAdvice, setWarningAdvice, showToast],
  );

  /* ---- 顶栏按钮：word 下载 ---- */
  const handleDownload = useCallback(() => {
    // 免责声明不在 .section-card 里，必须单独取出来放到最前，否则导出的 Word 会漏掉它
    const disclaimerHtml = document.querySelector<HTMLElement>('.report-disclaimer')?.outerHTML ?? '';
    const sectionsHtml = Array.from(document.querySelectorAll<HTMLElement>('.section-card'))
      .map(section => section.innerHTML)
      .join('<hr />');
    const bodyHtml = [disclaimerHtml, sectionsHtml].filter(Boolean).join('<hr />');
    downloadWord(`${reportMeta.companyName}-日常贷后检查报告.doc`, `${reportMeta.companyName} ${reportMeta.subtitle}`, bodyHtml);
  }, [reportMeta]);

  /* ---- 顶栏：更新报告（新建版本，后端异步生成；先弹框二次确认） ---- */
  const handleRenew = useCallback(() => {
    // 新版本号 = 该流水号下已有版本号最大值 + 1（仅用于提示文案）
    const nextVersion = Math.max(0, ...versions.map(v => v.version ?? 0)) + 1;
    Modal.confirm({
      title: '更新报告',
      content: (
        <div style={{ lineHeight: 1.9 }}>
          <div>
            将在当前日检流水号（<strong>{checkTaskNo || '-'}</strong>）下生成一份新版本报告
            <strong> V{nextVersion}</strong>。
          </div>
          <div style={{ color: '#8c8c8c', fontSize: 13 }}>
            报告由后台异步生成，提交后可继续查看历史版本，生成完成后会弹框提示。
          </div>
        </div>
      ),
      okText: '确认更新',
      cancelText: '取消',
      onOk: async () => {
        try {
          await renew();
          showToast('已提交，新报告生成中', 'success');
        } catch (e: any) {
          showToast(e?.message || '更新报告失败', 'error');
        }
      },
    });
  }, [versions, checkTaskNo, renew, showToast]);

  /* ---- 新报告生成完成 → 打开居中结果弹框（确认后刷新到新版本） ---- */
  useEffect(() => {
    if (!completedVersion) return;
    setResultModal({ type: 'success' });
  }, [completedVersion]);

  /* ---- 新报告生成失败 → 打开居中结果弹框（附失败原因） ---- */
  useEffect(() => {
    if (!failedVersion) return;
    setResultModal({ type: 'failed', failReason: failedVersion.failReason });
  }, [failedVersion]);

  /* ---- 结果弹框「确认」：成功→刷新到新版本；失败→关闭提示 ---- */
  const handleResultOk = useCallback(() => {
    const type = resultModal?.type;
    setResultModal(null);
    if (type === 'success') {
      reload();
    } else {
      clearFailed();
    }
  }, [resultModal, reload, clearFailed]);

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
      // 正文规则块末尾的「修改记录(N)」按钮：打开历史弹窗，不进入编辑（必须排在段落分支之前）
      const historyBtn = target.closest<HTMLElement>('[data-ai-risk-history]');
      if (historyBtn) {
        event.stopPropagation();
        openEditHistory(Number(historyBtn.getAttribute('data-ai-risk-history')));
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
    [editAIRiskParagraph, saveAIRiskParagraph, cancelAIRiskParagraph, openEditHistory, sections, showProvenance],
  );

  /**
   * 面板滚动位置守卫。
   *
   * <p>侧栏 body 是 `dangerouslySetInnerHTML` 注入的一整段 HTML，**每次数据变化都会整段重建**：
   * 内层滚动容器（预警建议表是 `.wa-table-wrap`）是新建的元素，`scrollTop` 必然从 0 开始
   * —— 表现就是「点一下采纳/无效，表格嗖地回到最上面」，如果点的是第 20 条会非常难受。</p>
   *
   * <p>所以：在触发重渲染**之前**记住位置（{@link rememberPanelScroll}），
   * 在 commit 之后、**绘制之前**用 layout effect 还回去（同一次点击只还一次，不留痕迹、不闪）。</p>
   */
  const panelScrollGuardRef = useRef<{
    wrapNode: HTMLElement | null; wrapTop: number;
    bodyTop: number;
    tab: AiPanelTab; until: number;
  } | null>(null);

  /** 记住当前面板滚动位置（必须在 setState 之前调用，重渲染后 DOM 就换了） */
  const rememberPanelScroll = useCallback(() => {
    const bodyEl = document.getElementById('side-panel-content');
    if (!bodyEl) return;
    const wrapEl = bodyEl.querySelector<HTMLElement>('.wa-table-wrap');
    panelScrollGuardRef.current = {
      wrapNode: wrapEl,
      wrapTop: wrapEl ? wrapEl.scrollTop : 0,
      bodyTop: bodyEl.scrollTop,
      tab: aiPanelTab,
      // 一次点击可能连着触发多次重渲染（乐观更新 → 接口回来 → toast），守卫活 3 秒兜住
      until: Date.now() + 3000,
    };
  }, [aiPanelTab]);

  /** ---- 侧栏事件代理 ---- */
  const onSidePanelClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // AI 面板页签切换（全文分析 / 预警建议）
      const tabBtn = target.closest<HTMLElement>('[data-ai-panel-tab]');
      if (tabBtn) {
        event.stopPropagation();
        const tab = tabBtn.getAttribute('data-ai-panel-tab');
        setAiPanelTab(tab === 'warning' ? 'warning' : 'analysis');
        return;
      }
      // 预警建议面板：逐条采纳与无效（触发按钮已移到面板顶部的「智能体分析」）
      const waBtn = target.closest<HTMLElement>('[data-wa-action]');
      if (waBtn) {
        event.stopPropagation();
        const action = waBtn.getAttribute('data-wa-action');
        if (action === 'adopt' || action === 'invalid') {
          // 原地更新，不能把用户看了半天的位置甩回最上面
          rememberPanelScroll();
          setWarningAdviceStatus(Number(waBtn.getAttribute('data-wa-id')),
            action === 'adopt' ? 'adopted' : 'invalid');
        }
        return;
      }
      // AI 全文分析面板：只剩「收起面板」（触发按钮已移到面板顶部的「智能体分析」）
      const aiFullBtn = target.closest<HTMLElement>('[data-ai-full-action]');
      if (aiFullBtn) {
        event.stopPropagation();
        if (aiFullBtn.getAttribute('data-ai-full-action') === 'close') collapsePanel();
        return;
      }
      const actionBtn = target.closest<HTMLElement>('[data-ai-risk-action]');
      if (actionBtn) {
        const id = Number(actionBtn.getAttribute('data-ai-risk-id'));
        const action = actionBtn.getAttribute('data-ai-risk-action');
        // AI 风险清单表同样是整段 HTML 重建，同样要把滚动位置捞回来
        rememberPanelScroll();
        setAIRiskStatus(id, action === 'adopt' ? 'adopted' : 'invalid');
        return;
      }
      // 「修改记录(N)」按钮：打开历史弹窗，不触发行跳转
      const historyBtn = target.closest<HTMLElement>('[data-ai-risk-history]');
      if (historyBtn) {
        event.stopPropagation();
        openEditHistory(Number(historyBtn.getAttribute('data-ai-risk-history')));
        return;
      }
      // 整行任意位置都可点击跳转（含「操作」列的空白区）；两个按钮已在上面的分支拦截
      const row = target.closest<HTMLElement>('[data-ai-risk-row]');
      if (row) {
        const id = Number(row.getAttribute('data-ai-risk-row'));
        locateAIRisk(id, true);
      }
    },
    [setAIRiskStatus, locateAIRisk, openEditHistory, collapsePanel, setWarningAdviceStatus, rememberPanelScroll],
  );

  /* ---- 侧栏标题与内容 ---- */
  const sidePanelTitle = useMemo(() => {
    if (sidePanelContent.type === 'aiRisk') return 'AI风险识别';
    // aiFull 面板不给标题：面板里已有「全文分析 / 预警建议」两个页签，再挂一个标题是重复
    if (sidePanelContent.type === 'aiFull') return '';
    return `${sidePanelContent.moduleTitle} / 溯源信息`;
  }, [sidePanelContent]);

  const sidePanelBody = useMemo(() => {
    // 行高亮随数据一起生成（activeAIRiskId 参与），避免被重渲染冲掉
    if (sidePanelContent.type === 'aiRisk') return aiRiskTableHTML(aiRiskList, activeAIRiskId);
    if (sidePanelContent.type === 'aiFull') {
      return aiPanelHTML(aiPanelTab, aiAnalysis, aiAnalysisLoading, warningAdvice, warningAdviceLoading);
    }
    return sourcePanelHtml(sourceTemplates[sidePanelContent.moduleId] ?? []);
  }, [sidePanelContent, aiRiskList, aiAnalysis, aiAnalysisLoading,
      aiPanelTab, warningAdvice, warningAdviceLoading, sourceTemplates, activeAIRiskId]);

  /**
   * ⚠️ `dangerouslySetInnerHTML` 的入参**必须 memo 化**，不能每次渲染都写字面量对象。
   *
   * <p>React 19 对它是**按对象引用**比较的（react-dom 源码 `updateProperties` 里
   * `propKey !== lastProp && setProp(...)`，`setProp` 里直接 `domElement.innerHTML = value.__html`）。
   * 写字面量 `{__html: sidePanelBody}` 意味着"每次渲染都是新对象" → **每次渲染都把整段 innerHTML 重设一遍**
   * → 面板里表格的滚动位置、选中态等所有 DOM 状态全被冲掉（点采纳/无效后表格跳回顶部就是这么来的）。</p>
   *
   * <p>memo 之后只有内容真的变了才重设 DOM，无关重渲染（toast、滚动联动、轮询）都不再动它。</p>
   */
  const sidePanelBodyHtml = useMemo(() => ({ __html: sidePanelBody }), [sidePanelBody]);

  /**
   * DOM 重建后把面板滚动位置还回去（内容真的变了时兜底）。
   *
   * <p>用 layout effect（不是 useEffect）：它在 React 换掉 innerHTML 之后、浏览器**绘制之前**同步执行，
   * 所以看不到"先跳到顶部再弹回来"的闪动。不写依赖数组 = 每次渲染后都检查一遍，
   * 因为内容变化的时机不止 `sidePanelBody` 一个来源。</p>
   *
   * <p>只在「同一个页签 + 距上次动作 3 秒内 + 滚动容器的 DOM 节点被换掉了」时才还原：
   * 节点没换说明位置本来就还在（用户可能刚自己滚过），这时去设置反而会把用户拽回去。</p>
   */
  useLayoutEffect(() => {
    const guard = panelScrollGuardRef.current;
    if (!guard) return;
    if (guard.tab !== aiPanelTab || Date.now() > guard.until) {
      panelScrollGuardRef.current = null;
      return;
    }
    const bodyEl = document.getElementById('side-panel-content');
    if (!bodyEl) return;
    const wrapEl = bodyEl.querySelector<HTMLElement>('.wa-table-wrap');
    if (wrapEl && guard.wrapTop > 0 && wrapEl !== guard.wrapNode) {
      wrapEl.scrollTop = guard.wrapTop;
      guard.wrapNode = wrapEl;
    }
    if (guard.bodyTop > 0 && bodyEl.scrollTop === 0) {
      bodyEl.scrollTop = guard.bodyTop;
    }
  });

  /* ---- Loading ---- */
  if (loading) {
    return (
      <ReportStateShell>
        <div className="report-state-card">
          <span className="report-state-spinner" aria-hidden />
          <div className="report-state-text">报告加载中…</div>
          <div className="report-state-hint">正在按模板组装报告内容，请稍候</div>
        </div>
      </ReportStateShell>
    );
  }

  if (error) {
    return (
      <ReportStateShell>
        <div className="report-error">
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>报告加载失败</p>
          <p className="muted">{error}</p>
          <p className="muted" style={{ marginTop: 10 }}>
            请确认后端已启动、该日检流水号（checkTaskNo={checkTaskNo}）下已有报告记录，且已完成生成加工。
          </p>
        </div>
      </ReportStateShell>
    );
  }

  return (
    <div className="report-root">
      {/* 全局 CSS 注入 */}
      <style dangerouslySetInnerHTML={REPORT_CSS_HTML} />

      <div
        ref={shellRef}
        className={`report-shell ${sidePanelEmbedded ? 'with-side' : ''} ${navCollapsed ? 'nav-collapsed' : ''}`}
      >
        {/* 左：目录（可收起；收起后整列不渲染，宽度让给正文 / 侧栏） */}
        {!navCollapsed && (
          <aside className="report-nav panel">
            <div className="panel-head sticky-head">
              <h2>报告目录</h2>
              <button
                className="nav-toggle-btn"
                type="button"
                onClick={toggleNav}
                title="收起目录"
                aria-label="收起目录"
              >
                ‹
              </button>
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
        )}

        {/* 中：报告主体 */}
        <main className="report-main">
          <header className="report-topbar panel">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <h1 className="report-company-title">{reportMeta.companyName}</h1>
                {displayVersions.length > 1 && (
                  <Select
                    value={currentReportNo}
                    onChange={selectVersion}
                    style={{ minWidth: 260 }}
                    placeholder="选择版本"
                    options={displayVersions.map(v => ({
                      value: v.reportNo,
                      // 进行中的版本排在最前，标注"生成中"且不可选（尚无正文内容）
                      label: v.status === '000'
                        ? `${fmtVersion(v.version)}（${v.reportNo}）· 生成中`
                        : (v.version != null ? `${fmtVersion(v.version)}（${v.reportNo}）` : v.reportNo),
                      disabled: v.status === '000',
                    }))}
                  />
                )}
                {/* 复制报告编号：图标按钮，不给文字；点一下复制当前版本的 reportNo */}
                {!!currentReportNo && (
                  <button
                    className={`copy-btn ${copiedReportNo ? 'copied' : ''}`}
                    type="button"
                    title={copiedReportNo ? '已复制' : '复制报告编号'}
                    aria-label="复制报告编号"
                    onClick={copyReportNo}
                  >
                    {copiedReportNo ? <CheckOutlined /> : <CopyOutlined />}
                  </button>
                )}
              </div>
              <p className="report-page-subtitle">{reportMeta.subtitle}</p>
              <div className="sample-badge">{reportMeta.sampleText}</div>
            </div>
            <div className="toolbar">
              <button className="ghost-btn" type="button" style={{ marginRight: 'auto' }} onClick={() => navigate('/reports')}>
                ← 返回列表
              </button>
              {/* 目录开关：目录收起后自身不可见，必须留一个常驻入口才能再展开 */}
              <button
                className="ghost-btn"
                type="button"
                onClick={toggleNav}
                title={navCollapsed ? '展开左侧报告目录' : '收起左侧报告目录'}
              >
                {navCollapsed ? '显示目录' : '收起目录'}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={renewing || !!runningVersion}
                onClick={handleRenew}
                title={runningVersion ? '已有报告正在生成中' : '在该日检流水号下生成一份新版本报告'}
              >
                {renewing ? '提交中…' : '更新报告'}
              </button>
              <button className="ghost-btn ai-risk-btn" type="button" onClick={showAIRiskPanel}>
                AI风险识别
              </button>
              <button className="ghost-btn" type="button" onClick={showAIFullAnalysis}>
                AI预警建议
              </button>
              <button className="primary-btn" type="button" onClick={handleDownload}>
                下载 Word
              </button>
            </div>
          </header>

          {/* 有进行中版本时提示：新报告生成中 */}
          {runningVersion && (
            <div className="report-running-tip">
              <span className="report-running-spinner" />
              <span>
                新报告生成中（{runningVersion.version != null ? fmtVersion(runningVersion.version) : '新版'}），可先查看历史版本数据
              </span>
            </div>
          )}

          <section className="report-sections" onClick={onSectionClick}>
            {/* 合规提示：正文最前面的固定文案（不来自模板内容块）。
                按客户要求不出现「免责声明」字样 —— 显眼度改由 琥珀色块 + 实底图标 + 加粗文案 承担。 */}
            <div className="report-disclaimer">
              <span className="report-disclaimer-icon" aria-hidden><SafetyCertificateOutlined /></span>
              <p className="report-disclaimer-text">
                本报告由人工智能基于行内外授权数据及相关系统加工信息生成。内容仅供参考，用于辅助决策，不构成贷后检查的唯一或必须依据。依据金发[2026]8号文要求，最终决策以人工审批结果为准。
              </p>
            </div>
            {visibleSections.map(item => (
              <SectionCard key={item.id} item={item} />
            ))}
          </section>
        </main>

        {/* 右：侧栏（仅 normal 时嵌入网格；expanded 时作为 floating 浮层在外侧） */}
        {sidePanelEmbedded && (
          <aside id="side-panel" className="side-panel panel">
            <div className="panel-head sticky-head">
              <div className="panel-head-left">
                {sidePanelTitle && <h2>{sidePanelTitle}</h2>}
                {sidePanelContent.type === 'aiFull' && (
                  <button
                    className={`chain-btn chain-btn-sm${chainRunning ? ' is-running' : ''}`}
                    type="button"
                    disabled={chainRunning}
                    onClick={handleAiChain}
                    title={chainRunning ? '智能体分析进行中' : '一键执行：全文分析 → 预警建议'}
                  >
                    {chainRunning && <span className="chain-btn-spinner" aria-hidden />}
                    <span>{chainRunning ? '分析中…' : '智能体分析'}</span>
                  </button>
                )}
              </div>
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
              dangerouslySetInnerHTML={sidePanelBodyHtml}
            />
          </aside>
        )}

        {/* 浮层侧栏（expanded 模式，position: fixed 全屏覆盖） */}
        {sidePanelFloating && (
          <>
            <aside id="side-panel" className="side-panel panel expanded">
              <div className="panel-head sticky-head">
                <div className="panel-head-left">
                  {sidePanelTitle && <h2>{sidePanelTitle}</h2>}
                  {sidePanelContent.type === 'aiFull' && (
                    <button
                      className={`chain-btn chain-btn-sm${chainRunning ? ' is-running' : ''}`}
                      type="button"
                      disabled={chainRunning}
                      onClick={handleAiChain}
                      title={chainRunning ? '智能体分析进行中' : '一键执行：全文分析 → 预警建议'}
                    >
                      {chainRunning && <span className="chain-btn-spinner" aria-hidden />}
                      <span>{chainRunning ? '分析中…' : '智能体分析'}</span>
                    </button>
                  )}
                </div>
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
                dangerouslySetInnerHTML={sidePanelBodyHtml}
              />
            </aside>
            {/* Backdrop：点击关闭浮层 */}
            <div className="panel-backdrop" onClick={collapsePanel} />
          </>
        )}

        {/* 回到顶部（向 ReportView 内部滚动） */}
        <button
          id="back-to-top"
          className={`back-to-top ${showBackToTop ? '' : 'hidden'}`}
          type="button"
          title="回到顶部"
          aria-label="回到顶部"
          onClick={scrollToTop}
        >
          回到顶部
        </button>
      </div>

      {/* Toast：语义图标（✓ 成功 / i 中性 / ! 失败） */}
      {toast && (
        <div className={`ai-risk-toast ${toast.type}`} role="status">
          <span className="ai-risk-toast-icon" aria-hidden="true">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '!' : 'i'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* 更新报告结果提示（居中弹框，自定义样式） */}
      <Modal
        open={!!resultModal}
        centered
        width={416}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={null}
        className="report-result-modal"
      >
        {resultModal && (
          <div className={`report-result-body ${resultModal.type === 'success' ? 'is-success' : 'is-failed'}`}>
            <div className="report-result-icon">{resultModal.type === 'success' ? '✓' : '!'}</div>
            <div className="report-result-title">
              {resultModal.type === 'success' ? '最新报告已生成' : '新报告生成失败'}
            </div>
            <div className="report-result-desc">
              {resultModal.type === 'success'
                ? '新版本报告已生成完成，点击「确认」后页面将自动刷新到最新版本。'
                : '报告生成过程发生异常，可稍后重试，或联系管理员查看日志。'}
            </div>
            {resultModal.type === 'failed' && resultModal.failReason && (
              <div className="report-result-reason">{resultModal.failReason}</div>
            )}
            <div className="report-result-actions">
              <button className="primary-btn" type="button" onClick={handleResultOk}>
                {resultModal.type === 'success' ? '确认' : '知道了'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 修改记录弹窗：归档维度 = 同日检流水号 + 同风险要点（跨版本累计）；
          列表时间正序：首位「原始版本」置顶，其后人工修改从早到晚 */}
      <Modal
        open={!!editHistory}
        centered
        width={880}
        footer={null}
        closable={false}
        title={null}
        onCancel={() => setEditHistory(null)}
        className="report-history-modal"
      >
        {/* 头部：图标 + 标题 + 风险要点名（自定义头部，不用 antd title，便于做渐变与副标题） */}
        <div className="history-head">
          <span className="history-head-icon" aria-hidden><HistoryOutlined /></span>
          <div className="history-head-txt">
            <h4>修改记录</h4>
            <p title={editHistory?.ruleName || ''}>{editHistory?.ruleName || '—'}</p>
          </div>
          <button className="history-close" type="button" onClick={() => setEditHistory(null)} aria-label="关闭">✕</button>
        </div>

        {editHistory?.loading ? (
          <div className="history-status"><Spin size="small" /><span>加载中…</span></div>
        ) : editHistory?.error ? (
          <div className="history-status is-error">{editHistory.error}</div>
        ) : (editHistory?.list.length ?? 0) === 0 ? (
          <div className="history-empty">
            <span className="history-empty-icon" aria-hidden><HistoryOutlined /></span>
            <strong>暂无修改记录</strong>
            <span>该风险要点还没有被人工编辑过</span>
          </div>
        ) : (
          <>
            {editHistorySummary && (
              <div className="history-stats">
                <span className="history-stat">共 <b>{editHistorySummary.count}</b> 次修改</span>
                <span className="history-stat"><b>{editHistorySummary.people}</b> 位修改人</span>
                <span className="history-stat">最近 <b>{editHistorySummary.latest}</b></span>
              </div>
            )}
            <ol className="history-list">
              {editHistory!.list.map((log, index) => {
                /* 首条「原始版本」由后端置顶补出（不在归档表里）：不参与序号编号，
                   序号从 1 起只编人工修改记录 —— 故要减掉它的占位 */
                const isOrigin = log.original === true;
                const seq = index + 1 - (editHistory!.list[0]?.original ? 1 : 0);
                const who = log.operatorName || log.operatorNo || '未知用户';
                return (
                  <li
                    key={`${isOrigin ? 'origin' : log.reportNo ?? ''}-${log.inputtime ?? ''}-${index}`}
                    className={isOrigin ? 'is-origin' : undefined}
                  >
                    <span className="history-index">{isOrigin ? '原' : seq}</span>
                    <div className="history-card">
                      {isOrigin ? (
                        <div className="history-meta">
                          <span className="history-origin-badge">原始版本</span>
                          <span className="history-origin-hint">AI 生成初稿</span>
                        </div>
                      ) : (
                        <div className="history-meta">
                          <span className="history-avatar" aria-hidden>{who.slice(0, 1)}</span>
                          <span className="history-who">{who}</span>
                          {log.reportNo && <span className="history-report">{log.reportNo}</span>}
                          <span className="history-time">{fmtDateTime(log.inputtime)}</span>
                        </div>
                      )}
                      <div className="history-text">
                        <span className="history-label">{isOrigin ? '原文：' : '修改为：'}</span>
                        {editLogPlainText(log.contentAfter)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="history-foot">
              <span>归档维度：同一日检流水号 + 同一风险要点，跨版本累计</span>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}