/**
 * 用户管理页 — 用户 CRUD + 重置密码
 * 仅系统管理员可访问
 */
import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { userApi } from '../../api/user';
import { roleApi } from '../../api/role';

export default function UserList() {
  const [data, setData] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pwdUserId, setPwdUserId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        userApi.page(1, 100),
        roleApi.listAll(),
      ]);
      setData(uRes.data.records || []);
      setRoles(rRes.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleSave = async (v: any) => {
    try {
      if (editingId) {
        await userApi.update({ id: editingId, realName: v.realName, status: v.status, roleIds: v.roleIds });
        message.success('更新成功');
      } else {
        await userApi.save(v);
        message.success('创建成功');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    await userApi.delete(id);
    message.success('已删除');
    fetchData();
  };

  const handleResetPwd = async (id: number) => {
    const res = await userApi.resetPassword(id);
    message.success(`密码已重置为: ${res.data.newPassword}`);
  };

  const handleSetPwd = async (v: { password: string }) => {
    try {
      await userApi.setPassword(pwdUserId!, v.password);
      message.success('密码已修改');
      setPwdUserId(null);
      pwdForm.resetFields();
    } catch { message.error('操作失败'); }
  };

  const openEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue({
      username: record.username,
      realName: record.realName,
      status: record.status,
      roleIds: record.roleIds || [],
    });
    setModalOpen(true);
  };

  const columns = [
    { title: '用户名', dataIndex: 'username' },
    { title: '真实姓名', dataIndex: 'realName' },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (rs: string[]) => rs?.map((rc) => {
        const name = roles.find((r: any) => r.roleCode === rc)?.roleName || rc;
        return <Tag key={rc} color="blue">{name}</Tag>;
      }),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: number) => s === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
    },
    { title: '创建时间', dataIndex: 'createdAt', render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Button type="link" icon={<LockOutlined />} onClick={() => { setPwdUserId(r.id); pwdForm.resetFields(); }}>修改密码</Button>
          <Popconfirm title="确认重置为默认密码 Abc12345？" onConfirm={() => handleResetPwd(r.id)}>
            <Button type="link" icon={<KeyOutlined />}>重置</Button>
          </Popconfirm>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}
            disabled={r.roles?.includes('admin')}>
            <Button type="link" danger icon={<DeleteOutlined />}
              disabled={r.roles?.includes('admin')}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingId(null);
            form.resetFields();
            setModalOpen(true);
          }}>新增用户</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} />

      {/* 新增/编辑用户 */}
      <Modal title={editingId ? '编辑用户' : '新增用户'} open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleSave} autoComplete="off">
          {!editingId && (
            <>
              <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Form.Item name="realName" label="真实姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {editingId && (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
            </Form.Item>
          )}
          <Form.Item name="roleIds" label="角色">
            <Select mode="multiple" placeholder="选择角色"
              options={roles.map(r => ({ label: r.roleName, value: r.id }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理员修改用户密码 */}
      <Modal title="修改密码" open={!!pwdUserId}
        onCancel={() => { setPwdUserId(null); pwdForm.resetFields(); }}
        onOk={() => pwdForm.submit()}>
        <Form form={pwdForm} layout="vertical" onFinish={handleSetPwd} autoComplete="off">
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6, message: '至少6位' }]}>
            <Input.Password autoComplete="new-password" placeholder="输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}