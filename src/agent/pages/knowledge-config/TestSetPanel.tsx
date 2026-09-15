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
import { Button, Input, Modal, Popconfirm, Select, Space, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { addTestSet, deleteTestSet, getTestSetList } from '../../api/knowledgeConfig';

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
      render: (_t, record, index) => (
        <Input
          value={record.name}
          onChange={(e) => patchItem(index, { name: e.target.value })}
          placeholder="请输入参数名称"
        />
      ),
    },
    {
      title: '参数值',
      dataIndex: 'defaultValue',
      render: (_t, record, index) => (
        <Input
          value={record.defaultValue}
          onChange={(e) => patchItem(index, { defaultValue: e.target.value })}
          placeholder="请输入参数值"
        />
      ),
    },
    {
      title: '操作',
      width: 90,
      render: (_t, _record, index) => (
        <Popconfirm
          title="确定删除该参数吗？"
          okText="确认"
          cancelText="取消"
          onConfirm={() => onChange(value.filter((_it, i) => i !== index))}
        >
          <a>删除</a>
        </Popconfirm>
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
        onClick={() => onChange([...value, { name: '', defaultValue: '', id: uid() }])}
      >
        添加参数
      </Button>

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
