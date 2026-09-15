/**
 * 知识库「细分参数配置」弹窗
 *
 * React 重写自源工程 `knowledge/components/IndexParamConfigModal.vue`（197 行）。
 *
 * ══════════ 数据结构（🔴 本轮修正，之前理解错了层级）══════════
 * `relateIndexSet` **不是一个扁平的行数组**，而是「**按指标分组**」的两层结构：
 * ```json
 * [
 *   { "type": "Api", "paramNo": "…", "paramName": "…", "intfNo": "…", "intfName": "…",
 *     "supplierId": "…",
 *     "params": [ { "field", "fieldType", "fieldName", "defaultValue",
 *                   "relateIndex", "sourceFlag", "sourceField" } ] },
 *   { "type": "Sql", … },
 *   { "type": "ParamSet", … }
 * ]
 * ```
 * 由后端 `KnowledgeBaseConfigServiceImpl#handleIndexParamConfig` 在**保存/发布知识库时自动生成**
 * （从 `prompt` 里解析出 `{{指标名||指标编号}}` 引用到的指标 → 取该指标（含父指标）的接口/SQL 参数）。
 *
 * ⇒ 界面必须**按分组渲染**（源工程是 `v-for` + 折叠面板，每个面板里一张 `params` 表），
 *    按扁平数组解析会渲染出一堆空行（用户 2026-09-16 反馈「细分参数差不出来」）。
 *
 * ══════════ 三个必须照抄的契约（错一个功能就静默失效）══════════
 * ① **`sourceFlag` 是字符串 `"1"` / `"0"`**（`YesOrNoEnum`），不是 boolean。
 *    后端判细分用的是 `"1".equals(json.getString("sourceFlag"))`
 *    （`SqlDataSetBuilder` L127 / `ExtIntfParamManageServiceImpl` L185）——
 *    存成 boolean `true` 的话**细分配置永不生效**，还不报错。
 * ② **`sourceField` 是 `key-title-value` 三段拼串**，值里带 `-` 时后端按第 2 个 `-` 截取
 *    （`KnowledgeBaseConfigServiceImpl` L1856~1869）。源工程的下拉就是这么拼的：
 *    `value = item.key + '-' + item.descValue`，`descValue = item.title + '-' + item.value`，
 *    显示文本 = `descValue`。
 * ③ 这两个字段**是唯一由用户维护、且保存时会被后端保留的字段**：`handleRelateIndexSet`
 *    重建 params 时会用 `field` 匹配旧值，把旧的 `sourceFlag` / `sourceField` 拷回来
 *    （L3391~3401）。所以本弹窗改的就是这两列，其余列是只读的指标元数据。
 *
 * ══════════ 其余对齐点 ══════════
 * · 细项名称下拉：`GET /sys/category/loadTreeRoot?pcode=X02&async=true`（`TreeSelectModel`）。
 *   ⚠️ 之前错打到 `/sys/category/rootList`（返回 `IPage<SysCategory>` 分页对象）→ 前端按数组收 → **恒为空**。
 * · 「是否细分」用 `Radio.Group`（是 / 否），不是 Checkbox。
 * · 细项名称**恒为 Select**（源工程不分 sourceFlag 都渲染 Select）。
 * · 面板标题按类型拼：`Api` → `名称（接口编号-接口名）(Api)`；`Sql` → `名称（接口名）(Sql)`；其他 → `名称(类型)`。
 * · 底部按钮：取消 / 保存（源工程显式给了 footer，不是默认的确定/取消）。
 * · 保存：`updateKnowledge({ paramId, relateIndexSet: JSON.stringify(groups) })`，成功后回传父级。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Collapse, Modal, Radio, Select, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { loadCategoryTreeRoot, updateKnowledge } from '../../api/knowledgeConfig';
import type { CategoryNode } from '../../api/knowledgeConfig';

/** 单个指标下的一个参数行（字段名与后端产出/源工程列定义一致） */
interface SubParam {
  field?: string;
  fieldType?: string;
  fieldName?: string;
  defaultValue?: string;
  relateIndex?: string;
  /** 是否细分：`"1"` / `"0"`（字符串！） */
  sourceFlag?: string;
  /** 细项名称：`key-title-value` 三段拼串 */
  sourceField?: string;
  [key: string]: unknown;
}

