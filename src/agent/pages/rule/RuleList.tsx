/**
 * 智策引擎 — 检查项列表
 *
 * 对应源工程 `amar-agent-admin/src/views/app/rule/List.vue`（412 行 Vue）。
 * 结构与交互逐项对齐：搜索栏（5 个条件）+ 表格（9 列）+ 状态开关 + 删除 + 全屏表单弹窗。
 *
 * 与源工程的差异只有一处，且是刻意的：
 *   源工程用 `res.success / res.result`（JeecgBoot 返回体）判断结果；
 *   本工程后端的返回体是 `{code, message, data}`，且已在 `agentRequest` 里
 *   统一校验 code 并解包到 data，所以本页**只写 try/catch，不再判 success**。
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, DatePicker, Popconfirm, Space, Switch, Table, Tooltip, TreeSelect, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { deleteRule, getRuleList, getTopicSelect, updateRuleStatus } from '../../api/rule';
import { FilterForm } from '../../components/FilterForm';
import type { FilterField } from '../../components/FilterForm';
import { useAgentTable } from '../../components/useAgentTable';
import { useAutoQuery } from '../../components/useAutoQuery';
import type { RuleItem, RuleListQuery, TopicOption, TopicPair } from '../../types';
import RuleFormModal from './RuleFormModal';

const { RangePicker } = DatePicker;

/**
 * 查询条件
 *
 * ⚠️ 主题这里存的是**树选择器的原始值**（`topic1|topic2` 字符串数组），
 *    请求要的 `topicPairList` 由 `buildParams` 现场拆出来 —— 只留一份真相，
 *    避免"选择器的值"和"已选的 pair"两处状态不一致（源工程是两处各存一份）。
 */
interface SearchState {
  ruleName: string;
  ruleCode: string;
  ruleStatus: string;
  dateRange: [Dayjs, Dayjs] | null;
  topicValues: string[];
}

const EMPTY_SEARCH: SearchState = {
  ruleName: '',
  ruleCode: '',
  ruleStatus: '',
  dateRange: null,
  topicValues: [],
};

/**
 * 把 TreeSelect 的选中值归一成 `topic1|topic2` 字符串。
 *
 * ⚠️ **两种形态都要接住**（2026-09-16 自测踩坑后加）：
 *   - 默认写法（`treeCheckStrictly` 不传 = false，**源工程就是这一种**）→ 值就是 `string[]`；
 *   - 一旦打开 `treeCheckStrictly` → antd 回传的是 `{ value, label, halfChecked }` **对象数组**。
 * 上一版只判 `typeof v === 'string'`，遇到对象形态就整批 `return`，
 * 于是 `topicPairList` 恒为空 → **「主题」筛选静默失效**（选了没反应、也不报错）。
 * 这里两头都兼容，避免以后再被同一个坑绊倒。
 */
function normalizeTopicValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'value' in v) {
    return String((v as { value: unknown }).value ?? '');
  }
  return '';
}

