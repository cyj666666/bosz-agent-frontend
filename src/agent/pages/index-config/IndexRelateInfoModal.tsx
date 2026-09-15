/**
 * 指标配置 — 「关联信息」弹窗
 *
 * 对应源工程三个文件：
 *   `views/index/IndexRelateInfoTab.vue`（54 行 —— 弹窗壳 + 两个页签）
 *   `views/index/IndexRelateKnowledgeModal.vue`（158 行 —— 「知识库」页签的筛选 + 表格）
 *   `views/index/IndexRelateIndexModal.vue`（152 行 —— 「指标」页签的筛选 + 表格）
 *
 * ── 触发方式 ──
 * 源工程列表页的「关联校验」按钮 `relateCheck()` **只做一件事**：校验"必须选中一行"，
 * 然后 `relateInfoVisible = true` 打开本弹窗；明细由两个页签各自调接口加载。
 * 本工程与之一致（见 `IndexConfigList.tsx` 的 `doRelateCheck`）。
 *
 * ── 接口契约 ──
 *   知识库页签 → `POST /index/config/queryRelateKnowledgeInfo`
 *                 入参 `{paramNo, relateKnowledgeCode?, relateKnowledgeName?, pageIndex, pageSize}`
 *                 列：序号 / 知识库编码 / 知识库名称 / 关联项 / 操作
 *   指标页签   → `POST /index/config/queryRelateIndexInfo`
 *                 入参 `{paramNo, relateParamNo?, relateParamName?, pageIndex, pageSize}`
 *                 列：序号 / 指标编码 / 指标名称 / 操作
 *
 * ── 与源工程的两处刻意差异（都已在下方标注）──
 * 1. **「指标」页签的表头文案**：源工程写的是「知识库编码 / 知识库名称」，
 *    但它绑定的字段是 `relateParamId` / `relateParamName`（都是**指标**），
 *    显然是复制「知识库」页签时忘了改。本工程按**实际字段语义**写为「指标编码 / 指标名称」。
 * 2. **跳转方式**：源工程是 `$router.push({path:'/index/list', query:{groupId}})`。
 *    本工程对应路由是 `/agent/index-config` 与 `/agent/knowledge-config`，
 *    且这两个列表页已支持读 `?groupId=` 自动定位分组（本轮补上），故语义等价。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Space, Table, Tabs, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { queryRelateIndexInfo, queryRelateKnowledgeInfo, type IndexParamRow } from '../../api/indexConfig';

/** 关联信息行（两个页签字段名不同，故用宽松类型） */
type RelateRow = Record<string, unknown>;

interface IndexRelateInfoModalProps {
  open: boolean;
  /** 选中的指标行（源工程传 `selectedRowNodes[0]`） */
  curParam: IndexParamRow | null;
  onClose: () => void;
}

/** 一个页签的取数配置 —— 两个页签的差异只有这些 */
interface RelateTabConfig {
  /** 取数接口 */
  fetch: (params: Record<string, unknown>) => Promise<unknown>;
  /** 两个筛选框：[字段名, 标签] */
  filters: [[string, string], [string, string]];
  /** 表头（不含「序号」「操作」两列，它们由 RelateTable 统一生成） */
  columns: ColumnsType<RelateRow>;
  /** 操作列按钮文案与跳转目标路由 */
  jumpLabel: string;
  jumpPath: string;
}

/**
 * 共用的「筛选 + 表格 + 分页」块
 *
 * 源工程两个子组件各自用 `useAntdTable` 重复了一遍同样的骨架，只有接口/字段/列/跳转不同。
 * 这里抽成一个受控组件（分页与筛选都由本组件持有），避免两份几乎相同的代码。
 */
