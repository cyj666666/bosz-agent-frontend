/**
 * 知识库「黑盒配置」弹窗
 *
 * React 重写自源工程 `knowledge/components/KnownBlackBoxConfig.vue`（272 行）。
 *
 * ── 契约（逐条对齐）──
 * 参数表：`getKnowledgeParamsList({ relateKnowledgeId })` → `result.list`
 *        行内保存：`updateKnowledgeParams({ id, paramValue })`
 * 保存配置：`saveBlackParam({ relateKnowledgeId, blackContentDesc, blackModelCode })`
 *        其中 `blackContentDesc` 是 **JSON 串**，结构为 `{ [大模型code]: 输出要求文本 }`
 *        （源工程 `largeModelContentDesc` 对象序列化而来，按模型分别记一份）
 * 预览：GET-SSE `/KnowledgeBase/config/summaryAnswer`，参数
 *        `{ entName, mainType, paramId, largeModelCode, inputParam: '' }`
 *        —— 源工程 `utils/sse.js` 的 `defaultRequestUrl` 正是这个地址，
 *        且 `sendSse` 是 GET（EventSource），故本工程用 `agentSseGet` 而非 `agentSse`。
 *
 * ── 一处刻意的实现差异（已在代码内标注）──
 * **打字机效果未复刻**：源工程用 `printMixin` + `tween.js` 逐字打印；
 * React 侧改为「收到即渲染」。纯视觉装饰，不影响数据与流程。
 *
 * ── 字典动态表单（已实现，不再降级）──
 * 源工程对 `relateDictValue` 有值的行用 `AdFormRender`（宿主通用动态表单）按字典结构渲染控件。
 * 本工程已实现等价物 `components/AdFormRenderer.tsx`（含控件类型映射与初始值规则），
 * 故这里恢复为**动态表单**；`relateDictValue` 为空或解析失败时仍退回普通文本输入，
 * 与源工程 `v-else` 分支的行为一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Col, Input, Modal, Radio, Row, Select, Space, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getKnowledgeParamsList, getLargeModelOptions, saveBlackParam, updateKnowledgeParams } from '../../api/knowledgeConfig';
import type { SelectOption } from '../../api/knowledgeConfig';
import { agentSseGet } from '../../api/agentSse';
import type { AgentSseHandle } from '../../api/agentSse';
import { AdFormRenderer } from '../../components/AdFormRenderer';
import type { AdFormOption, AdFormRendererHandle } from '../../components/AdFormRenderer';

export interface BlackBoxConfigModalProps {
  open: boolean;
  knownId: string;
  /** 知识库行上的 blackModelCode（初始选中的大模型） */
  blackModelCode?: string;
  /** 知识库行上的 blackContentDesc（`{[lmCode]: 文本}` 的 JSON 串） */
  blackContentDesc?: string;
  onClose: () => void;
  /** 保存成功后通知父级刷新列表 */
  onSaved?: () => void;
}

interface BlackBoxRow {
  id: string;
  paramName?: string;
  paramDesc?: string;
  paramValue?: string;
  /** 字典结构（JSON 串）；有值时源工程用动态表单渲染 */
  relateDictValue?: string;
  [key: string]: unknown;
}

/**
 * 解析字典结构（`relateDictValue` 是 JSON 串）
 *
 * 源工程在 `useAntdTable` 的 `onSuccess` 里 `JSON.parse` 后**原地写回** `i.relateDictValue`；
 * 这里改为按需解析、不改动原始字段类型 —— 解析失败或不是数组时返回 null，
 * 调用方据此退回普通文本输入（与源工程 `v-else` 一致）。
 */
function parseDictOptions(raw?: string): AdFormOption[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdFormOption[]) : null;
  } catch {
    return null;
  }
}

