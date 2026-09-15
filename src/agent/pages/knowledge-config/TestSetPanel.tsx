/**
 * 知识库「请求参数 / 测试集」面板
 *
 * React 重写自源工程 `knowledge/components/TestSet.vue`（183 行）
 * 与其内部的 `ParamList.vue`（199 行），两者在 React 侧合并为一个受控组件。
 *
 * ── 契约（逐条对齐）──
 * 参数列表：`[{ name, defaultValue, id }]`（**就是 configInfo.inputParam 的结构**）
 * 默认项：`{ name: 'entName', defaultValue: '', id }` —— 源工程 `setDefaultParams` 会补一个 entName 参数项，
 *   但其默认值是「科大讯飞股份有限公司」（厂商 demo 公司名，会随 `input_param` 落库）。
 *   **本实现保留 `entName` 这个参数名（后端按 script 顶层键取参，名字是有意义的），
 *   但把默认值改为空串**，由用户在测试集里显式填写。
 * 测试集列表：`getParam({ knowledgeId, pageIndex: 1, pageSize: 500 })`
 *   → 每项 `{ id, inputParamName, inputParam }`，其中 `inputParam` 是参数数组的 **JSON 串**
 * 选中测试集：`JSON.parse(item.inputParam)` 覆盖当前参数列表
 * 另存为新测试集：`addTestSet({ knowledgeId, inputParam: JSON.stringify(list), inputParamName: '创建于' + 当前时间 })`
 * 删除测试集：`deleteTestSet`
 *
 * ── 受控说明 ──
 * 源工程靠 `ref.getParamList()` 把列表回传给父组件（V2 的 `getSaveData`）。
 * React 侧改为受控：`value` + `onChange`，父组件直接持有这份数据。
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, Popconfirm, Select, Space, Table, Tooltip, message } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { addTestSet, deleteTestSet, editTestSet, getTestSetList } from '../../api/knowledgeConfig';

/** 单个请求参数（字段名与源工程一致） */
export interface InputParamItem {
  name: string;
  defaultValue: string;
  id: string;
}

/** 测试集行 */
interface TestSetItem {
  id: string;
  inputParamName: string;
  inputParam?: string;
}

export interface TestSetPanelProps {
  /** 知识库 id */
  knownId: string;
  value: InputParamItem[];
  onChange: (next: InputParamItem[]) => void;
}

