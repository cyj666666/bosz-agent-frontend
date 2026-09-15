/**
 * agent 模块 — 把大模型输出里的 ` <think>…</think> `「思考过程」折叠显示
 *
 * ══════════ 为什么要这个组件 ══════════
 * 后端 `OpenAiChatUtil.consumeStream` 在 `enable_think=true` 时会把模型的 reasoning 内容
 * 用 `<think>` / `</think>` 包起来一起推给前端（**这是源工程就有的行为**，
 * 源 `OpenAiChatUtil` 里同样是 `content = "<think>\n" + reasoningContent + …`）。
 * 之前前端是纯文本直出，于是页面上会看到裸露的 `&lt;think&gt;` 标签 —— 标签本身不是 bug，
 * 只是"不知道该显示什么"。
 *
 * ══════════ 交互 ══════════
 *   · 正在思考（还没出现 `</think>`）→ **自动展开**，让用户看到模型在动（否则整段思考期间页面像卡死）；
 *   · 思考结束 → **自动收起**，把版面让给正式回答；
 *   · 用户手动点过标题栏后，就不再自动开合（尊重用户意图）。
 *
 * ══════════ 用法 ══════════
 * ```tsx
 * <ThinkText text={raw} />                                  // 纯文本渲染
 * <ThinkText text={raw} renderText={(t) => <MarkdownText content={t} />} />   // 自定义正式内容渲染
 * ```
 *
 * ⚠️ 必须容忍"半截"输入：流式过程中 `<think>` 会出现但 `</think>` 还没到，
 * 此时整段剩余文本都算思考内容（`closed = false`）。
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

const OPEN = '<think>';
const CLOSE = '</think>';

export interface ThinkSegment {
  /** 是否是思考内容 */
  think: boolean;
  /** 片段文本（已去掉标签本身） */
  text: string;
  /** 思考片段是否已经闭合（流式过程中可能还没闭合） */
  closed: boolean;
}

/**
 * 按 `<think>` / `</think>` 切分文本
 *
 * 不闭合的 `<think>` 视为"仍在思考"，把剩余全文都归到该片段。
 */
export function splitThink(raw: string): ThinkSegment[] {
  const out: ThinkSegment[] = [];
  let rest = raw ?? '';
  while (rest.length > 0) {
    const openAt = rest.indexOf(OPEN);
    if (openAt < 0) {
      out.push({ think: false, text: rest, closed: true });
      break;
    }
    if (openAt > 0) {
      out.push({ think: false, text: rest.slice(0, openAt), closed: true });
    }
    const afterOpen = rest.slice(openAt + OPEN.length);
    const closeAt = afterOpen.indexOf(CLOSE);
    if (closeAt < 0) {
      out.push({ think: true, text: afterOpen, closed: false });
      break;
    }
    out.push({ think: true, text: afterOpen.slice(0, closeAt), closed: true });
    rest = afterOpen.slice(closeAt + CLOSE.length);
  }
  // 丢掉空片段（例如思考为空、或结尾多了换行）
  return out.filter((s) => s.think || s.text.trim().length > 0);
}

export interface ThinkTextProps {
  /** 大模型原始输出（可能含 `<think>` 标签） */
  text: string;
  /** 正式内容的渲染方式；不传则用等宽换行的纯文本 */
  renderText?: (t: string) => ReactNode;
  /** 正式内容的行高（仅默认纯文本渲染时生效） */
  lineHeight?: number;
  /**
   * 尾随内容（挂在**最后一个片段内部**，因此会紧跟在最后一个字符后面，而不是另起一行）。
   *
   * 用途：流式光标（`StreamCaret`）。若放在组件外面渲染，因为非思考片段是 `<div>`，
   * 光标会掉到下一行、看着像"光标丢了"。
   */
  tail?: ReactNode;
}

export function ThinkText({ text, renderText, lineHeight = 1.7, tail }: ThinkTextProps) {
  const segments = splitThink(text ?? '');
  return (
    <>
      {segments.map((seg, idx) => {
        // 尾随内容只挂最后一个片段：思考块内部 / 正文块内部都要能承接
        const segTail = idx === segments.length - 1 ? tail : null;
        return seg.think ? (
          <ThinkBlock key={idx} text={seg.text} closed={seg.closed} tail={segTail} />
        ) : (
          <div key={idx} style={{ whiteSpace: 'pre-wrap', lineHeight }}>
            {renderText ? renderText(seg.text) : seg.text}
            {segTail}
          </div>
        );
      })}
    </>
  );
}

function ThinkBlock({ text, closed, tail }: { text: string; closed: boolean; tail?: ReactNode }) {
  // 未闭合 = 模型还在思考 → 默认展开；闭合后自动收起
  const [open, setOpen] = useState(!closed);
  /** 用户手动开合过之后，不再自动控制（避免"我展开着它自己收回去"） */
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setOpen(!closed);
  }, [closed, touched]);

  return (
    <div
      style={{
        margin: '6px 0',
        border: '1px solid #e8e8e8',
        borderRadius: 4,
        background: '#fafafa',
      }}
    >
      <div
        onClick={() => {
          setTouched(true);
          setOpen((v) => !v);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          color: '#8c8c8c',
          fontSize: 12,
          userSelect: 'none',
        }}
      >
        {open ? <DownOutlined /> : <RightOutlined />}
        <span>{closed ? `思考过程（${text.length} 字）` : '思考中…'}</span>
      </div>
      {open && (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.7,
            padding: '0 10px 8px',
            color: '#8c8c8c',
            fontSize: 13,
          }}
        >
          {text}
          {tail}
        </div>
      )}
    </div>
  );
}

export default ThinkText;
