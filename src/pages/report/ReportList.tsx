/**
 * 报告列表页 —— 模板化报告记录（report 表）
 *
 * 数据来源：GET /api/report/instance/page
 * · "查看" → /report/{checkTaskNo}，详情页按日检流水号查最新版本（顶部可切换历史版本）
 * · "生成" → POST /api/report/instance/generate?reportNo=…，按模板加工该报告的实例数据
 *   报告记录由上游预生成（111-待开始），此处只做加工触发，不负责发起报告。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Button, Tag, message, Popconfirm, Tooltip } from "antd";
import { EyeOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { reportApi, type ReportInstanceSummary } from "../../api/report";

/** 报告状态码 → 展示样式 */
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  "111": { color: "default", label: "待开始" },
  "000": { color: "processing", label: "进行中" },
  "888": { color: "success", label: "已完成" },
  "999": { color: "error", label: "失败" },
};

export default function ReportList() {
  const [data, setData] = useState<ReportInstanceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const navigate = useNavigate();

  /** 加载报告记录（首屏取前 100 条） */
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await reportApi.instancePage(1, 100);
      setData(res.data.records || []);
    } catch (e: any) {
      message.error(e?.message || "报告列表加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchData(); }, []);

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
      fetchData();
    }
  };

  const columns = [
    { title: "企业名称", dataIndex: "customerName", width: 220 },
    { title: "报告编号", dataIndex: "reportNo", width: 190 },
    { title: "报告标题", dataIndex: "reportTitle" },
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
      title: "生成时间",
      dataIndex: "updatedAt",
      width: 175,
      render: (t: string) => (t ? new Date(t).toLocaleString("zh-CN") : "-"),
    },
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2>报告列表</h2>
        <Button onClick={fetchData}>刷新</Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="reportNo"
        loading={loading}
        scroll={{ x: 1100 }}
      />
    </div>
  );
}