function RelateTable({ config, curParam }: { config: RelateTabConfig; curParam: IndexParamRow | null }) {
  const navigate = useNavigate();
  const [keyword1, setKeyword1] = useState('');
  const [keyword2, setKeyword2] = useState('');
  const [rows, setRows] = useState<RelateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  const [[key1, label1], [key2, label2]] = config.filters;
  const paramNo = curParam?.paramNo ?? '';

  const load = useCallback(
    async (page: number, size: number, v1: string, v2: string) => {
      if (!paramNo) return;
      setLoading(true);
      try {
        const params: Record<string, unknown> = { paramNo, pageIndex: page, pageSize: size };
        if (v1) params[key1] = v1;
        if (v2) params[key2] = v2;
        const res = (await config.fetch(params)) as { list?: RelateRow[]; totalCount?: number } | undefined;
        setRows(res?.list ?? []);
        setTotal(res?.totalCount ?? 0);
      } catch (e) {
        message.error((e as Error)?.message || '关联信息加载失败');
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [config, paramNo, key1, key2],
  );

  // 换指标就重置筛选与页码后重新拉取（源工程靠 `curParam` 变化触发的 defaultParams 生效）
  useEffect(() => {
    setKeyword1('');
    setKeyword2('');
    setPageIndex(1);
    setPageSize(10);
    void load(1, 10, '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramNo]);

  const columns = useMemo<ColumnsType<RelateRow>>(
    () => [
      {
        title: '序号',
        align: 'center',
        width: 60,
        render: (_v, _r, index) => (pageIndex - 1) * pageSize + index + 1,
      },
      ...config.columns,
      {
        title: '操作',
        align: 'center',
        width: 110,
        render: (_v, record) => (
          <Button
            type="link"
            onClick={() => {
              const groupId = String(record.relateGroupId ?? '');
              if (!groupId) {
                message.warning('该行没有分组标识（relateGroupId），无法定位到来源分组');
                return;
              }
              navigate(`${config.jumpPath}?groupId=${encodeURIComponent(groupId)}`);
            }}
          >
            {config.jumpLabel}
          </Button>
        ),
      },
    ],
    [config, pageIndex, pageSize, navigate],
  );

  const doQuery = () => {
    setPageIndex(1);
    void load(1, pageSize, keyword1.trim(), keyword2.trim());
  };

  const doClear = () => {
    setKeyword1('');
    setKeyword2('');
    setPageIndex(1);
    void load(1, pageSize, '', '');
  };

  return (
    <>
      <div style={{ paddingBottom: 12 }}>
        <Space wrap>
          <Input
            style={{ width: 200 }}
            placeholder={`请输入${label1}`}
            value={keyword1}
            onChange={(e) => setKeyword1(e.target.value)}
            onPressEnter={doQuery}
            allowClear
          />
          <Input
            style={{ width: 200 }}
            placeholder={`请输入${label2}`}
            value={keyword2}
            onChange={(e) => setKeyword2(e.target.value)}
            onPressEnter={doQuery}
            allowClear
          />
          <Button onClick={doClear}>清空</Button>
          <Button type="primary" onClick={doQuery}>
            查询
          </Button>
        </Space>
      </div>
      <Table<RelateRow>
        rowKey={(r) => String(r.relateGroupId ?? '') + String(r[key1] ?? '') + String(r[key2] ?? '')}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 900 }}
        pagination={{
          current: pageIndex,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, s) => {
            setPageIndex(p);
            setPageSize(s);
            void load(p, s, keyword1.trim(), keyword2.trim());
          },
        }}
      />
    </>
  );
}

export function IndexRelateInfoModal({ open, curParam, onClose }: IndexRelateInfoModalProps) {
  const [activeKey, setActiveKey] = useState('1');

  /**
   * 源工程两个页签都加了 `forceRender`（一次性都渲染）；这里用 antd Tabs 的
   * `destroyOnHidden={false}`（默认）达到同样效果——切换回来不会丢已加载的数据。
   */
  const knowledgeTab: RelateTabConfig = {
    fetch: queryRelateKnowledgeInfo,
    filters: [
      ['relateKnowledgeCode', '知识库编码'],
      ['relateKnowledgeName', '知识库名称'],
    ],
    columns: [
      { title: '知识库编码', align: 'center', dataIndex: 'relateKnowledgeCode' },
      { title: '知识库名称', align: 'center', dataIndex: 'relateKnowledgeName' },
      { title: '关联项', align: 'center', dataIndex: 'relateItems' },
    ],
    jumpLabel: '查看知识库',
    jumpPath: '/agent/knowledge-config',
  };

  const indexTab: RelateTabConfig = {
    fetch: queryRelateIndexInfo,
    filters: [
      ['relateParamNo', '指标编码'],
      ['relateParamName', '指标名称'],
    ],
    columns: [
      // ⚠️ 源工程此处的表头写的是「知识库编码 / 知识库名称」，但字段是 relateParamId/relateParamName，
      //    属复制笔误；这里按实际语义写为「指标编码 / 指标名称」。
      { title: '指标编码', align: 'center', dataIndex: 'relateParamId' },
      { title: '指标名称', align: 'center', dataIndex: 'relateParamName' },
    ],
    jumpLabel: '查看指标',
    jumpPath: '/agent/index-config',
  };

  return (
    <Modal
      open={open}
      title={
        <span>
          关联信息
          {curParam?.paramName ? (
            <span style={{ color: '#8c8c8c', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
              （{curParam.paramName}
              {curParam.paramNo ? ` / ${curParam.paramNo}` : ''}）
            </span>
          ) : null}
        </span>
      }
      width={1200}
      footer={null}
      onCancel={onClose}
      destroyOnClose
    >
      {/* 关闭后重新打开需重新取数：用条件渲染保证 RelateTable 重新 mount（等价源工程的 v-if） */}
      <Tabs
        size="small"
        activeKey={activeKey}
        onChange={setActiveKey}
        items={[
          { key: '1', label: '知识库', children: open ? <RelateTable config={knowledgeTab} curParam={curParam} /> : null },
          { key: '2', label: '指标', children: open ? <RelateTable config={indexTab} curParam={curParam} /> : null },
        ]}
      />
    </Modal>
  );
}

export default IndexRelateInfoModal;
