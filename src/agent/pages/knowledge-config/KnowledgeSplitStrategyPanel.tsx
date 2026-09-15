/**
 * 知识库「分段与检索策略」面板
 *
 * React 重写自源工程 `knowledge/components/KnowledgeSplitStrategy.vue`（403 行）。
 *
 * ── 契约（**13 个字段一个都不能少**）──
 * 源工程 `getSplitterStrategyParam()` 返回 `JSON.stringify(splitterParam)`，
 * 父组件把它写进 `configInfo.splitStrategyParam` 一起提交。字段默认值也照抄：
 *
 *   {
 *     isActive: false,
 *     splitStrategy: 'auto',        // auto | floor | custom
 *     floorLevel: null,             // 文档层级（floor 时用）
 *     splitLabel: '',               // 自定义分段标识（custom 时用）
 *     splitMaxLength: null,         // 自定义分段最大长度（custom 时用）
 *     retrievalStrategy: 'auto',    // auto | custom（知识检索策略）
 *     retrievalMode: [],            // 检索方式（多选）
 *     retrievalKeywords: '',        // 自定义检索关键词
 *     returnCount: 10,              // 返回数量
 *     promptStrategy: 'strict',     // strict | merge（提示词执行策略）
 *     promptContent: '',            // 合并提示词（merge 时可填）
 *     checkKeyword: '',             // 关键词校验规则
 *     checkLlm: ''                  // 大模型校验规则
 *   }
 *
 * 解析已有值时，源工程会把 `floorLevel` 强制转数字（`Number(...) || 1`），这里保持一致。
 */
import { useEffect, useState } from 'react';
import { Card, Col, Input, InputNumber, Radio, Row, Select, Space, Switch } from 'antd';

/** 分段与检索策略参数（字段名与源工程 splitterParam 完全一致） */
export interface SplitStrategyParam {
  isActive: boolean;
  splitStrategy: string;
  floorLevel: number | null;
  splitLabel: string;
  splitMaxLength: number | null;
  retrievalStrategy: string;
  retrievalMode: string[];
  retrievalKeywords: string;
  returnCount: number | null;
  promptStrategy: string;
  promptContent: string;
  checkKeyword: string;
  checkLlm: string;
}

/** 默认值（与源工程 splitterParam 的初值逐字一致） */
export const DEFAULT_SPLIT_STRATEGY: SplitStrategyParam = {
  isActive: false,
  splitStrategy: 'auto',
  floorLevel: null,
  splitLabel: '',
  splitMaxLength: null,
  retrievalStrategy: 'auto',
  retrievalMode: [],
  retrievalKeywords: '',
  returnCount: 10,
  promptStrategy: 'strict',
  promptContent: '',
  checkKeyword: '',
  checkLlm: '',
};

/** 解析后端存的值（兼容"空/非法 JSON"两种脏数据） */
export function parseSplitStrategy(raw?: string | null): SplitStrategyParam {
  if (!raw) return { ...DEFAULT_SPLIT_STRATEGY };
  try {
    const parsed = JSON.parse(raw) as Partial<SplitStrategyParam>;
    return {
      ...DEFAULT_SPLIT_STRATEGY,
      ...parsed,
      // 源工程的行为：floorLevel 强制数字，空值回落 1
      floorLevel: parsed.floorLevel ? Number(parsed.floorLevel) : 1,
    };
  } catch {
    return { ...DEFAULT_SPLIT_STRATEGY };
  }
}

const SPLIT_OPTIONS = [
  { value: 'auto', label: '自动分段（默认）', desc: '按照文本长度、结构、模型Token上限自动设定分段逻辑' },
  { value: 'floor', label: '按文档层级分段', desc: '按文档层级结构分段，将文档转换成有层级信息的树结构' },
  { value: 'custom', label: '自定义分段', desc: '用户自定义文档拆分逻辑、支持按照拆分符号、拆分长度自定义拆分' },
];

const SPLIT_LABEL_OPTIONS = [
  { value: '\n', label: '换行符' },
  { value: '\n\n', label: '双换行符' },
  { value: '.', label: '英文句号(.)' },
  { value: '。', label: '中文句号(。)' },
  { value: '!', label: '英文叹号(!)' },
  { value: '！', label: '中文叹号(！)' },
  { value: '?', label: '英文问号(?)' },
  { value: '？', label: '中文问号(？)' },
];

const RETRIEVAL_OPTIONS = [
  { value: 'auto', label: '自动', desc: '结合知识库名称、描述的关键词自动检索相关内容' },
  { value: 'custom', label: '自定义检索', desc: '通过关键词+语义检索模式进行相关分段检索' },
];

const PROMPT_OPTIONS = [
  { value: 'strict', label: '直接执行（默认）', desc: '将知识检索的结果直接拼接知识库提示词后执行' },
  {
    value: 'merge',
    label: '分段执行再合并',
    desc: '将知识检索到的分割分段内容拼接知识库提示词后进行模型润色，最终再将所有模型分析结果合并，拼接合并提示词后进行模型润色',
  },
];

