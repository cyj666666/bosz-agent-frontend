/**
 * 知识库「指标」弹窗
 *
 * React 重写自源工程 `knowledge/components/TargetConfigModal.vue`（142 行，逻辑很薄）。
 *
 * ── 契约（逐条对齐，字段名不能改）──
 * 读：`queryInfo({ paramId: knownId })` → `result.inputIndex`（一个 JSON 串）
 *     → `JSON.parse` 成 `[{ indexName, indexNo }]`
 * 写：`updateKnowledge({ paramId: knownId, inputIndex: JSON.stringify(targetList) })`
 *
 * ── 交互 ──
 * 左侧指标树拖一个节点到右侧任意输入框即填入；`indexName` 也可手改，
 * `indexNo` 恒为只读（源工程也是 disabled）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Empty, Input, Modal, Popconfirm, Row, Space, message } from 'antd';
import { IndexTreePicker } from '../../components/IndexTreePicker';
import { queryInfo, updateKnowledge } from '../../api/knowledgeConfig';

export interface TargetConfigModalProps {
  open: boolean;
  /** 知识库 id（源工程 knownId） */
  knownId: string;
  onClose: () => void;
  /** 保存成功 */
  onSuccess?: () => void;
}

interface TargetItem {
  indexName: string;
  indexNo: string;
}

/** 读拖拽进来的指标（源工程读 `dataTransfer['attr']`） */
function readDragPayload(e: React.DragEvent): { label?: string; value?: string } | null {
  try {
    const raw = e.dataTransfer.getData('attr');
    if (!raw) return null;
    return JSON.parse(raw) as { label?: string; value?: string };
  } catch {
    return null;
  }
}

export function TargetConfigModal({ open, knownId, onClose, onSuccess }: TargetConfigModalProps) {
  const [targetList, setTargetList] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const getInfo = useCallback(async () => {
    if (!knownId) return;
    setLoading(true);
    try {
      const res = await queryInfo({ paramId: knownId });
      const raw = (res as unknown as { inputIndex?: string })?.inputIndex;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as TargetItem[];
          setTargetList(Array.isArray(parsed) && parsed.length ? parsed : [{ indexName: '', indexNo: '' }]);
        } catch {
          // 源工程这里静默吞掉解析异常（`catch (e) {}`），保持一致：解析失败就当空
          setTargetList([{ indexName: '', indexNo: '' }]);
        }
      } else {
        setTargetList([{ indexName: '', indexNo: '' }]);
      }
    } catch (err) {
      setTargetList([{ indexName: '', indexNo: '' }]);
      message.error(err instanceof Error ? err.message : '知识库详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [knownId]);

  useEffect(() => {
    if (open) void getInfo();
  }, [open, getInfo]);

  const patchItem = (index: number, patch: Partial<TargetItem>) => {
    setTargetList((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleOk = async () => {
    setSaving(true);
    try {
      const res = (await updateKnowledge({
        paramId: knownId,
        inputIndex: JSON.stringify(targetList),
      })) as unknown as { code?: number; message?: string };
      if (res?.code === 200) {
        message.success('修改成功');
        onSuccess?.();
        onClose();
      } else {
        message.error(res?.message ?? '保存失败');
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="指标"
      width={1200}
      onCancel={onClose}
      onOk={() => void handleOk()}
      confirmLoading={saving}
      destroyOnClose
    >
      <Row gutter={12}>
        <Col span={8}>
          <Card title="指标" size="small" loading={loading}>
            <IndexTreePicker height={430} />
          </Card>
        </Col>
        <Col span={16}>
          <div style={{ height: 468, overflow: 'auto', paddingRight: 20 }}>
            {targetList.length === 0 && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无指标，请点击下方「添加」" />
            )}
            {targetList.map((item, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: 20, width: '100%' }}>
                <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                  <span>指标名称：</span>
                  <Input
                    placeholder="请输入指标名称"
                    style={{ width: 280 }}
                    value={item.indexName}
                    onChange={(e) => patchItem(index, { indexName: e.target.value })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const payload = readDragPayload(e);
                      if (!payload) return;
                      patchItem(index, { indexName: payload.label ?? '', indexNo: payload.value ?? '' });
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                  <span>指标id：</span>
                  <Input
                    disabled
                    placeholder="请选择指标id"
                    style={{ width: 280 }}
                    value={item.indexNo}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const payload = readDragPayload(e);
                      if (!payload) return;
                      patchItem(index, { indexName: payload.label ?? '', indexNo: payload.value ?? '' });
                    }}
                  />
                </div>
                <Popconfirm
                  title="确定删除该指标吗？"
                  okText="确认"
                  cancelText="取消"
                  onConfirm={() => setTargetList((prev) => prev.filter((_it, i) => i !== index))}
                >
                  <Button danger type="text">
                    删除
                  </Button>
                </Popconfirm>
              </div>
            ))}
            <Space>
              <Button
                type="primary"
                size="small"
                onClick={() => setTargetList((prev) => [...prev, { indexName: '', indexNo: '' }])}
              >
                添加
              </Button>
            </Space>
          </div>
        </Col>
      </Row>
    </Modal>
  );
}
