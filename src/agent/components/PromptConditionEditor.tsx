/**
 * 提示词「条件组」编辑器
 *
 * React 重写自源工程 5 个互相嵌套的组件（React 侧合并成一个受控组件更清晰、也更少 prop 穿透）：
 *   - `PromptConfig.vue`      条件组列表容器（增 / 删 / 拖拽排序）
 *   - `PromptConfigItem.vue`  单个条件组（连接符 + 条件项 + 输出提示词 + 知识库引用）
 *   - `ConditionItem.vue`     单个条件项（字段 / 数据类型 / 操作符 / 值|指标）
 *   - `KnowledgePiece.vue`    知识库引用块（分组 + 知识库 + 大模型）
 *   - `OutPutModelInfo.vue`   模型信息（只有一个 `largeModelCode`）
 *
 * ══════════ 数据结构（**必须与源工程完全一致**）══════════
 * 因为它最终会被 `JSON.stringify` 存进
 * `knowledge_base_params.prompt` / `.content_desc` / `.large_model_content` 三个字段，
 * 后端与规则引擎按同一结构解析，任何字段改名都会导致线上数据读不出来。
 *
 *   PromptConditionItem = {
 *     id: string,
 *     if: {
 *       condition: 'AND' | 'OR' | '',                 // 条件项之间的连接关系
 *       variables: [{ field, data_type, operator, value, valueType, label, valueLabel, tabType }],
 *       output: string,                              // 核心提示词
 *       usePrompt?: string,                          // 用户提示词（仅「输出要求」场景有）
 *       reference: [{ know_type, knowledgeId, largeModelCode }],
 *       modelInfo?: { largeModelCode?: string },
 *       resourceFlag?: boolean
 *     }
 *   }
 *
 * ══════════ 两种用法（与源工程的 showTools 开关对应）══════════
 *   variant='prompt'  知识库配置弹窗中栏「prompt配置」：带工具条（添加条件 / 添加条件组 /
 *                     引用知识库 / 删除 / 拖拽手柄），只渲染「核心提示词」。
 *                     父组件保存时 `JSON.stringify(value)` 写入 `prompt`。
 *   variant='output'  中栏「输出要求」：不显示工具条，渲染「模型信息 + 用户提示词 + 核心提示词」，
 *                     并额外带一个 ELSE 分支（`elseValue`）。父组件取三份 JSON 写入
 *                     `contentDesc` / `inputCondition` / `largeModelContent`。
 *
 * ══════════ 「从左侧树插入文本」机制 ══════════
 * 源工程靠 `emit('editfocus', textareaDom, setter)` 把"当前聚焦的文本域"交给父组件，
 * 父组件再通过 `window.postMessage` 发给编辑器把指标/规则文本插到光标处。
 * React 侧改为：本组件用 `forwardRef` 暴露 `insertText(text)`，内部记住**最后一次聚焦的字段**
 * 与其 DOM，插入时按 `selectionStart/selectionEnd` 插到光标位置。
 * 行为等价，但不再依赖 postMessage 桥。
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button, Cascader, Empty, Input, Popconfirm, Select, Space, Tooltip, message } from 'antd';
import type { CascaderProps } from 'antd';
import type { SelectOption, KnowledgeGroupNode } from '../api/knowledgeConfig';
import { getKnowledgeOptions } from '../api/knowledgeConfig';

/* ---------------- 类型 ---------------- */

/** 条件项（源 ConditionItem 的 variables 元素） */
export interface PromptVariable {
  field: string;
  data_type: string;
  operator: string;
  value: string;
  /** 'value' = 比较字面值；'indicator' = 与另一个指标比较 */
  valueType: 'value' | 'indicator';
  /** 字段的中文名（由指标树拖入时带上，用于展示） */
  label?: string;
  /** 指标值的展示名 */
  valueLabel?: string;
  tabType?: string;
}

/** 知识库引用块（源 KnowledgePiece 的 reference 元素） */
export interface KnowledgeReference {
  /** 级联选择的分组路径（groupId 数组），源工程就是这个存法 */
  know_type?: string[];
  knowledgeId?: string;
  largeModelCode?: string;
}

/** 单个条件组 */
export interface PromptConditionItem {
  id: string;
  if: {
    condition: string;
    variables: PromptVariable[];
    output: string;
    usePrompt?: string;
    reference: KnowledgeReference[];
    modelInfo?: { largeModelCode?: string };
    resourceFlag?: boolean;
  };
}

