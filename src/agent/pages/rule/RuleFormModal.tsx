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
 *   3) **AI分析 / 补充分析增补三处可观测性**（2026-09-16，源工程没有）：
 *      ① 出错把原因显示出来（源工程出错时整块消失，看不出是失败）；
 *      ② 流结束但一个字都没收到 → 明确提示；
 *      ③ 重新生成时保留上一次结果，不再整块刷白重打。
 *      （打字机效果 `useTypewriter` 与源 `PrintMixin` 对齐，非差异。）
 *
 * 校验前置条件（照抄源工程，别"优化"掉，否则用户会拿到莫名其妙的报错）：
 *   - 解析前必须填「阈值设定」（源工程就用阈值去调解析接口）
 *   - 校验前必须有企业名称 + 已解析的表达式
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'react';
import { Button, Card, Col, Collapse, Empty, Form, Input, Modal, Row, Select, Space, Tree, message } from 'antd';
import type { TreeDataNode } from 'antd';
import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
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

/** 触发条件解析智能体在知识库侧的 moduleCode（源工程写死） */
const AI_ANALYSIS_MODULE_CODE = 'IntelligentStrategyEngine';

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
  const [executeResult, setExecuteResult] = useState<boolean | string | null>(null);

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
   *   · `aiShown` / `sShown` = **界面实际展示的**文本 —— 只有新内容到达时才顶上。
   * 分开的原因（用户反馈"再次点击会先刷成空白再重新打字"）：若直接用累积值做展示，
   * 开流瞬间会先清空 → 整块刷白，然后才逐字重打。保留上一次结果视觉上更连续。
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

  /** 新内容一到就顶上展示值；`aiText` 为空（刚开流）时保留上一次结果，避免整块刷白 */
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
    } catch {
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
      setAiText('');
      setSText('');
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
   * AI 分析（源工程 `aiAnalysisPostText`，moduleCode 写死 `IntelligentStrategyEngine`）
   *
   * 🔴 三处**必须区分"失败"和"空结果"**（2026-09-16 修复）：
   *   1. 开流只清 `aiText`（累积值），**不动 `aiShown`** → 不再整块刷白；
   *   2. 流结束时若一个字都没收到 → 明确提示（此前表现为"整块凭空消失"，看着像功能没做）；
   *   3. 出错把原因显示出来 —— 后端在 `large_model_code` 为空时会推一帧
   *      `{"code":500,"message":"非法的大模型CODE:"}`（知识库未配置即属此类），
   *      `agentSse` 现已识别该帧并抛错，这里落到 `aiError` 上。
   */
  const startAiAnalysis = (result: RuleExecuteResult) => {
    aiAbortRef.current?.abort();
    setAiText('');
    setAiError('');
    setAiSending(true);
    let received = false;
    let errored = false;
    aiAbortRef.current = agentSse({
      url: '/agent/get',
      body: {
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
    setSError('');
    setSSending(true);
    let received = false;
    let errored = false;
    sAbortRef.current = agentSse({
      url: '/agent/get',
      body: {
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
    setExecuteLoading(true);
    try {
      const requestParams: Record<string, unknown> = {};
      params.forEach((p) => {
        const key = (p.fieldName || '').trim();
        if (key) requestParams[key] = key === 'entName' ? (p.fieldValue || '').trim() : p.fieldValue;
      });

      const res = await apiExecuteRule({
        entName,
        requestParams,
        parsedExpression: form.parsedExpression,
        promptKey: form.promptKey,
        thresholdConfig: form.threshold,
        factAnalysis: form.factAnalysis,
      });

      aiAbortRef.current?.abort();
      setAiText('');
      setMatchedMetrics(res?.matchedMetrics ?? []);
      const status = res?.resultStatus ?? null;
      setExecuteResult(status);

      if (!isMiss(status)) {
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

  const resultText =
    typeof executeResult === 'string'
      ? executeResult
      : executeResult === true
        ? '命中'
        : executeResult === false
          ? '未命中'
          : '待校验';

  const resultColor =
    executeResult === true ? '#faad14' : executeResult === false ? '#52c41a' : '#8c8c8c';

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
                color: resultColor,
                fontWeight: 600,
              }}
            >
              {/* 对齐源工程：命中 = 黄色告警图标；未命中 = 绿色通过图标（`result-panel` 的 hit/miss） */}
              {executeResult === true && <WarningFilled />}
              {executeResult === false && <CheckCircleFilled />}
              <span>{resultText}</span>
            </div>

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
                      {/* 源工程这里是 loading.gif；本工程没有该资源，用文字占位表达同一状态 */}
                      {aiSending && !aiText && (
                        <div style={{ color: '#8c8c8c' }}>{aiShown ? '重新生成中…' : '生成中…'}</div>
                      )}
                      {/* 后端 enable_think=true 时会把思考内容用 <think>…</think> 包起来一起推，
                          这里交给 ThinkText 折叠显示（不渲染的话页面上会看到裸露的标签） */}
                      <ThinkText
                        text={aiDisplay.text}
                        renderText={(t) => <MarkdownText content={t} placeholder={aiSending ? '生成中…' : '-'} />}
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
                      {sSending && !sText && (
                        <div style={{ color: '#8c8c8c' }}>{sShown ? '重新生成中…' : '生成中…'}</div>
                      )}
                      {!sSending && !sShown && <div style={{ color: '#8c8c8c' }}>点「开始校验」后生成</div>}
                      <ThinkText
                        text={sDisplay.text}
                        renderText={(t) => <MarkdownText content={t} placeholder={sSending ? '生成中…' : '-'} />}
                      />
                    </>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>校验溯源</div>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 4 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 80px',
                  background: '#fafafa',
                  padding: '8px 12px',
                  fontWeight: 600,
                }}
              >
                <span>涉及指标</span>
                <span>指标名称</span>
                <span>命中值</span>
                <span>单位</span>
              </div>
              {matchedMetrics.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#8c8c8c' }}>暂无溯源数据</div>
              ) : (
                matchedMetrics.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 80px',
                      padding: '8px 12px',
                      borderTop: '1px solid #f0f0f0',
                    }}
                  >
                    <span>{m.indexCode || '-'}</span>
                    <span>{m.indexName || '-'}</span>
                    <span>
                      {m.actualValue === '' || m.actualValue === undefined || m.actualValue === null || m.actualValue === 'null'
                        ? '-'
                        : m.actualValue}
                    </span>
                    <span>{m.dataUnit || '-'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </Modal>
  );
}
