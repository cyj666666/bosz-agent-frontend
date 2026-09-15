/**
 * agent 模块 — 「打字机」逐字输出 hook
 *
 * React 等价物，对应源工程 `views/knowledge/components/printMixin.js`（195 行 Vue mixin，
 * 依赖 `tween.js` + `PrintMixin` 的 `resContent` / `finalText` 双缓冲）。
 *
 * ══════════ 源件的机制（本 hook 对齐的点）══════════
 *   `resContent` = 流式收到的**完整目标文本**（累积），`finalText` = **已打印出来的**文本。
 *   ① `setInterval(printSpeed = 40ms)` 每次从目标里取 `printCount` 个字符追加到已打印文本；
 *   ② 每 1 秒按**积压字数**调整 `printCount`：>300 → 10、>100 → 6、否则 2
 *      （源件用 `tween.js` 在 1 秒内把步长**平滑**过渡到目标值）；
 *   ③ 打完且流已结束 → 清定时器；被截断/重来 → 清零重打。
 *
 * ══════════ 与源件的两点差异（有意，且都能解释）══════════
 *   1. **不做 tween 平滑**：源件用 `tween.js` 把步长在 1 秒内缓动到目标值，本质是让
 *      速度变化不那么突兀。这里改为**每个 tick 直接按积压量取档**（一阶近似，肉眼等价），
 *      好处是不引入 `tween.js` 依赖、也不需要 `requestAnimationFrame` + 定时器双循环。
 *   2. **不动画化 markdown**：源件把逐字文本直接喂给 markdown 渲染器（半截语法会闪）。
 *      本 hook 只负责产出**要显示的文本**，是否交给 `MarkdownText` 由调用方决定 ——
 *      行为与源件相同，只是把选择权留给页面。
 *
 * ══════════ 用法 ══════════
 * ```tsx
 * const [raw, setRaw] = useState('');          // SSE 累积的完整文本
 * const { text } = useTypewriter(raw);         // 逐字显示的文本
 * return <MarkdownText text={text} />;
 * ```
 * 传 `enabled: false` 即退化为"收到即渲染"（不需要动画的场景，如一次性返回的预览接口）。
 *
 * 结束时**不需要**调用方做任何事：目标不再增长时自动停表。
 * 提供 `skip()` 供"跳过动画"按钮使用。
 *
 * ⚠️ `onTick` 的用途与源件一致 —— 源件在每帧打印后 `scrollToBottom` 滚动到底；
 *    调用方若要做同样的事，用 `onTick` 实现，注意别再触发重渲染死循环。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTypewriterOptions {
  /** 关闭则直接原样输出（等价"收到即渲染"），默认开启 */
  enabled?: boolean;
  /** 打印间隔毫秒，源件 `printSpeed` 默认 40 */
  speed?: number;
  /** 积压不多时的每帧字数，源件 `minStepCount` = 2（也是源件 `printCount` 的初值） */
  minStep?: number;
  /** 中等积压时的每帧字数，源件 `midStepCount` = 6 */
  midStep?: number;
  /** 大量积压时的每帧字数，源件 `maxStepCount` = 10 */
  maxStep?: number;
  /** 中等积压阈值，源件 100 */
  midThreshold?: number;
  /** 大量积压阈值，源件 300 */
  maxThreshold?: number;
  /** 每打印一帧回调（源件用于滚动到底） */
  onTick?: () => void;
}

export interface UseTypewriterResult {
  /** 当前应显示的文本（目标的已打印前缀） */
  text: string;
  /** 是否还在追字（目标还有没打完的部分） */
  printing: boolean;
  /** 立即打完（跳过动画） */
  skip: () => void;
}

export function useTypewriter(target: string, options: UseTypewriterOptions = {}): UseTypewriterResult {
  const {
    enabled = true,
    speed = 40,
    minStep = 2,
    midStep = 6,
    maxStep = 10,
    midThreshold = 100,
    maxThreshold = 300,
    onTick,
  } = options;

  const [printed, setPrinted] = useState(0);

  /** 目标与回调放 ref：定时器里读最新值，且不因它们变化而重启定时器 */
  const targetRef = useRef(target);
  targetRef.current = target;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  /**
   * 目标**变短**说明开始了新一轮内容（调用方用 `setText('')` 重置），已打的字数要归零；
   * 目标只是继续增长则保持进度，实现"边收边打"。
   */
  useEffect(() => {
    setPrinted((p) => (target.length < p ? 0 : p));
  }, [target]);

  const safePrinted = Math.min(printed, target.length);
  const printing = enabled && safePrinted < target.length;

  useEffect(() => {
    if (!printing) return;
    const timer = setInterval(() => {
      setPrinted((p) => {
        const len = targetRef.current.length;
        if (p >= len) return p;
        const backlog = len - p;
        // 源件 `changeStep()` 的分档（>300 → 10 / >100 → 6 / 否则 2）
        const step = backlog > maxThreshold ? maxStep : backlog > midThreshold ? midStep : minStep;
        const next = Math.min(p + step, len);
        onTickRef.current?.();
        return next;
      });
    }, speed);
    return () => clearInterval(timer);
    // 依赖里**不含 target**：target 每次增长都会变，带上它会导致定时器反复重建、打字卡顿
  }, [printing, speed, minStep, midStep, maxStep, midThreshold, maxThreshold]);

  const skip = useCallback(() => setPrinted(targetRef.current.length), []);

  if (!enabled) {
    return { text: target, printing: false, skip: () => undefined };
  }
  return { text: target.slice(0, safePrinted), printing, skip };
}
