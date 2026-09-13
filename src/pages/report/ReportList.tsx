/**
 * 报告列表页 —— 模板化报告记录（report 表）
 *
 * 数据来源：GET /api/report/instance/page（支持全部列检索，返回 total）
 * · 「发起报告」 → POST /api/report/instance/create，手工创建一条记录（status=111 待开始）
 * · 「生成」     → POST /api/report/instance/generate?reportNo=…，按模板加工该报告的实例数据
 * · 「查看」     → /report/{checkTaskNo}，详情页按日检流水号查最新版本（顶部可切换历史版本）
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, Button, Tag, message, Popconfirm, Tooltip, Modal, Form, Input, Select,
  DatePicker, Row, Col, Space, Pagination,
} from "antd";
import {
  EyeOutlined, ThunderboltOutlined, PlusOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import {
  reportApi,
  type ReportCreatePayload,
  type ReportInstanceSummary,
  type ReportPageQuery,
} from "../../api/report";

const { RangePicker } = DatePicker;

/** 报告状态码 → 展示样式 */
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  "111": { color: "default", label: "待开始" },
  "000": { color: "processing", label: "进行中" },
  "888": { color: "success", label: "已完成" },
  "999": { color: "error", label: "失败" },
};

/** 状态检索下拉项 */
const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([value, v]) => ({ value, label: v.label }));

/** 文本列空值兜底：null / undefined / 空串 → "-" */
const dash = (v?: string | null) => (v === null || v === undefined || v === "" ? "-" : v);

/** 检索表单字段（RangePicker 给的是 [Dayjs, Dayjs]） */
interface SearchFields {
  checkTaskNo?: string;
  customerId?: string;
  customerName?: string;
  reportNo?: string;
  reportTitle?: string;
  status?: string;
  userNo?: string;
  createdRange?: [Dayjs | null, Dayjs | null] | null;
  updatedRange?: [Dayjs | null, Dayjs | null] | null;
}

/** 检索区每一项的栅格宽度（窄屏一行两个、宽屏一行四个） */
const FIELD_COL = { xs: 24, sm: 12, lg: 8, xl: 6 } as const;
/** 日期范围项更宽一些 */
const RANGE_COL = { xs: 24, sm: 12, lg: 8, xl: 8 } as const;

