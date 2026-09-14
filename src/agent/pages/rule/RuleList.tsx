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
import { Button, Card, DatePicker, Form, Input, Popconfirm, Select, Space, Switch, Table, Tooltip, TreeSelect, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { deleteRule, getRuleList, getTopicSelect, updateRuleStatus } from '../../api/rule';
import type { RuleItem, TopicOption, TopicPair } from '../../types';
import RuleFormModal from './RuleFormModal';

const { RangePicker } = DatePicker;

interface SearchState {
  ruleName: string;
  ruleCode: string;
  ruleStatus: string;
  dateRange: [Dayjs, Dayjs] | null;
  topicPairs: TopicPair[];
}

const EMPTY_SEARCH: SearchState = {
  ruleName: '',
  ruleCode: '',
  ruleStatus: '',
  dateRange: null,
  topicPairs: [],
};

export default function RuleList() {
  const [rows, setRows] = useState<RuleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [topicValues, setTopicValues] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RuleItem | null>(null);

  /** 拉列表。传参显式化，避免"依赖 search 但只改了分页"时拿到旧条件 */
  const fetchList = useCallback(
    async (page: number, size: number, cond: SearchState) => {
      setLoading(true);
      try {
        const res = await getRuleList({
          ruleName: cond.ruleName || undefined,
          ruleCode: cond.ruleCode || undefined,
          ruleStatus: cond.ruleStatus || undefined,
          startTime: cond.dateRange?.[0] ? dayjs(cond.dateRange[0]).format('YYYY-MM-DD') : undefined,
          endTime: cond.dateRange?.[1] ? dayjs(cond.dateRange[1]).format('YYYY-MM-DD') : undefined,
          topicPairList: cond.topicPairs.length ? cond.topicPairs : undefined,
          pageIndex: page,
          pageSize: size,
        });
        setRows(res?.list ?? []);
        setTotal(res?.totalCount ?? 0);
      } catch (e) {
        message.error((e as Error)?.message || '检查项列表加载失败');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchList(pageIndex, pageSize, search);
    // 仅在分页变化时重查；条件变化由「查询」按钮显式触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, pageSize]);

  // 主题选项：一次加载，结构为 [{topic1, topic2List:[...]}]
  useEffect(() => {
    getTopicSelect()
      .then((data) => setTopics(Array.isArray(data) ? data : []))
      .catch(() => setTopics([]));
  }, []);

  /** 主题树：一级用 `group_` 前缀与二级区分，选中后只取二级组合成 topicPairList */
  const treeData = topics.map((t) => ({
    value: `group_${t.topic1}`,
    title: t.topic1,
    children: (t.topic2List ?? []).map((t2) => ({ value: `${t.topic1}|${t2}`, title: t2 })),
  }));

  const onTopicChange = (values: string[]) => {
    setTopicValues(values);
    const pairs: TopicPair[] = [];
    values.forEach((v) => {
      if (typeof v !== 'string' || v.startsWith('group_')) return;
      const parts = v.split('|');
      if (parts.length !== 2) return;
      if (!pairs.some((p) => p.topic1 === parts[0] && p.topic2 === parts[1])) {
        pairs.push({ topic1: parts[0], topic2: parts[1] });
      }
    });
    setSearch((prev) => ({ ...prev, topicPairs: pairs }));
  };

  const doQuery = () => {
    setPageIndex(1);
    void fetchList(1, pageSize, search);
  };

  const doReset = () => {
    setSearch(EMPTY_SEARCH);
    setTopicValues([]);
    setPageIndex(1);
    void fetchList(1, pageSize, EMPTY_SEARCH);
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
      void fetchList(pageIndex, pageSize, search);
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
        <Form layout="inline" style={{ rowGap: 12 }}>
          <Form.Item label="检查项检索">
            <Input
              allowClear
              placeholder="请输入规则名称/描述检索关键词"
              style={{ width: 240 }}
              value={search.ruleName}
              onChange={(e) => setSearch((p) => ({ ...p, ruleName: e.target.value }))}
              onPressEnter={doQuery}
            />
          </Form.Item>
          <Form.Item label="规则编号">
            <Input
              allowClear
              placeholder="请输入规则Code"
              style={{ width: 180 }}
              value={search.ruleCode}
              onChange={(e) => setSearch((p) => ({ ...p, ruleCode: e.target.value }))}
              onPressEnter={doQuery}
            />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              style={{ width: 130 }}
              placeholder="下拉选择"
              value={search.ruleStatus}
              onChange={(v) => setSearch((p) => ({ ...p, ruleStatus: v }))}
              options={[
                { label: '全部', value: '' },
                { label: '有效', value: 'Y' },
                { label: '无效', value: 'N' },
              ]}
            />
          </Form.Item>
          <Form.Item label="更新日期">
            <RangePicker
              format="YYYY-MM-DD"
              value={search.dateRange}
              onChange={(v) => setSearch((p) => ({ ...p, dateRange: (v as [Dayjs, Dayjs]) ?? null }))}
            />
          </Form.Item>
          <Form.Item label="主题">
            <TreeSelect
              style={{ width: 250 }}
              placeholder="请选择主题"
              treeData={treeData}
              value={topicValues}
              onChange={onTopicChange}
              treeCheckable
              allowClear
              showCheckedStrategy={TreeSelect.SHOW_CHILD}
              treeCheckStrictly
              treeDefaultExpandAll
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={doQuery}>
                查询
              </Button>
              <Button onClick={doReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card styles={{ body: { padding: 16 } }}>
        <Table<RuleItem>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1200 }}
          pagination={{
            current: pageIndex,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, size) => {
              setPageIndex(page);
              setPageSize(size);
            },
          }}
        />
      </Card>

      <RuleFormModal
        open={modalOpen}
        oldData={editing}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          void fetchList(pageIndex, pageSize, search);
        }}
      />
    </div>
  );
}
