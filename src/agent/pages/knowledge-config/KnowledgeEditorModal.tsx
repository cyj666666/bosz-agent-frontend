/**
 * 知识配置管理 — 新建 / 编辑知识库（弹窗）
 *
 * 对应源工程 `views/knowledge/components/KnownEditModal.vue`（222 行）。
 * 表单字段与默认值**逐项照抄**源工程的 `formInfo`，避免漏字段导致后端不认。
 *
 * 「关联 Agent」：源工程是下拉，选项来自 `getAgentList`（`/agent/agentConfig/list`）。
 * 该接口对应的 `agent_config` 表**本就在本工程库里**（随源库一并迁移过来），
 * 本工程已补只读的 `AgentConfigController` 把它暴露出来，故这里恢复为下拉（与源工程同形态）。
 *
 * ⚠️ 关于 `agentId` 字段的实际作用（如实说明）：源工程后端
 * `KnowledgeBaseParamsEntity.agentId` 只有字段声明与读写透传，**没有任何业务读取**
 * （全仓 `getAgentId`/`setAgentId` 零调用，也不作任何查询条件）——即"只存不读"的归属标记，
 * 填错不影响运行。但它对使用者的语义是"这个知识库属于哪个智能体"，
 * 所以仍保留下拉（显示可读名称、存 id），不降级成手填一串数字。
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Col, Form, Input, Modal, Row, Select, Space, message } from 'antd';
import type { AgentOptionRow, LargeModelRow, KnowledgeParamRow } from '../../api/knowledgeConfig';
import { queryInfo, addKnowledge, updateKnowledge, getAgentList } from '../../api/knowledgeConfig';

interface KnowledgeEditorModalProps {
  open: boolean;
  editType: 'add' | 'edit';
  row: KnowledgeParamRow | null;
  /** 新建时归属的分组 */
  parentGroupId: string;
  /** 大模型下拉选项（由父组件查好后传入，避免每个弹窗各查一次） */
  largeModels: LargeModelRow[];
  onClose: () => void;
  onSuccess: () => void;
}

/** 表单结构照抄源工程 KnownEditModal 的 formInfo */
interface EditorForm {
  paramId: string;
  paramNo: string;
  paramName: string;
  paramStatus: string;
  isClientSearch: string;
  isCloudSearch: string;
  agentId: string;
  online: string;
  isMarkdown: string;
  paramDescription: string;
  promptType: string;
  paramEntityType: string;
  groupId: string;
  /** 源工程未在编辑表单里出现、但列表里有：大模型编码 */
  largeModelCode: string;
}

const EMPTY: EditorForm = {
  paramId: '',
  paramNo: '',
  paramName: '',
  paramStatus: 'Y',
  isClientSearch: 'N',
  isCloudSearch: 'N',
  agentId: '',
  online: 'N',
  isMarkdown: 'Y',
  paramDescription: '',
  promptType: 'basic',
  paramEntityType: '',
  groupId: '',
  largeModelCode: '',
};

const YN_OPTIONS = [
  { label: '是', value: 'Y' },
  { label: '否', value: 'N' },
];

const PROMPT_TYPE_OPTIONS = [
  { label: '是（content）', value: 'content' },
  { label: '否（basic）', value: 'basic' },
];