export default function ReportList() {
  const [data, setData] = useState<ReportInstanceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  /** 已提交生效的检索条件（与表单分离：点「查询」才生效） */
  const [filters, setFilters] = useState<SearchFields>({});

  const [searchForm] = Form.useForm<SearchFields>();
  const [createForm] = Form.useForm<ReportCreatePayload>();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();

  /** 加载报告记录（检索条件 + 分页） */
  const fetchData = useCallback(
    async (pageNo: number, pageSize: number, f: SearchFields) => {
      setLoading(true);
      try {
        const query: ReportPageQuery = {
          page: pageNo,
          size: pageSize,
          checkTaskNo: f.checkTaskNo?.trim() || undefined,
          customerId: f.customerId?.trim() || undefined,
          customerName: f.customerName?.trim() || undefined,
          reportNo: f.reportNo?.trim() || undefined,
          reportTitle: f.reportTitle?.trim() || undefined,
          status: f.status || undefined,
          userNo: f.userNo?.trim() || undefined,
          createdBegin: f.createdRange?.[0]?.format("YYYY-MM-DD"),
          createdEnd: f.createdRange?.[1]?.format("YYYY-MM-DD"),
          updatedBegin: f.updatedRange?.[0]?.format("YYYY-MM-DD"),
          updatedEnd: f.updatedRange?.[1]?.format("YYYY-MM-DD"),
        };
        const res = await reportApi.instancePage(query);
        setData(res.data.records || []);
        setTotal(res.data.total || 0);
      } catch (e: any) {
        message.error(e?.message || "报告列表加载失败");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** 首屏：无检索条件、第 1 页 */
  useEffect(() => {
    void fetchData(1, 10, {});
  }, [fetchData]);

  /** 点「查询」：重置到第 1 页 */
  const handleSearch = (values: SearchFields) => {
    setFilters(values);
    setPage(1);
    void fetchData(1, size, values);
  };

  /** 点「重置」：清空条件并回到第 1 页 */
  const handleReset = () => {
    searchForm.resetFields();
    setFilters({});
    setPage(1);
    void fetchData(1, size, {});
  };

  /** 触发报告加工（111/999 状态的记录可跑） */
  const handleGenerate = async (reportNo: string) => {
    setGenerating(reportNo);
    try {
      const res = await reportApi.instanceGenerate(reportNo);
      const d = res.data || {};
      // 生成服务不抛异常，以 success 标志判断
      if (d.success === false) {
        message.error(d.failReason || "报告生成失败");
      } else {
        message.success(`生成成功：内容实例 ${d.contentTotal ?? 0} 条，AI 风险 ${d.riskTotal ?? 0} 条`);
      }
    } catch (e: any) {
      message.error(e?.message || "报告生成失败");
    } finally {
      setGenerating(null);
      void fetchData(page, size, filters);
    }
  };

  /** 发起报告：创建一条 status=111 的记录 */
  const handleCreate = async () => {
    let values: ReportCreatePayload;
    try {
      values = await createForm.validateFields();
    } catch {
      return; // 表单校验未通过
    }
    setCreating(true);
    try {
      const res = await reportApi.instanceCreateReport(values);
      message.success(`发起成功，报告编号 ${res.data?.reportNo ?? ""}（待开始）`);
      setCreateOpen(false);
      createForm.resetFields();
      setPage(1);
      void fetchData(1, size, filters);
    } catch (e: any) {
      message.error(e?.message || "发起报告失败");
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: "日检流水号", dataIndex: "checkTaskNo", width: 180, render: dash },
    { title: "客户编号", dataIndex: "customerId", width: 120, render: dash },
    { title: "客户名称", dataIndex: "customerName", width: 220, render: dash },
    { title: "报告编号", dataIndex: "reportNo", width: 190, render: dash },
    { title: "报告标题", dataIndex: "reportTitle", render: dash },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (s: string, r: ReportInstanceSummary) => {
        const item = STATUS_MAP[s] ?? { color: "default", label: s || "-" };
        const tag = <Tag color={item.color}>{item.label}</Tag>;
        // 失败状态：悬浮展示失败原因
        if (s === "999" && r.failReason) {
          return (
            <Tooltip title={r.failReason} placement="topLeft">
              {tag}
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 175,
      render: (t: string) => (t ? new Date(t).toLocaleString("zh-CN") : "-"),
    },
    {
      title: "生成时间",
      dataIndex: "updatedAt",
      width: 175,
      render: (t: string) => (t ? new Date(t).toLocaleString("zh-CN") : "-"),
    },
    { title: "用户账号", dataIndex: "userNo", width: 120, render: dash },
    {
      title: "操作",
      width: 200,
      render: (_: any, r: ReportInstanceSummary) => {
        // 只有已完成（888）才可进入详情查看（按日检流水号进入）
        if (r.status === "888") {
          return (
            <Button type="link" icon={<EyeOutlined />} onClick={() => navigate("/report/" + r.checkTaskNo)}>
              查看
            </Button>
          );
        }
        if (r.status === "000") {
          return <span style={{ color: "#999" }}>进行中…</span>;
        }
        return (
          <Popconfirm
            title="按模板加工该报告的实例数据？"
            onConfirm={() => handleGenerate(r.reportNo)}
            okText="执行"
            cancelText="取消"
          >
            <Button type="link" icon={<ThunderboltOutlined />} loading={generating === r.reportNo}>
              生成
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    /* 布局：MainLayout 的 Content 是「固定高 + overflow」，子路由必须自己撑满并内部滚动。
       骨架见 index.css 的 .page-fill / .table-fill（分页栏放在滚动区外面 → 永远贴底可见）。 */
    <div className="page-fill">
      <div className="page-fill-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>报告列表</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page, size, filters)}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            发起报告
          </Button>
        </Space>
      </div>

      {/* 检索区：覆盖表格全部可检索列（文本模糊 / 状态精确 / 时间区间） */}
      <Form form={searchForm} onFinish={handleSearch} className="page-fill-head" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 8]}>
          <Col {...FIELD_COL}>
            <Form.Item name="checkTaskNo" label="日检流水号" style={{ marginBottom: 0 }}>
              <Input allowClear placeholder="模糊匹配" />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL}>
            <Form.Item name="customerId" label="客户编号" style={{ marginBottom: 0 }}>
              <Input allowClear placeholder="模糊匹配" />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL}>
            <Form.Item name="customerName" label="客户名称" style={{ marginBottom: 0 }}>
              <Input allowClear placeholder="模糊匹配" />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL}>
            <Form.Item name="reportNo" label="报告编号" style={{ marginBottom: 0 }}>
              <Input allowClear placeholder="模糊匹配" />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL}>
            <Form.Item name="reportTitle" label="报告标题" style={{ marginBottom: 0 }}>
              <Input allowClear placeholder="模糊匹配" />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL}>
            <Form.Item name="status" label="状态" style={{ marginBottom: 0 }}>
              <Select allowClear placeholder="全部" options={STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL}>
            <Form.Item name="userNo" label="用户账号" style={{ marginBottom: 0 }}>
              <Input allowClear placeholder="模糊匹配" />
            </Form.Item>
          </Col>
          <Col {...RANGE_COL}>
            <Form.Item name="createdRange" label="创建时间" style={{ marginBottom: 0 }}>
              <RangePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col {...RANGE_COL}>
            <Form.Item name="updatedRange" label="生成时间" style={{ marginBottom: 0 }}>
              <RangePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col {...FIELD_COL} style={{ display: "flex", alignItems: "flex-end" }}>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Form>

      {/* 表格区：flex:1 + minHeight:0 才能让内部真正滚起来（不给 minHeight:0 会被表格内容顶开）；
          分页栏是它的兄弟节点、不参与滚动，所以常驻可见 */}
      <div className="table-fill">
        <div className="table-fill-body">
          <Table
            columns={columns}
            dataSource={data}
            rowKey="reportNo"
            loading={loading}
            scroll={{ x: 1600 }}
            pagination={false}
          />
        </div>
        <div className="table-fill-pager">
          <Pagination
            current={page}
            pageSize={size}
            total={total}
            showSizeChanger
            showQuickJumper
            pageSizeOptions={["10", "20", "50", "100"]}
            showTotal={t => `共 ${t} 条`}
            onChange={(p, s) => {
              setPage(p);
              setSize(s);
              void fetchData(p, s, filters);
            }}
          />
        </div>
      </div>

      {/* 发起报告：只收 5 个业务必填项，reportNo / 状态 / 用户账号由服务端补全 */}
      <Modal
        open={createOpen}
        title="发起报告"
        okText="发起"
        cancelText="取消"
        confirmLoading={creating}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            reportTitle: "对公客户日常定期检查报告",
            reportType: "日常定期检查报告",
          }}
        >
          <Form.Item
            name="customerId"
            label="客户编号"
            rules={[{ required: true, message: "请输入客户编号" }]}
          >
            <Input placeholder="如 C0001234" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="customerName"
            label="客户名称"
            rules={[{ required: true, message: "请输入客户名称" }]}
          >
            <Input placeholder="企业全称" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="checkTaskNo"
            label="日检流水号"
            rules={[{ required: true, message: "请输入日检流水号" }]}
            extra="详情页的入口键；同一流水号下不可重复发起（需要新版本请用「更新报告」）"
          >
            <Input placeholder="如 TASK20260913001" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="reportTitle"
            label="报告标题"
            rules={[{ required: true, message: "请输入报告标题" }]}
          >
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item
            name="reportType"
            label="报告类型"
            rules={[{ required: true, message: "请输入报告类型" }]}
          >
            <Input maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
