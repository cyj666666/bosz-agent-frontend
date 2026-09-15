/**
 * 知识库配置弹窗（全屏三栏）
 *
 * React 重写自源工程 `knowledge/components/KnownConfigModalV2.vue`（756 行）。
 *
 * ⚠️ 源工程里有 `KnownConfigModal.vue`（1198 行）与 `KnownConfigModalV2.vue`（756 行）两版，
 *    但 `KnownList.vue` 的 import 指向的是 **V2**（只是注册名仍叫 `KnownConfigModal`）。
 *    **V1 是废弃版本，本工程不迁移**——这是核对 `KnownList.vue:87` 后确认的事实，
 *    不是"少搬了一个文件"。
 *
 * ── 布局 ──
 *   左栏 288px  指标 / 规则 两个 tab（点节点 → 往中栏当前聚焦的文本域插入
 *               `{{指标名||编号}}` 或 `[[规则名||编码]]`）
 *   中栏 flex   ① prompt 配置（条件组编辑器，variant='prompt'）
 *               ② 输出要求（variant='output'，带 ELSE 分支 + 是否置顶）
 *               ③ 业务经验知识（纯文本）
 *               ④ 分段与检索策略（仅在 hasAuth 时显示）
 *   右栏 26%    模型配置 + 用户提示词 + 请求参数（测试集）
 *
 * ── 数据契约 ──
 *   读：`queryInfo({ paramId })` → 整个 configInfo 直接铺到表单
 *   写：`updateKnowledge({ ...configInfo, relateFlag: '1' })`
 *   其中三个字段是 **JSON 串**，必须按源工程的结构序列化：
 *     prompt            = JSON(promptGroups)
 *     contentDesc       = JSON(outputGroups)
 *     inputCondition    = JSON(elseCondition)
 *     splitStrategyParam= JSON(splitStrategy)
 *
 * ── 两个「按大模型分份」的映射（与源工程的语义逐条对齐，改动前务必看懂）──
 *
 * 源工程有两个独立的 map，key 都是**大模型 code**，且由**同一次模型切换**驱动：
 *
 *   ① `largeModelContent = { [code]: JSON(输出要求条件组) }`
 *      - 源位置：`OutputDemand.vue`
 *      - **写入**：`changeCondition()` —— 条件组每次变动（子组件 `PromptConfigItem` 的 `formInfo`
 *        watcher → `emit('change')`）。即"编辑即写回当前模型那一份"。
 *      - **读取**：`largeModelCodeChange(code)` —— 切模型时 `JSON.parse(map[code])` 灌进
 *        `conditionList`；**没有该模型的记录就重置为一条空条件组**。
 *      - 存的是 `contentDesc`（当前模型那份）+ `largeModelContent`（整张 map）两个字段。
 *
 *   ② `largeModelParam = { [code]: { topP, temperature, enableThink, systemContent } }`
 *      - 源位置：`LargeModelParam.vue`（`codeForm` + `changeCodeParam` / `setCodeParam`）
 *      - 语义与 ① 完全对称：编辑写回当前模型那一份，切模型载入那一份。
 *
 * 切换链路：`LargeModelParam` 的 select `@change` → `OutputLargeModel` →
 *          `eventhub.$emit('largeModelCodeChange')` → `OutputDemand` 在 `onMounted` 订阅接收。
 *          React 侧没有 eventhub，改为由本组件在 `handleLargeModelChange` 里一次分发到两个 map。
 *
 * ⚠️ **为什么必须做（此前不做会静默毁数据）**
 *   后端 `KnowledgeBaseConfigServiceImpl#updateKnowledgeBaseParamsInfo` 会拿**库里的旧 map**
 *   加上本次提交的 `contentDesc`，按 `largeModelCode` 做一次 `put` 再整体回写；
 *   而 `KnowledgeBaseParamsInfoSaveReq` 里**根本没有 `largeModelContent` 字段**，
 *   前端传上去的整张 map 在反序列化阶段就被丢弃了。
 *   于是若"切模型不换出该模型的输出要求"，用户切到 M2 后改的其实是 M1 的内容，
 *   一保存就把 **M2 原本那份覆盖掉**。→ 所以本组件必须自己维护并切换 map。
 *
 * ⚠️ 注意 `largeModelParam` 与 ① 相反：后端**不做任何合并**，前端提交什么就存什么
 *   （`PreviewLargeModel` 才按 `largeModelCode` 取出那一份，塞进 `temperature` / `top_p` /
 *   `enable_think` / `system_content` 去真正调用大模型）。故这张 map 前端是唯一责任方。
 *
 * ⚠️ `elseCondition`（ELSE 分支）与右栏「用户提示词」**不参与分模型**，是全局共享的
 *   （源 `getFormInfo()` 里它们是顶层 `inputCondition` / `configInfo.userPrompt`）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Input, InputNumber, Modal, Radio, Row, Select, Space, Spin, Switch, Tabs, Tooltip, message } from 'antd';
import type { InputRef } from 'antd';
import { agentSse } from '../../api/agentSse';
import type { AgentSseHandle } from '../../api/agentSse';
import { IndexTreePicker } from '../../components/IndexTreePicker';
import type { IndexTreePickerNode } from '../../components/IndexTreePicker';
import { RuleTreePicker } from '../../components/RuleTreePicker';
import type { RuleTreePickerNode } from '../../components/RuleTreePicker';
import { PromptConditionEditor, createConditionGroups, parseConditionGroups } from '../../components/PromptConditionEditor';
import type {
  ElseCondition,
  PromptConditionEditorHandle,
  PromptConditionItem,
} from '../../components/PromptConditionEditor';
import { KnowledgeSplitStrategyPanel, parseSplitStrategy } from './KnowledgeSplitStrategyPanel';
import type { SplitStrategyParam } from './KnowledgeSplitStrategyPanel';
import { TestSetPanel } from './TestSetPanel';
import type { InputParamItem } from './TestSetPanel';
import { TraceConfigModal } from './TraceConfigModal';
import { ConfigParamsModal } from './ConfigParamsModal';
import { IndexParamConfigModal } from './IndexParamConfigModal';
import { BlackBoxConfigModal } from './BlackBoxConfigModal';
import { useTypewriter } from '../../components/useTypewriter';
import { HistoryVersionModal, PublishVersionModal } from './VersionModals';
import { getLargeModelOptions, previewKnowledge, queryGroupTree, queryInfo, queryVersionById, updateKnowledge } from '../../api/knowledgeConfig';
import type { KnowledgeGroupNode, SelectOption } from '../../api/knowledgeConfig';

export interface KnowledgeConfigEditorProps {
  open: boolean;
  knownId: string;
  knownName?: string;
  knownCode?: string;
  onClose: () => void;
  /** 保存成功（父级刷新列表） */
  onSaved?: () => void;
}

