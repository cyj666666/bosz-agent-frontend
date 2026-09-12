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
import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Select, Modal } from 'antd';
import { CopyOutlined, CheckOutlined, HistoryOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useReportInstanceApi } from '../../hooks/useReportInstanceApi';
import { reportApi, type ReportRiskEditLogItem } from '../../api/report';
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
/* 展开侧栏时第三列 390 → 600：AI风险识别表要放下「操作/序号/规则名称/风险描述/对应章节/状态」6 列 */
.report-shell.with-side { grid-template-columns: 260px minmax(0, 1fr) 600px; }
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
.side-panel.expanded { position: fixed; inset: 16px 16px 16px auto; right: 16px; width: min(960px, calc(100vw - 200px)); max-height: calc(100vh - 32px); z-index: 32; box-shadow: 0 32px 80px rgba(13,31,62,.24); }
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
/* 「AI分析全文」默认开在窄侧栏里：收紧卡片内边距与字号，避免 30/34px 内边距把 390px 挤爆；
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
  .report-shell, .report-shell.with-side { grid-template-columns: 1fr; }
  .report-nav, .side-panel { position: relative; top: 0; height: auto; }
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
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
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
  return (
    <article id={item.id} className="section-card" data-module-id={item.id}>
      <h3>{item.title}</h3>
      {/* 溯源按钮不再单独渲染：它本身就是内容块（SOURCE_LINK），已在正文中渲染为外链按钮 */}
      <div className="section-body" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
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
    aiFullAnalysisHtml,
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
    [setAIRiskStatus, locateAIRisk, openEditHistory],
  );

  /* ---- 侧栏标题与内容 ---- */
  const sidePanelTitle = useMemo(() => {
    if (sidePanelContent.type === 'aiRisk') return 'AI风险识别';
    if (sidePanelContent.type === 'aiFull') return 'AI 分析全文';
    return `${sidePanelContent.moduleTitle} / 溯源信息`;
  }, [sidePanelContent]);

  const sidePanelBody = useMemo(() => {
    // 行高亮随数据一起生成（activeAIRiskId 参与），避免被重渲染冲掉
    if (sidePanelContent.type === 'aiRisk') return aiRiskTableHTML(aiRiskList, activeAIRiskId);
    if (sidePanelContent.type === 'aiFull') return aiFullAnalysisHtml;
    return sourcePanelHtml(sourceTemplates[sidePanelContent.moduleId] ?? []);
  }, [sidePanelContent, aiRiskList, aiFullAnalysisHtml, sourceTemplates, activeAIRiskId]);

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
                AI分析全文
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