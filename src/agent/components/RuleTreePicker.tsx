/**
 * 规则树选择器（React 重写自源工程 `knowledge/components/RuleTree.vue`）
 *
 * 用在知识库配置弹窗左栏的「规则」tab：点节点 → 往提示词里插入 `[[标题||规则编码]]`。
 *
 * ── 契约 ──
 * 1. 数据源：源 `getAgentRuleTree(params)` = `postAction('/agent/rule/tree', params)`，
 *    有搜索词时传 `{ keyname: keyword }`。本工程复用 `api/knowledgeConfig.getRuleTree`。
 * 2. 返回形态：源工程自己也不确定（它对 `result.list` / `result.records` / `result.data` /
 *    直接数组做了四路兼容），这里保留同样的宽容度——后端若改包装层，前端不至于白屏。
 * 3. 节点字段（源 `formatTreeNode` 的输出）：`{ _key, title, type, ruleCode, ruleName,
 *    paramName, paramNo, paramType, children, level }`。消费方（配置弹窗的 onRuleSelect）
 *    依赖 `type === 'leaf'` 与 `ruleCode`，**字段名不能改**。
 *
 * ⚠️ 一处对源实现的最小修正（已在代码内标注）：
 *   源 `formatTreeNode` 在节点带 `ruleCode` 时**无条件**把 `type` 覆盖成 `'rule'`；
 *   但消费方又要判断 `type === 'leaf'` 且叶子也带 `ruleCode` —— 两者相冲，叶子永远进不了
 *   那个分支。本实现改为「后端给了 `type` 就尊重它，没给才按 `ruleCode` 推 `'rule'`」，
 *   使 `'leaf'` 能正常透传。插入文本的格式（`[[title||ruleCode]]`）保持不变。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Spin, Tree, message } from 'antd';
import type { TreeDataNode } from 'antd';
import { getRuleTree } from '../api/knowledgeConfig';

/** 原始节点（后端字段命名不统一，这里把源工程兼容过的几种写法都列上） */
interface RawRuleNode {
  type?: string;
  ruleCode?: string;
  rule_code?: string;
  ruleName?: string;
  rule_name?: string;
  name?: string;
  label?: string;
  paramName?: string;
  paramNo?: string;
  children?: RawRuleNode[];
  childList?: RawRuleNode[];
  groups?: RawRuleNode[];
}

/** 规范化后的节点（与源 `formatTreeNode` 输出一致） */
export interface RuleTreePickerNode {
  _key: string;
  title: string;
  type: string;
  ruleCode: string;
  ruleName: string;
  paramName: string;
  paramNo: string;
  paramType: string;
  level: number;
  children: RuleTreePickerNode[];
}

interface TreeItem extends TreeDataNode {
  raw: RuleTreePickerNode;
}

export interface RuleTreePickerProps {
  onSelect?: (node: RuleTreePickerNode) => void;
  /** 树区域高度：`number`(px) 或 CSS 长度（`'100%'` / `'calc(100vh - 320px)'`） */
  height?: number | string;
  showSearch?: boolean;
}

function formatTreeNode(
  item: RawRuleNode,
  parent: { key: string; ruleCode: string; ruleName: string },
  level: number,
  index: number,
): RuleTreePickerNode {
  let type = item.type || '';
  let ruleCode = '';
  let ruleName = '';
  let title = '';
  let key = '';

  if (item.ruleCode || item.rule_code) {
    ruleCode = (item.ruleCode || item.rule_code) as string;
    ruleName = (item.ruleName || item.rule_name || '') as string;
    title = ruleName || ruleCode;
    key = ruleCode;
    // 见文件头「最小修正」：源此处为 `type = 'rule'`（无条件覆盖），
    // 会把后端给的 'leaf' 抹掉，导致消费方的 `type === 'leaf'` 分支永不命中。
    if (!type) type = 'rule';
  } else if (item.name) {
    title = item.name;
    key = (parent.key ? `${parent.key}-` : '') + item.name + '-' + index;
  } else if (item.label) {
    title = item.label;
    key = (parent.key ? `${parent.key}-` : '') + item.label + '-' + index;
  } else if (item.paramName) {
    title = item.paramName;
    key = (parent.key ? `${parent.key}-` : '') + (item.paramNo || item.paramName) + '-' + index;
  } else {
    title = '未命名';
    key = (parent.key ? `${parent.key}-` : '') + `node-${level}-${index}`;
  }

  const childList = item.children || item.childList || item.groups || [];
  const children = childList.map((child, childIdx) =>
    formatTreeNode(child, { key, ruleCode, ruleName }, level + 1, childIdx),
  );

  return {
    _key: key,
    title,
    type,
    ruleCode,
    ruleName,
    paramName: title,
    paramNo: ruleCode || key,
    paramType: `RULE_${type.toUpperCase()}`,
    level,
    children,
  };
}

/** 从任意包装形态里取出节点数组（保留源工程的四路兼容） */
function pickRawList(res: unknown): RawRuleNode[] {
  if (Array.isArray(res)) return res as RawRuleNode[];
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    for (const key of ['list', 'records', 'data'] as const) {
      if (Array.isArray(obj[key])) return obj[key] as RawRuleNode[];
    }
  }
  return [];
}

function filterTreeData(nodes: RuleTreePickerNode[], query: string): RuleTreePickerNode[] {
  return (nodes ?? []).reduce<RuleTreePickerNode[]>((acc, node) => {
    const title = String(node.title ?? '').toLowerCase();
    const code = String(node.ruleCode || node.paramNo || '').toLowerCase();
    const children = filterTreeData(node.children ?? [], query);
    if (title.includes(query) || code.includes(query) || children.length) {
      acc.push({ ...node, children: children.length ? children : node.children });
    }
    return acc;
  }, []);
}

function toTreeItems(nodes: RuleTreePickerNode[]): TreeItem[] {
  return (nodes ?? []).map((item, index) => ({
    key: item._key || `rule-${item.level}-${index}`,
    title: item.title,
    children: item.children?.length ? toTreeItems(item.children) : undefined,
    raw: item,
  }));
}

export function RuleTreePicker({ onSelect, height = 360, showSearch = true }: RuleTreePickerProps) {
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<RuleTreePickerNode[]>([]);
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await getRuleTree(search ? { keyname: search } : {});
      const raw = pickRawList(res);
      setSource(raw.map((item, idx) => formatTreeNode(item, { key: '', ruleCode: '', ruleName: '' }, 0, idx)));
    } catch (err) {
      setSource([]);
      message.error(err instanceof Error ? err.message : '规则树加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const treeData = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return toTreeItems(query ? filterTreeData(source, query) : source);
  }, [source, keyword]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {showSearch && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            allowClear
            placeholder="请输入规则名称或编码搜索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => void load(keyword.trim())}
          />
          <Button onClick={() => void load(keyword.trim())}>搜索</Button>
        </div>
      )}
      <Spin spinning={loading}>
        <div style={{ height, overflow: 'auto' }}>
          {treeData.length === 0 && !loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无规则数据" />
          ) : (
            <Tree
              showLine
              blockNode
              defaultExpandAll
              treeData={treeData}
              onSelect={(_keys, info) => {
                const item = info.node as TreeItem;
                if (item.raw) onSelect?.(item.raw);
              }}
            />
          )}
        </div>
      </Spin>
    </div>
  );
}