/** 一个指标分组（= 一张折叠面板 + 一张表） */
interface SubParamGroup {
  type?: string;
  paramNo?: string;
  paramName?: string;
  intfNo?: string;
  intfName?: string;
  supplierId?: string;
  params?: SubParam[];
  [key: string]: unknown;
}

export interface IndexParamConfigModalProps {
  open: boolean;
  /** 知识库 id（源工程从 configInfo.paramId 取） */
  paramId: string;
  /** 父级持有的 relateIndexSet（JSON 串） */
  relateIndexSet?: string;
  onClose: () => void;
  /** 保存成功后把新的 JSON 串交回父级 */
  onSuccess?: (nextJson: string) => void;
}

const NONE = '-';

/** 面板标题（照抄源工程的模板表达式，缺值用 `-` 占位） */
function groupTitle(group: SubParamGroup): string {
  const name = group.paramName ?? '';
  const type = group.type ?? '';
  const intfNo = group.intfNo ?? NONE;
  const intfName = group.intfName ?? NONE;
  if (type === 'Api') return `${name}（${intfNo}-${intfName}）(${type})`;
  if (type === 'Sql') return `${name}（${intfName}）(${type})`;
  return `${name}(${type})`;
}

export function IndexParamConfigModal({
  open,
  paramId,
  relateIndexSet,
  onClose,
  onSuccess,
}: IndexParamConfigModalProps) {
  const [groups, setGroups] = useState<SubParamGroup[]>([]);
  /** 细项名称下拉项：`value = key-title-value`、`label = title-value`（与源工程逐字一致） */
  const [sourceOptions, setSourceOptions] = useState<{ value: string; label: string }[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  /** 解析父级传入的 relateIndexSet（**按分组**解析） */
  useEffect(() => {
    if (!open) return;
    let parsed: SubParamGroup[] = [];
    if (relateIndexSet) {
      try {
        const arr = JSON.parse(relateIndexSet) as SubParamGroup[];
        parsed = Array.isArray(arr) ? arr : [];
      } catch {
        parsed = [];
      }
    }
    setGroups(parsed);
    // 默认全部展开：源工程每个面板都是 `default-active-key="0"`（即各自第一个面板默认展开）
    setActiveKeys(parsed.map((_g, i) => String(i)));
  }, [open, relateIndexSet]);

  /** 细项名称下拉（源 `loadTreeRoot('X02', true)`，前端补 label / descValue） */
  useEffect(() => {
    if (!open) return;
    loadCategoryTreeRoot('X02', true)
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setSourceOptions(
          arr.map((item: CategoryNode) => {
            // descValue = title + '-' + value（源工程原文）
            const descValue = `${item.title ?? ''}-${item.value ?? ''}`;
            return {
              // value = key + '-' + descValue（后端按第 2 个 '-' 之后截取细项名）
              value: `${item.key ?? ''}-${descValue}`,
              label: descValue,
            };
          }),
        );
      })
      .catch(() => setSourceOptions([]));
  }, [open]);

  /** 改某分组下某行的字段 */
  const patchParam = useCallback((groupIndex: number, rowIndex: number, p: Partial<SubParam>) => {
    setGroups((prev) =>
      prev.map((g, gi) => {
        if (gi !== groupIndex) return g;
        const params = (g.params ?? []).map((row, ri) => (ri === rowIndex ? { ...row, ...p } : row));
        return { ...g, params };
      }),
    );
  }, []);

  const columns = useMemo<ColumnsType<SubParam>>(
    () => [
      { title: '序号', width: 80, align: 'center', render: (_v, _r, index) => index + 1 },
      { title: '字段', width: 160, dataIndex: 'field' },
      { title: '字段类型', width: 80, dataIndex: 'fieldType' },
      {
        title: '是否必填',
        width: 80,
        align: 'center',
        dataIndex: 'isRequired',
        render: (text: unknown) => (text === true ? '是' : text === false ? '否' : String(text ?? '')),
      },
      { title: '字段名称', width: 160, dataIndex: 'fieldName' },
      { title: '默认值', width: 160, dataIndex: 'defaultValue' },
      { title: '关联指标', dataIndex: 'relateIndex' },
    ],
    [],
  );

  const handleOk = async () => {
    setSaving(true);
    try {
      const json = JSON.stringify(groups);
      await updateKnowledge({ paramId, relateIndexSet: json });
      message.success('保存成功!');
      onSuccess?.(json);
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 每个分组一张表。
   *
   * 用 `Collapse` 的 `items`（antd v6 API）；每组最后两列是**可编辑**的
   * （是否细分 / 细项名称），其余列是只读元数据。
   */
  const collapseItems = groups.map((group, groupIndex) => {
    const rows = group.params ?? [];
    const editColumns: ColumnsType<SubParam> = [
      ...columns,
      {
        title: '是否细分',
        width: 150,
        align: 'center',
        dataIndex: 'sourceFlag',
        render: (_t: unknown, record, rowIndex) => (
          <Radio.Group
            buttonStyle="solid"
            size="small"
            value={record.sourceFlag ?? '0'}
            onChange={(e) => patchParam(groupIndex, rowIndex, { sourceFlag: e.target.value })}
          >
            <Radio.Button value="1">是</Radio.Button>
            <Radio.Button value="0">否</Radio.Button>
          </Radio.Group>
        ),
      },
      {
        title: '细项名称',
        width: 250,
        dataIndex: 'sourceField',
        render: (_t: unknown, record, rowIndex) => (
          <Select
            allowClear
            showSearch
            style={{ width: 230 }}
            placeholder="请选择细项"
            optionFilterProp="label"
            value={record.sourceField || undefined}
            options={sourceOptions}
            onChange={(v) => patchParam(groupIndex, rowIndex, { sourceField: v ?? '' })}
          />
        ),
      },
    ];

    return {
      key: String(groupIndex),
      label: <span style={{ fontWeight: 500 }}>{groupTitle(group)}</span>,
      children: (
        <>
          {rows.length === 0 ? (
            <div style={{ padding: '12px 0', color: '#8c8c8c' }}>该指标下没有可配置的参数</div>
          ) : (
            <Table<SubParam>
              rowKey={(_r, index) => String(index)}
              size="middle"
              bordered
              columns={editColumns}
              dataSource={rows}
              pagination={false}
              scroll={{ x: 1320 }}
            />
          )}
        </>
      ),
    };
  });

  return (
    <Modal
      open={open}
      title="指标参数细类配置"
      width={1400}
      onCancel={onClose}
      footer={
        <>
          <Button key="back" onClick={onClose}>
            取消
          </Button>
          <Button key="submit" type="primary" loading={saving} onClick={() => void handleOk()}>
            保存
          </Button>
        </>
      }
      destroyOnClose
    >
      {groups.length === 0 ? (
        <div style={{ padding: '24px 0', color: '#8c8c8c' }}>
          暂无细类参数。该配置由后端在**保存/发布知识库**时按提示词里引用到的指标自动生成，
          保存后再打开本弹窗即可配置「是否细分」与「细项名称」。
        </div>
      ) : (
        <Collapse items={collapseItems} activeKey={activeKeys} onChange={(k) => setActiveKeys(Array.isArray(k) ? k.map(String) : [String(k)])} />
      )}
    </Modal>
  );
}