/** 源工程用的 uuid 生成（这里保持"够用且唯一"） */
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TestSetPanel({ knownId, value, onChange }: TestSetPanelProps) {
  const [testList, setTestList] = useState<TestSetItem[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string | undefined>(undefined);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  /* 「编辑测试集」：源 `TestSet.vue` 下拉选项 hover 出来的 ✏️ → `SaveTestSetModal(isEdit=true)`
     → `editTestSet({ id, inputParamName, inputParam })`，即**改名 + 用当前参数列表覆盖该测试集**。 */
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  /**
   * 参数行的「行内编辑」态（源 `ParamList.vue` 的 `editRowId`）
   *
   * 源行为：默认是**纯文本显示**，点 ✏️ 才变输入框、图标变 ✓，点 ✓ 结束（`confirmRow`）。
   * 同一时刻只允许编辑一行（`editRowId` 单值）。新增参数会直接进入编辑态。
   */
  const [editRowId, setEditRowId] = useState<string>('');

  const loadTestList = useCallback(async () => {
    if (!knownId) return;
    try {
      const res = await getTestSetList({ knowledgeId: knownId, pageIndex: 1, pageSize: 500 });
      setTestList((res?.list ?? []) as unknown as TestSetItem[]);
    } catch {
      setTestList([]);
    }
  }, [knownId]);

  useEffect(() => {
    void loadTestList();
  }, [loadTestList]);

  /**
   * 保证参数列表里始终有 entName（源 `setDefaultParams` 的行为）
   *
   * ⚠️ 只补**参数名**，不补默认值：源工程的默认值是厂商 demo 公司名
   * 「科大讯飞股份有限公司」，而这份列表会随 `input_param` 落库 —— 故留空串。
   */
  useEffect(() => {
    if (value.length === 0) {
      onChange([{ name: 'entName', defaultValue: '', id: uid() }]);
    }
    // 只在初始为空时补默认项，之后不干预用户编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchItem = (index: number, patch: Partial<InputParamItem>) => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const columns: ColumnsType<InputParamItem> = [
    {
      title: '参数名称',
      dataIndex: 'name',
      render: (text: unknown, record, index) =>
        record.id === editRowId ? (
          <Input
            value={record.name}
            placeholder="请输入参数名称"
            onChange={(e) => patchItem(index, { name: e.target.value })}
          />
        ) : (
          <span>{String(text ?? '')}</span>
        ),
    },
    {
      title: '参数值',
      dataIndex: 'defaultValue',
      render: (text: unknown, record, index) =>
        record.id === editRowId ? (
          <Input
            value={record.defaultValue}
            placeholder="请输入参数值"
            onChange={(e) => patchItem(index, { defaultValue: e.target.value })}
          />
        ) : (
          <span>{String(text ?? '')}</span>
        ),
    },
    {
      title: '操作',
      width: 80,
      align: 'center',
      /* 源 `ParamList.vue` 的 action 列：
         编辑中 → ✓（确认，结束编辑）；否则 → 🗑️（删除，带确认气泡）+ ✏️（进入编辑） */
      render: (_t, record, index) =>
        record.id === editRowId ? (
          <Tooltip title="确认">
            <CheckOutlined
              style={{ color: '#6060f0', fontSize: 16, cursor: 'pointer' }}
              onClick={() => setEditRowId('')}
            />
          </Tooltip>
        ) : (
          <Space size="middle">
            <Popconfirm
              title="确认删除此参数吗？"
              okText="确认"
              cancelText="取消"
              onConfirm={() => onChange(value.filter((_it, i) => i !== index))}
            >
              <Tooltip title="删除">
                <DeleteOutlined style={{ fontSize: 16, cursor: 'pointer' }} />
              </Tooltip>
            </Popconfirm>
            <Tooltip title="编辑">
              <EditOutlined
                style={{ color: '#6060f0', fontSize: 16, cursor: 'pointer' }}
                onClick={() => setEditRowId(record.id)}
              />
            </Tooltip>
          </Space>
        ),
    },
  ];

  const handleSaveAs = async () => {
    const name = saveName.trim() || `创建于${new Date().toLocaleString()}`;
    setSaving(true);
    try {
      await addTestSet({
        knowledgeId: knownId,
        inputParam: JSON.stringify(value),
        inputParamName: name,
      });
      message.success('保存成功！');
      setSaveOpen(false);
      setSaveName('');
      void loadTestList();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /** 打开「编辑测试集」：预填该测试集当前的名字（源 `editHandle`） */
  const openEdit = () => {
    const hit = testList.find((t) => t.id === selectedTestId);
    if (!hit) {
      message.warning('请先选择测试集');
      return;
    }
    setEditName(hit.inputParamName ?? '');
    setEditOpen(true);
  };

  /** 保存编辑：改名 + 用**当前参数列表**覆盖该测试集（源 `SaveTestSetModal.editHandle`） */
  const handleEditSave = async () => {
    if (!selectedTestId) return;
    const name = editName.trim();
    if (!name) {
      message.warning('请输入测试集名称');
      return;
    }
    setEditSaving(true);
    try {
      await editTestSet({
        id: selectedTestId,
        knowledgeId: knownId,
        inputParamName: name,
        inputParam: JSON.stringify(value),
      });
      message.success('保存成功！');
      setEditOpen(false);
      void loadTestList();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 8, width: '100%' }}>
        <Select
          allowClear
          showSearch
          style={{ width: 260 }}
          placeholder="选择已保存的测试集"
          value={selectedTestId}
          optionFilterProp="label"
          options={testList.map((t) => ({ value: t.id, label: t.inputParamName }))}
          onChange={(id) => {
            setSelectedTestId(id);
            if (!id) return;
            const hit = testList.find((t) => t.id === id);
            if (!hit?.inputParam) return;
            try {
              onChange(JSON.parse(hit.inputParam) as InputParamItem[]);
            } catch {
              message.warning('该测试集数据格式异常，已忽略');
            }
          }}
        />
        <Button onClick={() => setSaveOpen(true)}>另存为测试集</Button>
        {/* 「编辑测试集」——源 `TestSet.vue` 把 ✏️/🗑️ 放在下拉选项 hover 里；
            这里保留按钮形态（不引入全局 hover CSS，零回归），能力与源一致：
            改名 + 用当前参数列表覆盖该测试集（`editTestSet`）。 */}
        <Button disabled={!selectedTestId} onClick={openEdit}>
          编辑测试集
        </Button>
        <Popconfirm
          title="确定删除该测试集吗？"
          okText="确认"
          cancelText="取消"
          onConfirm={async () => {
            if (!selectedTestId) {
              message.warning('请先选择测试集');
              return;
            }
            try {
              await deleteTestSet([selectedTestId]);
              message.success('删除成功！');
              setSelectedTestId(undefined);
              void loadTestList();
            } catch (err) {
              message.error(err instanceof Error ? err.message : '删除失败');
            }
          }}
        >
          <Button danger disabled={!selectedTestId}>
            删除测试集
          </Button>
        </Popconfirm>
      </Space>

      <Table<InputParamItem>
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={value}
        scroll={{ y: 220 }}
      />

      <Button
        type="dashed"
        block
        style={{ marginTop: 8 }}
        onClick={() => {
          // 源 `ParamList.addParam`：新增后**直接进入编辑态**（editRowId = 新行 id）
          const id = uid();
          onChange([...value, { name: '', defaultValue: '', id }]);
          setEditRowId(id);
        }}
      >
        添加参数
      </Button>

      <Modal
        open={editOpen}
        title="编辑测试集"
        onCancel={() => setEditOpen(false)}
        onOk={() => void handleEditSave()}
        confirmLoading={editSaving}
        destroyOnClose
      >
        <Input
          placeholder="请输入测试集名称"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
        <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
          保存后会用**当前参数列表**覆盖该测试集（与源系统一致）
        </div>
      </Modal>

      <Modal
        open={saveOpen}
        title="另存为测试集"
        onCancel={() => setSaveOpen(false)}
        onOk={() => void handleSaveAs()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Input
          placeholder={`创建于${new Date().toLocaleString()}`}
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
        />
      </Modal>
    </div>
  );
}
