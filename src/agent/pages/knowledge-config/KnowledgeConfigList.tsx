/**
 * 知识配置管理 — 主页面
 *
 * 对应源工程三个文件：
 *   `views/knowledge/KnownConfigList.vue`（34 行，左树右列表的壳）
 *   `views/knowledge/components/KnownGroupManage.vue`（172 行，左侧分组树）
 *   `views/knowledge/components/KnownList.vue`（524 行，右侧知识库列表）
 *
 * **本文件的完成度（如实说明）**：
 *   完整实现：分组树（加载/选中/增删改）+ 知识库列表（4 个筛选条件、9 个操作按钮、6 列表格、
 *            多选、分页、大模型编码名称翻译）+ 新建/编辑 + 复制/移动（选目标分组）+ 批量同步 + 删除
 *            + 三个重交互弹窗的入口（配置 / 指标 / 知识库配置）。
 *
 *   三个重交互弹窗各自对应一个独立组件文件，均由本页「选中一行 → 点按钮」打开：
 *     - 「配置」      → `KnowledgeConfigEditor.tsx`   （源 `KnownConfigModalV2.vue` 756 行）
 *     - 「指标」      → `TargetConfigModal.tsx`       （源 `TargetConfigModal.vue`）
 *     - 「知识库配置」→ `BlackBoxConfigModal.tsx`     （源 `KnownBlackBoxConfig.vue`）
 *   **入口必须与本文件绑定**：三个弹窗的开关用「选中行的 id」而非 boolean
 *   （`configEditorTarget` / `targetConfigId` / `blackBoxTarget`），无选中行时不进渲染 ——
 *   组件写好了但忘了在这里接上，按钮就会"点了没反应"。
 *
 * 与源工程的差异：源工程用虚拟滚动树 `VirtualTree`，这里用 antd `Tree`（数据量大时性能略差，但更通用）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Space, Table, Tooltip, Tree, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import {
  addGroup,
  deleteGroup,
  deleteKnowledge,
  copyKnowledge,
  getLargeModelList,
  intfSync,
  moveKnowledge,
  pageKnowledgeList,
  queryGroupTree,
  updateGroup,
  type KnowledgeGroupNode,
  type KnowledgeParamRow,
  type LargeModelRow,
} from '../../api/knowledgeConfig';
import { FilterForm } from '../../components/FilterForm';
import { useAgentTable } from '../../components/useAgentTable';
import KnowledgeEditorModal from './KnowledgeEditorModal';
import { KnowledgeConfigEditor } from './KnowledgeConfigEditor';
import { TargetConfigModal } from './TargetConfigModal';
import { BlackBoxConfigModal } from './BlackBoxConfigModal';

interface FilterState {
  paramNo: string;
  paramName: string;
  paramStatus: string;
  online: string;
}

const EMPTY_FILTER: FilterState = { paramNo: '', paramName: '', paramStatus: '', online: '' };

export default function KnowledgeConfigList() {
  /* 分组树 */
  const [tree, setTree] = useState<KnowledgeGroupNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<KnowledgeGroupNode | null>(null);

  /** 读路由 query（用于从指标「关联信息」弹窗跳转过来时定位分组） */
  const [searchParams] = useSearchParams();

  /* 列表：分页 / 加载态 / 请求参数 / 过期响应丢弃统一由 hook 负责（见 components/useAgentTable.ts） */
  const { rows, loading, pagination, refresh, reload } = useAgentTable<KnowledgeParamRow>(pageKnowledgeList, {
    // 首屏由下面「分组变化」的 effect 触发，避免挂载时连查两次
    immediate: false,
    errorText: '知识库列表加载失败',
  });
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [rowKeys, setRowKeys] = useState<Key[]>([]);

  /* 大模型下拉（用于把 largeModelCode 翻译成名称） */
  const [largeModels, setLargeModels] = useState<LargeModelRow[]>([]);

  /* 弹窗 */
  const [groupModal, setGroupModal] = useState<{ open: boolean; mode: 'add' | 'addChild' | 'edit' }>({
    open: false,
    mode: 'add',
  });
  const [groupForm, setGroupForm] = useState({ groupName: '', groupValue: '' });
  const [groupSaving, setGroupSaving] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorType, setEditorType] = useState<'add' | 'edit'>('add');
  const [editorRow, setEditorRow] = useState<KnowledgeParamRow | null>(null);

  const [targetModal, setTargetModal] = useState<{ open: boolean; mode: 'copy' | 'move' }>({ open: false, mode: 'copy' });
  const [targetGroup, setTargetGroup] = useState<KnowledgeGroupNode | null>(null);

  /* 三个重交互弹窗：都由「选中一行」触发，故用 id 而非 boolean 表示开关 */
  const [configEditorTarget, setConfigEditorTarget] = useState<{ id: string; name: string; code: string } | null>(null);
  const [targetConfigId, setTargetConfigId] = useState<string | null>(null);
  const [blackBoxTarget, setBlackBoxTarget] = useState<{
    id: string;
    modelCode: string;
    contentDesc: string;
  } | null>(null);

  /* ---------------- 数据加载 ---------------- */

  const toTreeData = useCallback(
    (nodes: KnowledgeGroupNode[]): { key: string; title: string; children?: unknown[] }[] =>
      nodes.map((n) => ({
        key: n.groupId,
        title: n.groupName,
        children: n.children?.length ? toTreeData(n.children) : undefined,
      })),
    [],
  );

  const findGroup = useCallback((nodes: KnowledgeGroupNode[], id: string): KnowledgeGroupNode | null => {
    for (const n of nodes) {
      if (String(n.groupId) === id) return n;
      if (n.children?.length) {
        const hit = findGroup(n.children, id);
        if (hit) return hit;
      }
    }
    return null;
  }, []);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await queryGroupTree({});
      setTree(res?.list ?? []);
    } catch (e) {
      message.error((e as Error)?.message || '知识库分组加载失败');
      setTree([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  /**
   * 查询条件 → 请求参数
   *
   * 请求形状对齐源 `KnownList.vue`：`queryHandle` 里 `params = {...form}` 之后再
   * **`params.groupId = props.groupId`**（选中分组）；`resetHandle` 则整体重建 `params = {}`。
   *
   * 🔴 两个必须写死的点（都是 2026-09-15 自测踩过的坑）：
   *   1. **选中分组的字段名是 `groupId`**，不是 `parentParamNo` —— 后端 `KnowledgeBaseParamReq`
   *      确实有 `groupId` / `parentGroupId` / `parentParamId`，**没有 `parentParamNo`**；
   *      写成 `parentParamNo` 后端静默收不到 → 点分组后列表还是全部数据。
   *      另外 `parentGroupId` 要一起带上：后端 `pageKnowledgeBaseParamsList` 里
   *      「选中的是名为『全部』的节点 → 改用它的 `parentGroupId`」这段逻辑依赖它。
   *   2. **所有条件键都要显式写出**（空的写 `''`），不能"非空才写"：
   *      `useAgentTable.refresh(next)` 是**合并**语义（`{...当前条件, ...next}`，见 useAgentTable.ts），
   *      省略键 = 旧值残留 → **点「重置」再查还是老条件**。空串到后端无副作用
   *      （`isNotEmpty('')` 为 false，条件不进 SQL）。
   * 对照：`pages/rule/RuleList.tsx` 的 buildParams 一直是"全键写出"，所以它没这两个问题。
   */
  const buildParams = useCallback(
    (groupId: string, cond: FilterState, group?: KnowledgeGroupNode | null): Record<string, unknown> => {
      return {
        groupId: groupId || '',
        parentGroupId: group?.parentGroupId || '',
        paramNo: cond.paramNo || '',
        paramName: cond.paramName || '',
        paramStatus: cond.paramStatus || '',
        online: cond.online || '',
      };
    },
    [],
  );

  useEffect(() => {
    void loadTree();
    getLargeModelList({ pageIndex: 1, pageSize: 200 })
      .then((res) => setLargeModels(res?.list ?? []))
      .catch(() => setLargeModels([]));
  }, [loadTree]);

  // 首屏 + 切换分组都走这里（hook 的 immediate 已关掉，保证只查一次）
  useEffect(() => {
    void refresh(buildParams(selectedGroupId, filter, selectedGroup));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  /**
   * 从指标「关联信息」弹窗跳转过来时自动定位分组（?groupId=xxx）
   *
   * 源工程用 router.push 带 query 实现（path=/knowledge/config/list, query={groupId}）；
   * 本工程对应路由是 agent/knowledge-config，读同名参数即可。
   * 依赖 tree：树加载完才能把 groupId 还原成分组节点。
   */
  useEffect(() => {
    const groupId = searchParams.get('groupId');
    if (!groupId || !tree.length) return;
    const node = findGroup(tree, groupId);
    if (!node) return;
    setSelectedGroupId(groupId);
    setSelectedGroup(node);
    setRowKeys([]);
    // 不再手动 setPageIndex(1)：hook 的 refresh() 一律回到第 1 页
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tree]);

  /* ---------------- 树交互 ---------------- */

  const onTreeSelect = (keys: Key[]) => {
    if (!keys.length) {
      setSelectedGroupId('');
      setSelectedGroup(null);
      setRowKeys([]);
      return;
    }
    const id = String(keys[0]);
    setSelectedGroupId(id);
    setSelectedGroup(findGroup(tree, id));
    setRowKeys([]);
  };

  const openGroupModal = (mode: 'add' | 'addChild' | 'edit') => {
    if ((mode === 'addChild' || mode === 'edit') && !selectedGroup) {
      message.warning('请先在左侧选择一个分组');
      return;
    }
    setGroupForm({
      groupName: mode === 'edit' ? selectedGroup?.groupName ?? '' : '',
      groupValue: mode === 'edit' ? String(selectedGroup?.groupValue ?? '') : '',
    });
    setGroupModal({ open: true, mode });
  };

  const doSaveGroup = async () => {
    if (!groupForm.groupName.trim()) {
      message.warning('请输入分组名称');
      return;
    }
    setGroupSaving(true);
    try {
      const { mode } = groupModal;
      if (mode === 'add') {
        await addGroup({ groupName: groupForm.groupName, groupValue: groupForm.groupValue });
      } else if (mode === 'addChild') {
        await addGroup({
          parentGroupId: selectedGroup?.groupId,
          parentParamNo: selectedGroup?.groupId,
          groupName: groupForm.groupName,
          groupValue: groupForm.groupValue,
        });
      } else {
        await updateGroup({
          groupId: selectedGroup?.groupId,
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
      setSelectedGroupId('');
      await loadTree();
    } catch (e) {
      message.error((e as Error)?.message || '删除失败');
    }
  };

  /* ---------------- 列表操作 ---------------- */

  const requireOne = (): string | null => {
    if (!rowKeys.length) {
      message.warning('请先选择一条知识库');
      return null;
    }
    return String(rowKeys[0]);
  };

  const doQuery = () => void refresh(buildParams(selectedGroupId, filter, selectedGroup));

  const doReset = () => {
    setFilter(EMPTY_FILTER);
    void refresh(buildParams(selectedGroupId, EMPTY_FILTER, selectedGroup));
  };

  const doDelete = async () => {
    const paramId = requireOne();
    if (!paramId) return;
    try {
      await deleteKnowledge({ paramId, paramNo: paramId });
      message.success('删除成功');
      setRowKeys([]);
      void reload();
    } catch (e) {
      message.error((e as Error)?.message || '删除失败');
    }
  };

  const openTargetModal = (mode: 'copy' | 'move') => {
    const id = requireOne();
    if (!id) return;
    setTargetGroup(null);
    setTargetModal({ open: true, mode });
  };

  const doTargetConfirm = async () => {
    const id = requireOne();
    if (!id) return;
    if (!targetGroup) {
      message.warning('请选择目标分组');
      return;
    }
    try {
      const payload = { paramId: id, parentParamNo: targetGroup.groupId, groupId: targetGroup.groupId };
      if (targetModal.mode === 'copy') await copyKnowledge(payload);
      else await moveKnowledge(payload);
      message.success(targetModal.mode === 'copy' ? '复制成功' : '移动成功');
      setTargetModal((s) => ({ ...s, open: false }));
      setRowKeys([]);
      void reload();
    } catch (e) {
      message.error((e as Error)?.message || '操作失败');
    }
  };

  const doBatchSync = async () => {
    if (!rowKeys.length) {
      message.warning('请选择要同步的知识库');
      return;
    }
    try {
      await intfSync({ syncType: 'knowledge', syncIdList: rowKeys.map(String) });
      message.success('批量同步任务发起成功！');
    } catch (e) {
      message.error((e as Error)?.message || '同步失败');
    }
  };

  /* ---------------- 三个重交互弹窗（源工程各自是独立组件） ---------------- */

  /**
   * 「配置」：prompt 配置 / 溯源配置 / 分片策略 / 黑盒参数（源 `KnownConfigModalV2.vue`）
   *
   * 说明：源工程 `configKnown()` 只校验"必须选中一行"，弹窗自身用 `selectedRowKeys[0]` 取值；
   * 这里显式传 id/name/code，等价且更明确。
   */
  const openConfigEditor = () => {
    const id = requireOne();
    if (!id) return;
    const row = rows.find((r) => String(r.paramId) === id);
    setConfigEditorTarget({ id, name: String(row?.paramName ?? ''), code: String(row?.paramNo ?? '') });
  };

  /**
   * 「指标」：指标与溯源点绑定（源 `TargetConfigModal.vue`）
   *
   * ⚠️ 与源工程的一处刻意差异：源 `editTarget()` **不校验是否选中**就开弹窗，
   * 而弹窗内部用 `selectedRowKeys[0]` 取 knownId —— 未选中时会把 undefined 传进去。
   * 这里改为先校验（提示"请先选择一条知识库"），避免弹窗拿着空 id 发请求。
   */
  const openTargetConfig = () => {
    const id = requireOne();
    if (!id) return;
    setTargetConfigId(id);
  };

  /** 「知识库配置」：黑盒参数（源 `KnownBlackBoxConfig.vue`） */
  const openBlackBox = () => {
    const id = requireOne();
    if (!id) return;
    const row = rows.find((r) => String(r.paramId) === id);
    setBlackBoxTarget({
      id,
      modelCode: String(row?.blackModelCode ?? ''),
      contentDesc: String(row?.blackContentDesc ?? ''),
    });
  };

  /* ---------------- 表格 ---------------- */

  const columns: ColumnsType<KnowledgeParamRow> = useMemo(
    () => [
      {
        title: '序号',
        dataIndex: 'paramID',
        width: 60,
        align: 'center',
        render: (_: unknown, __: KnowledgeParamRow, index: number) => index + 1,
      },
      { title: '知识库编号', dataIndex: 'paramNo', width: 350, ellipsis: true },
      { title: '知识库名称', dataIndex: 'paramName', width: 300, ellipsis: true },
      {
        title: '大模型编码',
        dataIndex: 'largeModelCode',
        width: 260,
        ellipsis: true,
        render: (code: string) => {
          const hit = largeModels.find((m) => m.lmCode === code);
          return <span>{hit ? hit.lmName : code || ''}</span>;
        },
      },
      { title: '是否Markdown', dataIndex: 'isMarkdownDesc', width: 200, ellipsis: true },
      { title: '上线状态', dataIndex: 'onlineDesc', width: 200, ellipsis: true },
    ],
    [largeModels],
  );

  const treeData = useMemo(() => toTreeData(tree), [tree, toTreeData]);

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={12}>
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
                <Popconfirm
                  title={`确定删除「${selectedGroup?.groupName ?? ''}」分组及其子分组吗？`}
                  okText="确定"
                  cancelText="取消"
                  onConfirm={() => void doDeleteGroup()}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            }
            styles={{ body: { minHeight: 420, maxHeight: 620, overflow: 'auto' } }}
          >
            {treeData.length ? (
              <Tree treeData={treeData as never} selectedKeys={selectedGroupId ? [selectedGroupId] : []} defaultExpandAll onSelect={onTreeSelect} />
            ) : (
              <div style={{ color: '#8c8c8c', textAlign: 'center', paddingTop: 40 }}>
                {treeLoading ? '加载中…' : '暂无分组数据'}
              </div>
            )}
          </Card>
        </Col>

        <Col span={19}>
          <Card styles={{ body: { padding: 16 } }}>
            <FilterForm<FilterState>
              fields={[
                { field: 'paramNo', label: '知识库编号', placeholder: '请输入知识库编号', width: 180 },
                { field: 'paramName', label: '知识库名称', placeholder: '请输入知识库名称', width: 180 },
                {
                  field: 'paramStatus',
                  label: '验收状态',
                  type: 'select',
                  placeholder: '请选择验收状态',
                  width: 140,
                  options: [
                    { label: '是', value: 'Y' },
                    { label: '否', value: 'N' },
                  ],
                },
                {
                  field: 'online',
                  label: '上线状态',
                  type: 'select',
                  placeholder: '请选择上线状态',
                  width: 140,
                  options: [
                    { label: '已上线', value: 'Y' },
                    { label: '已下线', value: 'N' },
                  ],
                },
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
                  if (!selectedGroupId) {
                    message.warning('请先在左侧选择分组');
                    return;
                  }
                  setEditorType('add');
                  setEditorRow(null);
                  setEditorOpen(true);
                }}
              >
                新建
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  const id = requireOne();
                  if (!id) return;
                  setEditorType('edit');
                  setEditorRow(rows.find((r) => String(r.paramId) === id) ?? null);
                  setEditorOpen(true);
                }}
              >
                编辑
              </Button>
              <Tooltip title="prompt 配置 / 溯源配置 / 分片策略（源 KnownConfigModalV2）">
                <Button type="primary" onClick={openConfigEditor}>
                  配置
                </Button>
              </Tooltip>
              <Button type="primary" onClick={() => openTargetModal('copy')}>
                复制
              </Button>
              <Button type="primary" onClick={() => openTargetModal('move')}>
                移动
              </Button>
              <Popconfirm title="确定删除选中知识库吗？" okText="确定" cancelText="取消" onConfirm={() => void doDelete()}>
                <Button danger>删除</Button>
              </Popconfirm>
              <Tooltip title="指标与溯源点绑定（源 TargetConfigModal）">
                <Button type="primary" onClick={openTargetConfig}>
                  指标
                </Button>
              </Tooltip>
              <Popconfirm title="确定发起批量同步吗？" okText="确定" cancelText="取消" onConfirm={() => void doBatchSync()}>
                <Button type="primary">批量同步</Button>
              </Popconfirm>
              <Tooltip title="黑盒参数配置（源 KnownBlackBoxConfig）">
                <Button type="primary" onClick={openBlackBox}>
                  知识库配置
                </Button>
              </Tooltip>
              <Button onClick={() => void reload()}>刷新</Button>
            </Space>

            <Table<KnowledgeParamRow>
              rowKey="paramId"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={rows}
              scroll={{ x: 1650 }}
              rowSelection={{ selectedRowKeys: rowKeys, onChange: (keys) => setRowKeys(keys) }}
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

      {/* 复制 / 移动 */}
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

      {/* 新建 / 编辑知识库 */}
      <KnowledgeEditorModal
        open={editorOpen}
        editType={editorType}
        row={editorRow}
        parentGroupId={selectedGroupId}
        largeModels={largeModels}
        onClose={() => setEditorOpen(false)}
        onSuccess={() => {
          setEditorOpen(false);
          void reload();
        }}
      />

      {/* 知识库配置（源 KnownConfigModalV2：全屏三栏） */}
      {configEditorTarget && (
        <KnowledgeConfigEditor
          open
          knownId={configEditorTarget.id}
          knownName={configEditorTarget.name}
          knownCode={configEditorTarget.code}
          onClose={() => setConfigEditorTarget(null)}
          onSaved={() => void reload()}
        />
      )}

      {/* 知识库「指标」（源 TargetConfigModal） */}
      {targetConfigId && (
        <TargetConfigModal
          open
          knownId={targetConfigId}
          onClose={() => setTargetConfigId(null)}
          onSuccess={() => void reload()}
        />
      )}

      {/* 知识库「黑盒配置」（源 KnownBlackBoxConfig） */}
      {blackBoxTarget && (
        <BlackBoxConfigModal
          open
          knownId={blackBoxTarget.id}
          blackModelCode={blackBoxTarget.modelCode}
          blackContentDesc={blackBoxTarget.contentDesc}
          onClose={() => setBlackBoxTarget(null)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}