/** ELSE 分支（仅 variant='output'） */
export interface ElseCondition {
  output: string;
  usePrompt?: string;
  modelInfo?: { largeModelCode?: string };
}

export interface PromptConditionEditorHandle {
  /** 往「最后一次聚焦」的文本域光标处插入文本 */
  insertText: (text: string) => void;
}

export interface PromptConditionEditorProps {
  value: PromptConditionItem[];
  onChange: (next: PromptConditionItem[]) => void;
  /** 'prompt' = 带工具条只渲染核心提示词；'output' = 含模型/用户提示词与 ELSE 分支 */
  variant?: 'prompt' | 'output';
  /** 大模型下拉（来自 `/agent/largeModelConfig/list`） */
  modelOptions?: SelectOption[];
  /** 知识库分组树（「引用知识库」的级联选项） */
  groupOptions?: KnowledgeGroupNode[];
  /** 是否显示核心提示词（对应源工程的 hasAuth / showOutputSection） */
  hasAuth?: boolean;
  /** ELSE 分支（仅 variant='output'） */
  elseValue?: ElseCondition;
  onElseChange?: (next: ElseCondition) => void;
  /** 新增条件项时写入的 tabType（源工程用左栏当前的 tab：'index' | 'rule'） */
  tabType?: string;
  /**
   * 任意文本域获得焦点时回调
   *
   * 用途：父组件同时挂了「prompt 配置」与「输出要求」两个本组件的实例，
   * 需要知道"最后一次交互的是哪一个"，才能把左侧树点选的指标/规则文本
   * 插入到正确的那个编辑器的光标处。
   */
  onAnyFocus?: () => void;
}

/* ---------------- 枚举（逐字抄自源工程 conditionEnum.json） ---------------- */

const DATA_TYPES = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'array', label: '数组' },
  { value: 'boolean', label: '布尔' },
];

const OPERATORS = [
  { value: '=', label: '等于' },
  { value: '!=', label: '不等于' },
  { value: '<=', label: '小于等于' },
  { value: '<', label: '小于' },
  { value: '>', label: '大于' },
  { value: '>=', label: '大于等于' },
  { value: 'is_null', label: '为空' },
  { value: 'is_not_null', label: '不为空' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'len_=', label: '长度等于' },
  { value: 'len_!=', label: '长度不等于' },
  { value: 'len_<=', label: '长度小于等于' },
  { value: 'len_<', label: '长度小于' },
  { value: 'len_>', label: '长度大于' },
  { value: 'len_>=', label: '长度大于等于' },
  { value: 'is_true', label: '为真' },
  { value: 'is_false', label: '为假' },
];

const CONDITION_OPTIONS = [
  { value: 'AND', label: '且' },
  { value: 'OR', label: '或' },
  { value: '', label: '无条件' },
];

/* ---------------- 工具 ---------------- */

/** 源工程用 `createUUID()`；这里用「时间戳 + 随机段」即可满足"组内唯一"的用途 */
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 新条件组（字段与源 `addConditionGroup` 一致） */
function makeConditionGroup(withModelInfo: boolean): PromptConditionItem {
  return {
    id: uid(),
    if: {
      condition: '',
      variables: [],
      output: '',
      reference: [],
      resourceFlag: false,
      ...(withModelInfo ? { modelInfo: {} } : {}),
    },
  };
}

/** 新条件项（字段与源 `addCondition` 一致） */
function makeVariable(tabType: string): PromptVariable {
  return { field: '', data_type: '', operator: '', value: '', valueType: 'value', tabType };
}

/** 从 antd Input.TextArea 的 ref 上取真实 DOM（用于光标定位） */
function domOf(el: unknown): HTMLTextAreaElement | null {
  const inst = el as { resizableTextArea?: { textArea?: HTMLTextAreaElement } } | null;
  return inst?.resizableTextArea?.textArea ?? null;
}

/** 把拖拽进来的指标塞进字段/值（源工程靠 `dataTransfer['attr']`） */
function readDragPayload(e: React.DragEvent): { label?: string; value?: string } | null {
  try {
    const raw = e.dataTransfer.getData('attr');
    if (!raw) return null;
    return JSON.parse(raw) as { label?: string; value?: string };
  } catch {
    return null;
  }
}

/* ---------------- 组件 ---------------- */

