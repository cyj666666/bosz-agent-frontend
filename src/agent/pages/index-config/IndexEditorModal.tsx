/**
 * 指标配置 — 新增 / 配置指标（弹窗）
 *
 * 对应源工程 `amar-agent-admin/src/views/index/EditorModal.vue`（699 行）
 * ＋ 它的子组件 `DataSourceCard.vue`（1237 行，数据源四选一配置）。
 *
 * **完成度（2026-09-15 更新）**：
 *   完整实现：基本信息 / 指标类型 / 数据获取方式 / 接口脚本相关字段 /
 *            语义描述（介绍·单位·样例·类型·解析）/ 上线开关 / 指标唯一标志 / 回显与保存。
 *
 *   数据源配置：源工程挂在 `DataSourceCard.vue`（1237 行）上的富交互，已由同目录的
 *   `IndexDataSourceCard.tsx` 承接——**数据源下拉、表列表、SQL 编辑与结果预览均已实现**。
 *   仍属简化的部分（源工程对应 700+ 行，已在该组件内标注）：
 *     · 「知识库」类型只做到「分组 → 知识库」两级选择，参数明细按原值保留；
 *     · `paramData`（参数映射表格）读出后原样回传，未做行内编辑。
 *
 * **字段来源**：后端 `IndexParamsInfoSaveReq`（50 个字段）。本表单只绑定常用项，
 * 其余字段在「配置」时原样回传（用 formInfo 承载详情全量对象），避免丢字段。
 */
import { useCallback, useEffect, useState } from 'react';
import { AutoComplete, Button, Col, Form, Input, Modal, Row, Space, Switch, message } from 'antd';
import { addIndex, queryInfo, updateIndex, type IndexGroupNode, type IndexParamDetail, type IndexParamRow } from '../../api/indexConfig';
import { IndexDataSourceCard } from './IndexDataSourceCard';

/**
 * 数据源类型候选值已移到 `IndexDataSourceCard.tsx`（与它的配置区放在一起，避免两处维护）。
 *
 * 附注：源工程的类型枚举里还有 `Procedure`（存储过程），但源 UI 的 `DataSourceCard.vue`
 * 只对 `Sql` / `Api` / `KnowledgeCode` 三类提供了配置区（模板里只有三个 `v-show`），
 * 本工程据此也未为 `Procedure` 提供配置区。
 */

/** 指标类型候选（源工程用 LIST；允许自由填写以防枚举差异） */
const PARAM_TYPE_OPTIONS = [{ value: 'LIST', label: '列表型 LIST' }];

/** 数据获取方式候选（源工程用 Auto） */
const DATA_METHOD_OPTIONS = [{ value: 'Auto', label: '自动 Auto' }];