export default function RuleList() {
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RuleItem | null>(null);

  /**
   * 查询条件 → 请求参数
   *
   * 照抄源 `queryHandle`：**只带非空项**（空值给 `undefined`，序列化时自然消失）。
   * ⚠️ 文字检索对应的字段名是 **`ruleName`**（源工程 `params.ruleName = searchForm.checkItemSearch`），
   *    不是搜索框标签里的"检查项检索"。
   */
  const buildParams = useCallback((cond: SearchState): Partial<RuleListQuery> => {
    const pairs: TopicPair[] = [];
    cond.topicValues.forEach((raw) => {
      const v = normalizeTopicValue(raw);
      // 一级节点的值带 `group_` 前缀（只是用来区分层级），提交时只保留二级组合
      if (!v || v.startsWith('group_')) return;
      const parts = v.split('|');
      if (parts.length !== 2) return;
      if (!pairs.some((p) => p.topic1 === parts[0] && p.topic2 === parts[1])) {
        pairs.push({ topic1: parts[0], topic2: parts[1] });
      }
    });
    return {
      ruleName: cond.ruleName.trim() || undefined,
      ruleCode: cond.ruleCode.trim() || undefined,
      ruleStatus: cond.ruleStatus || undefined,
      startTime: cond.dateRange?.[0] ? dayjs(cond.dateRange[0]).format('YYYY-MM-DD') : undefined,
      endTime: cond.dateRange?.[1] ? dayjs(cond.dateRange[1]).format('YYYY-MM-DD') : undefined,
      topicPairList: pairs.length ? pairs : undefined,
    };
  }, []);

  /** 列表：分页 / 请求参数 / 加载态 / 过期响应丢弃统一由 hook 负责 */
  const { rows, loading, pagination, refresh, reload, setRows } = useAgentTable<
    RuleItem,
    Omit<RuleListQuery, 'pageIndex' | 'pageSize'>
  >(getRuleList, { errorText: '检查项列表加载失败' });

  // 主题选项：一次加载，结构为 [{topic1, topic2List:[...]}]
  useEffect(() => {
    getTopicSelect()
      .then((data) => setTopics(Array.isArray(data) ? data : []))
      .catch(() => setTopics([]));
  }, []);

  /**
   * 主题树：一级用 `group_` 前缀与二级区分，选中后只取二级组合成 topicPairList
   *
   * 🔴 **这里不要加 `treeCheckStrictly`**（2026-09-16 修复）：
   *   源工程 `app/rule/List.vue` 写的是 `:tree-check-strictly="false"`，即**父子联动**的默认行为；
   *   上一版漏看了这一行、直接写了 `treeCheckStrictly`（= true），两个后果：
   *     ① 打开 strict 后 antd 回传的是 `{value,label,halfChecked}` 对象数组，
   *        而 `buildParams` 只认字符串 → **主题筛选静默失效**；
   *     ② 交互也和源工程不一致（strict 下父子不联动）。
   * `showCheckedStrategy={SHOW_CHILD}` 与源工程默认策略一致（只回传叶子节点值），保留。
   */
  const treeData = topics.map((t) => ({
    value: `group_${t.topic1}`,
    title: t.topic1,
    children: (t.topic2List ?? []).map((t2) => ({ value: `${t.topic1}|${t2}`, title: t2 })),
  }));

  /** 搜索区字段（源工程是自己写的一段 inline form，这里用通用 FilterForm 表达） */
  const filterFields: FilterField[] = [
    { field: 'ruleName', label: '检查项检索', placeholder: '请输入规则名称/描述检索关键词', width: 240 },
    { field: 'ruleCode', label: '规则编号', placeholder: '请输入规则Code', width: 180 },
    {
      field: 'ruleStatus',
      label: '状态',
      type: 'select',
      placeholder: '下拉选择',
      width: 130,
      options: [
        { label: '全部', value: '' },
        { label: '有效', value: 'Y' },
        { label: '无效', value: 'N' },
      ],
    },
    {
      field: 'dateRange',
      label: '更新日期',
      type: 'custom',
      render: (v, onChange) => (
        <RangePicker
          format="YYYY-MM-DD"
          value={v as [Dayjs, Dayjs] | undefined}
          onChange={(next) => onChange(next)}
        />
      ),
    },
    {
      field: 'topicValues',
      label: '主题',
      type: 'custom',
      render: (v, onChange) => (
        <TreeSelect
          style={{ width: 250 }}
          placeholder="请选择主题"
          treeData={treeData}
          value={v as string[]}
          onChange={(next) => onChange(next)}
          treeCheckable
          allowClear
          showCheckedStrategy={TreeSelect.SHOW_CHILD}
          treeDefaultExpandAll
        />
      ),
    },
  ];

  const doQuery = useCallback(() => void refresh(buildParams(search)), [refresh, buildParams, search]);

  /**
   * 条件一变就自动重查（免点「查询」）—— 详见 `components/useAutoQuery.ts`
   *
   * 「状态」下拉、「更新日期」区间属于"选完即提交"的控件 → 立即查（与源工程一致）；
   * 文字检索与「主题」多选树 → 防抖 400ms（逐字/每勾一次都查会打出一串请求）。
   */
  useAutoQuery(search, doQuery, { immediateFields: ['ruleStatus', 'dateRange'] });

  const doReset = () => {
    // 只改条件，真正的查询由 useAutoQuery 触发；条件本来就空时不会多打一次请求
    setSearch({ ...EMPTY_SEARCH });
  };

  /** 启用/停用：成功后只改本地行数据，不整表重刷（与源工程一致，避免翻页位置跳动） */
  const onToggleStatus = async (row: RuleItem) => {
    const next = row.ruleStatus === 'Y' ? 'N' : 'Y';
    try {
      await updateRuleStatus(row.id, next);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ruleStatus: next } : r)));
      message.success(next === 'Y' ? '启用成功' : '禁用成功');
    } catch (e) {
      message.error((e as Error)?.message || '状态修改失败');
    }
  };

  const onDelete = async (row: RuleItem) => {
    try {
      await deleteRule(row.id);
      message.success('删除成功');
      void reload();
    } catch (e) {
      message.error((e as Error)?.message || '删除失败');
    }
  };

  const columns: ColumnsType<RuleItem> = [
    { title: 'ID', dataIndex: 'id', width: 80, align: 'center' },
    { title: '规则编号', dataIndex: 'ruleCode', width: 120, align: 'center' },
    { title: '一级主题', dataIndex: 'topic1', width: 120, align: 'center' },
    { title: '二级主题', dataIndex: 'topic2', width: 120, align: 'center' },
    { title: '检查项', dataIndex: 'ruleName', width: 180, ellipsis: true },
    {
      title: '触发条件',
      dataIndex: 'ruleText',
      width: 350,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'ruleStatus',
      width: 100,
      align: 'center',
      render: (_: unknown, row: RuleItem) => (
        <Switch
          checked={row.ruleStatus === 'Y'}
          checkedChildren="有效"
          unCheckedChildren="无效"
          onChange={() => void onToggleStatus(row)}
        />
      ),
    },
    { title: '更新日期', dataIndex: 'updateTime', width: 150, align: 'center' },
    {
      title: '操作',
      dataIndex: 'action',
      width: 120,
      align: 'center',
      render: (_: unknown, row: RuleItem) => (
        <Space size={8}>
          <Button
            type="link"
            onClick={() => {
              setEditing(row);
              setModalOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除检查项「${row.ruleName}」吗？`}
            okText="确定"
            cancelText="取消"
            onConfirm={() => void onDelete(row)}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>智策引擎</h2>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          创建检查项
        </Button>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <FilterForm<SearchState>
          fields={filterFields}
          value={search}
          onChange={setSearch}
          onQuery={doQuery}
          onReset={doReset}
          loading={loading}
        />
      </Card>

      <Card styles={{ body: { padding: 16 } }}>
        <Table<RuleItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1200 }}
          pagination={pagination}
        />
      </Card>

      <RuleFormModal
        open={modalOpen}
        oldData={editing}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          void reload();
        }}
      />
    </div>
  );
}
