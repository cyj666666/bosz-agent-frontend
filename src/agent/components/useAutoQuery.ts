/**
 * agent 模块 — 查询条件变化后**自动重查**（免点「查询」）
 *
 * 需求来源（2026-09-16 用户）："可以让用户少点查询的、立马生效自动查询列表的，三个菜单下都改成自动触发"。
 * 本 hook 按**控件性质分两档**，不是一刀切 —— 一刀切会把"少点一次"变成"乱打请求"：
 *   · `immediateFields`（下拉枚举、日期区间）→ **变化即查**：
 *     这类控件的"选择"本身就是一次明确提交；源工程智策引擎的状态下拉/日期也是 `@change` 即查。
 *   · 其余字段（文本输入、多选树）→ **防抖** `debounceMs` 后查：
 *     逐字触发会打出一串请求、列表反复跳动；多选树每勾一个节点都会 onChange。
 *     防抖口径与「数据源配置的表名检索」（输入即搜）保持一致。
 *
 * ══════════ 三条必须注意（写之前想清楚，别改坏）══════════
 *   1. **只能在页面侧用，不能塞进 `FilterForm` 内部**：文本输入是受控的，
 *      `onChange` 之后立刻回调 `onQuery` 时 React 的 `setState` 还没生效，
 *      拿到的 `value` 是**旧条件** → 变成"条件没变、重查一次"的假自动。
 *      本 hook 读的是已经更新过的 `value`（effect 在渲染提交后执行），所以是对的。
 *   2. **首帧跳过**：三个列表页挂载时各自已查过一次，不跳过就会开机连打两次。
 *   3. `run` 走 ref：它通常是每次渲染新建的闭包（`() => refresh(buildParams(cond))`），
 *      放进依赖会导致防抖定时器被反复重建、永远不触发。
 *
 * ⚠️ 与「重置」按钮的配合：本 hook 按**值**判断是否真的变了（不是按对象标识），
 *    所以「重置」到本来就空的条件时**不会**多打一次请求；重置若真的清掉了条件，
 *    正好由本 hook 触发那一次查询 —— 因此页面里的 `doReset` **不要再显式调 refresh**，
 *    否则会查两次（一显式、一自动）。
 */
import { useEffect, useRef } from 'react';

export interface UseAutoQueryOptions {
  /** 变化后**立即**重查的字段名（下拉枚举、日期区间这类"选完即提交"的控件） */
  immediateFields?: string[];
  /** 其余字段的防抖时长（毫秒），默认 400 */
  debounceMs?: number;
  /** 关掉自动查询（弹窗内、调试时等），默认开启 */
  enabled?: boolean;
}

export function useAutoQuery<V extends object>(
  value: V,
  run: () => void,
  options: UseAutoQueryOptions = {},
): void {
  const { immediateFields = [], debounceMs = 400, enabled = true } = options;

  const runRef = useRef(run);
  runRef.current = run;
  /** 上一次的条件快照（浅拷贝，用于逐字段比"值"） */
  const prevRef = useRef<Record<string, unknown> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const next = value as Record<string, unknown>;
    if (prevRef.current === null) {
      // 首帧只记基线，不查询（页面挂载时自己已经查过）
      prevRef.current = { ...next };
      return;
    }

    const prev = prevRef.current;
    const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
    prevRef.current = { ...next };
    if (!changed.length) return;

    // 有变化就先清掉上一次待触发的防抖
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // 变的全是"选完即提交"的字段 → 立刻查；否则等用户停下来再查
    if (changed.every((k) => immediateFields.includes(k))) {
      runRef.current();
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runRef.current();
    }, debounceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs]);

  /** 卸载时清掉待触发的定时器 */
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
}