export function BlackBoxConfigModal({
  open,
  knownId,
  blackModelCode,
  blackContentDesc,
  onClose,
  onSaved,
}: BlackBoxConfigModalProps) {
  const [rows, setRows] = useState<BlackBoxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<SelectOption[]>([]);

  /** `{[大模型code]: 输出要求}` —— 与源工程 largeModelContentDesc 同名同构 */
  const [contentDescMap, setContentDescMap] = useState<Record<string, string>>({});
  const [largeModelCode, setLargeModelCode] = useState<string>('');
  const [contentDesc, setContentDesc] = useState('');
  const [entName, setEntName] = useState('科大讯飞股份有限公司');
  const [mainType, setMainType] = useState('企业主体');

  const [previewText, setPreviewText] = useState('');
  const [sending, setSending] = useState(false);
  const sseRef = useRef<AgentSseHandle | null>(null);

  /**
   * 每行的动态表单实例（对应源工程的 `$refs["formRef" + record.id]`）
   *
   * 保存时要从这里取 `paramValue` —— 与源工程 `saveEdit` 的
   * `proxy.$refs["formRef" + record.id].form.paramValue` 等价。
   */
  const formRefs = useRef<Record<string, AdFormRendererHandle | null>>({});

  /* ---- 初始化：解析 blackContentDesc + 加载模型下拉 ---- */
  useEffect(() => {
    if (!open) return;
    let map: Record<string, string> = {};
    if (blackContentDesc) {
      try {
        map = JSON.parse(blackContentDesc) as Record<string, string>;
      } catch {
        map = {};
      }
    }
    setContentDescMap(map);
    const code = blackModelCode ?? '';
    setLargeModelCode(code);
    setContentDesc(code ? map[code] ?? '' : '');
    setPreviewText('');
    setEditingId(null);

    getLargeModelOptions()
      .then(setModelOptions)
      .catch(() => setModelOptions([]));
  }, [open, blackContentDesc, blackModelCode]);

  /** 关闭时确保中止流 */
  useEffect(() => {
    if (!open && sseRef.current) {
      sseRef.current.abort();
      sseRef.current = null;
      setSending(false);
    }
  }, [open]);

  const load = useCallback(async () => {
    if (!knownId) return;
    setLoading(true);
    try {
      const res = await getKnowledgeParamsList({ relateKnowledgeId: knownId });
      const list = (res?.list ?? []) as unknown as BlackBoxRow[];
      setRows(list);
      setEditingId(null);
    } catch (err) {
      setRows([]);
      message.error(err instanceof Error ? err.message : '参数列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [knownId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const saveEdit = async (record: BlackBoxRow) => {
    try {
    // 有字典结构时，值来自该行的动态表单（对应源工程 `$refs["formRef" + record.id].form.paramValue`）
    const form = formRefs.current[record.id]?.getForm();
    const paramValue = form && 'paramValue' in form ? form.paramValue : record.paramValue;
    await updateKnowledgeParams({ id: record.id, paramValue });
      message.success('保存成功！');
      setEditingId(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  /** 保存黑盒配置（源 saveConfig） */
  const saveConfig = useCallback(
    async (callback?: () => void) => {
      const nextMap = { ...contentDescMap, [largeModelCode]: contentDesc || '' };
      setContentDescMap(nextMap);
      try {
        await saveBlackParam({
          relateKnowledgeId: knownId,
          blackContentDesc: JSON.stringify(nextMap),
          blackModelCode: largeModelCode,
        });
        message.success('保存成功！');
        onSaved?.();
        callback?.();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '保存失败');
      }
    },
    [contentDescMap, largeModelCode, contentDesc, knownId, onSaved],
  );

  const startPreview = () => {
    void saveConfig(() => {
      if (!largeModelCode) {
        message.error('请选择大模型！');
        return;
      }
      setPreviewText('');
      setSending(true);
      sseRef.current = agentSseGet({
        url: '/agent/KnowledgeBase/config/summaryAnswer',
        params: {
          entName,
          mainType,
          paramId: knownId,
          largeModelCode,
          inputParam: '',
        },
        onChunk: (chunk) => setPreviewText((prev) => prev + chunk.text),
        onDone: () => setSending(false),
        onError: (err) => {
          setSending(false);
          message.error(err instanceof Error ? err.message : '预览失败');
        },
      });
    });
  };

  const closePreview = () => {
    sseRef.current?.abort();
    sseRef.current = null;
    setSending(false);
  };

  const columns: ColumnsType<BlackBoxRow> = useMemo(
    () => [
      { title: '参数名称', width: 160, dataIndex: 'paramName' },
      { title: '参数说明', width: 160, dataIndex: 'paramDesc' },
      {
        title: '参数值',
        dataIndex: 'paramValue',
        render: (_text: unknown, record) => {
          const editable = editingId === record.id;
          const dictOptions = parseDictOptions(record.relateDictValue);
          // 有字典结构 → 动态表单（源工程 v-if="record.relateDictValue" 分支）
          if (dictOptions) {
            return (
              <AdFormRenderer
                ref={(handle) => {
                  formRefs.current[record.id] = handle;
                }}
                options={dictOptions}
                defaultValues={{ paramValue: record.paramValue ?? '' }}
                disabled={!editable}
                colspan={24}
                gutter={32}
              />
            );
          }
          // 无字典结构 → 普通文本输入（源工程 v-else 分支）
          return (
            <Input
              disabled={!editable}
              value={record.paramValue}
              onChange={(e) =>
                setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, paramValue: e.target.value } : r)))
              }
            />
          );
        },
      },
      {
        title: '操作',
        width: 80,
        fixed: 'right',
        render: (_text: unknown, record) =>
          editingId === record.id ? (
            <a onClick={() => void saveEdit(record)}>保存</a>
          ) : (
            <a onClick={() => setEditingId(record.id)}>编辑</a>
          ),
      },
    ],
    [editingId],
  );

  const handleCancel = () => {
    closePreview();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="配置"
      width={1200}
      onCancel={handleCancel}
      onOk={() => void saveConfig(() => onClose())}
      okText="保存并关闭"
      destroyOnClose
    >
      <Row gutter={12}>
        <Col span={15}>
          <Table<BlackBoxRow>
            rowKey="id"
            size="middle"
            bordered
            loading={loading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 800 }}
            pagination={false}
          />
          <Space style={{ marginTop: 20 }}>
            <Button type="primary" onClick={startPreview} disabled={sending}>
              开始预览
            </Button>
            <Button danger onClick={closePreview}>
              终止
            </Button>
          </Space>
        </Col>
        <Col span={9}>
          <div style={{ marginBottom: 12 }}>
            <Radio.Group value={mainType} onChange={(e) => { setMainType(e.target.value); setEntName(''); }}>
              <Radio value="企业主体">企业主体</Radio>
              <Radio value="行业主体">行业主体</Radio>
            </Radio.Group>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Input
              placeholder="请输入主体名称"
              value={entName}
              onChange={(e) => setEntName(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 8 }}>大模型</div>
          <Select
            allowClear
            showSearch
            style={{ width: '100%', marginBottom: 10 }}
            placeholder="请选择大模型"
            value={largeModelCode || undefined}
            optionFilterProp="label"
            options={modelOptions.map((o) => ({ value: o.value, label: o.title }))}
            onChange={(code) => {
              const next = code ?? '';
              setLargeModelCode(next);
              // 源 changeLargeCode：切模型时载入该模型各自记的输出要求
              setContentDesc(next ? contentDescMap[next] ?? '' : '');
            }}
          />
          <div style={{ marginBottom: 8 }}>输出要求</div>
          <Input.TextArea
            rows={8}
            placeholder="请输入内容"
            value={contentDesc}
            onChange={(e) => setContentDesc(e.target.value)}
          />
          <div style={{ marginTop: 12, height: 300, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 4, padding: 6 }}>
            {sending && !previewText && <Alert type="info" message="正在生成…" showIcon style={{ marginBottom: 8 }} />}
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{previewText}</div>
          </div>
        </Col>
      </Row>
    </Modal>
  );
}