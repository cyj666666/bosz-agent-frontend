/**
 * 智策引擎 — 检查项新增/编辑（全屏弹窗）
 *
 * 对应源工程 `amar-agent-admin/src/views/app/rule/RuleFormModal.vue`（1718 行 Vue）。
 * 左右两栏：左侧「检查项」表单，右侧「解析校验」。
 *
 * 与源工程的三处刻意差异（均不改变功能，只为贴合 React/宿主习惯）：
 *   1) **SSE 结束做双保险**（见 api/agentSse.ts 注释），源工程只认服务端下发的 `finished!`。
 *   2) **返回体判断**：源工程判 `res.success`，本工程由 agentRequest 统一校验 code 并解包，
 *      这里只写 try/catch。
 *   3) **「开始校验」做成"看得见的智能体流水线"**（2026-09-16 用户要求，源工程没有）：
 *      ① 结果面板有**最小停留时长** `MIN_EXECUTE_MS`（规则引擎算太快，看不出在处理）；
 *      ② **每次点校验都清空上一次的全部产出**（校验结论 / 命中明细 / AI分析 / 补充分析），
 *         再各自转圈等待 —— 用户原话：「已经再次发起校验了，上次的结果还挂着很怪」，
 *         并要求「要看起来非常像个 AI 智能体的效果」；
 *      ③ 按钮下方加**阶段状态条**（`Steps`：规则校验 → AI 分析 → 补充分析），
 *         进行中转圈、未命中标「跳过」，与代码里的真实顺序一一对应（不是假进度条）；
 *      ④ 出错把原因显示出来；流结束但一个字都没收到 → 明确提示。
 *      （打字机效果 `useTypewriter` 与源 `PrintMixin` 对齐，非差异。）
 *
 * 校验前置条件（照抄源工程，别"优化"掉，否则用户会拿到莫名其妙的报错）：
 *   - 解析前必须填「阈值设定」（源工程就用阈值去调解析接口）
 *   - 校验前必须有企业名称 + 已解析的表达式
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'react';
import { Button, Card, Col, Collapse, Empty, Form, Input, Modal, Row, Select, Space, Spin, Steps, Table, Tree, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { StepsProps, TreeDataNode } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined, WarningFilled } from '@ant-design/icons';
import {
  executeRule as apiExecuteRule,
  getSupplementaryOptions,
  loadIndexTree,
  parseRule as apiParseRule,
  saveRule as apiSaveRule,
} from '../../api/rule';
import { agentSse } from '../../api/agentSse';
import type { IndexTreeNode, RuleExecuteResult, RuleItem, RuleMetricItem, SupplementaryOption } from '../../types';
import MarkdownText from '../../components/MarkdownText';
import { useTypewriter } from '../../components/useTypewriter';
import { ThinkText } from '../../components/ThinkText';
import { AgentRunning, StreamCaret } from '../../components/AgentRunning';

/** 触发条件解析智能体在知识库侧的 moduleCode（源工程写死） */
const AI_ANALYSIS_MODULE_CODE = 'IntelligentStrategyEngine';

/**
 * 「开始校验」结果面板的最小停留时长（ms）—— 2026-09-16 用户要求
 *
 * 规则引擎是**本地确定性计算**，一次校验通常几十毫秒就返回，结果"啪"地直接出现，
 * 用户反馈"看着不像智能体在处理"。这里给结果面板一个**最小可见的等待态**：
 * 请求照旧尽早发出，只是**结果延后到至少 `MIN_EXECUTE_MS` 才落屏**（超时则立即落屏，不加长慢请求）。
 * 取 700ms：足够让人看到"校验中…"，又不会觉得卡。
 */
const MIN_EXECUTE_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 「智能体执行中」面板的阶段提示语（`AgentRunning` 用）
 *
 * 必须与实际链路一致：`/agent/get` → 后端按 moduleCode 查知识库配置 → 拼提示词 → 调大模型 → SSE 回传。
 * 补充分析多一步"读取该检查项绑定的经验库文案"。
 */
const AI_HINTS = ['正在读取命中指标…', '正在拼装分析提示词…', '正在请求大模型…', '正在生成分析结论…'];
const SUPP_HINTS = ['正在读取经验库文案…', '正在拼装分析提示词…', '正在请求大模型…', '正在生成补充分析…'];

/** 源工程列出的"未命中"判定集合，逐项照抄——后端 resultStatus 类型不固定（布尔/字符串） */
const MISS_VALUES: Array<boolean | string | null | undefined> = [
  false,
  null,
  undefined,
  '',
  'false',
  '未命中',
  'no_hit',
  '解析失败',
  '解析异常',
];

function isMiss(result: boolean | string | null): boolean {
  return MISS_VALUES.includes(result);
}

interface ParamRow {
  fieldName: string;
  fieldValue: string;
}

interface RuleFormState {
  id: number | null;
  ruleCode: string;
  ruleName: string;
  firstTheme: string;
  secondTheme: string;
  ruleText: string;
  parsedExpression: string;
  promptKey: string;
  threshold: string;
  factAnalysis: string;
  riskInterpretation: string;
  disposalSuggestion: string;
  requestParams: string;
  /** 补充分析的中文名（仅用于回显/保存，不参与校验） */
  additionalAnalysisName: string;
}

const EMPTY_FORM: RuleFormState = {
  id: null,
  ruleCode: '',
  ruleName: '',
  firstTheme: '',
  secondTheme: '',
  ruleText: '',
  parsedExpression: '',
  promptKey: '',
  threshold: '',
  factAnalysis: '',
  riskInterpretation: '',
  disposalSuggestion: '',
  requestParams: '',
  additionalAnalysisName: '',
};

const DEFAULT_PARAM: ParamRow = { fieldName: 'entName', fieldValue: '' };

