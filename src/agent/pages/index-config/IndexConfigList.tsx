/**
 * 指标配置 — 主页面
 *
 * 对应源工程 `amar-agent-admin/src/views/index/ConfigList.vue`（842 行）。
 * 结构逐项对齐：左栏分组树（4 个分组操作）+ 右栏筛选/操作按钮组/指标表格（10 列 + 多选）。
 *
 * **与源工程的差异（刻意，均已在下方注释标注）**：
 *   1) 结果判断：源工程判 `res.success`；本工程由 agentRequest 统一校验 code 并解包到 data，
 *      所以这里只写 try/catch。
 *   2) 源工程的 `FilterForm` 是宿主的通用筛选组件、`useAntdTable` 是宿主的表格 hooks，
 *      本模块**不复用宿主组件**（保持 `src/agent` 自包含），改用受控 state + 原生 Table 分页。
 *   3) 「复制 / 移动 / 快速引入」在源工程是三个独立弹窗组件（各 100-210 行），
 *      这里做成**一个通用的"选择目标分组"弹窗** + 快速引入的**基础版**（多选指标引入当前分组）。
 *   4) 「关联校验」= **完整实现**：源 relateCheck() 只校验「必须选中一行」，随后打开
 *      「关联信息」弹窗（源 IndexRelateInfoTab），明细由「知识库 / 指标」两个页签各自加载。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
  Tree,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import {
  addConfigGroup,
  addGroup,
  copyIndex,
  deleteGroup,
  deleteIndex,
  intfSync,
  moveIndex,
  queryAllList,
  queryGroupTree,
  refreshCache,
  updateGroup,
  PARAM_TYPE_LABELS,
  type IndexGroupNode,
  type IndexParamRow,
} from '../../api/indexConfig';
import { FilterForm } from '../../components/FilterForm';
import { useAgentTable } from '../../components/useAgentTable';
import { useAutoQuery } from '../../components/useAutoQuery';
import { IndexRelateInfoModal } from './IndexRelateInfoModal';
import IndexEditorModal from './IndexEditorModal';

/**
 * 表格列（源工程 views/index/tableColumns.json）
 *
 * 🔴 前三列**不要加 `ellipsis`**：源工程 `tableColumns.json` 里只有「数据源配置」
 *    (`indexSource`) 带 `ellipsis: true`，前三列是**自动换行**的。移植时误加了
 *    `ellipsis` → 指标名称一长就被截成「国税财报4指标-与财务同期值及…」，
 *    用户在列表里看不到完整名称（2026-09-16 反馈）。
 *    现在按源端口径复原为换行，并把宽度放宽（260/260/200 → 300/300/380）让绝大多数
 *    名称一行就能显示完；超长时换行显示，不再隐藏。
 */
const COLUMNS: ColumnsType<IndexParamRow> = [
  { title: '指标ID', dataIndex: 'paramNo', width: 300 },
  { title: '指标编号', dataIndex: 'paramID', width: 300 },
  { title: '指标名称', dataIndex: 'paramName', width: 380 },
  { title: '指标类型', dataIndex: 'paramType', width: 120, align: 'center', render: (v: string) => PARAM_TYPE_LABELS[v] ?? v },
  { title: '数据源类型', dataIndex: 'scriptTypeDesc', width: 160, align: 'center' },
  { title: '数据源配置', dataIndex: 'indexSource', width: 120, align: 'center', ellipsis: true },
  { title: '创建用户', dataIndex: 'inputUserID', width: 160, align: 'center' },
  { title: '创建时间', dataIndex: 'inputTime', width: 160, align: 'center' },
  { title: '更新用户', dataIndex: 'updateUserID', width: 160, align: 'center' },
  { title: '更新时间', dataIndex: 'updateTime', width: 160, align: 'center' },
];

interface FilterState {
  paramNo: string;
  paramId: string;
  paramName: string;
  indexSource: string;
}

