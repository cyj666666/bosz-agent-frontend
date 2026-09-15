/**
 * 动态表单渲染器（React 版）
 *
 * 对应宿主源组件 `components/form/components/AdFormRenderer.vue` +
 * `components/form/_utils/defaultItemOptions.js`（两者合计约 420 行）。
 *
 * ── 为什么 agent 模块需要它 ──
 * 知识库「黑盒配置」表格的「参数值」列，在行数据的 `relateDictValue` 有值时
 * 会用本组件按字典结构渲染**类型正确的控件**（源 `KnownBlackBoxConfig.vue` 的
 * `paramValue` 插槽：`<ad-form-render v-if="record.relateDictValue" :options="record.relateDictValue"
 * :defaultValues="{ paramValue: text }" />`，否则退回一个普通 `a-input`）。
 *
 * ── 配置项结构（与源组件保持一致）──
 * ```ts
 * {
 *   field: string;      // 字段名（知识库场景固定为 paramValue）
 *   label?: string;
 *   type: string;       // 见 COMPONENT_MAP 的键
 *   span?: number;      // 栅格宽度，缺省取 colspan
 *   hidden?: boolean;   // 隐藏则不渲染、也不进表单值
 *   attrs?: object;     // 透传给控件：defaultValue / options / placeholder / mode ...
 * }
 * ```
 *
 * ── 初始值规则（逐条照抄 `getItemOptions`）──
 *   1. 多值类型 → `[]`：treeSelect / checkbox / adCheckbox / adTextCheckbox / treePicker /
 *      rangePicker，以及 adSelect+`mode=multiple`、cascader+`multiple`、adTreeSelect+`mode=multiple`
 *   2. slider → `0`
 *   3. 其余 → `undefined`
 *   4. 再叠加外部 defaultValues：`defaultValues[field] || defaultValues[field] === 0`
 *      成立就用它（**注意 0 与 falsy 的处理要一致，源实现就是这么写的**），否则用 `attrs.defaultValue`
 *
 * ── 实现范围（如实说明，且降级不静默）──
 * 已等价实现：input / password / textarea / inputNumber / autoComplete / select / radio /
 *   checkbox / switch / datePicker / timePicker / rangePicker / slider / cascader / treeSelect
 * 降级为 Input 并**在界面顶部给出可见提示**：cityPicker / induPicker / treePicker / custom /
 *   richText / jEditor 以及 ad* / dict* 系列。
 *   理由：它们依赖宿主级组件（城市/行业选择器、Jeecg 字典组件、JEditor 富文本），
 *   在 `src/agent` 自包含的前提下无法等价实现；而知识库黑盒参数实际只用基础控件。
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import {
  Alert,
  AutoComplete,
  Cascader,
  Checkbox,
  Col,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Slider,
  Switch,
  TimePicker,
  TreeSelect,
} from 'antd';
import dayjs from 'dayjs';

/** 配置项 */
export interface AdFormOption {
  field: string;
  label?: string;
  type?: string;
  span?: number;
  hidden?: boolean;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 对外暴露的实例方法（对应源组件 `$refs.x.form` 的取值能力） */
export interface AdFormRendererHandle {
  /** 取当前表单值 */
  getForm: () => Record<string, unknown>;
}

interface AdFormRendererProps {
  /** 动态表单结构 */
  options: AdFormOption[] | null | undefined;
  /** 外部默认值（知识库场景传 `{ paramValue: 行上的值 }`） */
  defaultValues?: Record<string, unknown>;
  disabled?: boolean;
  /** Col 默认 span */
  colspan?: number;
  gutter?: number;
}

/** 需要按「数组」初始化的类型（照抄源实现的多值判定） */
const MULTI_VALUE_TYPES = [
  'treeSelect',
  'checkbox',
  'adCheckbox',
  'adTextCheckbox',
  'treePicker',
  'rangePicker',
];

/** 本工程已等价实现的类型；其余一律降级为 Input 并提示 */
const SUPPORTED_TYPES = new Set([
  'input',
  'password',
  'textarea',
  'inputNumber',
  'autoComplete',
  'select',
  'radio',
  'checkbox',
  'switch',
  'datePicker',
  'timePicker',
  'rangePicker',
  'slider',
  'cascader',
  'treeSelect',
]);

/** 判定某配置项是否为「多值」（含 attrs 上的 mode/multiple 条件） */
function isMultiValue(item: AdFormOption): boolean {
  const type = String(item.type ?? 'input');
  const attrs = (item.attrs ?? {}) as Record<string, unknown>;
  if (MULTI_VALUE_TYPES.includes(type)) return true;
  if (type === 'adSelect' && attrs.mode === 'multiple') return true;
  if (type === 'cascader' && attrs.multiple === true) return true;
  if (type === 'adTreeSelect' && attrs.mode === 'multiple') return true;
  return false;
}

/** 按源实现算出某配置项在没有外部默认值时的初始值 */
function defaultValueOf(item: AdFormOption): unknown {
  const type = String(item.type ?? 'input');
  if (isMultiValue(item)) return [];
  if (type === 'slider') return 0;
  return undefined;
}

export const AdFormRenderer = forwardRef<AdFormRendererHandle, AdFormRendererProps>(function AdFormRenderer(
  { options, defaultValues, disabled = false, colspan = 24, gutter = 16 },
  ref,
) {
  const list = useMemo<AdFormOption[]>(
    () => (Array.isArray(options) ? options : []).filter((n) => n && !n.hidden),
    [options],
  );

  // 未实现的类型（用于顶部提示，避免"悄悄变成输入框"）
  const unsupportedTypes = useMemo(
    () => Array.from(new Set(list.map((n) => String(n.type ?? 'input')).filter((t) => !SUPPORTED_TYPES.has(t)))),
    [list],
  );

  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    list.forEach((item) => {
      const external = defaultValues?.[item.field];
      // 源实现：外部值「非空 或 等于 0」时优先，否则回落 attrs.defaultValue
      init[item.field] =
        external || external === 0
          ? external
          : ((item.attrs ?? {}) as Record<string, unknown>).defaultValue ?? defaultValueOf(item);
    });
    return init;
  });

