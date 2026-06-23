import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, Space, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { customerApi } from "../../api/customer";

export default function CustomerList() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try { const r = await customerApi.page(1, 200); setData(r.data.records || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const cols = [
    { title: "企业名称", dataIndex: "companyName" },
    { title: "统一信用代码", dataIndex: "creditCode" },
    { title: "法定代表人", dataIndex: "legalPerson" },
    { title: "所属行业", dataIndex: "industry" },
    { title: "操作", render: (_:any, r:any) => (
      <Space>
        <Button type="link" icon={<EditOutlined/>} onClick={()=>{setEditing(r);form.setFieldsValue(r);setModalOpen(true)}}>编辑</Button>
        <Button type="link" danger icon={<DeleteOutlined/>} onClick={async()=>{await customerApi.delete(r.id);fetch()}}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
        <h2>客户管理</h2>
        <Button type="primary" icon={<PlusOutlined/>} onClick={()=>{setEditing(null);form.resetFields();setModalOpen(true)}}>新增客户</Button>
      </div>
      <Table columns={cols} dataSource={data} rowKey="id" loading={loading}/>
      <Modal title={editing?"编辑客户":"新增客户"} open={modalOpen} onCancel={()=>{setModalOpen(false);setEditing(null)}} onOk={()=>form.submit()}>
        <Form form={form} layout="vertical" onFinish={async(v)=>{editing?.id?await customerApi.update({...editing,...v}):await customerApi.save(v);message.success("保存成功");setModalOpen(false);setEditing(null);form.resetFields();fetch()}}>
          <Form.Item name="companyName" label="企业名称" rules={[{required:true}]}><Input/></Form.Item>
          <Form.Item name="creditCode" label="统一信用代码"><Input/></Form.Item>
          <Form.Item name="legalPerson" label="法定代表人"><Input/></Form.Item>
          <Form.Item name="actualController" label="实际控制人"><Input/></Form.Item>
          <Form.Item name="industry" label="所属行业"><Input/></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