/**
 * 在整棵列表树里按 `paramNo` 找行（**顶层 + 嵌套的 `children`**）
 *
 * 🔴 为什么必须递归：`queryAllList` 返回的是**树**（后端 `TreeUtil.buildTree` 产出，
 * `IndexParamsEntity extends BaseTree` 自带 `children`），子指标挂在父行的 `children` 里，
 * antd Table 默认 `childrenColumnName = 'children'` 会把它们渲染成**可展开的子行**。
 *
 * 原实现是 `rows.find((r) => String(r.paramNo) === paramNo)` —— **只在顶层数组里找**：
 * 选中**子指标**点「配置」时返回 `undefined` → 弹框拿到 `row = null` → 回显整段跳过 →
 * 表单保持空（或上一次的残留）→ 保存时 `paramNo` 是空串 → 后端 `getById('')` 查不到 →
 * **`更新失败！`**（2026-09-16 实测：`2100189565707907073` 下的子指标 `ypsfczdcdy`，
 * 后端日志 `selectById ... Parameters: (String)`）。
 *
 * 源工程 `views/index/ConfigList.vue` 用的是表格 `rowSelection.onChange(keys, nodes)` 的
 * **第二参 `selectedRowNodes`**（真实行对象，子行也有），本工程改为「整树查找」——
 * 等价，且不依赖 antd 回调形态。
 */
function findRowByParamNo(list: IndexParamRow[], paramNo: string): IndexParamRow | null {
  for (const row of list) {
    if (String(row.paramNo) === paramNo) return row;
    const kids = (row as { children?: IndexParamRow[] }).children;
    if (Array.isArray(kids) && kids.length) {
      const hit = findRowByParamNo(kids, paramNo);
      if (hit) return hit;
    }
  }
  return null;
}

const EMPTY_FILTER: FilterState = { paramNo: '', paramId: '', paramName: '', indexSource: '' };