export default function KnowledgeEditorModal({
  open,
  editType,
  row,
  parentGroupId,
  largeModels,
  onClose,
  onSuccess,
}: KnowledgeEditorModalProps) {
  const [form, setForm] = useState<EditorForm>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** 「关联 Agent」下拉选项（来源 /agent/agentConfig/list） */
  const [agents, setAgents] = useState<AgentOptionRow[]>([]);

  const patch = useCallback((p: Partial<EditorForm>) => setForm((prev) => ({ ...prev, ...p })), []);

  /* 「关联 Agent」下拉：进页面查一次即可（选项是低频变更的基础数据） */
  useEffect(() => {
    getAgentList()
      .then((res) => setAgents(res?.list ?? []))
      // 失败不打断表单：降级为可手填（见下方 Form.Item 的兜底分支）
      .catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editType === 'add') {
      setForm({ ...EMPTY, groupId: parentGroupId });
      return;
    }
    if (!row) return;
    setLoading(true);
    queryInfo({ paramId: row.paramId })
      .then((detail) => {
        const d = (detail ?? {}) as Record<string, unknown>;
        setForm({
          paramId: String(d.paramId ?? row.paramId ?? ''),
          paramNo: String(d.paramNo ?? row.paramNo ?? ''),
          paramName: String(d.paramName ?? row.paramName ?? ''),
          paramStatus: String(d.paramStatus ?? 'Y'),
          isClientSearch: String(d.isClientSearch ?? 'N'),
          isCloudSearch: String(d.isCloudSearch ?? 'N'),
          agentId: String(d.agentId ?? ''),
          online: String(d.online ?? 'N'),
          isMarkdown: String(d.isMarkdown ?? 'Y'),
          paramDescription: String(d.paramDescription ?? ''),
          promptType: String(d.promptType ?? 'basic'),
          paramEntityType: String(d.paramEntityType ?? ''),
          groupId: String(d.groupId ?? parentGroupId ?? ''),
          largeModelCode: String(d.largeModelCode ?? row.largeModelCode ?? ''),
        });
      })
      .catch((e) => message.error((e as Error)?.message || '知识库详情加载失败'))
      .finally(() => setLoading(false));
  }, [open, editType, row, parentGroupId]);

  const doSave = async () => {
    if (!form.paramNo.trim()) {
      message.warning('请输入知识库编号');
      return;
    }
    if (!form.paramName.trim()) {
      message.warning('请输入知识库名称');
      return;
    }
    setSaving(true);
    try {
      if (editType === 'add') await addKnowledge({ ...form });
      else await updateKnowledge({ ...form });
      message.success('保存成功');
      onSuccess();
    } catch (e) {
      message.error((e as Error)?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editType === 'add' ? '新增知识库' : '编辑知识库'}
      onCancel={onClose}
      width={760}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void doSave()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" disabled={loading} style={{ maxHeight: '60vh', overflow: 'auto', paddingRight: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="知识库编号" required>
              <Input
                placeholder="请输入知识库编号"
                disabled={editType === 'edit'}
                value={form.paramNo}
                onChange={(e) => patch({ paramNo: e.target.value })}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="知识库名称" required>
              <Input placeholder="请输入知识库名称" value={form.paramName} onChange={(e) => patch({ paramName: e.target.value })} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="验收状态">
              <Select value={form.paramStatus} onChange={(v) => patch({ paramStatus: v })} options={YN_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="上线状态">
              <Select value={form.online} onChange={(v) => patch({ online: v })} options={YN_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否Markdown">
              <Select value={form.isMarkdown} onChange={(v) => patch({ isMarkdown: v })} options={YN_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否客户端查询">
              <Select value={form.isClientSearch} onChange={(v) => patch({ isClientSearch: v })} options={YN_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否云查询">
              <Select value={form.isCloudSearch} onChange={(v) => patch({ isCloudSearch: v })} options={YN_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Prompt 类型">
              <Select value={form.promptType} onChange={(v) => patch({ promptType: v })} options={PROMPT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="大模型">
              <Select
                allowClear
                placeholder="请选择大模型"
                value={form.largeModelCode || undefined}
                onChange={(v) => patch({ largeModelCode: v ?? '' })}
                options={largeModels.map((m) => ({ label: `${m.lmName}（${m.lmCode}）`, value: m.lmCode }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="实体类型">
              <Input placeholder="paramEntityType" value={form.paramEntityType} onChange={(e) => patch({ paramEntityType: e.target.value })} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="关联 Agent"
              tooltip="来源 /agent/agentConfig/list（本工程已补该只读接口）。该字段当前无业务读取逻辑，可留空"
            >
              {agents.length ? (
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="请选择智能体"
                  value={form.agentId || undefined}
                  onChange={(v) => patch({ agentId: v ?? '' })}
                  options={agents.map((a) => ({
                    value: String(a.id),
                    label: a.agentCode ? `${a.agentName}（${a.agentCode}）` : String(a.agentName ?? a.id),
                  }))}
                />
              ) : (
                // 兜底：agent_config 无数据时仍允许手填，避免"下拉空白就彻底没法填"
                <Input
                  placeholder="agentId（未查询到智能体配置，可留空）"
                  value={form.agentId}
                  onChange={(e) => patch({ agentId: e.target.value })}
                />
              )}
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="知识库描述">
          <Input.TextArea
            rows={3}
            placeholder="请输入知识库描述"
            value={form.paramDescription}
            onChange={(e) => patch({ paramDescription: e.target.value })}
          />
        </Form.Item>
        <Form.Item label="所属分组">
          <Input placeholder="groupId" value={form.groupId} onChange={(e) => patch({ groupId: e.target.value })} />
        </Form.Item>
      </Form>
    </Modal>
  );
}