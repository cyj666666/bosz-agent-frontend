/**
 * 智策引擎 — 检查项新增/编辑（全屏弹窗）
 *
 * 对应源工程 `amar-agent-admin/src/views/app/rule/RuleFormModal.vue`（1718 行 Vue）。
 * 左右两栏：左侧「检查项」表单，右侧「解析校验」。
 *
 * 与源工程的三处刻意差异（均不改变功能，只为贴合 React/宿主习惯）：
 *   1) **不做打字机效果**。源工程用 `PrintMixin` + tween.js 做逐字打印 + 自动滚动，
 *      属于纯视觉装饰；这里改为"收到即渲染"，流式内容一样是逐段出现的。
 *   2) **SSE 结束做双保险**（见 api/agentSse.ts 注释），源工程只认服务端下发的 `finished!`。
 *   3) **返回体判断**：源工程判 `res.success`，本工程由 agentRequest 统一校验 code 并解包，
 *      这里只写 try/catch。
 *
 * 校验前置条件（照抄源工程，别"优化"掉，否则用户会拿到莫名其妙的报错）：
 *   - 解析前必须填「阈值设定」（源工程就用阈值去调解析接口）
 *   - 校验前必须有企业名称 + 已解析的表达式
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'react';
import { Button, Card, Col, Collapse, Empty, Form, Input, Modal, Row, Select, Space, Tree, message } from 'antd';
import type { TreeDataNode } from 'antd';
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

  const [suppOptions, setSuppOptions] = useState<SupplementaryOption[]>([]);
  const [suppValue, setSuppValue] = useState<string | undefined>(undefined);

  const [aiText, setAiText] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [sText, setSText] = useState('');
  const [sSending, setSSending] = useState(false);

  /**
   * 打字机（源 `views/knowledge/components/printMixin.js`）
   *
   * `setAiText` / `setSText` 收的是 **SSE 累积的完整文本**（相当于源件的 `resContent`），
   * 这里由 `useTypewriter` 负责逐字"追"出来给界面显示（相当于源件的 `finalText`）。
   * 关闭时传 `enabled: false` 即退化为"收到即渲染"。
   */
  const aiDisplay = useTypewriter(aiText);
  const sDisplay = useTypewriter(sText);

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
    setSText('');
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
        setSuppValue(code);
        patch({ additionalAnalysisName: hit ? hit.paramName : code });
      }
    } catch {
      setSuppOptions([]);
    }
  }, [patch]);

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
      setSuppValue(oldData.additionalAnalysis || undefined);
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

  const startAiAnalysis = (result: RuleExecuteResult) => {
    aiAbortRef.current?.abort();
    setAiText('');
    setAiSending(true);
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
      onChunk: (c) => setAiText((prev) => prev + c.text),
      onDone: () => setAiSending(false),
      onError: () => setAiSending(false),
    });
  };

  const startSupplementaryAnalysis = (factExpression: string) => {
    if (!suppValue) return;
    sAbortRef.current?.abort();
    setSText('');
    setSSending(true);
    sAbortRef.current = agentSse({
      url: '/agent/get',
      body: {
        moduleCode: suppValue,
        entName,
        factExpression: factExpression || '',
        stream: true,
        withModelSummary: true,
        finishFlag: 'true',
      },
      onChunk: (c) => setSText((prev) => prev + c.text),
      onDone: () => setSSending(false),
      onError: () => setSSending(false),
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
        additionalAnalysis: suppValue || '',
        additionalAnalysisName: suppOptions.find((o) => o.paramNo === suppValue)?.paramName || '',
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
              <Select
                allowClear
                showSearch
                placeholder="请选择补充分析"
                style={{ width: '100%' }}
                value={suppValue}
                filterOption={false}
                onSearch={(v) => void loadSuppOptions(v)}
                onChange={(v) => setSuppValue(v)}
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
                  <Input
                    placeholder="字段名"
                    value={p.fieldName}
                    onChange={(e) =>
                      setParams((prev) => prev.map((x, xi) => (xi === i ? { ...x, fieldName: e.target.value } : x)))
                    }
                  />
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
                padding: '10px 16px',
                borderRadius: 4,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                color: resultColor,
                fontWeight: 600,
              }}
            >
              {resultText}
              {aiSending ? '（AI 分析生成中…）' : ''}
            </div>

            {(aiText || aiSending) && (
              <>
                <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>AI分析</div>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, maxHeight: 320, overflow: 'auto' }}>
                  <MarkdownText content={aiDisplay.text} placeholder={aiSending ? '生成中…' : '-'} />
                </div>
              </>
            )}

            {suppValue && (sText || sSending) && (
              <>
                <div style={{ marginTop: 20, marginBottom: 8, color: '#595959' }}>补充分析</div>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, padding: 8, maxHeight: 320, overflow: 'auto' }}>
                  <MarkdownText content={sDisplay.text} placeholder={sSending ? '生成中…' : '-'} />
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
