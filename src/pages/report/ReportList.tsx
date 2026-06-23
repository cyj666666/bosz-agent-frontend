/**
 * 报告列表页 — 展示全部报告，支持查看和删除
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Button, Space, Tag, message } from "antd";
import { PlusOutlined, EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import { reportApi } from "../../api/report";
import type { Report } from "../../types";

export default function ReportList() {
  const [data, setData] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  /** 加载报告列表（首屏取前 100 条） */
  const fetchData = async () => {
    setLoading(true);
    try { const res = await reportApi.page(1, 100); setData(res.data.records || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  /** 删除报告后刷新列表 */
  const handleDelete = async (id: number) => {
    await reportApi.delete(id); message.success("已删除"); fetchData();
  };

  /** 表格列定义 */
  const columns = [
    { title: "报告标题", dataIndex: "reportTitle" },
    { title: "报告类型", dataIndex: "reportType" },
    {
      title: "状态",
      dataIndex: "status",
      render: (s: string) => {
        const colorMap: Record<string, string> = { DRAFT: "default", GENERATED: "processing", PUBLISHED: "success" };
        const labelMap: Record<string, string> = { DRAFT: "草稿", GENERATED: "已生成", PUBLISHED: "已发布" };
        return <Tag color={colorMap[s]}>{labelMap[s] || s}</Tag>;
      },
    },
    {
      title: "生成时间",
      dataIndex: "createdAt",
      render: (t: string) => t ? new Date(t).toLocaleString("zh-CN") : "-",
    },
    { title: "更新时间", dataIndex: "updatedAt", render: (t: string) => t ? new Date(t).toLocaleString("zh-CN") : "-" },
    {
      title: "操作",
      render: (_: any, r: Report) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate("/report/" + r.id)}>查看</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => r.id && handleDelete(r.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2>报告列表</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/report-create")}>生成报告</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} />
    </div>
  );
}