interface RuleFormModalProps {
  open: boolean;
  oldData: RuleItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RuleFormModal({ open, oldData, onClose, onSuccess }: RuleFormModalProps) {
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [saveLoading, setSaveLoading] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const [thresholdParseLoading, setThresholdParseLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);

  const [parseStatus, setParseStatus] = useState<'unparsed' | 'failed' | 'success'>('unparsed');
  const [parseErrorMessage, setParseErrorMessage] = useState('');
  const [isEditingExpr, setIsEditingExpr] = useState(false);

  const [thresholdParseStatus, setThresholdParseStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [thresholdParseMessage, setThresholdParseMessage] = useState('');

  const [params, setParams] = useState<ParamRow[]>([{ ...DEFAULT_PARAM }]);
  const [matchedMetrics, setMatchedMetrics] = useState<RuleMetricItem[]>([]);
  /**
   * 「校验溯源」表的**前端分页**状态
   *
   * 为什么要自己持页码（不用非受控）：每次点「开始校验」都会把 `matchedMetrics` 清空再由结果填回，
   * 非受控的话页码会停在上一轮的页（比如上次在第 4 页、这次只有 1 页 → 显示空白），
   * 所以 `doExecute` 里显式 `setTracePage(1)` 归位。
   */
  const [tracePage, setTracePage] = useState(1);
  const [tracePageSize, setTracePageSize] = useState(10);
  const [executeResult, setExecuteResult] = useState<boolean | string | null>(null);
  /**
   * 本次校验的**取数/执行事实**（后端 2026-09-16 新增返回）
   *
   * 为什么需要：`entName` 只是一个普通入参，后端**不校验企业是否存在**。
   * 填一个不存在的企业名时，指标 SQL 照常执行但返回 0 行 → 拿空值/默认值去算表达式，
   * 依然会得出"命中/未命中"，甚至照常触发 AI 分析 —— 从界面上完全看不出来数据是空的。
   *
   * · `failed`  表达式**根本没算成**（区别于"算出来是 false/未命中"）
   * · `missing` 未取到值的指标数
   * · `total`   本次涉及的指标总数
   */
  const [execInfo, setExecInfo] = useState<{ failed: boolean; missing: number; total: number } | null>(null);

  /**
   * 补充分析：**值里带名称**（对齐源工程 `label-in-value`）
   *
   * 源件 `supplementaryValue` 是 `{ key, label }` 对象，保存时 `additionalAnalysis` 取 key、
   * `additionalAnalysisName` 取 label，界面上显示的也是 label。
   * 本工程原先只存 code、靠 Select 的 `options` 反查名称 —— **一旦该 code 不在当前选项列表里**
   * （列表分页 / 关键词筛选 / 角色授权变化 / 反查失败），antd 就会直接把原始值打出来，
   * 于是界面上看到的是**码值**（用户 2026-09-16 反馈的问题）。改成对象后显示不再依赖选项列表。
   */
  const [suppOptions, setSuppOptions] = useState<SupplementaryOption[]>([]);
  const [suppValue, setSuppValue] = useState<{ value: string; label: string } | undefined>(undefined);

  /**
   * 两份文本：
   *   · `aiText` / `sText`  = SSE 累积的**完整目标文本**（每次开流清空，喂给打字机）；
   *   · `aiShown` / `sShown` = **界面实际展示的**文本（打字机的输入），流式过程中"新内容一到就顶上"。
   *
   * 🔴 2026-09-16 用户要求调整（**反转了上一版口径**）：
   *   上一版为了让重跑时视觉连续，开流只清累积值、展示值保留上一次结果；
   *   用户反馈"上次的就不要展示了，还停留在上次很奇怪"→ 现在**每次点「开始校验」把两份都清空**，
   *   由 `aiSending` 驱动显示"分析中"等待态，新内容到达后再逐字追上。
   */
  const [aiText, setAiText] = useState('');
  const [aiShown, setAiShown] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState('');
  const [sText, setSText] = useState('');
  const [sShown, setSShown] = useState('');
  const [sSending, setSSending] = useState(false);
  const [sError, setSError] = useState('');

  /**
   * 打字机（源 `views/knowledge/components/printMixin.js`）
   *
   * `setAiText` / `setSText` 收的是 **SSE 累积的完整文本**（相当于源件的 `resContent`），
   * 这里由 `useTypewriter` 负责逐字"追"出来给界面显示（相当于源件的 `finalText`）。
   * 关闭时传 `enabled: false` 即退化为"收到即渲染"。
   */
  const aiDisplay = useTypewriter(aiShown);
  const sDisplay = useTypewriter(sShown);

  /** 新内容一到就顶上展示值（「开始校验」时置空 → 打字机自然从空开始重打） */
  useEffect(() => {
    if (aiText) setAiShown(aiText);
  }, [aiText]);
  useEffect(() => {
    if (sText) setSShown(sText);
  }, [sText]);

  const [indexTree, setIndexTree] = useState<IndexTreeNode[]>([]);
  const [indexKeyword, setIndexKeyword] = useState('');

  const exprRef = useRef<HTMLTextAreaElement | null>(null);
  const aiAbortRef = useRef<{ abort: () => void } | null>(null);
  const sAbortRef = useRef<{ abort: () => void } | null>(null);

  const patch = useCallback((p: Partial<RuleFormState>) => setForm((prev) => ({ ...prev, ...p })), []);

  /* ---------------- 初始化 / 回填 ---------------- */

  const resetAll = useCallback(() => {
    setForm(EMPTY_FORM);
    setParams([{ ...DEFAULT_PARAM }]);
    setMatchedMetrics([]);
    setExecuteResult(null);
    setParseStatus('unparsed');
    setParseErrorMessage('');
    setIsEditingExpr(false);
    setThresholdParseStatus('idle');
    setThresholdParseMessage('');
    setSuppValue(undefined);
    setAiText('');
    setAiShown('');
    setAiError('');
    setSText('');
    setSShown('');
    setSError('');
    setIndexKeyword('');
    aiAbortRef.current?.abort();
    sAbortRef.current?.abort();
  }, []);

  /** 请求参数在库里的存储形式是「字段名数组」的 JSON 串 */
  const restoreParams = useCallback((raw: string) => {
    if (!raw) {
      setParams([{ ...DEFAULT_PARAM }]);
      return;
    }
    try {
      const names = JSON.parse(raw) as string[];
      if (Array.isArray(names) && names.length) {
        setParams(names.map((n) => ({ fieldName: n || '', fieldValue: '' })));
        return;
      }
    } catch {
      /* 历史数据可能不是合法 JSON，回落默认 */
    }
    setParams([{ ...DEFAULT_PARAM }]);
  }, []);

  const loadSuppOptions = useCallback(async (keyword: string, code?: string) => {
    try {
      const list = await getSupplementaryOptions(keyword);
      setSuppOptions(list);
      if (code) {
        const hit = list.find((o) => o.paramNo === code);
        // 反查不到就退回 code 当名称（源工程同款降级：`label: item ? item.paramName : code`）
        setSuppValue({ value: code, label: hit ? hit.paramName : code });
      }
    } catch (err) {
      // 以前这里是**静默**吞掉（只清空选项）→ 接口 404 时下拉恒为空，界面上看不出原因。
      // 2026-09-16 实锤过一次：`api/rule.ts` 漏了 `/agent` 前缀导致 404。
      // 现在至少留一条控制台记录，便于下次一眼定位。
      console.error('[RuleFormModal] 补充分析下拉加载失败：', err);
      setSuppOptions([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (oldData) {
      const parsed = oldData.parsedExpression ?? '';
      setForm({
        id: oldData.id ?? null,
        ruleCode: oldData.ruleCode ?? '',
        ruleName: oldData.ruleName ?? '',
        firstTheme: oldData.topic1 ?? '',
        secondTheme: oldData.topic2 ?? '',
        ruleText: oldData.ruleText ?? '',
        parsedExpression: parsed,
        promptKey: oldData.promptKey ?? '',
        threshold: oldData.thresholdConfig ?? '',
        factAnalysis: oldData.factAnalysis ?? '',
        riskInterpretation: oldData.riskRemark ?? '',
        disposalSuggestion: oldData.disposalAdvice ?? '',
        requestParams: oldData.requestParams ?? '',
        additionalAnalysisName: oldData.additionalAnalysisName ?? '',
      });
      restoreParams(oldData.requestParams ?? '');
      // 补充分析：先用**库里的名称**兜底（列表接口还没回来时也能显示名称，而不是码值），
      // 随后 loadSuppOptions 会用选项列表里的名称刷新一次。源工程同样保留
      // additionalAnalysisName 字段做这个兜底。
      setSuppValue(
        oldData.additionalAnalysis
          ? { value: oldData.additionalAnalysis, label: oldData.additionalAnalysisName || oldData.additionalAnalysis }
          : undefined,
      );
      void loadSuppOptions('', oldData.additionalAnalysis || undefined);
      if (parsed) {
        if (parsed.includes('未解析到')) {
          setParseStatus('failed');
          setParseErrorMessage(parsed);
        } else {
          setParseStatus('success');
        }
      } else {
        setParseStatus('unparsed');
      }
      setMatchedMetrics([]);
      setExecuteResult(null);
      setExecInfo(null);
      // 表达式变了 → 上一次的校验结论作废，AI分析/补充分析 的展示内容一并清空（含等待态标志）
      setAiText('');
      setAiShown('');
      setAiError('');
      setSText('');
      setSShown('');
      setSError('');
    } else {
      resetAll();
      void loadSuppOptions('');
    }
  }, [open, oldData, restoreParams, resetAll, loadSuppOptions]);

  /* ---------------- 指标树（表达式编辑用） ---------------- */

  const loadTree = useCallback(async () => {
    try {
      const res = await loadIndexTree();
      setIndexTree(res?.list ?? []);
    } catch {
      setIndexTree([]);
    }
  }, []);

  const toggleEditExpr = () => {
    if (!isEditingExpr) void loadTree();
    setIsEditingExpr((v) => !v);
  };

  /** 按关键字过滤树（保留命中节点的祖先链），逻辑照抄源工程 */
  const filteredTree = useMemo(() => {
    const kw = indexKeyword.trim().toLowerCase();
    if (!kw) return indexTree;
    const walk = (nodes: IndexTreeNode[]): IndexTreeNode[] =>
      nodes.reduce<IndexTreeNode[]>((acc, node) => {
        const children = node.children?.length ? walk(node.children) : [];
        const hit = (node.paramName ?? '').toLowerCase().includes(kw);
        if (hit || children.length) acc.push({ ...node, children });
        return acc;
      }, []);
    return walk(indexTree);
  }, [indexTree, indexKeyword]);

  const toTreeData = (nodes: IndexTreeNode[]): TreeDataNode[] =>
    nodes.map((n) => ({
      key: n.paramNo,
      title: n.paramName,
      children: n.children?.length ? toTreeData(n.children) : undefined,
    }));

  /** 找节点路径，用于拼 `一级/二级` 这种可读名称 */
  const findPath = (nodes: IndexTreeNode[], key: string, path: IndexTreeNode[] = []): IndexTreeNode[] | null => {
    for (const node of nodes) {
      if (node.paramNo === key) return [...path, node];
      if (node.children?.length) {
        const r = findPath(node.children, key, [...path, node]);
        if (r) return r;
      }
    }
    return null;
  };

  /** 选中指标 → 在表达式光标处插入 `&&{paramNo|名称路径}` */
  const onSelectIndex = (keys: Key[]) => {
    if (!keys.length) return;
    const key = String(keys[0]);
    const path = findPath(indexTree, key) ?? [];
    const insert = `&&{${key}|${path.map((n) => n.paramName).join('/')}}`;
    const el = exprRef.current;
    if (el) {
      const start = el.selectionStart ?? form.parsedExpression.length;
      const end = el.selectionEnd ?? start;
      const next = `${form.parsedExpression.slice(0, start)}${insert}${form.parsedExpression.slice(end)}`;
      patch({ parsedExpression: next });
      // 光标落到插入文本之后
      requestAnimationFrame(() => {
        const pos = start + insert.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      });
    } else {
      patch({ parsedExpression: `${form.parsedExpression}${insert}` });
    }
  };

  /* ---------------- 解析 ---------------- */

  const doParse = async (forThreshold: boolean) => {
    if (!form.threshold.trim()) {
      message.warning('请先输入阈值设定');
      return;
    }
    if (forThreshold) setThresholdParseLoading(true);
    else {
      setParseLoading(true);
      setIsEditingExpr(false);
    }
    try {
      const res = await apiParseRule(form.threshold);
      const expr = res?.parsedExpression ?? '';
      if (forThreshold) {
        setThresholdParseStatus(res?.parseCode === 'error' ? 'error' : 'success');
        setThresholdParseMessage(res?.parseCode === 'error' ? expr || '未成功解析到阈值设定，请调整描述或尝试重新解析' : '');
        if (res?.parseCode !== 'error') message.success('解析验证成功');
      } else {
        patch({ parsedExpression: expr, promptKey: res?.promptKey ?? '' });
        if (expr && !expr.includes('未解析到')) {
          setParseStatus('success');
        } else {
          setParseStatus('failed');
          setParseErrorMessage(expr || '未成功解析到触发条件涉及指标，请调整触发条件描述或尝试重新解析');
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message || '未成功解析到触发条件涉及指标，请调整触发条件描述或尝试重新解析';
      if (forThreshold) {
        setThresholdParseStatus('error');
        setThresholdParseMessage(msg);
      } else {
        setParseStatus('failed');
        setParseErrorMessage(msg);
      }
    } finally {
      if (forThreshold) setThresholdParseLoading(false);
      else setParseLoading(false);
    }
  };

  /* ---------------- 校验 ---------------- */

  const entName = useMemo(() => (params.find((p) => p.fieldName === 'entName')?.fieldValue ?? '').trim(), [params]);

  /**
   * 把参数面板里填写的入参摊平成请求体（2026-09-17 修复）
   *
   * 背景：`startAiAnalysis` / `startSupplementaryAnalysis` 此前**只传了 `entName`**，
   * `reportNo` / `guarantorName` 等参数在链路中直接丢失 → 后端取数拿不到入参时会回落到
   * 配置里预置的样例值（实测 `index_params.script.paramData` 的 `guarantorName = '泰州公司'`），
   * 于是"规则判定"用的是用户填的担保人、"补充分析"用的却是样例担保人，
   * 两边取到不同记录，写出自相矛盾的文案（「担保人泰州公司不是企业实际控制人，学历为。」）。
   *
   * 口径与 `doExecute` 里的 `requestParams` 完全一致：`entName` 做 trim，其余原样。
   */
  const buildParamPayload = useCallback(() => {
    const payload: Record<string, string> = {};
    params.forEach((p) => {
      const key = (p.fieldName || '').trim();
      if (key) payload[key] = key === 'entName' ? (p.fieldValue || '').trim() : p.fieldValue;
    });
    return payload;
  }, [params]);

  /**
   * AI 分析（源工程 `aiAnalysisPostText`，moduleCode 写死 `IntelligentStrategyEngine`）
   *
   * 🔴 三处**必须区分"失败"和"空结果"**（2026-09-16 修复）：
   *   1. 开流清空累积值与展示值（点「开始校验」时已清过一遍，这里再清一次保证自洽，
   *      本函数即使被单独调用也是干净的一次）；
   *   2. 流结束时若一个字都没收到 → 明确提示（此前表现为"整块凭空消失"，看着像功能没做）；
   *   3. 出错把原因显示出来 —— 后端在 `large_model_code` 为空时会推一帧
   *      `{"code":500,"message":"非法的大模型CODE:"}`（知识库未配置即属此类），
   *      `agentSse` 现已识别该帧并抛错，这里落到 `aiError` 上。
   */
  const startAiAnalysis = (result: RuleExecuteResult) => {
    aiAbortRef.current?.abort();
    setAiText('');
    setAiShown('');
    setAiError('');
    setAiSending(true);
    let received = false;
    let errored = false;
    aiAbortRef.current = agentSse({
      url: '/agent/get',
      body: {
        // 参数面板里填的入参全部带上（含 reportNo / guarantorName），
        // 否则后端取数会回落配置样例值 —— 见 buildParamPayload 注释。固定键放后面覆盖。
        ...buildParamPayload(),
        moduleCode: AI_ANALYSIS_MODULE_CODE,
        entName,
        content: form.disposalSuggestion || '',
        input: form.threshold || '',
        data: result.matchedMetrics ?? [],
        risk: form.riskInterpretation || '',
        result: result.resultStatus != null ? String(result.resultStatus) : '',
        rule_name: form.ruleName || '',
        factExpression: result.factExpression || '',
        stream: true,
        withModelSummary: true,
        finishFlag: 'true',
      },
      onChunk: (c) => {
        received = true;
        setAiText((prev) => prev + c.text);
      },
      onDone: () => {
        setAiSending(false);
        if (!received && !errored) {
          setAiError('服务端没有返回任何内容（多为该知识库未配置提示词 / 模型编码，请到「知识配置」里补一份）');
        }
      },
      onError: (e) => {
        errored = true;
        setAiSending(false);
        setAiError((e as Error)?.message || 'AI 分析失败');
      },
    });
  };

  const startSupplementaryAnalysis = (factExpression: string) => {
    if (!suppValue) return;
    sAbortRef.current?.abort();
    setSText('');
    setSShown('');
    setSError('');
    setSSending(true);
    let received = false;
    let errored = false;
    sAbortRef.current = agentSse({
      url: '/agent/get',
      body: {
        // 参数面板里填的入参全部带上（含 reportNo / guarantorName），
        // 否则后端取数会回落配置样例值 —— 见 buildParamPayload 注释。固定键放后面覆盖。
        ...buildParamPayload(),
        moduleCode: suppValue.value,
        entName,
        factExpression: factExpression || '',
        stream: true,
        withModelSummary: true,
        finishFlag: 'true',
      },
      onChunk: (c) => {
        received = true;
        setSText((prev) => prev + c.text);
      },
      onDone: () => {
        setSSending(false);
        if (!received && !errored) setSError('服务端没有返回任何内容');
      },
      onError: (e) => {
        errored = true;
        setSSending(false);
        setSError((e as Error)?.message || '补充分析失败');
      },
    });
  };

  const doExecute = async () => {
    if (!entName) {
      message.warning('请选择或填写企业名称');
      return;
    }
    if (!form.parsedExpression.trim()) {
      message.warning('请先解析规则表达式');
      return;
    }
    /** 「校验中…」最小可见时长的计时起点（含请求本身的耗时） */
    const startedAt = Date.now();
    setExecuteLoading(true);

    // 每次点「开始校验」都当**全新一次**（用户 2026-09-16：「已经再次发起校验了，上次的结果还挂着很怪」）：
    //   ① 掐掉可能还在跑的 AI/补充分析 SSE；
    //   ② 清空**上一次的全部产出** —— 校验结论、命中明细（溯源表）、AI分析、补充分析（含错误）；
    //   ③ 清空后由 `executeLoading` / `aiSending` / `sSending` 驱动各处的转圈等待态，
    //      新内容到达再落屏（等价于"从零开始跑一轮"）。
    aiAbortRef.current?.abort();
    sAbortRef.current?.abort();
    setExecuteResult(null);
    setMatchedMetrics([]);
    setExecInfo(null);
    // 溯源表分页归位：新一次校验的明细条数通常和上一次不同，页码留在旧值会停在空白页
    setTracePage(1);
    setAiText('');
    setAiShown('');
    setAiError('');
    setSText('');
    setSShown('');
    setSError('');

    try {
      // 与 AI 分析 / 补充分析共用同一套摊平逻辑，保证三条链路拿到的入参完全一致
      const requestParams = buildParamPayload();

      const res = await apiExecuteRule({
        entName,
        requestParams,
        parsedExpression: form.parsedExpression,
        promptKey: form.promptKey,
        thresholdConfig: form.threshold,
        factAnalysis: form.factAnalysis,
      });

      // 规则引擎是本地确定性计算，通常几十毫秒就回来，结果"啪"地落屏看着不像智能体在处理 →
      // 让「校验中…」至少可见 MIN_EXECUTE_MS。请求本身不延迟（已在途的耗时计入），
      // 慢请求（超过 MIN_EXECUTE_MS）不会被再加长。
      const rest = MIN_EXECUTE_MS - (Date.now() - startedAt);
      if (rest > 0) {
        await sleep(rest);
      }

      setMatchedMetrics(res?.matchedMetrics ?? []);
      const status = res?.resultStatus ?? null;
      setExecuteResult(status);
      // 取数/执行层面的事实（后端新增）：失败 ≠ 未命中；缺失值数量要如实告诉用户
      const failed = res?.executeFailed === true;
      setExecInfo({
        failed,
        missing: res?.missingValueCount ?? 0,
        total: res?.totalMetricCount ?? 0,
      });

      /*
       * 🔴 只有**表达式真的算成了**、而且结果是"命中"时，才去调 AI 分析（2026-09-16 修）。
       *
       * 原先只判 `!isMiss(status)`：而 `isMiss(null)` 为 true，所以"执行失败"恰好也被挡掉了 ——
       * 但那是**巧合**，不是显式约定；而且反过来，后端把空值/默认值算出的"命中"会照样触发分析，
       * 于是"随便填个 aaaaa 也能出 AI 分析"。现在把 `failed` 显式写进条件。
       */
      if (!failed && !isMiss(status)) {
        startAiAnalysis(res);
        if (suppValue) startSupplementaryAnalysis(res?.factExpression ?? '');
      }
    } catch (e) {
      message.error((e as Error)?.message || '校验失败');
    } finally {
      setExecuteLoading(false);
    }
  };

  /* ---------------- 保存 ---------------- */

  const doSave = async () => {
    if (!form.ruleName.trim()) {
      message.warning('请输入检查项名称');
      return;
    }
    if (!form.ruleText.trim()) {
      message.warning('请输入触发条件');
      return;
    }
    setSaveLoading(true);
    try {
      const fieldNames = params.map((p) => (p.fieldName || '').trim()).filter(Boolean);
      await apiSaveRule({
        id: form.id,
        ruleCode: form.ruleCode,
        ruleName: form.ruleName,
        topic1: form.firstTheme,
        topic2: form.secondTheme,
        ruleText: form.ruleText,
        parsedExpression: form.parsedExpression,
        promptKey: form.promptKey,
        thresholdConfig: form.threshold,
        factAnalysis: form.factAnalysis,
        riskRemark: form.riskInterpretation,
        disposalAdvice: form.disposalSuggestion,
        // 源工程：additionalAnalysis = supplementaryValue.key，additionalAnalysisName = supplementaryValue.label
        additionalAnalysis: suppValue?.value || '',
        additionalAnalysisName: suppValue?.label || '',
        requestParams: fieldNames.length ? JSON.stringify(fieldNames) : '',
      });
      message.success('保存成功');
      onSuccess();
    } catch (e) {
      message.error((e as Error)?.message || '保存失败');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleClose = () => {
    aiAbortRef.current?.abort();
    sAbortRef.current?.abort();
    resetAll();
    onClose();
  };

  /* ---------------- 渲染 ---------------- */

  /**
   * 🔴 表达式**执行失败** ≠ **未命中**（2026-09-16 修）
   *
   * 后端取不到指标值时，会拿空值/默认值去算表达式；算不成（异常）时 `resultStatus` 是 `null`。
   * 若不区分，界面会把"这次校验根本没成立"显示成"未命中"——把数据问题伪装成业务结论。
   */
  const execFailed = execInfo?.failed === true;

  const resultText = execFailed
    ? '校验失败：规则表达式无法执行'
    : typeof executeResult === 'string'
      ? executeResult
      : executeResult === true
        ? '命中'
        : executeResult === false
          ? '未命中'
          : '待校验';

  const resultColor = execFailed
    ? '#ff4d4f'
    : executeResult === true
      ? '#faad14'
      : executeResult === false
        ? '#52c41a'
        : '#8c8c8c';

  /**
   * 取数完整性提示（后端新增的 `missingValueCount` / `totalMetricCount`）
   *
   * 是否要有这条提示，取决于"用户能不能从结果里看出数据是空的"——
   * 实测：企业名填 `aaaaa` 时指标全部取不到值，但界面照样显示命中并跑 AI 分析。
   */
  const warnIncomplete = !execFailed && !!execInfo && execInfo.missing > 0 && execInfo.total > 0;

  /**
   * 「开始校验」链路的**阶段状态**（用户 2026-09-16：「要看起来非常像个 AI 智能体的效果」）
   *
   * 三个阶段与代码里的真实顺序**一一对应，不是假进度条**：
   *   ① 规则校验 = `apiExecuteRule`（含命中判定，由规则引擎本地计算）
   *   ② AI 分析   = 命中后 `startAiAnalysis` 的 SSE（moduleCode 写死 `IntelligentStrategyEngine`）
   *   ③ 补充分析 = 选了「补充分析」且命中时 `startSupplementaryAnalysis` 的 SSE
   *
   * ⚠️ **转圈图标必须自己传**：查过 antd v6 的 `steps/index.js`（L160~188），
   * `status='process'` 且**没有传 `icon`** 时它渲染的是 `-item-icon-number`（就是个序号），
   * **不会自动转圈**。所以进行中那一格显式给 `<LoadingOutlined spin />`。
   * 只在"进行中"传 icon，`finish`/`error` 仍用 antd 自带的 √ / ×。
   * **未命中时后两步标「未命中，跳过」**而不是留空/转圈 —— 否则看着像卡住了。
   */
  const executeSteps = useMemo<StepsProps['items']>(() => {
    // `execFailed` 时 resultStatus 是 null，但这次校验**已经跑过了**（只是没算成），
    // 所以 hasResult 要把失败也算进去，否则第 1 格会停留显示"待执行"。
    const hasResult = executeResult !== null || execFailed;
    const miss = hasResult && !execFailed && isMiss(executeResult);
    const running = <LoadingOutlined spin />;

    const items: StepsProps['items'] = [
      {
        title: '规则校验',
        // 表达式没算成 → error（antd 自带 ×），不要混进 finish 的"完成"语义
        status: executeLoading ? 'process' : execFailed ? 'error' : hasResult ? 'finish' : 'wait',
        icon: executeLoading ? running : undefined,
        description: executeLoading
          ? '校验中…'
          : execFailed
            ? '执行失败'
            : !hasResult
              ? '待执行'
              : miss
                ? '未命中'
                : '命中',
      },
      {
        title: 'AI 分析',
        status: aiSending ? 'process' : aiError ? 'error' : aiShown ? 'finish' : 'wait',
        icon: aiSending ? running : undefined,
        description: aiSending
          ? '分析中…'
          : aiError
            ? '失败'
            : aiShown
              ? '已完成'
              : miss
                ? '未命中，跳过'
                : '待执行',
      },
    ];
    // 未选「补充分析」时这一格没有意义，不展示
    if (suppValue) {
      items.push({
        title: '补充分析',
        status: sSending ? 'process' : sError ? 'error' : sShown ? 'finish' : 'wait',
        icon: sSending ? running : undefined,
        description: sSending
          ? '生成中…'
          : sError
            ? '失败'
            : sShown
              ? '已完成'
              : miss
                ? '未命中，跳过'
                : '待执行',
      });
    }
    return items;
  }, [executeLoading, executeResult, execFailed, aiSending, aiError, aiShown, sSending, sError, sShown, suppValue]);

  /**
   * 「校验溯源」表的列（源工程是手写 grid，字段与顺序逐条对齐）
   *
   * 为什么改成 antd `Table`：源工程 `.trace-body { max-height: 300px; overflow-y: auto }` 是**内部滚动**，
   * 而我们这版连这个限高都漏了（超长明细会把整块撑长）→ 改为**前端分页**（用户 2026-09-16 要求）。
   *
   * 规模依据（实测交付包 `agent_rule` 全 42 条检查项的 `parsed_expression`，统计其中 `{编号|名称}` 的**去重**个数）：
   * **中位 3 / 最大 24**（「报表真实性」），超过 10 行的只有 3 条（12、13、24 行）。
   * 也就是说分页对大多数检查项是 1 页、对少数长明细才有意义 —— 但 24 行塞在左栏 300px 里很难用，所以值得做。
   */
  /**
   * 🔴 「涉及指标」这一列**不是"命中的指标"**（2026-09-16 澄清 + 改展示）
   *
   * 后端 `executeRule` 里 `matchedMetrics = paramsList.stream().map(...)`，
   * 而 `paramsList` = **表达式里引用的全部指标**（`getParamsList(emptyMetricList(表达式))`）——
   * 它在**取数之前**就构造好了，取值用的还是 `rawDataSnapshot.getOrDefault(paramNo, "")`。
   * ⇒ 只要表达式引用了指标，这张表**必然有行**，与"取没取到值""算没算成"完全无关。
   * 字段名叫 `matchedMetrics` 容易误解成"命中结果"，实际是"**本次校验用到的指标清单**"。
   *
   * 所以"校验失败但溯源表有行"**不矛盾** —— 那几行的「命中值」为空。为了不再让人误会，
   * 空值不再显示成 `-`（太像"有数据"），改成灰色「未取到」。
   */
  const traceColumns = useMemo<ColumnsType<RuleMetricItem>>(
    () => [
      { title: '涉及指标', dataIndex: 'indexCode', width: '30%', render: (v: unknown) => String(v || '-') },
      { title: '指标名称', dataIndex: 'indexName', width: '30%', render: (v: unknown) => String(v || '-') },
      {
        title: '命中值',
        dataIndex: 'actualValue',
        width: '26%',
        render: (v: unknown) =>
          v === '' || v === undefined || v === null || v === 'null' ? (
            <span style={{ color: '#bfbfbf' }}>未取到</span>
          ) : (
            String(v)
          ),
      },
      { title: '单位', dataIndex: 'dataUnit', width: '14%', render: (v: unknown) => String(v || '-') },
    ],
    [],
  );

  /** 溯源表里"未取到值"的行数（表上方说明用，与后端 `missingValueCount` 同口径） */
  const traceMissingCount = useMemo(
    () =>
      matchedMetrics.filter(
        (m) =>
          m.actualValue === '' || m.actualValue === undefined || m.actualValue === null || m.actualValue === 'null',
      ).length,
    [matchedMetrics],
  );

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width="100%"
      style={{ top: 0, margin: 0, maxWidth: '100%', paddingBottom: 0 }}
      styles={{ body: { height: 'calc(100vh - 55px)', overflow: 'auto', background: '#f5f5f5', padding: 16 } }}
    >
      <Row gutter={24}>
        {/* 左栏：检查项 */}
        <Col xs={24} xl={12}>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>检查项</div>

            <Form layout="vertical">
              <Form.Item style={{ marginBottom: 12 }}>
                <Input
                  allowClear
                  placeholder="请输入检查项名称"
                  value={form.ruleName}
                  onChange={(e) => patch({ ruleName: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="规则编号" style={{ marginBottom: 12 }}>
                <Input
                  allowClear
                  placeholder="请输入规则编号"
                  value={form.ruleCode}
                  onChange={(e) => patch({ ruleCode: e.target.value })}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="一级主题" style={{ marginBottom: 12 }}>
                    <Input
                      allowClear
                      placeholder="一级主题"
                      value={form.firstTheme}
                      onChange={(e) => patch({ firstTheme: e.target.value })}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="二级主题" style={{ marginBottom: 12 }}>
                    <Input
                      allowClear
                      placeholder="二级主题"
                      value={form.secondTheme}
                      onChange={(e) => patch({ secondTheme: e.target.value })}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="触发条件" style={{ marginBottom: 12 }}>
                <Input.TextArea
                  rows={6}
                  placeholder="请输入触发条件"
                  value={form.ruleText}
                  onChange={(e) => patch({ ruleText: e.target.value })}
                />
              </Form.Item>
            </Form>

            <Collapse
              ghost
              items={[
                {
                  key: 'threshold',
                  label: '阈值设定',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      <Input.TextArea
                        rows={4}
                        placeholder="请输入阈值设定"
                        value={form.threshold}
                        onChange={(e) => patch({ threshold: e.target.value })}
                      />
                      <Button type="primary" loading={thresholdParseLoading} onClick={() => void doParse(true)}>
                        解析验证
                      </Button>
                      {thresholdParseStatus !== 'idle' && (
                        <div style={{ color: thresholdParseStatus === 'error' ? '#ff4d4f' : '#52c41a' }}>
                          {thresholdParseStatus === 'success' ? '解析成功' : thresholdParseMessage}
                        </div>
                      )}
                    </Space>
                  ),
                },
                {
                  key: 'parse',
                  label: '检查项解析',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      {isEditingExpr ? (
                        <Row gutter={8}>
                          <Col span={10}>
                            <Input.Search
                              allowClear
                              placeholder="请输入指标名称"
                              value={indexKeyword}
                              onChange={(e) => setIndexKeyword(e.target.value)}
                              style={{ marginBottom: 8 }}
                            />
                            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #f0f0f0', padding: 4 }}>
                              {filteredTree.length ? (
                                <Tree
                                  showLine
                                  treeData={toTreeData(filteredTree)}
                                  onSelect={onSelectIndex}
                                />
                              ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无指标数据" />
                              )}
                            </div>
                          </Col>
                          <Col span={14}>
                            <Input.TextArea
                              rows={15}
                              ref={(el) => {
                                exprRef.current = (el as unknown as { resizableTextArea?: { textArea: HTMLTextAreaElement } })
                                  ?.resizableTextArea?.textArea ?? null;
                              }}
                              placeholder="可在此编辑解析后的表达式"
                              value={form.parsedExpression}
                              onChange={(e) => patch({ parsedExpression: e.target.value })}
                            />
                            <div style={{ marginTop: 8, textAlign: 'right' }}>
                              <Button onClick={toggleEditExpr}>取消</Button>
                            </div>
                          </Col>
                        </Row>
                      ) : (
                        <>
                          {parseStatus === 'success' ? (
                            <pre
                              style={{
                                background: '#fafafa',
                                border: '1px solid #f0f0f0',
                                borderRadius: 4,
                                padding: 8,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                margin: 0,
                                maxHeight: 260,
                                overflow: 'auto',
                              }}
                            >
                              {form.parsedExpression}
                            </pre>
                          ) : (
                            <div style={{ color: parseStatus === 'failed' ? '#ff4d4f' : '#8c8c8c' }}>
                              {parseStatus === 'failed'
                                ? parseErrorMessage
                                : '请调用智能体解析检查项的触发条件'}
                            </div>
                          )}
                          <Space>
                            <Button onClick={toggleEditExpr}>编辑</Button>
                            <Button type="primary" loading={parseLoading} onClick={() => void doParse(false)}>
                              {parseStatus === 'unparsed' ? '调用检查项解析智能体' : '重新解析'}
                            </Button>
                          </Space>
                        </>
                      )}
                    </Space>
                  ),
                },
                {
                  key: 'fact',
                  label: '事实分析',
                  children: (
                    <Input.TextArea
                      rows={4}
                      placeholder="请输入事实分析"
                      value={form.factAnalysis}
                      onChange={(e) => patch({ factAnalysis: e.target.value })}
                    />
                  ),
                },
                {
                  key: 'risk',
                  label: '风险释义',
                  children: (
                    <Input.TextArea
                      rows={4}
                      placeholder="请输入风险释义"
                      value={form.riskInterpretation}
                      onChange={(e) => patch({ riskInterpretation: e.target.value })}
                    />
                  ),
                },
                {
                  key: 'disposal',
                  label: '处置意见',
                  children: (
                    <Input.TextArea
                      rows={4}
                      placeholder="请输入处置意见"
                      value={form.disposalSuggestion}
                      onChange={(e) => patch({ disposalSuggestion: e.target.value })}
                    />
                  ),
                },
              ]}
            />

            <Form.Item label="补充分析" style={{ marginTop: 12, marginBottom: 12 }}>
              {/* `labelInValue`：对齐源工程的 `label-in-value`，显示用 label（名称）而不是 value（码值） */}
              <Select
                allowClear
                showSearch
                labelInValue
                placeholder="请选择补充分析"
                style={{ width: '100%' }}
                value={suppValue}
                filterOption={false}
                onSearch={(v) => void loadSuppOptions(v)}
                onChange={(v) => {
                  const item = v as { value?: unknown; label?: unknown } | null | undefined;
                  setSuppValue(
                    item && item.value !== undefined && item.value !== null
                      ? { value: String(item.value), label: String(item.label ?? item.value) }
                      : undefined,
                  );
                }}
                options={suppOptions.map((o) => ({ label: o.paramName, value: o.paramNo }))}
              />
            </Form.Item>

            <Space style={{ marginTop: 8 }}>
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" loading={saveLoading} onClick={() => void doSave()}>
                保存
              </Button>
            </Space>
          </Card>
        </Col>

        {/* 右栏：解析校验 */}
        <Col xs={24} xl={12}>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>解析校验</div>

            <div style={{ marginBottom: 8, color: '#595959' }}>请求参数</div>
            {params.map((p, i) => (
              <Row gutter={8} key={i} style={{ marginBottom: 8 }}>
                <Col flex="auto">
                  {p.fieldName === 'entName' ? (
                    /* 对齐源工程（`RuleFormModal.vue` 模板 320~328 行）：entName 这一行的
                       **字段名是只读文本**，只有「值」（企业名称）可填 —— 原先做成了可编辑输入框，
                       用户能误改字段名导致校验取不到企业名。 */
                    <div
                      style={{
                        height: 32,
                        lineHeight: '30px',
                        paddingInlineStart: 11,
                        color: 'rgba(0, 0, 0, 0.65)',
                        background: '#fafafa',
                        border: '1px solid #d9d9d9',
                        borderRadius: 6,
                      }}
                    >
                      entName
                    </div>
                  ) : (
                    <Input
                      placeholder="字段名"
                      value={p.fieldName}
                      onChange={(e) =>
                        setParams((prev) => prev.map((x, xi) => (xi === i ? { ...x, fieldName: e.target.value } : x)))
                      }
                    />
                  )}
                </Col>
                <Col flex="auto">
                  <Input
                    allowClear
                    placeholder={p.fieldName === 'entName' ? '企业名称' : '字段值'}
                    value={p.fieldValue}
                    onChange={(e) =>
                      setParams((prev) => prev.map((x, xi) => (xi === i ? { ...x, fieldValue: e.target.value } : x)))
                    }
                  />
                </Col>
                <Col>
                  <Space size={4}>
                    <Button
                      type="primary"
                      ghost
                      shape="circle"
                      onClick={() => setParams((prev) => [...prev, { fieldName: '', fieldValue: '' }])}
                    >
                      +
                    </Button>
                    {params.length > 1 && (
                      <Button
                        danger
                        ghost
                        shape="circle"
                        onClick={() => setParams((prev) => prev.filter((_, xi) => xi !== i))}
                      >
                        -
                      </Button>
                    )}
                  </Space>
                </Col>
              </Row>
            ))}
            <Button type="primary" loading={executeLoading} onClick={() => void doExecute()}>
              开始校验
            </Button>

            {/* 流程状态：把「开始校验」的真实链路显式摆出来 —— 规则校验 → AI 分析 →（补充分析）。
                进行中的那格自动转圈，未命中标「跳过」，让人一眼看出走到哪一步、是不是在跑。 */}
            <Steps size="small" items={executeSteps} style={{ marginTop: 18, marginBottom: 4 }} />

            <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>校验结果</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 4,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                /* 校验中固定灰色，避免把上一次的「命中(黄)/未命中(绿)」颜色留在等待态里 */
                color: executeLoading ? '#8c8c8c' : resultColor,
                fontWeight: 600,
              }}
            >
              {executeLoading ? (
                /* 规则引擎算得太快（几十毫秒），这里让"校验中…"至少可见 MIN_EXECUTE_MS，
                   否则结果瞬间落屏，看不出有在处理（2026-09-16 用户反馈） */
                <>
                  <Spin size="small" />
                  <span>校验中…</span>
                </>
              ) : (
                <>
                  {/* 对齐源工程：命中 = 黄色告警图标；未命中 = 绿色通过图标（`result-panel` 的 hit/miss）；
                      执行失败 = 红色失败图标（本工程新增，源工程没有这个状态，它把失败吞成了"未命中"） */}
                  {execFailed && <CloseCircleFilled />}
                  {!execFailed && executeResult === true && <WarningFilled />}
                  {!execFailed && executeResult === false && <CheckCircleFilled />}
                  <span>{resultText}</span>
                </>
              )}
            </div>

            {/* 取数完整性提示（本工程新增，2026-09-16）：
                `entName` 只是个普通入参，后端不校验企业是否存在 —— 填 `aaaaa` 这种不存在的企业时，
                指标 SQL 照常执行但返回 0 行，表达式拿空值/默认值算出"命中"，还会触发 AI 分析。
                这条提示让"数据是空的"这件事在界面上无法被忽略。 */}
            {(execFailed || warnIncomplete) && execInfo && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 4,
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  color: '#614700',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                本次校验涉及 <b>{execInfo.total}</b> 个指标，其中 <b>{execInfo.missing}</b> 个
                <b>未取到值</b>。
                {execInfo.missing === execInfo.total && execInfo.total > 0
                  ? '（全部为空——通常是企业名称不存在或该企业本期没有数据）'
                  : ''}
                {execFailed
                  ? '表达式在缺失值上无法执行，本次校验没有结论；请核对「企业名称」后重试。'
                  : '缺失值会以空值/默认值参与计算，命中结论仅供参考；请核对「企业名称」。'}
              </div>
            )}

            {/* AI分析：块的出现条件与源工程一致（`finalText || sending`），并额外保留**错误态**，
                避免"失败了却整块消失"，让用户以为功能不存在（2026-09-16 修复）。 */}
            {(aiSending || aiShown || aiError) && (
              <>
                <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>AI分析</div>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, maxHeight: 320, overflow: 'auto' }}>
                  {aiError ? (
                    <div style={{ color: '#ff4d4f' }}>{aiError}</div>
                  ) : (
                    <>
                      {/* 源工程这里是 loading.gif；本工程没有该资源 → 用「智能体执行中」面板表达同一状态
                          （2026-09-16 由 `Spin + 文字` 升级，用户反馈"等待效果太普通、不像智能体在跑"）。
                          判据用 `aiDisplay.text`（打字机输出）而非 `aiText`：打字机滞后于 SSE，
                          用累积值会让面板提前消失、出现短暂空白。
                          现在每次校验都会先清空上一次内容，所以这里**就是**"新一次的开始"，
                          不再区分"生成中/重新生成中"。 */}
                      {aiSending && !aiDisplay.text && (
                        <AgentRunning
                          compact
                          title="智能体正在分析命中情况"
                          hints={AI_HINTS}
                          padding={12}
                        />
                      )}
                      {/* 后端 enable_think=true 时会把思考内容用 <think>…</think> 包起来一起推，
                          这里交给 ThinkText 折叠显示（不渲染的话页面上会看到裸露的标签） */}
                      <ThinkText
                        text={aiDisplay.text}
                        renderText={(t) => <MarkdownText content={t} placeholder={aiSending ? '生成中…' : '-'} />}
                        tail={<StreamCaret show={aiSending || aiDisplay.printing} />}
                      />
                    </>
                  )}
                </div>
              </>
            )}

            {/* 补充分析：**选中即出现**（对齐源工程 `v-if="supplementaryValue"`），
                原先要求"有文本或在生成中"才渲染 → 刚选完看不到这一块。 */}
            {suppValue && (
              <>
                <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>补充分析</div>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, maxHeight: 320, overflow: 'auto' }}>
                  {sError ? (
                    <div style={{ color: '#ff4d4f' }}>{sError}</div>
                  ) : (
                    <>
                      {sSending && !sDisplay.text && (
                        <AgentRunning
                          compact
                          title="智能体正在生成补充分析"
                          hints={SUPP_HINTS}
                          padding={12}
                        />
                      )}
                      {/* 未命中时不会触发补充分析（与源工程一致），此处给出说明而不是留空 */}
                      {!sSending && !sShown && !sError && (
                        <div style={{ color: '#8c8c8c' }}>点「开始校验」后生成（未命中不生成）</div>
                      )}
                      <ThinkText
                        text={sDisplay.text}
                        renderText={(t) => <MarkdownText content={t} placeholder={sSending ? '生成中…' : '-'} />}
                        tail={<StreamCaret show={sSending || sDisplay.printing} />}
                      />
                    </>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>校验溯源</div>
            {/* 🔴 口径说明（2026-09-16 加）：这张表**不等于"命中结果"** ——
                它是「本次表达式引用的指标清单」，在取数之前就定下来了，
                所以"校验失败却仍有行"是正常的，关键看「命中值」列。
                不放说明的话，用户会以为"有行 = 有数据 = 校验成功"（用户就是这么问的）。 */}
            {matchedMetrics.length > 0 && (
              <div style={{ marginBottom: 8, fontSize: 12, color: '#8c8c8c', lineHeight: 1.6 }}>
                下方是本次表达式引用的 <b>{matchedMetrics.length}</b> 个指标（
                <b>指标清单，不等于「命中结果」</b>）；其中{' '}
                <b style={{ color: traceMissingCount > 0 ? '#faad14' : '#8c8c8c' }}>{traceMissingCount}</b> 个未取到值，
                显示为灰色「未取到」。
              </div>
            )}
            {/* 源工程是手写 grid + `.trace-body{max-height:300px;overflow-y:auto}`（内部滚动），
                但那 300px 对几十行的长明细依然难用（实测最大 24 行）→ 改为**前端分页**。
                `matchedMetrics` 是校验接口**一次性返回的完整明细**（不是服务端分页列表），
                所以这里分页纯属展示层，不需要新接口、也不需要改后端。 */}
            <Table<RuleMetricItem>
              rowKey={(_row, index) => String(index)}
              size="small"
              bordered
              columns={traceColumns}
              dataSource={matchedMetrics}
              pagination={{
                current: tracePage,
                pageSize: tracePageSize,
                size: 'small',
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, size) => {
                  setTracePage(page);
                  setTracePageSize(size);
                },
              }}
              locale={{
                /* 点「开始校验」时会先清空上一次的明细，所以这里要区分"正在跑"和"确实没有"；
                   执行失败时明细行是有的（只是值全空），说明白比"暂无"更有用 */
                emptyText: (
                  <div style={{ padding: 16, color: '#8c8c8c' }}>
                    {executeLoading ? '校验中…' : execFailed ? '校验失败，未能取到指标值' : '暂无溯源数据'}
                  </div>
                ),
              }}
            />
          </Card>
        </Col>
      </Row>
    </Modal>
  );
}