export default function IndexConfigList() {
  /* ---------------- 分组树 ---------------- */
  const [tree, setTree] = useState<IndexGroupNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<IndexGroupNode | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

  /* ---------------- 指标列表 ---------------- */
  /* 分页 / 加载态 / 请求参数 / 过期响应丢弃统一由 hook 负责（见 components/useAgentTable.ts） */
  const { rows, loading, pagination, refresh, reload } = useAgentTable<IndexParamRow>(queryAllList, {
    // 首屏由下面「分组变化」的 effect 触发，避免挂载时连查两次
    immediate: false,
    errorText: '指标列表加载失败',
  });
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [rowKeys, setRowKeys] = useState<Key[]>([]);

  /* ---------------- 弹窗 ---------------- */
  const [groupModal, setGroupModal] = useState<{ open: boolean; mode: 'add' | 'addChild' | 'edit'; node?: IndexGroupNode }>({
    open: false,
    mode: 'add',
  });
  const [groupForm, setGroupForm] = useState({ groupName: '', groupValue: '' });
  const [groupSaving, setGroupSaving] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorType, setEditorType] = useState<'add' | 'config'>('add');
  const [editorRow, setEditorRow] = useState<IndexParamRow | null>(null);

  /** 选择目标分组（复制/移动共用） */
  const [targetModal, setTargetModal] = useState<{ open: boolean; mode: 'copy' | 'move' }>({ open: false, mode: 'copy' });
  const [targetGroup, setTargetGroup] = useState<IndexGroupNode | null>(null);

  /**
   * 「关联信息」弹窗（源 IndexRelateInfoTab）
   *
   * 用「选中的行」而不是 boolean 表示开关：弹窗里两个页签都要拿 curParam.paramNo 取数，
   * 没有选中行时不该进渲染。
   */
  const [relateParam, setRelateParam] = useState<IndexParamRow | null>(null);

  /** 读路由 query（用于从「关联信息」弹窗跳转过来时定位分组） */
  const [searchParams] = useSearchParams();

  /** 快速引入 */
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState<IndexParamRow[]>([]);
  const [importKeys, setImportKeys] = useState<Key[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  /* ---------------- 加载 ---------------- */

  /** 树节点转 antd Tree 结构（源工程用 replaceFields 映射 groupName/groupId） */
  const toTreeData = useCallback(
    (nodes: IndexGroupNode[]): { key: string; title: string; children?: unknown[] }[] =>
      nodes.map((n) => ({
        key: n.groupId,
        title: n.groupName,
        children: n.children?.length ? toTreeData(n.children) : undefined,
      })),
    [],
  );

  /** 查找分组节点（用于选中回填） */
  const findGroup = useCallback((nodes: IndexGroupNode[], groupId: string): IndexGroupNode | null => {
    for (const n of nodes) {
      if (n.groupId === groupId) return n;
      if (n.children?.length) {
        const hit = findGroup(n.children, groupId);
        if (hit) return hit;
      }
    }
    return null;
  }, []);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await queryGroupTree();
      setTree(res?.list ?? []);
    } catch (e) {
      message.error((e as Error)?.message || '分组树加载失败');
      setTree([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  /**
   * 查询条件 → 请求参数
   *
   * 请求形状照抄源工程 `queryHandle`：带 `filters: []`；选中分组时带
   * `parentParamNo/groupValue/groupName`，未选中即查全部；各筛选项只带非空值
   * （**值**为空就不筛，但**键**必须留着）。
   *
   * 🔴 这里必须把「所有条件键」都显式写出来（空的写 `''`），不能像源工程那样"非空才写"：
   *   `useAgentTable.refresh(next)` 是**合并**语义（`{...当前条件, ...next}`，见 useAgentTable.ts），
   *   省略某个键 = 上一次的值原封不动留着 → **点了「重置」再查还是老条件**、取消选中分组后列表
   *   仍按老分组过滤（2026-09-15 自测实测："重置条件后查询还是原来的检索数据"）。
   *   空串到后端无副作用：`isNotEmpty('')`/`isNotBlank('')` 均为 false，条件不会进 SQL。
   * 对照：`pages/rule/RuleList.tsx` 的 buildParams 一直是"全键写出"（空值给 undefined），所以它没这个问题。
   */
  const buildParams = useCallback(
    (group: IndexGroupNode | null, cond: FilterState): Record<string, unknown> => {
      const params: Record<string, unknown> = { filters: [] };
      params.parentParamNo = group ? group.groupId : '';
      params.groupValue = group ? group.groupValue : '';
      params.groupName = group ? group.groupName : '';
      params.paramNo = cond.paramNo || '';
      // 🔴 请求字段名必须是 `paramId`（后端 IndexParamQueryReq 的字段），
      // 不要照抄表格列/响应体的 `paramID`（那是实体 getter getParamID() 序列化出来的 key）。
      // 写成 `paramID` 后端收不到 → 该条件被静默忽略 → 检索等于没筛（2026-09-15 自测踩过：
      // 按指标编号 fxmdkjjye 查，返回的是未过滤的第一页，看着"查到很多"）。
      params.paramId = cond.paramId || '';
      params.paramName = cond.paramName || '';
      params.indexSource = cond.indexSource || '';
      return params;
    },
    [],
  );

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // 首屏 + 切换分组都走这里（hook 的 immediate 已关掉，保证只查一次）
  useEffect(() => {
    void refresh(buildParams(selectedGroup, filter));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);

  /**
   * 从「关联信息」弹窗跳转过来时自动定位分组（?groupId=xxx）
   *
   * 源工程用 router.push 带 query 实现（path=/index/list, query={groupId}）；
   * 本工程对应路由是 agent/index-config，读同名参数即可。
   * 依赖 tree：树加载完才能把 groupId 还原成分组节点。
   */
  useEffect(() => {
    const groupId = searchParams.get('groupId');
    if (!groupId || !tree.length) return;
    const node = findGroup(tree, groupId);
    if (!node) return;
    setSelectedKeys([groupId]);
    setSelectedGroup(node);
    setRowKeys([]);
    // 不再手动 setPageIndex(1)：hook 的 refresh() 一律回到第 1 页
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tree]);

  /* ---------------- 树交互 ---------------- */

  /** 点击已选中的节点＝取消选中（源工程行为），取消后列表查全部 */
  const onTreeSelect = (keys: Key[]) => {
    if (!keys.length || String(keys[0]) === String(selectedKeys[0])) {
      setSelectedKeys([]);
      setSelectedGroup(null);
      setRowKeys([]);
      return;
    }
    const node = findGroup(tree, String(keys[0]));
    setSelectedKeys(keys);
    setSelectedGroup(node);
    setRowKeys([]);
  };

  const openGroupModal = (mode: 'add' | 'addChild' | 'edit') => {
    if ((mode === 'addChild' || mode === 'edit') && !selectedGroup) {
      message.warning('请先在左侧选择一个分组');
      return;
    }
    setGroupForm({
      groupName: mode === 'edit' ? selectedGroup?.groupName ?? '' : '',
      groupValue: mode === 'edit' ? selectedGroup?.groupValue ?? '' : '',
    });
    setGroupModal({ open: true, mode, node: selectedGroup ?? undefined });
  };

  const doSaveGroup = async () => {
    if (!groupForm.groupName.trim()) {
      message.warning('请输入分组名称');
      return;
    }
    setGroupSaving(true);
    try {
      const { mode, node } = groupModal;
      if (mode === 'add') {
        await addGroup({ groupName: groupForm.groupName, groupValue: groupForm.groupValue });
      } else if (mode === 'addChild') {
        // 新增下级：挂在当前选中节点下
        await addConfigGroup({
          parentParamNo: node?.groupId,
          groupName: groupForm.groupName,
          groupValue: groupForm.groupValue,
        });
      } else {
        await updateGroup({
          groupId: node?.groupId,
          groupName: groupForm.groupName,
          groupValue: groupForm.groupValue,
        });
      }
      message.success('保存成功');
      setGroupModal((s) => ({ ...s, open: false }));
      await loadTree();
    } catch (e) {
      message.error((e as Error)?.message || '保存失败');
    } finally {
      setGroupSaving(false);
    }
  };

  const doDeleteGroup = async () => {
    if (!selectedGroup) {
      message.warning('请先在左侧选择一个分组');
      return;
    }
    try {
      await deleteGroup({ groupId: selectedGroup.groupId });
      message.success('删除成功');
      setSelectedGroup(null);
      setSelectedKeys([]);
      await loadTree();
    } catch (e) {
      message.error((e as Error)?.message || '删除失败');
    }
  };

  /* ---------------- 列表操作 ---------------- */

  const doQuery = useCallback(
    () => void refresh(buildParams(selectedGroup, filter)),
    [refresh, buildParams, selectedGroup, filter],
  );

  /**
   * 条件一变就自动重查（免点「查询」）—— 详见 `components/useAutoQuery.ts`
   *
   * 本页四个筛选项（指标ID / 指标编号 / 指标名称 / 数据来源）**全是文本框**，
   * 所以不传 `immediateFields`，统一走 400ms 防抖：边打字边查会打出一串请求、列表反复跳。
   */
  useAutoQuery(filter, doQuery);

  const doReset = () => {
    // 只改条件，真正的查询由 useAutoQuery 触发；条件本来就空时不会多打一次请求
    setFilter({ ...EMPTY_FILTER });
  };

  const requireOne = (): string | null => {
    if (!rowKeys.length) {
      message.warning('请先选择一条指标');
      return null;
    }
    return String(rowKeys[0]);
  };

  const doDelete = async () => {
    const paramNo = requireOne();
    if (!paramNo) return;
    try {
      await deleteIndex({ paramNo });
      message.success('删除成功');
      setRowKeys([]);
      void reload();
    } catch (e) {
      message.error((e as Error)?.message || '删除失败');
    }
  };

  const openTargetModal = (mode: 'copy' | 'move') => {
    const paramNo = requireOne();
    if (!paramNo) return;
    setTargetGroup(null);
    setTargetModal({ open: true, mode });
  };

  const doTargetConfirm = async () => {
    const paramNo = requireOne();
    if (!paramNo) return;
    if (!targetGroup) {
      message.warning('请选择目标分组');
      return;
    }
    try {
      const payload = { paramNo, parentParamNo: targetGroup.groupId, groupValue: targetGroup.groupValue, groupName: targetGroup.groupName };
      if (targetModal.mode === 'copy') await copyIndex(payload);
      else await moveIndex(payload);
      message.success(targetModal.mode === 'copy' ? '复制成功' : '移动成功');
      setTargetModal((s) => ({ ...s, open: false }));
      setRowKeys([]);
      void reload();
    } catch (e) {
      message.error((e as Error)?.message || '操作失败');
    }
  };

  const doRefreshCache = async () => {
    try {
      await refreshCache();
      message.success('刷新成功！');
    } catch (e) {
      message.error((e as Error)?.message || '刷新失败');
    }
  };

  const doBatchSync = async () => {
    if (!rowKeys.length) {
      message.warning('请选择要同步的指标');
      return;
    }
    try {
      await intfSync({ syncType: 'index', syncIdList: rowKeys.map(String) });
      message.success('批量同步任务发起成功！');
    } catch (e) {
      message.error((e as Error)?.message || '同步失败');
    }
  };

  /**
   * 关联校验
   *
   * 与源工程 relateCheck() 完全一致：**只校验「必须选中一行」，然后打开「关联信息」弹窗**，
   * 明细交给弹窗里「知识库 / 指标」两个页签各自调接口加载 ——
   * 源工程也不是在这里发请求（它只置 relateInfoVisible = true）。
   */
  const doRelateCheck = () => {
    const paramNo = requireOne();
    if (!paramNo) return;
    // 同上：子指标要用整树查找，否则弹框拿不到行、静默什么都不发生
    const row = findRowByParamNo(rows, paramNo);
    if (!row) {
      message.warning('未找到该指标的数据，请刷新列表后重试');
      return;
    }
    setRelateParam(row);
  };

  /** 业务指标快速引入（基础版）：从全部指标里多选后引入当前分组 */
  const openImport = async () => {
    if (!selectedGroup) {
      message.warning('请先在左侧选择要引入到的分组');
      return;
    }
    setImportModal(true);
    setImportLoading(true);
    try {
      const res = await queryAllList({ filters: [], pageIndex: 1, pageSize: 500 });
      setImportRows(res?.list ?? []);
      setImportKeys([]);
    } catch (e) {
      message.error((e as Error)?.message || '指标加载失败');
      setImportRows([]);
    } finally {
      setImportLoading(false);
    }
  };

  const doImportConfirm = async () => {
    if (!importKeys.length) {
      message.warning('请选择要引入的指标');
      return;
    }
    setImportLoading(true);
    try {
      for (const k of importKeys) {
        await copyIndex({
          paramNo: String(k),
          parentParamNo: selectedGroup?.groupId,
          groupValue: selectedGroup?.groupValue,
          groupName: selectedGroup?.groupName,
        });
      }
      message.success(`已引入 ${importKeys.length} 个指标`);
      setImportModal(false);
      void reload();
    } catch (e) {
      message.error((e as Error)?.message || '引入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const treeData = useMemo(() => toTreeData(tree), [tree, toTreeData]);

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={12}>
        {/* 左：分组树 */}
        <Col span={5}>
          <Card
            title={
              <Space size={6} wrap>
                <Button size="small" type="primary" onClick={() => openGroupModal('add')}>
                  添加分组
                </Button>
                <Button size="small" onClick={() => openGroupModal('addChild')}>
                  添加下级
                </Button>
                <Button size="small" onClick={() => openGroupModal('edit')}>
                  编辑
                </Button>
                <Popconfirm title="确定删除该分组吗？" okText="确定" cancelText="取消" onConfirm={() => void doDeleteGroup()}>
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            }
            styles={{ body: { minHeight: 420, maxHeight: 620, overflow: 'auto' } }}
          >
            {treeData.length ? (
              <Tree
                treeData={treeData as never}
                selectedKeys={selectedKeys}
                defaultExpandAll
                onSelect={onTreeSelect}
              />
            ) : (
              <div style={{ color: '#8c8c8c', textAlign: 'center', paddingTop: 40 }}>
                {treeLoading ? '加载中…' : '暂无分组数据'}
              </div>
            )}
          </Card>
        </Col>

        {/* 右：指标列表 */}
        <Col span={19}>
          <Card styles={{ body: { padding: 16 } }}>
            <FilterForm<FilterState>
              fields={[
                { field: 'paramNo', label: '指标ID', placeholder: '请输入指标ID', width: 180 },
                { field: 'paramId', label: '指标编号', placeholder: '请输入指标编号', width: 180 },
                { field: 'paramName', label: '指标名称', placeholder: '请输入指标名称', width: 180 },
                { field: 'indexSource', label: '数据来源', placeholder: '请输入数据来源', width: 180 },
              ]}
              value={filter}
              onChange={setFilter}
              onQuery={doQuery}
              onReset={doReset}
              loading={loading}
            />

            <Space size={8} wrap style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                onClick={() => {
                  setEditorType('add');
                  setEditorRow(null);
                  setEditorOpen(true);
                }}
              >
                新增
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  const paramNo = requireOne();
                  if (!paramNo) return;
                  // 子指标在父行的 children 里 → 必须整树查找（见 findRowByParamNo 的说明）
                  const row = findRowByParamNo(rows, paramNo);
                  if (!row) {
                    message.warning('未找到该指标的数据，请刷新列表后重试');
                    return;
                  }
                  setEditorType('config');
                  setEditorRow(row);
                  setEditorOpen(true);
                }}
              >
                配置
              </Button>
              <Button type="primary" onClick={() => openTargetModal('copy')}>
                复制
              </Button>
              <Button type="primary" onClick={() => openTargetModal('move')}>
                移动
              </Button>
              <Popconfirm title="确定删除选中指标吗？" okText="确定" cancelText="取消" onConfirm={() => void doDelete()}>
                <Button danger>删除</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => void openImport()}>
                业务指标快速引入
              </Button>
              <Button type="primary" onClick={() => void doRelateCheck()}>
                关联校验
              </Button>
              <Popconfirm title="确定发起批量同步吗？" okText="确定" cancelText="取消" onConfirm={() => void doBatchSync()}>
                <Button type="primary">批量同步</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => void doRefreshCache()}>
                刷新缓存
              </Button>
              <Button onClick={() => void reload()}>刷新</Button>
            </Space>

            <Table<IndexParamRow>
              rowKey="paramNo"
              size="small"
              loading={loading}
              columns={COLUMNS}
              dataSource={rows}
              /* 列宽合计 2020 + 多选列 → 取 2100，避免 x 小于列宽和导致列被压缩 */
              scroll={{ x: 2100 }}
              rowSelection={{
                selectedRowKeys: rowKeys,
                onChange: (keys) => setRowKeys(keys),
              }}
              pagination={pagination}
            />
          </Card>
        </Col>
      </Row>

      {/* 分组新增/编辑 */}
      <Modal
        open={groupModal.open}
        title={groupModal.mode === 'add' ? '添加分组' : groupModal.mode === 'addChild' ? '添加下级分组' : '编辑分组'}
        onCancel={() => setGroupModal((s) => ({ ...s, open: false }))}
        onOk={() => void doSaveGroup()}
        confirmLoading={groupSaving}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="分组名称" required>
            <Input
              placeholder="请输入分组名称"
              value={groupForm.groupName}
              onChange={(e) => setGroupForm((p) => ({ ...p, groupName: e.target.value }))}
            />
          </Form.Item>
          <Form.Item label="分组值">
            <Input
              placeholder="请输入分组值（可留空）"
              value={groupForm.groupValue}
              onChange={(e) => setGroupForm((p) => ({ ...p, groupValue: e.target.value }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 复制 / 移动：选目标分组 */}
      <Modal
        open={targetModal.open}
        title={targetModal.mode === 'copy' ? '复制到分组' : '移动到分组'}
        onCancel={() => setTargetModal((s) => ({ ...s, open: false }))}
        onOk={() => void doTargetConfirm()}
        width={520}
        destroyOnHidden
      >
        <div style={{ marginBottom: 8, color: '#8c8c8c' }}>
          {targetModal.mode === 'copy' ? '选择要复制到的目标分组' : '选择要移动到的目标分组'}
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #f0f0f0', padding: 8 }}>
          {treeData.length ? (
            <Tree
              treeData={treeData as never}
              defaultExpandAll
              selectedKeys={targetGroup ? [targetGroup.groupId] : []}
              onSelect={(keys) => {
                if (!keys.length) {
                  setTargetGroup(null);
                  return;
                }
                setTargetGroup(findGroup(tree, String(keys[0])));
              }}
            />
          ) : (
            <div style={{ color: '#8c8c8c', textAlign: 'center', padding: 20 }}>暂无分组数据</div>
          )}
        </div>
      </Modal>

      {/* 关联信息（源 IndexRelateInfoTab：「知识库 / 指标」两个页签） */}
      <IndexRelateInfoModal open={!!relateParam} curParam={relateParam} onClose={() => setRelateParam(null)} />

      {/* 业务指标快速引入（基础版） */}
      <Modal
        open={importModal}
        title={`业务指标快速引入 → ${selectedGroup?.groupName ?? ''}`}
        onCancel={() => setImportModal(false)}
        onOk={() => void doImportConfirm()}
        confirmLoading={importLoading}
        width={900}
        destroyOnHidden
      >
        <div style={{ marginBottom: 8, color: '#8c8c8c' }}>
          从全部指标中多选，确认后会以「复制」方式引入到当前分组。已选 {importKeys.length} 个。
        </div>
        <Table<IndexParamRow>
          rowKey="paramNo"
          size="small"
          loading={importLoading}
          dataSource={importRows}
          columns={[
            { title: '指标ID', dataIndex: 'paramNo', width: 260 },
            { title: '指标名称', dataIndex: 'paramName', width: 320 },
            { title: '数据源类型', dataIndex: 'scriptTypeDesc', width: 140, align: 'center' },
          ]}
          scroll={{ y: 360, x: 740 }}
          rowSelection={{ selectedRowKeys: importKeys, onChange: (keys) => setImportKeys(keys) }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </Modal>

      {/* 新增 / 配置指标 */}
      <IndexEditorModal
        open={editorOpen}
        editType={editorType}
        row={editorRow}
        parentGroup={selectedGroup}
        onClose={() => setEditorOpen(false)}
        onSuccess={() => {
          setEditorOpen(false);
          void reload();
        }}
      />
    </div>
  );
}