export interface KnowledgeSplitStrategyPanelProps {
  value: SplitStrategyParam;
  onChange: (next: SplitStrategyParam) => void;
  disabled?: boolean;
}

/** 带描述文字的单选项 */
function OptionWithDesc({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string; desc: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <Space direction="vertical" size={4}>
        {options.map((opt) => (
          <Radio key={opt.value} value={opt.value}>
            <span>{opt.label}</span>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{opt.desc}</div>
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  );
}

export function KnowledgeSplitStrategyPanel({ value, onChange, disabled }: KnowledgeSplitStrategyPanelProps) {
  const [param, setParam] = useState<SplitStrategyParam>(value);

  // 外部值变化（如切换版本）时同步进来
  useEffect(() => {
    setParam(value);
  }, [value]);

  const patch = (p: Partial<SplitStrategyParam>) => {
    const next = { ...param, ...p };
    setParam(next);
    onChange(next);
  };

  return (
    <Card
      size="small"
      title="分段与检索策略"
      extra={
        <Space>
          <span>启用</span>
          <Switch checked={param.isActive} disabled={disabled} onChange={(v) => patch({ isActive: v })} />
        </Space>
      }
    >
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>分段策略</div>
          <OptionWithDesc
            options={SPLIT_OPTIONS}
            value={param.splitStrategy}
            onChange={(v) => patch({ splitStrategy: v })}
            disabled={disabled}
          />
          {param.splitStrategy === 'floor' && (
            <div style={{ marginTop: 12 }}>
              <span style={{ marginRight: 8 }}>文档层级</span>
              <InputNumber
                min={1}
                disabled={disabled}
                value={param.floorLevel ?? undefined}
                onChange={(v) => patch({ floorLevel: v === null ? null : Number(v) })}
              />
            </div>
          )}
          {param.splitStrategy === 'custom' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ marginRight: 8 }}>拆分标识</span>
                <Select
                  allowClear
                  style={{ width: 200 }}
                  disabled={disabled}
                  value={param.splitLabel || undefined}
                  options={SPLIT_LABEL_OPTIONS}
                  onChange={(v) => patch({ splitLabel: v ?? '' })}
                />
              </div>
              <div>
                <span style={{ marginRight: 8 }}>最大长度</span>
                <InputNumber
                  min={1}
                  disabled={disabled}
                  value={param.splitMaxLength ?? undefined}
                  onChange={(v) => patch({ splitMaxLength: v === null ? null : Number(v) })}
                />
              </div>
            </div>
          )}
        </Col>

        <Col span={12}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>知识检索策略</div>
          <OptionWithDesc
            options={RETRIEVAL_OPTIONS}
            value={param.retrievalStrategy}
            onChange={(v) => patch({ retrievalStrategy: v })}
            disabled={disabled}
          />
          {param.retrievalStrategy === 'custom' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ marginRight: 8 }}>检索方式</span>
                <Select
                  mode="multiple"
                  allowClear
                  style={{ width: 220 }}
                  disabled={disabled}
                  placeholder="请选择检索方式"
                  value={param.retrievalMode}
                  options={[
                    { value: 'keyword', label: '关键词检索' },
                    { value: 'semantic', label: '语义检索' },
                  ]}
                  onChange={(v) => patch({ retrievalMode: v })}
                />
              </div>
              <div>
                <span style={{ marginRight: 8 }}>检索关键词</span>
                <Input
                  style={{ width: 220 }}
                  disabled={disabled}
                  value={param.retrievalKeywords}
                  onChange={(e) => patch({ retrievalKeywords: e.target.value })}
                />
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <span style={{ marginRight: 8 }}>返回数量</span>
            <InputNumber
              min={1}
              disabled={disabled}
              value={param.returnCount ?? undefined}
              onChange={(v) => patch({ returnCount: v === null ? null : Number(v) })}
            />
          </div>
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>提示词执行策略</div>
        <OptionWithDesc
          options={PROMPT_OPTIONS}
          value={param.promptStrategy}
          onChange={(v) => patch({ promptStrategy: v })}
          disabled={disabled}
        />
        {param.promptStrategy === 'merge' && (
          <Input.TextArea
            rows={3}
            style={{ marginTop: 12 }}
            placeholder="请输入合并提示词"
            disabled={disabled}
            value={param.promptContent}
            onChange={(e) => patch({ promptContent: e.target.value })}
          />
        )}
      </div>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <div style={{ marginBottom: 8 }}>关键词校验规则</div>
          <Input
            disabled={disabled}
            value={param.checkKeyword}
            onChange={(e) => patch({ checkKeyword: e.target.value })}
          />
        </Col>
        <Col span={12}>
          <div style={{ marginBottom: 8 }}>大模型校验规则</div>
          <Input disabled={disabled} value={param.checkLlm} onChange={(e) => patch({ checkLlm: e.target.value })} />
        </Col>
      </Row>
    </Card>
  );
}
