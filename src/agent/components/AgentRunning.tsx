/**
 * agent 模块 — 「智能体执行中」等待面板 + 流式光标
 *
 * ══════════ 为什么要有这个组件 ══════════
 * 原先所有"点了按钮等模型出内容"的位置，等待态都是一个 antd `<Alert type="info" message="正在生成…" />`
 * —— 一行灰底小字，看着跟"表单在提交"没区别，完全没有"智能体在跑分析"的观感
 * （用户 2026-09-16 反馈：「这个等待效果太普通了，不像智能体在执行预览分析」）。
 *
 * 这里把等待态做成一个**有信息量**的面板：
 *   ① 自定义 SVG 标记（两个反向旋转的渐变弧 + 中心脉动点，见 `AgentGlyph`）
 *   ② **循环的真实阶段提示语**（如"正在请求大模型…"）—— 文案必须写实际会走到的阶段，
 *      不要写代码里不存在的步骤（那是假进度，见 `口径与红线_详版.md` 的"阶段显式化"口径）
 *   ③ 一条**不确定进度条**（indeterminate）—— 只表达"在进行"，不假装有百分比
 *   ④ 骨架行 shimmer —— 暗示"内容正在产出"
 *
 * ══════════ 2026-09-16 二次返工（用户反馈）══════════
 *   · **去掉「已接收 N 字」**：原话「已接收xx字就没必要了吧，我看一直是0，突然就出来一个数字」——
 *     它只在"开始出字"那一刻从 0 跳成 N，之后面板就被内容顶掉了，**信息量≈0 纯噪音**。
 *   · **换掉机器人图标**：原话「有个小机器人的logo要么换个，要么不要了，看着没有啥设计感」——
 *     直接用了 antd 的 `RobotOutlined`，是"图标库里的一个现成图标"，跟整体排版不搭。
 *     现改为**自绘 SVG**（`AgentGlyph`）：外层慢转长弧 + 内层反向快转短弧 + 中心脉动实心点，
 *     用同一条渐变描边保证和主题蓝一致；不再依赖 `@ant-design/icons`。
 *
 * ⚠️ 有意**不显示百分比/剩余时间**：模型出字速度不可预测，编一个进度反而误导。
 *
 * ══════════ 用法 ══════════
 * ```tsx
 * {sending && !text && (
 *   <AgentRunning title="智能体正在生成预览结果" hints={PREVIEW_HINTS} />
 * )}
 * <ThinkText text={display.text} />
 * <StreamCaret show={sending || display.printing} />
 * ```
 * 真流式下文本会先到一部分，所以**「面板」与「光标」是两个阶段**：
 * 面板占位（还没出字）→ 光标闪烁（已在出字、打字机还在追）。
 */

import { useEffect, useId, useState } from 'react';

/**
 * 动画关键帧。
 *
 * ⚠️ 用内联 `<style>` 而不是全局 CSS 文件：agent 模块要求**自包含**（只通过 `src/agent/index.ts`
 * 对外暴露），新增全局样式文件会牵动宿主的构建入口；同款做法见 `IndexDataSourceCard` 的表体最小高度。
 * 同一个 keyframes 被多次注入是无害的（内容完全相同，浏览器按最后一条生效）。
 */
const CSS = `
@keyframes agentSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes agentCorePulse {
  0%, 100% { transform: scale(1);    opacity: 1; }
  50%      { transform: scale(0.62); opacity: 0.75; }
}
@keyframes agentBarSlide {
  0%   { left: -45%; }
  100% { left: 100%; }
}
@keyframes agentShimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@keyframes agentCaretBlink {
  0%, 45%  { opacity: 1; }
  50%, 95% { opacity: 0.15; }
  100%     { opacity: 1; }
}
.agent-run-shimmer {
  background: linear-gradient(90deg, #f2f4f7 0%, #e3e9f2 50%, #f2f4f7 100%);
  background-size: 200% 100%;
  animation: agentShimmer 1.5s linear infinite;
}
/* SVG 弧线绕自身中心旋转（fill-box 让 transform-origin: center 落到弧的包围盒中心） */
.agent-glyph-arc {
  transform-box: fill-box;
  transform-origin: center;
  animation: agentSpin 2.6s linear infinite;
}
.agent-glyph-arc--reverse {
  animation-duration: 1.7s;
  animation-direction: reverse;
}
.agent-glyph-core {
  transform-box: fill-box;
  transform-origin: center;
  animation: agentCorePulse 1.5s ease-in-out infinite;
}
`;

/**
 * 自绘「智能体」标记（不依赖图标库）
 *
 * 设计意图：**双弧反向旋转 + 中心呼吸**，读起来是"在运算"，而不是"一个静态图标"。
 *
 * ⚠️ 渐变 id 必须全局唯一：同一页面可能同时存在多个实例（知识配置预览 + 结果校验），
 * id 重名会让后一个复用前一个的 `<defs>`。这里用 React `useId()` 并按 `:` 清理
 * （`useId` 的原始值长这样 `:r0:`，在 `url(#…)` 里能work，但清理掉更省心）。
 */