interface IndexEditorModalProps {
  open: boolean;
  editType: 'add' | 'config';
  /** 配置时传入选中的行（用于取 paramNo 拉详情） */
  row: IndexParamRow | null;
  /** 当前选中的分组（新增时作为父节点） */
  parentGroup: IndexGroupNode | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 表单绑定的常用字段；其余字段存在 extra 里原样回传 */
interface EditorForm {
  paramNo: string;
  paramID: string;
  paramName: string;
  paramType: string;
  dataMethod: string;
  scriptType: string;
  script: string;
  intfNo: string;
  supplierId: string;
  intfParams: string;
  intfField: string;
  structure: string;
  extendField: string;
  countField: string;
  metricIntro: string;
  dataUnit: string;
  dataExample: string;
  dataType: string;
  dataContentParse: string;
  paramKey: string;
  isOnline: boolean;
}

const EMPTY: EditorForm = {
  paramNo: '',
  paramID: '',
  paramName: '',
  paramType: '',
  dataMethod: '',
  scriptType: '',
  script: '',
  intfNo: '',
  supplierId: '',
  intfParams: '',
  intfField: '',
  structure: '',
  extendField: '',
  countField: '',
  metricIntro: '',
  dataUnit: '',
  dataExample: '',
  dataType: '',
  dataContentParse: '',
  paramKey: '',
  isOnline: false,
};

export default function IndexEditorModal({ open, editType, row, parentGroup, onClose, onSuccess }: IndexEditorModalProps) {
  const [form, setForm] = useState<EditorForm>(EMPTY);
  /** 详情全量对象：保证编辑时不丢后端返回的其它字段 */
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = useCallback((p: Partial<EditorForm>) => setForm((prev) => ({ ...prev, ...p })), []);

  /** 数据源配置区是否需要展示（源工程条件：LIST + Auto） */
  const showDataSource = form.paramType === 'LIST' && form.dataMethod === 'Auto';
  /** 是否为接口类数据源（决定接口字段区是否展示） */
  const isApi = showDataSource && (form.scriptType === 'Api' || form.scriptType === '接口' || form.scriptType === 'API');

  useEffect(() => {
    if (!open) return;
    if (editType === 'add') {
      setForm({ ...EMPTY, scriptType: parentGroup ? String((parentGroup as Record<string, unknown>).scriptType ?? '') : '' });
      setExtra({});
      return;
    }
    if (!row) return;
    setLoading(true);
    queryInfo({ paramNo: row.paramNo })
      .then((detail: IndexParamDetail) => {
        const d = (detail ?? {}) as Record<string, unknown>;
        setExtra(d);
        setForm({
          paramNo: String(d.paramNo ?? row.paramNo ?? ''),
          paramID: String(d.paramID ?? row.paramID ?? ''),
          paramName: String(d.paramName ?? row.paramName ?? ''),
          paramType: String(d.paramType ?? row.paramType ?? ''),
          dataMethod: String(d.dataMethod ?? ''),
          scriptType: String(d.scriptType ?? ''),
          script: String(d.script ?? ''),
          intfNo: String(d.intfNo ?? ''),
          supplierId: String(d.supplierId ?? ''),
          intfParams: String(d.intfParams ?? ''),
          intfField: String(d.intfField ?? ''),
          structure: String(d.structure ?? ''),
          extendField: String(d.extendField ?? ''),
          countField: String(d.countField ?? ''),
          metricIntro: String(d.metricIntro ?? ''),
          dataUnit: String(d.dataUnit ?? ''),
          dataExample: String(d.dataExample ?? ''),
          dataType: String(d.dataType ?? ''),
          dataContentParse: String(d.dataContentParse ?? ''),
          paramKey: String(d.paramKey ?? ''),
          isOnline: d.isOnline === 1 || d.isOnline === true || d.isOnline === '1' || d.isOnline === 'Y',
        });
      })
      .catch((e) => message.error((e as Error)?.message || '指标详情加载失败'))
      .finally(() => setLoading(false));
  }, [open, editType, row, parentGroup]);

  const doSave = async () => {
    if (!form.paramNo.trim()) {
      message.warning('请输入指标ID');
      return;
    }
    if (!form.paramName.trim()) {
      message.warning('请输入指标名称');
      return;
    }
    setSaving(true);
    try {
      // 源工程的提交结构：详情全量 + 表单值 + isOnline 归一 + paramKey 空串转 null
      const payload: Record<string, unknown> = {
        ...extra,
        ...form,
        isOnline: form.isOnline ? 1 : 0,
        paramKey: form.paramKey === '' ? null : form.paramKey,
      };
      if (editType === 'add') {
        payload.parentParamNo = parentGroup?.groupId ?? payload.parentParamNo ?? '';
        payload.parentParamName = parentGroup?.groupName ?? payload.parentParamName ?? '';
        await addIndex(payload);
      } else {
        await updateIndex(payload);
      }
      message.success('保存成功');
      onSuccess();
    } catch (e) {
      message.error((e as Error)?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const title = editType === 'add' ? '新增指标' : `配置指标 — ${row?.paramNo ?? ''}`;

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={900}
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
      <Form layout="vertical" disabled={loading} style={{ maxHeight: '62vh', overflow: 'auto', paddingRight: 8 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="指标ID" required>
              <Input
                placeholder="请输入指标ID"
                disabled={editType === 'config'}
                value={form.paramNo}
                onChange={(e) => patch({ paramNo: e.target.value })}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="指标编号">
              <Input placeholder="请输入指标编号" value={form.paramID} onChange={(e) => patch({ paramID: e.target.value })} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="指标名称" required>
              <Input placeholder="请输入指标名称" value={form.paramName} onChange={(e) => patch({ paramName: e.target.value })} />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item label="指标类型" tooltip="源工程常用值 LIST；如不确定可直接填写后端约定值">
              <AutoComplete
                allowClear
                placeholder="如 LIST"
                options={PARAM_TYPE_OPTIONS}
                value={form.paramType}
                onChange={(v) => patch({ paramType: v })}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="数据获取方式" tooltip="源工程常用值 Auto">
              <AutoComplete
                allowClear
                placeholder="如 Auto"
                options={DATA_METHOD_OPTIONS}
                value={form.dataMethod}
                onChange={(v) => patch({ dataMethod: v })}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="是否上线">
              <Switch checked={form.isOnline} onChange={(v) => patch({ isOnline: v })} checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
          </Col>
        </Row>

        {showDataSource && (
          <>
            <div style={{ fontWeight: 600, margin: '8px 0 12px' }}>数据源配置</div>
            {/* 迁移说明：源工程此处挂的是 `DataSourceCard.vue`（1237 行）。
                本工程重写为 `IndexDataSourceCard.tsx`：类型选择（Sql / Api / KnowledgeCode）
                + 数据源下拉 + 选表 + SQL 编辑与结果预览，并把选择结果序列化成 JSON 写回
                `script` 字段（字段名与源 `getValue()` 一致，后端解析不受影响）。 */}
            <IndexDataSourceCard
              scriptType={form.scriptType}
              onScriptTypeChange={(v) => patch({ scriptType: v })}
              value={form.script}
              onChange={(next) => patch({ script: next })}
            />

            {isApi && (
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="接口编号">
                    <Input placeholder="intfNo" value={form.intfNo} onChange={(e) => patch({ intfNo: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="接口供应商">
                    <Input placeholder="supplierId" value={form.supplierId} onChange={(e) => patch({ supplierId: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="接口参数">
                    <Input placeholder="intfParams" value={form.intfParams} onChange={(e) => patch({ intfParams: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="接口字段">
                    <Input placeholder="intfField" value={form.intfField} onChange={(e) => patch({ intfField: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="结构">
                    <Input placeholder="structure" value={form.structure} onChange={(e) => patch({ structure: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="扩展字段">
                    <Input placeholder="extendField" value={form.extendField} onChange={(e) => patch({ extendField: e.target.value })} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="计数字段">
                    <Input placeholder="countField" value={form.countField} onChange={(e) => patch({ countField: e.target.value })} />
                  </Form.Item>
                </Col>
              </Row>
            )}
          </>
        )}

        <div style={{ fontWeight: 600, margin: '8px 0 12px' }}>语义描述</div>
        <Form.Item label="指标介绍">
          <Input.TextArea rows={2} placeholder="请输入指标介绍" value={form.metricIntro} onChange={(e) => patch({ metricIntro: e.target.value })} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="数值单位">
              <Input placeholder="如 万元" value={form.dataUnit} onChange={(e) => patch({ dataUnit: e.target.value })} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="数据类型">
              <Input placeholder="如 数值/字符串" value={form.dataType} onChange={(e) => patch({ dataType: e.target.value })} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="数据样例">
              <Input placeholder="请输入数据样例" value={form.dataExample} onChange={(e) => patch({ dataExample: e.target.value })} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="数据内容解析">
          <Input.TextArea
            rows={2}
            placeholder="请输入数据内容解析"
            value={form.dataContentParse}
            onChange={(e) => patch({ dataContentParse: e.target.value })}
          />
        </Form.Item>

        <Form.Item label="指标唯一标志" tooltip="源工程约定：留空则提交为 null">
          <Input placeholder="paramKey（可留空）" value={form.paramKey} onChange={(e) => patch({ paramKey: e.target.value })} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
