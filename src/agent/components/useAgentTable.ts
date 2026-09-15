/**
 * agent 模块 — 分页表格 hook
 *
 * React 等价物，对应源工程宿主的 `hooks/useAntdTable.js`（112 行 Vue）——
 * 三个列表页（智策引擎 / 指标配置 / 知识配置）此前各自手写了一套
 * `rows + total + loading + pageIndex + pageSize` 的受控 state 与分页对象，
 * 这里统一收敛成一个 hook，行为按源件对齐。
 *
 * ══════════ 与源件对齐的点 ══════════
 *   1. 请求参数形状：`{ pageIndex, pageSize, ...业务条件 }`，页码从 **1** 开始。
 *   2. 响应解包：取 `list`（源件还兼容 `records` 与裸数组），总数取 `totalCount`（兼容 `total`）。
 *   3. 分页器：`pageSizeOptions = ['10','20','30','40','50','100']`、`showSizeChanger`、
 *      `showQuickJumper`、`showTotal = '共 N 条'` —— 源件就是这五项。
 *   4. `refresh(条件)` 会**回到第 1 页**再查（源件同）；`reload()` 保持当前页（源件叫 `getList`）。
 *   5. **不提供"选中行"**：源件里那部分是 `rowSelection` 的可选项，本工程三个列表页
 *      各自维护选中态（还有"只允许选一条"等业务规则），放进 hook 反而更绕。
 *
 * ══════════ 两点有意的改进（说明在此，避免被当成 bug）══════════
 *   1. **过期响应丢弃（latest-wins）**：快速翻页 / 连点查询时，先发的请求可能后返回，
 *      造成"页码和内容对不上"。这里给每次请求编号，只接受最新一次的响应 —— 源件没有这层保护。
 *   2. **参数放 ref**：`reload()` / 翻页都用 ref 读最新条件，避免闭包里拿到旧 filter
 *      （源件用 `params.value` 天然没这问题；React 里不注意就会踩）。
 *      同时保留一份 state 供调用方读取/展示。
 *
 * ⚠️ 出错时**清空列表**（沿用本工程三个列表页原有行为）。若要"保留上次成功结果"，
 *    传 `clearOnError: false`。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { message } from 'antd';
import type { TablePaginationConfig } from 'antd';
import type { AgentListResult } from '../types';

export interface UseAgentTableOptions<T, P extends Record<string, unknown>> {
  /** 默认业务条件（不含 pageIndex / pageSize） */
  defaultParams?: P;
  /** 初始每页条数，默认 10（源件同） */
  pageSize?: number;
  /** 挂载后立即查一次，默认 true */
  immediate?: boolean;
  /** 响应二次加工（源件 `format`） */
  format?: (rows: T[]) => T[];
  /** 成功回调（源件 `onSuccess`），可用来同步总数以外的附加信息 */
  onSuccess?: (res: AgentListResult<T>) => void;
  /** 失败提示；不传则用 `message.error` + `errorText` */
  onError?: (err: unknown) => void;
  /** `onError` 缺省时的兜底提示文案 */
  errorText?: string;
  /** 出错是否清空列表，默认 true（与本工程原有行为一致） */
  clearOnError?: boolean;
}

export interface UseAgentTableResult<T, P extends Record<string, unknown>> {
  rows: T[];
  total: number;
  loading: boolean;
  /** 当前生效的业务条件（不含分页） */
  params: P;
  /** 直接摊进 `<Table pagination={...}>` */
  pagination: TablePaginationConfig;
  /** 用当前条件 + 当前页码重查 */
  reload: () => Promise<void>;
  /** 合并 / 替换条件后回到第 1 页重查；传 `{}` 即"用当前条件刷第 1 页" */
  refresh: (next?: Partial<P>) => Promise<void>;
  /** 改行数据而不重查（如状态开关就地切换，避免翻页位置跳动） */
  setRows: Dispatch<SetStateAction<T[]>>;
}

const PAGE_SIZE_OPTIONS = ['10', '20', '30', '40', '50', '100'];

export function useAgentTable<T, P extends Record<string, unknown> = Record<string, unknown>>(
  /**
   * 列表接口。参数类型写成 `P & {pageIndex, pageSize}` —— 这样调用方可以直接把
   * 现成的接口函数传进来，无需任何断言，例如：
   * `useAgentTable<RuleItem, Omit<RuleListQuery, 'pageIndex' | 'pageSize'>>(getRuleList)`
   */
  fetcher: (params: P & { pageIndex: number; pageSize: number }) => Promise<AgentListResult<T>>,
  options: UseAgentTableOptions<T, P> = {},
): UseAgentTableResult<T, P> {
  const {
    defaultParams = {} as P,
    pageSize = 10,
    immediate = true,
    format,
    onSuccess,
    onError,
    errorText = '列表加载失败',
    clearOnError = true,
  } = options;

  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<P>(defaultParams);
  const [current, setCurrent] = useState(1);
  const [size, setSize] = useState(pageSize);

  /** 用 ref 读最新值，避免 reload / 翻页拿到闭包里的旧条件 */
  const paramsRef = useRef<P>(defaultParams);
  const pageRef = useRef({ current: 1, size: pageSize });
  /** 请求序号：只接受最新一次响应 */
  const seqRef = useRef(0);
  /** 组件卸载后不再 setState */
  const aliveRef = useRef(true);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const formatRef = useRef(format);
  formatRef.current = format;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const errorTextRef = useRef(errorText);
  errorTextRef.current = errorText;

  const run = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await fetcherRef.current({
        ...paramsRef.current,
        pageIndex: pageRef.current.current,
        pageSize: pageRef.current.size,
      });      if (!aliveRef.current || seq !== seqRef.current) return;
      const raw = (res?.list ?? []) as T[];
      setRows(formatRef.current ? formatRef.current(raw) : raw);
      setTotal(Number(res?.totalCount ?? 0));
      onSuccessRef.current?.(res);
    } catch (err) {
      if (!aliveRef.current || seq !== seqRef.current) return;
      if (clearOnError) {
        setRows([]);
        setTotal(0);
      }
      if (onErrorRef.current) onErrorRef.current(err);
      else message.error((err as Error)?.message || errorTextRef.current);
    } finally {
      if (aliveRef.current && seq === seqRef.current) setLoading(false);
    }
    // 全部通过 ref 读取，无需依赖业务条件
  }, [clearOnError]);

  const reload = useCallback(() => run(), [run]);

  const refresh = useCallback(
    async (next?: Partial<P>) => {
      if (next) {
        paramsRef.current = { ...paramsRef.current, ...next };
        setParams(paramsRef.current);
      }
      pageRef.current = { ...pageRef.current, current: 1 };
      setCurrent(1);
      await run();
    },
    [run],
  );

  const goPage = useCallback(
    (page: number, nextSize: number) => {
      pageRef.current = { current: page, size: nextSize };
      setCurrent(page);
      setSize(nextSize);
      void run();
    },
    [run],
  );

  useEffect(() => {
    aliveRef.current = true;
    if (immediate) void run();
    return () => {
      aliveRef.current = false;
      // 让在途响应失效
      seqRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pagination: TablePaginationConfig = {
    current,
    pageSize: size,
    total,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: goPage,
  };

  return { rows, total, loading, params, pagination, reload, refresh, setRows };
}