/** configInfo 用宽松类型承载（后端字段有 30+ 个，逐个声明反而易漏） */
type ConfigInfo = Record<string, unknown>;

/** 解析 ELSE 分支（源 `inputCondition`） */
function parseElse(raw?: unknown): ElseCondition {
  if (typeof raw !== 'string' || !raw) return { output: '', usePrompt: '', modelInfo: {} };
  try {
    const parsed = JSON.parse(raw) as ElseCondition;
    return {
      output: parsed?.output ?? '',
      usePrompt: parsed?.usePrompt ?? '',
      modelInfo: parsed?.modelInfo ?? {},
    };
  } catch {
    return { output: raw, usePrompt: '', modelInfo: {} };
  }
}

/* ---------------- 「按大模型分份」的两个 map ---------------- */

/** 单个大模型下的模型参数（源 `LargeModelParam.vue` 的 `codeForm`） */
interface ModelParam {
  topP?: number | null;
  temperature?: number | null;
  systemContent?: string;
  enableThink?: boolean | null;
}

/** 源 `setCodeParam()` 的兜底值：该模型没有记录时用的空表单 */
const EMPTY_MODEL_PARAM: ModelParam = { topP: null, temperature: null, systemContent: '', enableThink: null };

/**
 * 解析 `largeModelContent`（源 `OutputDemand` 的 watch(props.largeModelContent)）
 * 正常形态 `{ [code]: "条件组JSON串" }`；容错：值若已是对象/数组，重新串化以便下游统一解析。
 */
function parseOutputContentMap(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    Object.keys(parsed as Record<string, unknown>).forEach((code) => {
      const value = (parsed as Record<string, unknown>)[code];
      if (typeof value === 'string') out[code] = value;
      else if (value !== null && value !== undefined) out[code] = JSON.stringify(value);
    });
    return out;
  } catch {
    return {};
  }
}

/** 解析 `largeModelParam`（源 `LargeModelParam` 的 watch(props.largeModelParam) + `setCodeParam()`） */
function parseModelParamMap(raw: unknown): Record<string, ModelParam> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, ModelParam> = {};
    Object.keys(parsed as Record<string, unknown>).forEach((code) => {
      const value = (parsed as Record<string, unknown>)[code];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const form = value as ModelParam;
        out[code] = {
          topP: form.topP ?? null,
          temperature: form.temperature ?? null,
          systemContent: form.systemContent ?? '',
          enableThink: form.enableThink ?? null,
        };
      }
    });
    return out;
  } catch {
    return {};
  }
}

/** 取 antd `Input.TextArea` 的原生 DOM（不同小版本 ref 形态不同，做兼容取值） */
function getTextAreaEl(ref: unknown): HTMLTextAreaElement | null {
  const r = ref as
    | { nativeElement?: HTMLTextAreaElement; resizableTextArea?: { textArea?: HTMLTextAreaElement } }
    | null;
  return r?.nativeElement ?? r?.resizableTextArea?.textArea ?? null;
}