  useImperativeHandle(ref, () => ({ getForm: () => form }), [form]);

  const setValue = useCallback((field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (!list.length) {
    return <span style={{ color: '#bfbfbf' }}>（字典结构为空）</span>;
  }

  return (
    <>
      {unsupportedTypes.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={`该字典结构用到了本工程未实现的控件类型：${unsupportedTypes.join('、')}，已降级为文本输入`}
        />
      )}
      <Row gutter={gutter}>
        {list.map((item) => {
          const type = String(item.type ?? 'input');
          const attrs = { ...((item.attrs ?? {}) as Record<string, unknown>) };
          const value = form[item.field];
          const control = renderControl(type, value, attrs, disabled, (v) => setValue(item.field, v));
          return (
            <Col span={item.span ?? colspan} key={item.field}>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 4 }}>
                {item.label ? (
                  <span style={{ flex: '0 0 110px', textAlign: 'right', paddingRight: 8, color: '#595959' }}>
                    {item.label}
                  </span>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>{control}</div>
              </div>
            </Col>
          );
        })}
      </Row>
    </>
  );
});

/**
 * 按 type 渲染控件
 *
 * 说明：`attrs` 里的 `options`（`[{label,value}]`）会透传给 antd 的
 * Select / Radio.Group / Checkbox.Group / AutoComplete —— 它们都原生支持该字段。
 *
 * 日期类控件做了一次**类型转换**：`paramValue` 在库里是**文本**，而 DatePicker 需要 dayjs 对象。
 * 源组件是把外部值直接塞给控件（字符串 → DatePicker 会不显示），这里在进出时各转一次，
 * 保证「存库仍是文本」，且回显正确。
 */
function renderControl(
  type: string,
  value: unknown,
  attrs: Record<string, unknown>,
  disabled: boolean,
  onChange: (v: unknown) => void,
) {
  const common = { ...attrs, disabled, style: { width: '100%', ...((attrs.style as object) ?? {}) } };
  const asString = value === undefined || value === null ? '' : String(value);

  switch (type) {
    case 'password':
      return <Input.Password {...common} value={asString} onChange={(e) => onChange(e.target.value)} />;
    case 'textarea':
      return (
        <Input.TextArea
          {...common}
          rows={(attrs.rows as number) ?? 3}
          value={asString}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'inputNumber':
      return <InputNumber {...common} value={value as number} onChange={(v) => onChange(v ?? '')} />;
    case 'autoComplete':
      return <AutoComplete {...common} value={asString} onChange={(v) => onChange(v)} />;
    case 'select':
      return <Select {...common} value={value as never} onChange={(v) => onChange(v)} />;
    case 'radio':
      return <Radio.Group {...common} value={value as never} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return <Checkbox.Group {...common} value={value as never} onChange={(v) => onChange(v)} />;
    case 'switch':
      return <Switch {...common} checked={Boolean(value)} onChange={(v) => onChange(v)} />;
    case 'slider':
      return <Slider {...common} value={value as number} onChange={(v) => onChange(v)} />;
    case 'cascader':
      return <Cascader {...common} value={value as never} onChange={(v) => onChange(v)} />;
    case 'treeSelect':
      return <TreeSelect {...common} value={value as never} onChange={(v) => onChange(v)} />;
    case 'datePicker':
      return (
        <DatePicker
          {...common}
          value={asString ? dayjs(asString) : null}
          onChange={(_d, s) => onChange(s)}
          format={(attrs.format as string) ?? 'YYYY-MM-DD'}
        />
      );
    case 'timePicker':
      return (
        <TimePicker
          {...common}
          value={asString ? dayjs(asString, 'HH:mm:ss') : null}
          onChange={(_d, s) => onChange(s)}
          format={(attrs.format as string) ?? 'HH:mm:ss'}
        />
      );
    case 'rangePicker':
      return (
        <DatePicker.RangePicker
          {...common}
          value={
            Array.isArray(value) && value.length === 2 && value[0] && value[1]
              ? [dayjs(String(value[0])), dayjs(String(value[1]))]
              : null
          }
          onChange={(_d, s) => onChange(s)}
          format={(attrs.format as string) ?? 'YYYY-MM-DD'}
        />
      );
    case 'input':
    default:
      // 未实现的类型统一降级为单行文本（上方 Alert 会明确列出是哪些类型）
      return <Input {...common} value={asString} onChange={(e) => onChange(e.target.value)} />;
  }
}

export default AdFormRenderer;