export const PromptConditionEditor = forwardRef<PromptConditionEditorHandle, PromptConditionEditorProps>(
  function PromptConditionEditor(props, ref) {
    const {
      value,
      onChange,
      variant = 'prompt',
      modelOptions = [],
      groupOptions = [],
      hasAuth = true,
      elseValue,
      onElseChange,
      tabType = 'index',
      onAnyFocus,
    } = props;

    const showTools = variant === 'prompt';
    /** 「最后一次聚焦的文本域」——插入文本时用 */
    const lastFocus = useRef<{ key: string; field: 'output' | 'usePrompt' | 'elseOutput' | 'elseUsePrompt' } | null>(
      null,
    );
    const domRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
    /** 分组拖拽排序时记住源位置 */
    const dragFrom = useRef<number | null>(null);

    /** 知识库引用块的下拉数据：key = itemId_idx */
    const [knowOptions, setKnowOptions] = useState<Record<string, SelectOption[]>>({});

    const loadKnowOptions = useCallback(async (itemId: string, idx: number, knowType?: string[]) => {
      const groupId = knowType?.length ? knowType[knowType.length - 1] : '';
      const parentGroupId = knowType && knowType.length > 1 ? knowType[knowType.length - 2] : '';
      try {
        const options = await getKnowledgeOptions({ groupId, parentGroupId });
        setKnowOptions((prev) => ({ ...prev, [`${itemId}_${idx}`]: options }));
      } catch {
        setKnowOptions((prev) => ({ ...prev, [`${itemId}_${idx}`]: [] }));
      }
    }, []);

    /* ---- 变更：条件组 ---- */

    const patchItem = useCallback(
      (index: number, patch: Partial<PromptConditionItem['if']>) => {
        const next = value.map((item, i) => (i === index ? { ...item, if: { ...item.if, ...patch } } : item));
        onChange(next);
      },
      [value, onChange],
    );

    const addConditionGroup = useCallback(
      (index: number) => {
        const next = [...value];
        next.splice(index + 1, 0, makeConditionGroup(showTools === false));
        onChange(next);
      },
      [value, onChange, showTools],
    );

    const deleteConditionGroup = useCallback(
      (index: number) => {
        if (value.length <= 1) {
          message.warning('最后一条不可删除！');
          return;
        }
        onChange(value.filter((_item, i) => i !== index));
      },
      [value, onChange],
    );

    const moveGroup = useCallback(
      (from: number, to: number) => {
        if (from === to) return;
        const next = [...value];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(next);
      },
      [value, onChange],
    );

    /* ---- 变更：条件项 ---- */

    const addCondition = useCallback(
      (groupIndex: number) => {
        const item = value[groupIndex];
        patchItem(groupIndex, { variables: [...(item.if.variables ?? []), makeVariable(tabType)] });
      },
      [value, patchItem, tabType],
    );

    const patchVariable = useCallback(
      (groupIndex: number, varIndex: number, patch: Partial<PromptVariable>) => {
        const item = value[groupIndex];
        const variables = (item.if.variables ?? []).map((v, i) => (i === varIndex ? { ...v, ...patch } : v));
        patchItem(groupIndex, { variables });
      },
      [value, patchItem],
    );

    const deleteVariable = useCallback(
      (groupIndex: number, varIndex: number) => {
        const item = value[groupIndex];
        patchItem(groupIndex, {
          variables: (item.if.variables ?? []).filter((_v, i) => i !== varIndex),
        });
      },
      [value, patchItem],
    );

    /* ---- 变更：知识库引用 ---- */

    const addReference = useCallback(
      (groupIndex: number) => {
        const item = value[groupIndex];
        const reference: KnowledgeReference[] = [
          ...(item.if.reference ?? []),
          { largeModelCode: undefined, knowledgeId: undefined, know_type: null as unknown as string[] },
        ];
        patchItem(groupIndex, { reference });
      },
      [value, patchItem],
    );

    const patchReference = useCallback(
      (groupIndex: number, refIndex: number, patch: Partial<KnowledgeReference>) => {
        const item = value[groupIndex];
        const reference = (item.if.reference ?? []).map((r, i) => (i === refIndex ? { ...r, ...patch } : r));
        patchItem(groupIndex, { reference });
      },
      [value, patchItem],
    );

    const deleteReference = useCallback(
      (groupIndex: number, refIndex: number) => {
        const item = value[groupIndex];
        patchItem(groupIndex, { reference: (item.if.reference ?? []).filter((_r, i) => i !== refIndex) });
      },
      [value, patchItem],
    );

    /* ---- 光标插入 ---- */

    useImperativeHandle(
      ref,
      () => ({
        insertText(text: string) {
          const target = lastFocus.current;
          // 没聚焦过任何文本域时，退化为插入第一个条件组的核心提示词末尾
          const fallbackKey = value.length ? `${value[0].id}::output` : null;
          const key = target ? `${target.key}::${target.field}` : fallbackKey;
          const field = target?.field ?? 'output';
          const itemId = target?.key ?? value[0]?.id;
          if (!itemId || !key) return;

          const dom = domRefs.current[key];
          const start = dom?.selectionStart ?? null;
          const end = dom?.selectionEnd ?? null;

          const splice = (current: string): string => {
            const s = current ?? '';
            if (start === null || end === null) return s + text;
            return s.slice(0, start) + text + s.slice(end);
          };

          if (field === 'elseOutput' && onElseChange && elseValue) {
            onElseChange({ ...elseValue, output: splice(elseValue.output) });
            return;
          }
          if (field === 'elseUsePrompt' && onElseChange && elseValue) {
            onElseChange({ ...elseValue, usePrompt: splice(elseValue.usePrompt ?? '') });
            return;
          }

          const idx = value.findIndex((item) => item.id === itemId);
          if (idx < 0) return;
          const current = field === 'output' ? value[idx].if.output : value[idx].if.usePrompt ?? '';
          patchItem(idx, { [field]: splice(current) });
        },
      }),
      [value, patchItem, elseValue, onElseChange],
    );

    /** 文本域通用属性 */
    const textareaBind = (key: string, field: 'output' | 'usePrompt' | 'elseOutput' | 'elseUsePrompt') => ({
      ref: (el: unknown) => {
        domRefs.current[`${key}::${field}`] = domOf(el);
      },
      onFocus: () => {
        lastFocus.current = { key, field };
        // 通知父组件"当前交互的是这个编辑器实例"，供左侧树插入文本时定位
        onAnyFocus?.();
      },
    });

    const modelSelectOptions = useMemo(
      () => modelOptions.map((opt) => ({ value: opt.value, label: opt.title })),
      [modelOptions],
    );

    if (!value.length) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无条件组"
          style={{ padding: '24px 0' }}
        >
          <Button type="primary" onClick={() => onChange([makeConditionGroup(!showTools)])}>
            添加条件组
          </Button>
        </Empty>
      );
    }

    return (
      <div>
        {value.map((item, index) => {
          const variables = item.if.variables ?? [];
          const references = item.if.reference ?? [];
          return (
            <div
              key={item.id}
              style={{
                marginBottom: 16,
                padding: 12,
                border: '1px solid #f0f0f0',
                borderRadius: 4,
                background: '#fff',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current === null) return;
                moveGroup(dragFrom.current, index);
                dragFrom.current = null;
              }}
            >
              {/* 组头：标题 + 工具条 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: 6,
                  borderBottom: '1px solid rgba(40,40,85,0.08)',
                  marginBottom: 12,
                }}
              >
                <strong>{`条件组${index + 1}`}</strong>
                {showTools && (
                  <Space size={8}>
                    <Button size="small" onClick={() => addCondition(index)}>
                      添加条件
                    </Button>
                    <Button size="small" onClick={() => addConditionGroup(index)}>
                      添加条件组
                    </Button>
                    <Button size="small" onClick={() => addReference(index)}>
                      引用知识库
                    </Button>
                    <Popconfirm
                      title="确定要删除该组条件吗？"
                      okText="确认"
                      cancelText="取消"
                      onConfirm={() => deleteConditionGroup(index)}
                    >
                      <Button size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                    <Tooltip title="按住拖拽可调整条件组顺序">
                      <span
                        draggable
                        style={{ cursor: 'grab', userSelect: 'none', color: 'rgba(40,40,85,0.45)' }}
                        onDragStart={() => {
                          dragFrom.current = index;
                        }}
                      >
                        ⠿ 拖拽
                      </span>
                    </Tooltip>
                  </Space>
                )}
              </div>

              {/* 条件项区：连接符 + 条件项列表 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                {variables.length > 0 && (
                  <Select
                    style={{ width: 96 }}
                    value={item.if.condition}
                    options={CONDITION_OPTIONS}
                    onChange={(v) => patchItem(index, { condition: v })}
                  />
                )}
                <div style={{ flex: 1 }}>
                  {variables.map((variable, varIndex) => (
                    <div
                      key={`${item.id}_var_${varIndex}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                    >
                      <Tooltip title={variable.label}>
                        <Input
                          readOnly
                          disabled
                          placeholder="从左侧拖入指标"
                          style={{ width: 180 }}
                          value={variable.label || variable.field}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const payload = readDragPayload(e);
                            if (!payload) return;
                            // 源工程把指标写进 field（编号）+ label（中文名）
                            patchVariable(index, varIndex, {
                              field: payload.value ?? '',
                              label: payload.label ?? '',
                            });
                          }}
                        />
                      </Tooltip>
                      <Select
                        placeholder="数据类型"
                        style={{ width: 110 }}
                        value={variable.data_type || undefined}
                        options={DATA_TYPES}
                        onChange={(v) => patchVariable(index, varIndex, { data_type: v })}
                      />
                      <Select
                        placeholder="操作符"
                        style={{ width: 120 }}
                        value={variable.operator || undefined}
                        options={OPERATORS}
                        onChange={(v) => patchVariable(index, varIndex, { operator: v })}
                      />
                      <Space.Compact>
                        <Select
                          style={{ width: 72 }}
                          value={variable.valueType}
                          options={[
                            { value: 'value', label: '值' },
                            { value: 'indicator', label: '指标' },
                          ]}
                          onChange={(v) => {
                            // 源 `changeType`：切换值类型时清空原来的值/指标展示
                            patchVariable(index, varIndex, {
                              valueType: v,
                              value: '',
                              valueLabel: '',
                            });
                          }}
                        />
                        {variable.valueType === 'indicator' ? (
                          <Tooltip title={variable.valueLabel}>
                            <Input
                              readOnly
                              disabled
                              placeholder="拖入指标"
                              style={{ width: 140 }}
                              value={variable.valueLabel || ''}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                const payload = readDragPayload(e);
                                if (!payload) return;
                                patchVariable(index, varIndex, {
                                  value: payload.value ?? '',
                                  valueLabel: payload.label ?? '',
                                });
                              }}
                            />
                          </Tooltip>
                        ) : (
                          <Input
                            placeholder="请输入值"
                            style={{ width: 140 }}
                            value={variable.value}
                            onChange={(e) => patchVariable(index, varIndex, { value: e.target.value })}
                          />
                        )}
                      </Space.Compact>
                      <Popconfirm
                        title="确定要删除该条件吗？"
                        okText="确认"
                        cancelText="取消"
                        onConfirm={() => deleteVariable(index, varIndex)}
                      >
                        <Button size="small" danger type="text">
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              </div>

              {/* 输出区 */}
              <div style={{ marginTop: 8 }}>
                {showTools ? (
                  <Input.TextArea
                    {...textareaBind(item.id, 'output')}
                    rows={5}
                    placeholder="请输入核心提示词内容"
                    value={item.if.output}
                    onChange={(e) => patchItem(index, { output: e.target.value })}
                  />
                ) : (
                  <>
                    <div style={{ marginBottom: 4 }}>模型信息</div>
                    <Select
                      allowClear
                      showSearch
                      placeholder="请选择大模型"
                      style={{ width: 260, marginBottom: 8 }}
                      value={item.if.modelInfo?.largeModelCode}
                      options={modelSelectOptions}
                      onChange={(v) =>
                        patchItem(index, { modelInfo: { ...(item.if.modelInfo ?? {}), largeModelCode: v } })
                      }
                      optionFilterProp="label"
                    />
                    <div style={{ marginBottom: 4 }}>用户提示词</div>
                    <Input.TextArea
                      {...textareaBind(item.id, 'usePrompt')}
                      rows={4}
                      placeholder="请输入内容"
                      value={item.if.usePrompt ?? ''}
                      onChange={(e) => patchItem(index, { usePrompt: e.target.value })}
                    />
                    {hasAuth && (
                      <>
                        <div style={{ marginBottom: 4, marginTop: 8 }}>核心提示词</div>
                        <Input.TextArea
                          {...textareaBind(item.id, 'output')}
                          rows={4}
                          placeholder="请输入核心提示词内容"
                          value={item.if.output}
                          onChange={(e) => patchItem(index, { output: e.target.value })}
                        />
                      </>
                    )}
                  </>
                )}
              </div>

              {/* 知识库引用块 */}
              {references.map((reference, refIndex) => (
                <div
                  key={`${item.id}_ref_${refIndex}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    padding: 8,
                    background: 'rgba(40,40,85,0.02)',
                    borderRadius: 4,
                  }}
                >
                  <Cascader
                    placeholder="请选择知识库分组"
                    style={{ width: 260 }}
                    showSearch
                    allowClear
                    fieldNames={{ label: 'groupName', value: 'groupId', children: 'children' }}
                    options={groupOptions as unknown as CascaderProps['options']}
                    value={reference.know_type}
                    onChange={(v) => {
                      const knowType = (v as string[]) ?? [];
                      patchReference(index, refIndex, { know_type: knowType, knowledgeId: undefined });
                      void loadKnowOptions(item.id, refIndex, knowType);
                    }}
                  />
                  <Select
                    allowClear
                    showSearch
                    placeholder="请选择知识库"
                    style={{ width: 260 }}
                    value={reference.knowledgeId}
                    options={knowOptions[`${item.id}_${refIndex}`] ?? []}
                    onChange={(v) => patchReference(index, refIndex, { knowledgeId: v })}
                    optionFilterProp="label"
                  />
                  <Select
                    allowClear
                    showSearch
                    placeholder="是否走大模型"
                    style={{ width: 220 }}
                    value={reference.largeModelCode}
                    options={modelSelectOptions}
                    onChange={(v) => patchReference(index, refIndex, { largeModelCode: v })}
                    optionFilterProp="label"
                  />
                  <Popconfirm
                    title="确定要删除该知识片段吗？"
                    okText="确认"
                    cancelText="取消"
                    onConfirm={() => deleteReference(index, refIndex)}
                  >
                    <Button size="small" danger type="text">
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              ))}

              {/* ELSE 分支（仅最后一个条件组之后显示，与源工程 OutputDemand 一致） */}
              {!showTools && index === value.length - 1 && elseValue && onElseChange && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed #e8e8e8' }}>
                  <strong>ELSE</strong>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 4 }}>模型信息</div>
                    <Select
                      allowClear
                      showSearch
                      placeholder="请选择大模型"
                      style={{ width: 260, marginBottom: 8 }}
                      value={elseValue.modelInfo?.largeModelCode}
                      options={modelSelectOptions}
                      onChange={(v) => onElseChange({ ...elseValue, modelInfo: { ...(elseValue.modelInfo ?? {}), largeModelCode: v } })}
                      optionFilterProp="label"
                    />
                    <div style={{ marginBottom: 4 }}>用户提示词</div>
                    <Input.TextArea
                      {...textareaBind(item.id, 'elseUsePrompt')}
                      rows={4}
                      value={elseValue.usePrompt ?? ''}
                      onChange={(e) => onElseChange({ ...elseValue, usePrompt: e.target.value })}
                    />
                    {hasAuth && (
                      <>
                        <div style={{ marginBottom: 4, marginTop: 8 }}>核心提示词</div>
                        <Input.TextArea
                          {...textareaBind(item.id, 'elseOutput')}
                          rows={4}
                          placeholder="请输入核心提示词内容"
                          value={elseValue.output}
                          onChange={(e) => onElseChange({ ...elseValue, output: e.target.value })}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

/** 条件组数组的创建 / 序列化辅助（与源工程 `getValue()` / `setCondition()` 等价） */
export function createConditionGroups(withModelInfo: boolean): PromptConditionItem[] {
  return [makeConditionGroup(withModelInfo)];
}

/** 把后端存的 JSON 串解析成条件组（兼容旧数据：缺 `usePrompt` 时补空串） */
export function parseConditionGroups(raw?: string | null): PromptConditionItem[] {
  if (!raw) return createConditionGroups(false);
  try {
    const parsed = JSON.parse(raw) as PromptConditionItem[];
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (item.if && item.if.usePrompt === undefined) item.if.usePrompt = '';
        if (item.if && !item.if.reference) item.if.reference = [];
        if (item.if && !item.if.variables) item.if.variables = [];
      });
      return parsed;
    }
  } catch {
    // 旧数据可能是纯文本（源工程 setCondition 的兜底分支）
    const group = makeConditionGroup(false);
    group.if.output = raw;
    return [group];
  }
  return createConditionGroups(false);
}