/**
 * 把文本插到原生 textarea 的光标处（源工程靠 `editfocus` + `window.postMessage` 桥实现，React 侧直接操作 DOM）。
 * ⚠️ 受控组件必须走**原生 value setter** 再派发 input 事件，否则 React 的 value 追踪会吞掉这次变更。
 */
function insertIntoTextarea(el: HTMLTextAreaElement | null, text: string) {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  if (setter) setter.call(el, next);
  else el.value = next;
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function KnowledgeConfigEditor({
  open,
  knownId,
  knownName,
  knownCode,
  onClose,
  onSaved,
}: KnowledgeConfigEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configInfo, setConfigInfo] = useState<ConfigInfo>({});

  /** 三个条件组状态（保存时各自序列化） */
  const [promptGroups, setPromptGroups] = useState<PromptConditionItem[]>(() => createConditionGroups(false));
  const [outputGroups, setOutputGroups] = useState<PromptConditionItem[]>(() => createConditionGroups(true));
  const [elseCondition, setElseCondition] = useState<ElseCondition>({ output: '', usePrompt: '', modelInfo: {} });
  const [splitStrategy, setSplitStrategy] = useState<SplitStrategyParam>(parseSplitStrategy(''));
  const [inputParam, setInputParam] = useState<InputParamItem[]>([]);

  /* ---- 两个「按大模型分份」的 map（语义见文件头注释，改动前必读）---- */
  /** `{ [大模型code]: JSON(输出要求条件组) }` —— 源 `OutputDemand` 的 `largeModelContent` */
  const [largeModelContent, setLargeModelContent] = useState<Record<string, string>>({});
  /** `{ [大模型code]: 模型参数表单 }` —— 源 `LargeModelParam` 的 `largeModelParam` */
  const [largeModelParam, setLargeModelParam] = useState<Record<string, ModelParam>>({});

  const [modelOptions, setModelOptions] = useState<SelectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<KnowledgeGroupNode[]>([]);

  /** 左栏 */
  const [treeVisible, setTreeVisible] = useState(true);
  const [leftTab, setLeftTab] = useState<'index' | 'rule'>('index');

  /** 当前聚焦的编辑器（决定左侧树点选插入到哪里） */
  const activeEditor = useRef<'prompt' | 'output' | 'userPrompt' | 'modelSystem'>('prompt');
  const promptEditorRef = useRef<PromptConditionEditorHandle>(null);
  const outputEditorRef = useRef<PromptConditionEditorHandle>(null);
  const userPromptRef = useRef<InputRef>(null);
  /** 右栏「系统提示词」（源 `LargeModelParam` 的系统提示词，可被左侧树插入） */
  const systemPromptRef = useRef<InputRef>(null);

  /** 各子弹窗开关 */
  const [traceOpen, setTraceOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [indexParamOpen, setIndexParamOpen] = useState(false);
  const [blackBoxOpen, setBlackBoxOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  /** 「生成文案」—— 一次性接口返回的提示词全文，可编辑后再预览（源 `previewContext`） */
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [previewPromptLoading, setPreviewPromptLoading] = useState(false);
  /** 「预览结果」—— POST-SSE 流式累积的全文（源 `contentProps.resContent`） */
  const [previewText, setPreviewText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const previewSseRef = useRef<AgentSseHandle | null>(null);
  /**
   * 预览流序号 —— 用来丢弃「上一条流」的回调
   *
   * ⚠️ 必须有：`abort()` 会让上一条流的 `onDone` 在**微任务**里才触发，
   * 若直接改新流的 `previewing=true`，会被旧回调立刻清成 `false`（按钮状态瞬闪、误判结束）。
   * 每次开新流/主动终止都自增序号，回调只认自己那一号。
   */
  const previewSeqRef = useRef(0);
  /**
   * 打字机（源 `views/knowledge/components/PreviewModal.vue` 用了 `printMixin`）
   *
   * 预览结果本身是 SSE 流式（见 `startPreviewStream`），打字机负责把**积压**的增量
   * 平滑地"追"出来显示（源 `printMixin` 对 `PostText` 同样套了这一层）。
   */
  const previewDisplay = useTypewriter(previewText);

  /** 铺数据（源 setConfigValue） */
  const setConfigValue = useCallback((data: ConfigInfo) => {
    setConfigInfo(data);
    setPromptGroups(parseConditionGroups(data.prompt as string));
    setOutputGroups(parseConditionGroups(data.contentDesc as string));
    setElseCondition(parseElse(data.inputCondition));
    setSplitStrategy(parseSplitStrategy(data.splitStrategyParam as string));
    // 两个 map 都要**原样收下来**，否则切模型时会把别的模型那份覆盖掉（详见文件头注释）
    setLargeModelContent(parseOutputContentMap(data.largeModelContent));
    setLargeModelParam(parseModelParamMap(data.largeModelParam));
    const params = data.inputParam;
    setInputParam(Array.isArray(params) ? (params as InputParamItem[]) : []);
  }, []);

  const getInfo = useCallback(async () => {
    if (!knownId) return;
    setLoading(true);
    try {
      const res = await queryInfo({ paramId: knownId });
      setConfigValue(res as unknown as ConfigInfo);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '知识库详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [knownId, setConfigValue]);

  useEffect(() => {
    if (!open) return;
    void getInfo();
    getLargeModelOptions()
      .then(setModelOptions)
      .catch(() => setModelOptions([]));
    queryGroupTree()
      .then((res) => setGroupOptions((res?.list ?? []) as KnowledgeGroupNode[]))
      .catch(() => setGroupOptions([]));
    // 每次打开都重置交互态
    setPreviewText('');
    setPreviewPrompt('');
    setLeftTab('index');
    setTreeVisible(true);
  }, [open, getInfo]);

  /** 卸载 / 关闭编辑器时中止预览流，避免流还在推、组件已走 */
  useEffect(
    () => () => {
      previewSeqRef.current += 1;
      previewSseRef.current?.abort();
      previewSseRef.current = null;
    },
    [],
  );

  /* ---- 两个 map 的读写（源 `changeCondition()` / `changeCodeParam()` / `setCodeParam()` / `largeModelCodeChange()`）---- */

  /** 当前大模型 code；未选时源工程用空串做 key（`largeModelContent[largeCode || '']`），此处保持一致 */
  const modelCodeKey = (configInfo.largeModelCode as string) ?? '';

  /** 当前模型的那份参数表单；该模型没有记录时回落空表单（源 `setCodeParam()` 的 else 分支） */
  const currentModelParam = largeModelParam[modelCodeKey] ?? EMPTY_MODEL_PARAM;

  /** 输出要求编辑 → 立刻写回「当前大模型那一份」（源 `OutputDemand.changeCondition`） */
  const handleOutputGroupsChange = useCallback(
    (next: PromptConditionItem[]) => {
      setOutputGroups(next);
      setLargeModelContent((prev) => ({ ...prev, [modelCodeKey]: JSON.stringify(next) }));
    },
    [modelCodeKey],
  );

  /** 模型参数编辑 → 写回「当前大模型那一份」（源 `LargeModelParam.changeCodeParam`） */
  const patchModelParam = useCallback(
    (patch: Partial<ModelParam>) => {
      setLargeModelParam((prev) => ({
        ...prev,
        [modelCodeKey]: { ...(prev[modelCodeKey] ?? EMPTY_MODEL_PARAM), ...patch },
      }));
    },
    [modelCodeKey],
  );

  /**
   * 切换大模型（源 `OutputDemand.largeModelCodeChange` + `LargeModelParam.setCodeParam` 的合并动作）
   *
   * 源工程靠 eventhub 广播、两个组件各听各的；React 侧没有 eventhub，
   * 这里一处把「换模型」的连带影响全部处理掉：
   *   ① 记下新的 code（后续 map 的 key 就是它）
   *   ② 把该模型专属的输出要求载入编辑器；**没有记录则重置为空条件组**（源工程原文行为）
   *   ③ 模型参数不需要动作 —— 表单是从 `largeModelParam[code]` 派生的，code 一变自然换那份
   */
  const handleLargeModelChange = useCallback(
    (code: string | undefined) => {
      const key = code ?? '';
      setConfigInfo((prev) => ({ ...prev, largeModelCode: key }));
      const saved = largeModelContent[key];
      setOutputGroups(saved ? parseConditionGroups(saved) : createConditionGroups(true));
    },
    [largeModelContent],
  );

  /* ---- 组装并保存 ---- */
  const buildPayload = useCallback(
    (): ConfigInfo => ({
      ...configInfo,
      paramId: knownId,
      prompt: JSON.stringify(promptGroups),
      // contentDesc = 「当前大模型」那一份输出要求（源 `getFormInfo()`）
      contentDesc: JSON.stringify(outputGroups),
      // largeModelContent = 整张 map。⚠️ 本工程后端不认识这个字段
      // （`KnowledgeBaseParamsInfoSaveReq` 里没有它），它会自行用库里的旧 map 合并 contentDesc，
      // 这里仍然一致地回传，只为"前端提交的数据自洽"，不影响落库结果。
      largeModelContent: JSON.stringify(largeModelContent),
      inputCondition: JSON.stringify(elseCondition),
      splitStrategyParam: JSON.stringify(splitStrategy),
      inputParam,
      // ⚠️ `largeModelParam` 相反：后端**不做合并**，整体存我们提交的值。
      // 空 map 时不提交，避免把库里已有的参数整份抹掉（解析失败/原值为空才会出现这种状态）。
      ...(Object.keys(largeModelParam).length > 0
        ? { largeModelParam: JSON.stringify(largeModelParam) }
        : {}),
      // 源工程的 saveCallback 固定置 '1'（表示"已关联"）
      relateFlag: '1',
    }),
    [
      configInfo,
      knownId,
      promptGroups,
      outputGroups,
      largeModelContent,
      largeModelParam,
      elseCondition,
      splitStrategy,
      inputParam,
    ],
  );

  const doSave = useCallback(
    async (onDone?: () => void) => {
      setSaving(true);
      try {
        await updateKnowledge(buildPayload());
        message.success('保存成功');
        onSaved?.();
        onDone?.();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '保存失败');
      } finally {
        setSaving(false);
      }
    },
    [buildPayload, onSaved],
  );

  /* ---- 左侧树 → 插入文本 ---- */
  const insertText = (text: string) => {
    // 源工程由 `emit('editfocus', textareaDom, setter)` 把「当前聚焦的文本域」交给父组件，
    // React 侧同样按「最后一次聚焦的是谁」分发；右栏两个文本域不在条件组编辑器内部，
    // 单独走原生 textarea 插入（此前「用户提示词」被错误地指向了 output 编辑器，已修）。
    if (activeEditor.current === 'modelSystem') {
      insertIntoTextarea(getTextAreaEl(systemPromptRef.current), text);
      return;
    }
    if (activeEditor.current === 'userPrompt') {
      insertIntoTextarea(getTextAreaEl(userPromptRef.current), text);
      return;
    }
    const target = activeEditor.current === 'output' ? outputEditorRef.current : promptEditorRef.current;
    target?.insertText(text);
  };

  const handleIndexSelect = (node: IndexTreePickerNode) => {
    // 源工程 `onSelect`：`{{paramName||paramNo}}`
    insertText(`{{${node.paramName}||${node.paramNo}}}`);
  };

  const handleRuleSelect = (node: RuleTreePickerNode) => {
    // 源工程 `onRuleSelect`：leaf 与 rule 都拼 `[[title||ruleCode]]`
    if (node.type === 'leaf' || node.type === 'rule') {
      insertText(`[[${node.title}||${node.ruleCode}]]`);
    }
  };

  /* ---- 回看历史版本 ---- */
  const handleSelectVersion = async (versionId: string) => {
    setLoading(true);
    try {
      const res = await queryVersionById(versionId);
      setConfigValue(res as unknown as ConfigInfo);
      message.success('已切换到该版本');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '版本详情加载失败');
    } finally {
      setLoading(false);
    }
  };

  /* ---- 预览 ---- */

  /** 中止流（终止按钮 / 关闭弹窗 / 新一次预览都走这里） */
  const stopPreviewStream = () => {
    // 先作废序号：abort 触发的 onDone 随后到达时会被判为过期，不会再来改状态
    previewSeqRef.current += 1;
    previewSseRef.current?.abort();
    previewSseRef.current = null;
    setPreviewing(false);
  };

  /**
   * 「预览结果」：POST-SSE 流式生成
   *
   * 后端 `KnowledgeBaseConfigController#getSummaryAnswer`（POST，`SseEmitter`，
   * 与源工程 `PreviewModal` 的 `previewUrl = '/KnowledgeBase/config/getSummaryAnswer'` 一致）。
   *
   * ⚠️ 三个易踩点：
   *   1. **不能走 axios**：普通请求会把整段响应一次读完，拿不到增量；
   *      这里用 `agentSse`（fetch + ReadableStream）。也不走 `agentGet/agentPost` 的
   *      `Result` 包装 —— SSE 帧体是 `{"answer":...}`，没有 `code/message` 外壳。
   *   2. `inputParam` 传**数组**而不是 JSON 串：后端 `KnowledgeBasePromptViewReq.inputParam`
   *      是 `List<JSONObject>`，`sendAnswer` 按 `name` / `defaultValue` 两个键取用。
   *   3. 传 `previewPrompt` 会触发后端走「使用页面数据」分支（用当前编辑器里的配置而非库里的），
   *      这正是预览该有的语义；不传则后端自己去库里拼提示词。
   */
  const startPreviewStream = useCallback(
    (promptOverride?: string) => {
      const largeModelCode = String(configInfo.largeModelCode ?? '');
      if (!largeModelCode) {
        message.error('请先选择大模型');
        return;
      }
      // 先作废旧序号（并让旧流失效），再开新流 —— 顺序不能反，理由见 previewSeqRef 注释
      previewSeqRef.current += 1;
      const seq = previewSeqRef.current;
      const isStale = () => seq !== previewSeqRef.current;
      previewSseRef.current?.abort();
      setPreviewText('');
      setPreviewing(true);
      previewSseRef.current = agentSse({
        url: '/agent/KnowledgeBase/config/getSummaryAnswer',
        body: {
          ...configInfo,
          paramId: knownId,
          largeModelCode,
          previewPrompt: promptOverride ?? previewPrompt,
          inputParam,
        },
        onChunk: (chunk) => {
          if (isStale()) return;
          setPreviewText((prev) => prev + chunk.text);
        },
        onDone: () => {
          if (isStale()) return;
          previewSseRef.current = null;
          setPreviewing(false);
        },
        onError: (err) => {
          if (isStale()) return;
          previewSseRef.current = null;
          setPreviewing(false);
          message.error(err instanceof Error ? err.message : '预览失败');
        },
      });
    },
    [configInfo, knownId, previewPrompt, inputParam],
  );

  /**
   * 点「预览」：先保存 → 打开弹窗 → ①取「生成文案」→ ②自动开流
   *
   * 对应源工程 `PreviewModal` 的 `onMounted(){ getModelOptions(); generateText() }`
   * 加用户点「预览」触发 `previewHandle → getContent()` 两步；这里把第二步合并成自动执行，
   * 避免用户打开弹窗后还要再点一次（左侧仍有「预览」按钮可改完文案后重跑）。
   */
  const handlePreview = () => {
    void doSave(() => {
      setPreviewOpen(true);
      setPreviewText('');
      setPreviewPrompt('');
      setPreviewPromptLoading(true);
      previewKnowledge({
        paramId: knownId,
        largeModelCode: configInfo.largeModelCode,
        // ⚠️ 传**数组**，不是 JSON 串：后端 `KnowledgeBasePromptViewReq.inputParam` 是
        //    `List<JSONObject>`，传字符串会被 Jackson 拒掉（400 Cannot deserialize ... from String）。
        //    同一个字段在 `KnowledgeBaseParamsInfoSaveReq` / `KnowledgeBaseParamsDTO` 里也是 JSONArray。
        inputParam,
      })
        .then((res) => {
          const text =
            typeof res === 'string'
              ? res
              : ((res as { content?: string; answer?: string })?.content ??
                (res as { answer?: string })?.answer ??
                JSON.stringify(res));
          const promptText = String(text ?? '');
          setPreviewPrompt(promptText);
          setPreviewPromptLoading(false);
          startPreviewStream(promptText);
        })
        .catch((err: unknown) => {
          setPreviewPromptLoading(false);
          message.error(err instanceof Error ? err.message : '预览失败');
        });
    });
  };

  /** 关闭预览弹窗：必须中止流，否则后台仍在推、组件卸载后 setState 会告警 */
  const closePreview = () => {
    stopPreviewStream();
    setPreviewOpen(false);
  };

  const copyPreview = async () => {
    const text = previewDisplay.text;
    if (!text) {
      message.warning('无可复制内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success('复制成功');
    } catch {
      message.error('复制失败');
    }
  };

  /**
   * 「输出要求 / 核心提示词 / 分段与检索策略」的显示开关
   *
   * 源工程 `showOutputSection = configInfo.hasAuth === true || hasPermission('index:output')`。
   * 宿主没有 `index:output` 权限项，所以只保留前半截 —— **必须用后端返回的 `hasAuth`**。
   *
   * 🔴 判定链路（2026-09-15 核对代码 + 真实数据后确定，勿改回硬编码）：
   *   后端 `queryKnowledgeBaseParamsInfo` 拿 `ApiContextModel.getRole()`（内容是**角色主键
   *   `sys_role.id` 的 JSON 数组串**，见 `ApiContext#resolveFromRequest`）去查
   *   `sys_role_knowledge_output`：`role_id IN (当前用户角色主键) AND knowledge_id = paramId`，
   *   命中才回 `hasAuth = true`。其中 `knowledge_id` 存的就是 `knowledge_base_params.paramid`。
   *
   * ⚠️ 早期这里写死 `true`（当时理由是"宿主权限体系不同"），会让**所有**用户都看到
   *   「输出要求 / 核心提示词 / 分段与检索策略」。实测公司库 `sys_role_knowledge_output` **只有 1 行**
   *   （单个角色对单个知识库），即真实环境下绝大多数角色本就不该看到这一块。
   */
  const hasAuth = configInfo.hasAuth === true;

  return (
    <>
      <Modal
        open={open}
        width="100vw"
        style={{ top: 0, maxWidth: '100vw', padding: 0 }}
        styles={{ body: { height: 'calc(100vh - 120px)', overflow: 'auto', background: '#f5f5ff', padding: 12 } }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 40 }}>
            <div style={{ fontWeight: 600 }}>{`${knownName ? knownName + ' -   ' : ''}${knownCode ?? ''}`}</div>
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  // 源工程 publishHandle：先 getSaveData() 再打开发布弹窗
                  void doSave(() => setPublishOpen(true));
                }}
              >
                发布
              </Button>
              <Button onClick={handlePreview}>预览</Button>
              <Button onClick={() => setHistoryOpen(true)}>历史版本</Button>
              <Button onClick={() => setIndexParamOpen(true)}>细分参数配置</Button>
              <Button onClick={() => setTraceOpen(true)}>溯源配置</Button>
              {/* 源工程 V2 标题栏的「黑盒配置」打开的是 ConfigParams（配置参数表），
                  而不是 KnownBlackBoxConfig——后者由知识库列表页的「配置」按钮打开 */}
              <Button onClick={() => setParamsOpen(true)}>黑盒配置</Button>
            </Space>
          </div>
        }
        onCancel={onClose}
        footer={
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void doSave(onClose)}>
              确定
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Spin spinning={loading}>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* ===== 左栏：树 ===== */}
            {treeVisible && (
              <div style={{ width: 288 }}>
                <Card size="small" bordered={false} bodyStyle={{ padding: '8px 4px' }}>
                  <Tabs
                    size="small"
                    activeKey={leftTab}
                    onChange={(k) => setLeftTab(k as 'index' | 'rule')}
                    items={[
                      {
                        key: 'index',
                        label: '指标',
                        children: <IndexTreePicker height={430} onSelect={handleIndexSelect} />,
                      },
                      {
                        key: 'rule',
                        label: '规则',
                        children: <RuleTreePicker height={430} onSelect={handleRuleSelect} />,
                      },
                    ]}
                  />
                </Card>
              </div>
            )}

            {/* ===== 中栏 ===== */}
            <div style={{ flex: 1, height: 'calc(100vh - 144px)', overflowY: 'auto', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Button size="small" onClick={() => setTreeVisible((v) => !v)}>
                  {treeVisible ? '收起左栏' : '展开左栏'}
                </Button>
                <span style={{ fontWeight: 600, fontSize: 16 }}>prompt配置</span>
              </div>

              <Card size="small" style={{ marginBottom: 8 }}>
                <PromptConditionEditor
                  ref={promptEditorRef}
                  value={promptGroups}
                  onChange={setPromptGroups}
                  variant="prompt"
                  modelOptions={modelOptions}
                  groupOptions={groupOptions}
                  tabType={leftTab}
                  onAnyFocus={() => {
                    activeEditor.current = 'prompt';
                  }}
                />
              </Card>

              <Card
                size="small"
                style={{ marginBottom: 8 }}
                title="输出要求"
                extra={
                  <Space>
                    <span>是否置顶：</span>
                    <Switch
                      checked={configInfo.isTop === 'Y'}
                      onChange={(checked) =>
                        setConfigInfo((prev) => ({ ...prev, isTop: checked ? 'Y' : 'N' }))
                      }
                    />
                  </Space>
                }
              >
                <PromptConditionEditor
                  ref={outputEditorRef}
                  value={outputGroups}
                  onChange={handleOutputGroupsChange}
                  variant="output"
                  modelOptions={modelOptions}
                  groupOptions={groupOptions}
                  hasAuth={hasAuth}
                  tabType={leftTab}
                  elseValue={elseCondition}
                  onElseChange={setElseCondition}
                  onAnyFocus={() => {
                    activeEditor.current = 'output';
                  }}
                />
              </Card>

              <Card size="small" style={{ marginBottom: 8 }} title="业务经验知识">
                <Input.TextArea
                  rows={6}
                  placeholder="请输入业务经验知识"
                  value={(configInfo.businessExperience as string) ?? ''}
                  onChange={(e) => setConfigInfo((prev) => ({ ...prev, businessExperience: e.target.value }))}
                />
              </Card>

              {hasAuth && (
                <KnowledgeSplitStrategyPanel value={splitStrategy} onChange={setSplitStrategy} />
              )}
            </div>

            {/* ===== 右栏 ===== */}
            <div style={{ width: '26%' }}>
              <Card size="small" title="预览配置">
                <div style={{ height: 'calc(100vh - 204px)', overflowY: 'auto' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>模型配置</div>
                  <Select
                    allowClear
                    showSearch
                    style={{ width: '100%', marginBottom: 12 }}
                    placeholder="请选择大模型"
                    optionFilterProp="label"
                    value={(configInfo.largeModelCode as string) || undefined}
                    options={modelOptions.map((o) => ({ value: o.value, label: o.title }))}
                    onChange={handleLargeModelChange}
                  />
                  {/* ↓ 以下 4 个字段照抄源 `LargeModelParam.vue`；
                      值全部取自 `largeModelParam[当前大模型]`，切模型自然换出那一份。
                      这几个参数会由后端塞进请求的 temperature / top_p / enable_think / system_content，
                      直接影响真实大模型调用，不是装饰字段。 */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        <Tooltip title="输入范围：0~1">
                          <span style={{ cursor: 'help' }}>top概率 ⓘ</span>
                        </Tooltip>
                      </div>
                      <InputNumber
                        style={{ width: '100%', marginBottom: 12 }}
                        min={0}
                        max={1}
                        step={0.1}
                        value={currentModelParam.topP ?? null}
                        onChange={(v) => patchModelParam({ topP: (v as number | null) ?? null })}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        <Tooltip title="输入范围：0~2">
                          <span style={{ cursor: 'help' }}>温度 ⓘ</span>
                        </Tooltip>
                      </div>
                      <InputNumber
                        style={{ width: '100%', marginBottom: 12 }}
                        min={0}
                        max={2}
                        step={0.1}
                        value={currentModelParam.temperature ?? null}
                        onChange={(v) => patchModelParam({ temperature: (v as number | null) ?? null })}
                      />
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>是否输出思考</div>
                  <Radio.Group
                    style={{ marginBottom: 12 }}
                    value={currentModelParam.enableThink ?? null}
                    onChange={(e) => patchModelParam({ enableThink: e.target.value as boolean })}
                  >
                    <Radio value={true}>是</Radio>
                    <Radio value={false}>否</Radio>
                  </Radio.Group>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>系统提示词</div>
                  <Input.TextArea
                    ref={systemPromptRef}
                    rows={4}
                    style={{ marginBottom: 12 }}
                    value={currentModelParam.systemContent ?? ''}
                    onChange={(e) => patchModelParam({ systemContent: e.target.value })}
                    onFocus={() => {
                      // 源 `LargeModelParam.onFocus`：聚焦后可被左侧树插入 `{{指标名||编号}}`
                      activeEditor.current = 'modelSystem';
                    }}
                  />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>用户提示词</div>
                  <Tooltip title="聚焦此处后，左侧树的插入会落到这里">
                    <Input.TextArea
                      ref={userPromptRef}
                      rows={4}
                      style={{ marginBottom: 12 }}
                      value={(configInfo.userPrompt as string) ?? ''}
                      onChange={(e) => setConfigInfo((prev) => ({ ...prev, userPrompt: e.target.value }))}
                      onFocus={() => {
                        // 让左侧树的插入落到「用户提示词」自身（它不在条件组编辑器内部，走原生 textarea 分支）
                        activeEditor.current = 'userPrompt';
                      }}
                    />
                  </Tooltip>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>请求参数</div>
                  <TestSetPanel knownId={knownId} value={inputParam} onChange={setInputParam} />
                </div>
              </Card>
            </div>
          </div>
        </Spin>
      </Modal>

      {/* ===== 子弹窗 ===== */}
      {traceOpen && (
        <TraceConfigModal open={traceOpen} knownId={knownId} onClose={() => setTraceOpen(false)} />
      )}
      {paramsOpen && <ConfigParamsModal open={paramsOpen} knownId={knownId} onClose={() => setParamsOpen(false)} />}
      {indexParamOpen && (
        <IndexParamConfigModal
          open={indexParamOpen}
          paramId={knownId}
          relateIndexSet={(configInfo.relateIndexSet as string) ?? ''}
          onClose={() => setIndexParamOpen(false)}
          onSuccess={(json) => setConfigInfo((prev) => ({ ...prev, relateIndexSet: json }))}
        />
      )}
      {blackBoxOpen && (
        <BlackBoxConfigModal
          open={blackBoxOpen}
          knownId={knownId}
          blackModelCode={(configInfo.blackModelCode as string) ?? ''}
          blackContentDesc={(configInfo.blackContentDesc as string) ?? ''}
          onClose={() => setBlackBoxOpen(false)}
          onSaved={() => void getInfo()}
        />
      )}
      {publishOpen && (
        <PublishVersionModal
          open={publishOpen}
          paramId={knownId}
          configInfo={buildPayload()}
          onClose={() => setPublishOpen(false)}
          onSuccess={() => onSaved?.()}
        />
      )}
      {historyOpen && (
        <HistoryVersionModal
          open={historyOpen}
          paramId={knownId}
          onClose={() => setHistoryOpen(false)}
          onSelectVersion={(id) => void handleSelectVersion(id)}
        />
      )}
      <Modal
        open={previewOpen}
        title="预览"
        width={1280}
        footer={null}
        onCancel={closePreview}
        destroyOnClose
      >
        <Row gutter={16}>
          {/* 左：生成文案（源 PreviewModal 的 content-container） */}
          <Col span={12}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>生成文案</div>
            <Spin spinning={previewPromptLoading}>
              <Input.TextArea
                rows={20}
                value={previewPrompt}
                onChange={(e) => setPreviewPrompt(e.target.value)}
                placeholder="生成中的提示词文案，可编辑后重新预览"
              />
            </Spin>
            <Button
              type="primary"
              style={{ marginTop: 8 }}
              onClick={() => startPreviewStream()}
              disabled={previewing}
            >
              预览
            </Button>
          </Col>
          {/* 右：预览结果（流式） */}
          <Col span={12}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>预览结果</div>
            <div
              style={{
                height: 470,
                overflow: 'auto',
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                padding: 8,
              }}
            >
              {previewing && !previewText && (
                <Alert type="info" message="正在生成…" showIcon style={{ marginBottom: 8 }} />
              )}
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{previewDisplay.text}</div>
            </div>
            <Space style={{ marginTop: 8 }}>
              <Button danger onClick={stopPreviewStream} disabled={!previewing}>
                终止
              </Button>
              <Button onClick={() => void copyPreview()} disabled={!previewDisplay.text}>
                复制
              </Button>
            </Space>
          </Col>
        </Row>
      </Modal>
    </>
  );
}
