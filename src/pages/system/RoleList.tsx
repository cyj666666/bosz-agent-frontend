/**
 * 角色管理页 — 角色 CRUD
 * 仅系统管理员可访问
 */
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { roleApi } from '../../api/role';
import type { Role } from '../../types';

export default function RoleList() {
  const [data, setData] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await roleApi.listAll();
      setData(res.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleSave = async (v: any) => {
    try {
      const data = {
        ...v,
        menuPermissions: JSON.stringify(v.menuPermissions || []),
      };
      if (editing) {
        await roleApi.update({ ...data, id: editing.id });
        message.success('更新成功');
      } else {
        await roleApi.save(data);
        message.success('创建成功');
      }
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      menuPermissions: r.menuPermissions ? JSON.parse(r.menuPermissions) : [],
    });
    setModalOpen(true);
  };

  const menuOptions = [
    { label: '报告管理', value: '/reports' },
    { label: '客户管理', value: '/customers' },
    { label: '数据源配置', value: '/data-config' },
    { label: '知识库管理', value: '/rules' },
    { label: '用户管理（系统管理）', value: '/users' },
    { label: '角色管理（系统管理）', value: '/roles' },
  ];

  const handleDelete = async (id: number) => {
    await roleApi.delete(id);
    message.success('已删除');
    fetchData();
  };

  const columns = [
    { title: '角色编码', dataIndex: 'roleCode' },
    { title: '角色名称', dataIndex: 'roleName' },
    { title: '描述', dataIndex: 'description' },
    { title: '创建时间', dataIndex: 'createdAt', render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
    {
      title: '操作',
      render: (_: any, r: Role) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => r.id && handleDelete(r.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} disabled={r.roleCode === 'admin'}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>角色管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditing(null);
          form.resetFields();
          setModalOpen(true);
        }}>新增角色</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} />

      <Modal title={editing ? '编辑角色' : '新增角色'} open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditing(null); }}
        onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="roleCode" label="角色编码" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="roleName" label="角色名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="menuPermissions" label="菜单权限">
            <Select mode="multiple" placeholder="选择可访问的菜单"
              options={menuOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}