function AgentGlyph({ size }: { size: number }) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const g1 = `agent-grad-a-${uid}`;
  const g2 = `agent-grad-b-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g1} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1677ff" />
          <stop offset="100%" stopColor="#69c0ff" />
        </linearGradient>
        <linearGradient id={g2} x1="10" y1="30" x2="30" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#40a9ff" />
          <stop offset="100%" stopColor="#91d5ff" />
        </linearGradient>
      </defs>
      {/* 底色圆（很淡，衬托两段弧） */}
      <circle cx="20" cy="20" r="17" stroke="#eaf3ff" strokeWidth="2.5" />
      {/* 外弧：慢速顺时针 */}
      <circle
        className="agent-glyph-arc"
        cx="20"
        cy="20"
        r="17"
        stroke={`url(#${g1})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="34 73"
      />
      {/* 内弧：反向加速 */}
      <circle
        className="agent-glyph-arc agent-glyph-arc--reverse"
        cx="20"
        cy="20"
        r="10.5"
        stroke={`url(#${g2})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="18 48"
      />
      {/* 中心：呼吸的实心点 */}
      <circle className="agent-glyph-core" cx="20" cy="20" r="4.2" fill={`url(#${g1})`} />
    </svg>
  );
}

export interface AgentRunningProps {
  /** 主标题，如「智能体正在生成预览结果」 */
  title?: string;
  /** 循环展示的阶段提示语（必须是真实会走到的阶段） */
  hints?: string[];
  /** 附加的实际上下文，如「大模型：bosz-report-ai」（真实值，不编） */
  meta?: string;
  /** 占位高度（默认自适应内容） */
  height?: number | string;
  /** 紧凑模式：不显示骨架行、标记变小 —— 用于窄条/表单内联位置 */
  compact?: boolean;
  /** 内边距 */
  padding?: number;
}

/**
 * 「智能体执行中」面板
 */
export function AgentRunning({
  title = '智能体正在处理',
  hints = [],
  meta,
  height,
  compact = false,
  padding = 16,
}: AgentRunningProps) {
  const [idx, setIdx] = useState(0);
  const hintCount = hints.length;

  // 依赖只取 length：调用方常写成内联数组字面量，跟着数组引用走会每帧重启定时器
  useEffect(() => {
    if (hintCount <= 1) return undefined;
    const timer = window.setInterval(() => setIdx((i) => (i + 1) % hintCount), 1800);
    return () => window.clearInterval(timer);
  }, [hintCount]);

  const glyphSize = compact ? 26 : 34;

  return (
    <div
      style={{
        position: 'relative',
        height,
        padding,
        borderRadius: 8,
        border: '1px solid #e6f0fb',
        background: 'linear-gradient(180deg, #f7fbff 0%, #fbfdff 100%)',
        overflow: 'hidden',
      }}
    >
      <style>{CSS}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* 智能体标记（自绘 SVG，非图标库图标） */}
        <span style={{ flex: '0 0 auto', display: 'block', lineHeight: 0 }}>
          <AgentGlyph size={glyphSize} />
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#1f2d3d', fontSize: compact ? 13 : 14 }}>{title}</div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              color: '#8c8c8c',
              height: 17,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {hints[idx] ?? ''}
          </div>
        </div>
      </div>

      {/* 不确定进度条：只表示"在进行"，不给假百分比 */}
      <div
        style={{
          position: 'relative',
          height: 3,
          marginTop: compact ? 10 : 14,
          borderRadius: 2,
          background: '#eef3f9',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '45%',
            borderRadius: 2,
            background: 'linear-gradient(90deg, rgba(145,202,255,0), #1677ff, rgba(145,202,255,0))',
            animation: 'agentBarSlide 1.5s ease-in-out infinite',
          }}
        />
      </div>

      {/* 骨架行：暗示内容正在产出 */}
      {!compact && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[92, 78, 86].map((w) => (
            <div key={w} className="agent-run-shimmer" style={{ height: 12, width: `${w}%`, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {meta ? <div style={{ marginTop: compact ? 8 : 14, fontSize: 12, color: '#a0aec0' }}>{meta}</div> : null}
    </div>
  );
}

/**
 * 流式光标 —— 文字已经在下、但打字机还在追字时，在文末闪一个方块。
 *
 * 与 `AgentRunning` 是**两个阶段**：面板是"还没出字"，光标是"正在出字"。
 */
export function StreamCaret({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <>
      <style>{CSS}</style>
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 15,
          marginLeft: 2,
          verticalAlign: '-2px',
          background: '#1677ff',
          animation: 'agentCaretBlink 1s step-end infinite',
        }}
      />
    </>
  );
}
