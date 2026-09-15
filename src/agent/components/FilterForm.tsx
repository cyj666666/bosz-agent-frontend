/**
 * agent 模块 — 通用查询表单
 *
 * React 等价物，对应源工程宿主的 `components/form/components/FilterForm.vue`（199 行）。
 * 三个列表页（智策引擎 / 指标配置 / 知识配置）此前各自手写一段 `<Form layout="inline">`
 * + 一组受控 `Input/Select` + 查询/重置按钮，这里收敛成一个组件。
 *
 * ══════════ 源件的契约（本组件对齐的点）══════════
 *   1. 入参 `options`：每项 `{ field, label, type, span?, hidden?, attrs:{ placeholder, options,
 *      defaultValue, allowClear, ... } }`；本组件用扁平的 `FilterField` 表达同样信息
 *      （React 侧不需要 `getItemOptions` 那层"把配置翻译成组件 props"的间接）。
 *   2. `labelWidth` 控制标签宽度；源件指标配置/知识配置都传 100。
 *   3. 底部固定「重置」「查询」两个按钮；**回车等于查询**（源件 `@keyup.enter.native`）。
 *   4. `@query` 抛出**整个表单对象**、`@reset` 只通知"请重置"，重置后的值由调用方决定
 *      （源件也只是 `resetFields()` + `$emit('reset')`，真正的空值由父级给）。
 *
 * ══════════ 与源件的两点差异（有意）══════════
 *   1. **完全受控**：值放在调用方的 state 里（`value` / `onChange`）。源件内部持有 `form`
 *      并用 `$emit('query', form)` 抛出快照；受控写法与三个列表页现有风格一致，也避免
 *      "组件内部表单值和页面查询条件两份真相"。
 *   2. **支持 `type: 'custom'`**：源件靠宿主注册的一堆 `AdXxx` 组件（`adSelect`/`adCascader`…）
 *      覆盖复杂控件；本工程不引那套，改为调用方用 `render` 直接给控件
 *      （智策引擎的 `RangePicker` / `TreeSelect` 就是这一支）。
 *
 * ⚠️ 不做"按 span 分栏"：源件用 `a-col :span="item.span"`，指标配置传 8、知识配置传 6。
 *    本工程三个列表页的搜索区都在一行内 `wrap`，用 `flexWrap` 表达更直观，也就不需要 span。
 *    如需分栏，用 `fields` 里各字段的 `width` 控制宽度即可。
 */
import type { ReactNode } from 'react';
import { Button, Form, Input, Select, Space } from 'antd';

export interface FilterFieldOption {
  label: string;
  value: string;
}

export interface FilterField {
  /** 对应查询条件的字段名（也是 `value` 对象的 key） */
  field: string;
  label: string;
  /** 内置两种最常见控件，其余走 `custom` */
  type?: 'input' | 'select' | 'custom';
  placeholder?: string;
  /** `type='select'` 的选项；`allowClear` 默认开启 */
  options?: FilterFieldOption[];
  /** 控件宽度，默认 input 180 / select 160 */
  width?: number;
  /** `type='custom'` 时必填：`(value, onChange) => ReactNode` */
  render?: (value: unknown, onChange: (next: unknown) => void) => ReactNode;
}

export interface FilterFormProps<V extends object = Record<string, unknown>> {
  fields: FilterField[];
  value: V;
  onChange: (next: V) => void;
  /** 点「查询」或按回车 */
  onQuery: () => void;
  /** 点「重置」（清空由调用方在 onReset 里做） */
  onReset: () => void;
  loading?: boolean;
  /** 按钮文案，默认「查询」/「重置」 */
  queryText?: string;
  resetText?: string;
  /** 右侧额外内容（如「刷新」等次要按钮），渲染在查询/重置之后 */
  extra?: ReactNode;
  style?: React.CSSProperties;
}

export function FilterForm<V extends object = Record<string, unknown>>({
  fields,
  value,
  onChange,
  onQuery,
  onReset,
  loading,
  queryText = '查询',
  resetText = '重置',
  extra,
  style,
}: FilterFormProps<V>) {
  const patch = (field: string, next: unknown) => onChange({ ...value, [field]: next } as V);
  /** 按字段名取值：V 可能是没有索引签名的 interface，故这里统一收窄一次 */
  const values = value as Record<string, unknown>;

  return (
    <Form
      layout="inline"
      style={{ rowGap: 12, flexWrap: 'wrap', marginBottom: 12, ...style }}
      onKeyDown={(e) => {
        // 源件 `@keyup.enter.native="$emit('query', form)"`：任意字段回车即查询
        if (e.key === 'Enter') {
          e.preventDefault();
          onQuery();
        }
      }}
    >
      {fields.map((f) => (
        <Form.Item key={f.field} label={f.label} style={{ marginInlineEnd: 12 }}>
          {f.type === 'custom' && f.render ? (
            f.render(values[f.field], (next) => patch(f.field, next))
          ) : f.type === 'select' ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: f.width ?? 160 }}
              placeholder={f.placeholder}
              value={(values[f.field] as string) || undefined}
              options={f.options}
              onChange={(next) => patch(f.field, next ?? '')}
            />
          ) : (
            <Input
              allowClear
              style={{ width: f.width ?? 180 }}
              placeholder={f.placeholder}
              value={(values[f.field] as string) ?? ''}
              onChange={(e) => patch(f.field, e.target.value)}
            />
          )}
        </Form.Item>
      ))}
      <Form.Item>
        <Space>
          <Button type="primary" loading={loading} onClick={onQuery}>
            {queryText}
          </Button>
          <Button onClick={onReset}>{resetText}</Button>
          {extra}
        </Space>
      </Form.Item>
    </Form>
  );
}
