/**
 * 指标树选择器（React 重写自源工程 `knowledge/components/TargetTree.vue`）
 *
 * 被三个地方复用：知识库配置弹窗左栏、知识库「指标」弹窗、溯源配置弹窗。
 *
 * ── 契约（与源工程逐条对齐，改动会让后端/交互对不上）──
 * 1. 数据源：源用 `paramsAllList` = `postAction('/index/config/all/queryList', {...})`。
 *    本工程复用 `api/indexConfig.allQueryList`（同一后端接口 `/api/agent/index/config/all/queryList`）。
 *    **入参逐字照抄源工程**（含 `modelNo: 'Public'`、`pageSize: 10`——后端返回的是整棵树，
 *    pageSize 不参与裁剪，改它没有意义）。
 * 2. 节点字段：`{ parentParamName, paramName, paramNo, paramType, children }`。
 * 3. 交互：
 *    ① 点击节点 → `onSelect(node)`（对应源 `emit('select', item)`）；
 *    ② 拖拽节点 → `dataTransfer.setData('attr', JSON.stringify({label, value, paramName, paramNo, paramType}))`。
 *       源工程 `TargetConfigModal` 的「拖指标到右侧列表」就是读这个 `attr` 键完成的，
 *       键名与字段名都不能改。
 * 4. 搜索：递归过滤——节点自身命中、或其子孙命中，都保留该节点（与源 `filterTreeData` 一致）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Spin, Tree, message } from 'antd';
import type { TreeDataNode } from 'antd';
import { allQueryList } from '../api/indexConfig';

/** 树节点（与源工程 `formatTreeData` 的输出字段一致） */
export interface IndexTreePickerNode {
  parentParamName?: string;
  paramName: string;
  paramNo: string;
  paramType?: string;
  children?: IndexTreePickerNode[];
}

/** antd Tree 的节点上挂原始业务节点，供 titleRender / onSelect 取用 */
interface TreeItem extends TreeDataNode {
  raw: IndexTreePickerNode;
}

export interface IndexTreePickerProps {
  /** 点击节点（源工程 emit('select', item)） */
  onSelect?: (node: IndexTreePickerNode) => void;
  /**
   * 树区域高度
   *
   * 支持 `number`(px) 与字符串（`'100%'` / `'calc(100vh - 320px)'`）：
   * 源工程 `TargetTree` 传的就是 `height="calc(100vh - 300px)"`，
   * 让树跟着弹窗高度自适应，而不是写死像素值。
   */
  height?: number | string;
  /** 是否允许拖拽节点（默认 true） */
  draggable?: boolean;
  /** 是否显示搜索框（默认 true） */
  showSearch?: boolean;
}

/** 源工程 TargetTree.getData 的入参，逐字对齐 */
const TREE_QUERY = {
  filters: [],
  modelNo: 'Public',
  pageIndex: 1,
  pageSize: 10,
  parentParamNo: '',
  reportVersion: null as string | null,
  versionNo: null as string | null,
};

/** 业务树 → antd Tree 节点（key 用父路径拼接，避免不同层出现同名 paramNo 时 key 冲突） */
function toTreeItems(nodes: IndexTreePickerNode[], parentKey: string): TreeItem[] {
  return (nodes ?? []).map((item, index) => {
    const key = item.paramNo ? `${parentKey}/${item.paramNo}` : `${parentKey}/#${index}`;
    return {
      key,
      title: item.paramName,
      children: item.children?.length ? toTreeItems(item.children, key) : undefined,
      raw: item,
    };
  });
}

/** 递归过滤（与源工程 filterTreeData 同逻辑） */
function filterTreeData(nodes: IndexTreePickerNode[], query: string): IndexTreePickerNode[] {
  return (nodes ?? []).reduce<IndexTreePickerNode[]>((acc, node) => {
    const name = (node.paramName ?? '').toLowerCase();
    const no = (node.paramNo ?? '').toLowerCase();
    const children = node.children?.length ? filterTreeData(node.children, query) : [];
    if (name.includes(query) || no.includes(query) || children.length) {
      acc.push({ ...node, children: node.children?.length ? children : node.children });
    }
    return acc;
  }, []);
}

export function IndexTreePicker({
  onSelect,
  height = 360,
  draggable = true,
  showSearch = true,
}: IndexTreePickerProps) {
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<IndexTreePickerNode[]>([]);
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await allQueryList({ ...TREE_QUERY });
      setSource((res?.list ?? []) as unknown as IndexTreePickerNode[]);
    } catch (err) {
      setSource([]);
      message.error(err instanceof Error ? err.message : '指标树加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const treeData = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const finalNodes = query ? filterTreeData(source, query) : source;
    return toTreeItems(finalNodes, '');
  }, [source, keyword]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {showSearch && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            allowClear
            placeholder="请输入指标名称或编号搜索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button onClick={() => void load()}>刷新</Button>
        </div>
      )}
      <Spin spinning={loading}>
        <div style={{ height, overflow: 'auto' }}>
          {treeData.length === 0 && !loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无指标数据" />
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
              titleRender={(node) => {
                const item = node as TreeItem;
                const raw = item.raw;
                if (!raw) return <span>{node.title as string}</span>;
                // 源工程用 HTML5 原生拖拽把节点数据塞进 dataTransfer['attr']，
                // 外部（如 TargetConfigModal 的输入框）靠 onDrop 读它完成「拖指标进来」。
                return (
                  <span
                    draggable={draggable}
                    title={`${raw.paramName}（${raw.paramNo}）`}
                    style={{ cursor: draggable ? 'grab' : 'pointer' }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'attr',
                        JSON.stringify({
                          label: raw.paramName,
                          value: raw.paramNo,
                          paramName: raw.paramName,
                          paramNo: raw.paramNo,
                          paramType: raw.paramType,
                        }),
                      );
                    }}
                  >
                    {raw.paramName}
                  </span>
                );
              }}
            />
          )}
        </div>
      </Spin>
    </div>
  );
}
