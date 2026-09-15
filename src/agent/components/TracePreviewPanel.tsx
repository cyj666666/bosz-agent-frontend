/**
 * agent 模块 — 溯源预览浮层
 *
 * React 重写自源工程 `knowledge/components/PreviewTraceModal.vue`（257 行）。
 *
 * ══════════ 形态 ══════════
 * 源件**不是** modal，而是一个**右上角固定浮层**：`position: fixed; top:20px; right:20px;
 * width:600px; height:calc(100vh - 40px)`，标题「引用内容 共N个」，右上角 X 关闭。
 * 这里保持同形态（固定浮层 + 右上角关闭），只是把样式写成 React 内联 + 注入 style。
 *
 * ══════════ 数据 ══════════
 * `html` prop 实际是**字符串化的 JSON 数组**（`/KnowledgeBase/config/resource/preview` 的返回）：
 * 每项形如 `{ card_title, html, source_anchor, sourceType, defaultParams, inputParam, … }`。
 * 源件的处理链（逐条照抄）：
 *   ① `JSON.parse` —— **失败直接吞掉**（`try{}catch(e){}`），此时列表为空 → 显示 `a-empty`；
 *   ② 每项的 `html` 里把 `<table>…</table>` 包一层 `<div class="table-wrp">`（为了横向滚动）；
 *   ③ 再整段包一层 `<div class="preview-wrp">`；没有 html 的项则直接 `JSON.stringify(item)` 展示。
 *
 * ⚠️ 用 `dangerouslySetInnerHTML` 是**必要**的：这段 HTML 就是后端拼好的溯源卡片正文
 * （含 `{{名||号}}` 已被替换成实际取值），要在浏览器里按富文本呈现；
 * 数据来源是自家后端 `/KnowledgeBase/config/resource/preview` 的返回值，不是用户输入。
 */
import { useMemo } from 'react';
import { Empty } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

/** 预览返回里的一张卡片 */
interface PreviewCard {
  card_title?: string;
  html?: string;
  [key: string]: unknown;
}

export interface TracePreviewPanelProps {
  open: boolean;
  /** 后端返回的字符串化 JSON 数组 */
  html: string;
  onClose: () => void;
}

export function TracePreviewPanel({ open, html, onClose }: TracePreviewPanelProps) {
  const cardList = useMemo<PreviewCard[]>(() => {
    let arr: PreviewCard[] = [];
    try {
      const parsed = JSON.parse(html) as PreviewCard[];
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      // 与源件一致：解析失败当作"没有内容"（不抛、不提示，避免预览时弹一堆错）
      arr = [];
    }
    return arr.map((item) => {
      let next = item?.html ?? '';
      if (next) {
        // 表格外包一层（横向可滚），整段再包一层 preview-wrp（统一字号/边框样式）
        next = next.replace(/<table[\s\S]*?>[\s\S]*?<\/table>/gm, (table) => `<div class="table-wrp">${table}</div>`);
        next = `<div class="preview-wrp">${next}</div>`;
      } else {
        next = `<div class="preview-wrp">${JSON.stringify(item)}</div>`;
      }
      return { ...item, html: next };
    });
  }, [html]);

  if (!open) return null;

  return (
    <>
      <style>{`
        .agent-trace-preview {
          position: fixed; top: 20px; right: 20px; width: 600px;
          height: calc(100vh - 40px); background: #fff;
          box-shadow: 0 2px 16px 0 rgba(70, 26, 206, 0.08);
          border-radius: 4px; z-index: 1100; display: flex; flex-direction: column;
        }
        .agent-trace-preview .hd {
          position: relative; padding: 10px 20px;
          border-bottom: 1px solid rgba(41, 36, 66, 0.08);
          font-weight: 500; font-size: 18px; color: #292442;
        }
        .agent-trace-preview .hd span { margin-left: 10px; font-size: 14px; }
        .agent-trace-preview .close {
          position: absolute; top: 14px; right: 14px;
          cursor: pointer; color: #999;
        }
        .agent-trace-preview .close:hover { color: #666; }
        .agent-trace-preview .bd { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
        .agent-trace-preview .card {
          margin-bottom: 12px; background: rgba(41, 36, 66, 0.03); border-radius: 4px;
        }
        .agent-trace-preview .card .title {
          font-weight: 500; font-size: 16px; padding: 12px 12px 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .agent-trace-preview .card .content { font-size: 14px; color: #666; padding: 8px 12px 12px; }
        .agent-trace-preview .content .table-wrp { overflow: auto; }
        .agent-trace-preview .content .traceability-table {
          border-collapse: collapse; border-spacing: 0; margin: 8px 0; width: 100%;
          border-left: 1px solid #ddd; border-top: 1px solid #ddd;
        }
        .agent-trace-preview .content .traceability-table th,
        .agent-trace-preview .content .traceability-table td {
          border-bottom: 1px solid #ddd; border-right: 1px solid #ddd;
          padding: 5px; text-align: center; word-break: break-all; overflow-wrap: break-word;
        }
        .agent-trace-preview .content .traceability-table th { background-color: #f5f5f5; }
      `}</style>
      <div className="agent-trace-preview">
        <div className="hd">
          引用内容
          {cardList.length > 0 && <span>共 {cardList.length} 个</span>}
          <span className="close" onClick={onClose}>
            <CloseOutlined />
          </span>
        </div>
        <div className="bd">
          {cardList.length === 0 ? (
            <Empty />
          ) : (
            cardList.map((item, index) => (
              // 内容来自后端拼好的 HTML（见文件头说明），必须按富文本渲染
              <div className="card" key={index}>
                <div className="title">{item.card_title ?? ''}</div>
                <div className="content" dangerouslySetInnerHTML={{ __html: item.html ?? '' }} />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
