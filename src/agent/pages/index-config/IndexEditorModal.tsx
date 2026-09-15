/**
 * 指标配置 — 新增 / 配置指标（整屏弹窗）
 *
 * 对应源工程 `amar-agent-admin/src/views/index/EditorModal.vue`（699 行）
 * ＋ 它的子组件 `DataSourceCard.vue`（1237 行，数据源配置）。
 *
 * ══════════ 2026-09-15 重构（用户反馈："整个配置页面跟源系统的布局都不一样"）══════════
 * 上一版只实现了 6 个基本字段 + 语义描述，**丢掉了源表单的一半**：
 * 输入形式、是否只读、指标默认值、初始化方法、取值方式/取值字段、父指标、是否启用大模型；
 * 而且「指标类型」「数据获取方式」两个下拉各只剩一个英文选项。现在**逐项对齐源模板**：
 * 字段顺序 / 显隐条件 / 选项文案 / 双列布局 / 两个折叠面板的默认展开规则 / 必填校验。
 *
 * 字段顺序与显隐条件（对应源 template 19~232 行）：
 *   指标编号 → 指标名称 → 指标类型 → 指标值获取方式 → 输入形式
 *   → [是否只读：CHAR+Auto] → 指标默认值 → [初始化方法：LIST 或 CHAR+Auto]
 *   → [取值方式 + 取值字段：(CHAR+Auto) 或 (LIST+Manual)] → 父指标 → 是否启用大模型
 *   → 折叠面板「指标语义描述配置」（是否上线语义指标 / 数据样例 / 指标唯一标志 /
 *      数值单位 / 数据类型 / 指标介绍 / 数据内容解析）
 *   → [折叠面板「数据源配置」：LIST+Auto]（内含接口类字段）
 *
 * ⚠️ 三条容易搞错的点：
 *   1. 源表单里**没有「指标ID（paramNo）」输入框**（后端新增时自生成）→ 本工程同样不渲染，
 *      但保存时要把 `paramNo` 回传（更新接口靠它定位），值取自选中行 / 详情接口。
 *   2. `withModelSummary`（是否启用大模型）在后端 `IndexParamsInfoSaveReq` 里**没有这个字段**，
 *      提交会被静默丢弃 —— 源工程亦然。知识库类指标的这个开关真正生效的位置在 `script` 里，
 *      由数据源卡片负责（真实数据里 `script.withModelSummary=true`）。
 *   3. `readOnly` 的显隐条件是 **CHAR + Auto**；`initMethod` 是 **LIST 或 CHAR+Auto**；
 *      `codeMethod/codeNo` 是 **(CHAR+Auto) 或 (LIST+Manual)**；数据源面板是 **LIST+Auto**。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AutoComplete,
  Button,
  Col,
  Collapse,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  message,
} from 'antd';
import {
  PARAM_TYPE_OPTIONS,
  addIndex,
  queryInfo,
  updateIndex,
  type IndexGroupNode,
  type IndexParamRow,
} from '../../api/indexConfig';
import { IndexTreePicker } from '../../components/IndexTreePicker';
import { IndexDataSourceCard } from './IndexDataSourceCard';

/* ------------------------------------------------------------------ *
 * 候选项（照抄源工程 `EditorModal.vue` 387~492 行，文案用中文）
 * ------------------------------------------------------------------ */

/**
 * 指标类型：定义在 `api/indexConfig.ts`（列表列的中文映射也用它，保持一处真源）
 */

/** 指标值获取方式（源 405~414；表单标签为「指标值获取方式」） */
const DATA_METHOD_OPTIONS = [
  { value: 'Auto', label: '自动' },
  { value: 'Manual', label: '手动' },
];

/** 取值方式（源 475~492） */
const CODE_METHOD_OPTIONS = [
  { value: 'CodeTable', label: '代码表' },
  { value: 'JavaMethod', label: 'JAVA方法' },
  { value: 'Code', label: '代码' },
  { value: 'CodeLibrary', label: '代码数据表' },
];

/** 数值单位（源 415~428，AutoComplete 可选可填） */
const DATA_UNIT_OPTIONS = ['元', '万元', '亿元'].map((v) => ({ value: v }));

/** 数据类型（源 template 171~176） */
const DATA_TYPE_OPTIONS = [
  { value: 'STRING', label: '字符串' },
  { value: 'NUMBER', label: '数值' },
  { value: 'DATE', label: '日期' },
  { value: 'BOOLEAN', label: '布尔值' },
  { value: 'MARKDOWN', label: 'markdown' },
  { value: 'JSON', label: 'json' },
];

/**
 * 输入形式的动态候选（源 429~474 的 computed 逐字搬）
 *
 * ⚠️ 「CHAR / NUMBER + 自动」时源工程**就只给一个「文本区域」**，不是漏写 —— 别"好心"补选项。
 */
function getInputMethodOptions(paramType: string, dataMethod: string): { value: string; label: string }[] {
  let options = [{ value: 'label', label: '文本区域' }];
  if (paramType === 'CHAR' || paramType === 'NUMBER') {
    if (dataMethod === 'Manual') {
      options = [
        { value: 'input', label: '输入框' },
        { value: 'radio', label: '单选框' },
        { value: 'tipTrace', label: '溯源按钮' },
        { value: 'tipIcon', label: '提示按钮' },
        { value: 'select', label: '下拉选择框' },
        { value: 'textarea', label: '多行文本框' },
        { value: 'richText', label: '富文本编辑框' },
      ];
    }
  } else if (dataMethod === 'Auto') {
    options = [
      { value: 'calc', label: '计算器' },
      { value: 'form', label: '表单' },
      { value: 'table', label: '表格' },
    ];
  } else {
    options = [{ value: 'checkbox', label: '多选框' }];
  }
  return options;
}

/* ------------------------------------------------------------------ */

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

/**
 * 表单字段。
 *
 * ⚠️ 这里只列**表单真正绑定的字段**；详情接口返回的其它几十个字段放在 `extra` 里原样回传，
 *    避免"打开再保存"把后端字段清空（源工程是 `{...formInfo}` 全量提交，等价效果）。
 */
interface EditorForm {
  /** 指标ID：不在表单里渲染，但要回传给更新接口 */
  paramNo: string;
  paramID: string;
  paramName: string;
  paramType: string;
  dataMethod: string;
  inputMethod: string;
  readOnly: string;
  defaultValue: string;
  initMethod: string;
  codeMethod: string;
  codeNo: string;
  parentParamNo: string;
  parentParamName: string;
  withModelSummary: boolean;
  scriptType: string;
  script: string;
  intfNo: string;
  supplierId: string;
  intfParams: string;
  intfField: string;
  structure: string;
  extendField: string;
  countField: string;
  isOnline: boolean;
  metricIntro: string;
  dataUnit: string;
  dataExample: string;
  dataType: string;
  dataContentParse: string;
  paramKey: string;
  /* 源 formInfo 的默认值，随详情一起提交，保证后端字段不被清空 */
  modelNo: string;
  reportVersion: string;
}

/** 新增时的初始值（对齐源 `formInfo` 默认值：paramType=CHAR / dataMethod=Auto / readOnly=Y） */
const EMPTY: EditorForm = {
  paramNo: '',
  paramID: '',
  paramName: '',
  paramType: 'CHAR',
  dataMethod: 'Auto',
  inputMethod: '',
  readOnly: 'Y',
  defaultValue: '',
  initMethod: '',
  codeMethod: '',
  codeNo: '',
  parentParamNo: '',
  parentParamName: '',
  withModelSummary: false,
  scriptType: '',
  script: '',
  intfNo: '',
  supplierId: '',
  intfParams: '',
  intfField: '',
  structure: '',
  extendField: '',
  countField: '',
  isOnline: false,
  metricIntro: '',
  dataUnit: '',
  dataExample: '',
  dataType: '',
  dataContentParse: '',
  paramKey: '',
  modelNo: 'Public',
  reportVersion: 'Public',
};

/** 源 `normalizeOnlineValue`：1 / true / '1' / 'Y' / 'true' 都算开启 */
function normalizeOnlineValue(value: unknown): boolean {
  return value === 1 || value === true || value === '1' || value === 'Y' || value === 'true';
}

function toStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/**
 * 表单分区块（标题 + 卡片）——只为把「基本信息」从无分组的一堆字段里拎出来。
 *
 * 2026-09-16 布局优化说明：整屏弹窗里原先最上面直接是一格一格的字段（下面反倒有
 * 「指标语义描述配置」「数据源配置」两个折叠面板标题），上下粗细不一致、看着散。
 * 这里用**纯展示的壳**（不引入任何依赖、不改字段）给基本信息补一个同级的区块标题，
 * 并把内容限宽居中，避免在超宽屏上单行输入框被拉到 800px+。
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <span style={{ width: 3, height: 14, background: '#1677ff', borderRadius: 2 }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ padding: '16px 16px 0' }}>{children}</div>
    </div>
  );
}

export default function IndexEditorModal({ open, editType, row, parentGroup, onClose, onSuccess }: IndexEditorModalProps) {
  const [form, setForm] = useState<EditorForm>(EMPTY);
  /** 详情全量对象：保证编辑时不丢后端返回的其它字段 */
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 折叠面板（源 `semanticActiveKeys` / `dataSourceActiveKeys`） */
  const [semanticKeys, setSemanticKeys] = useState<string[]>([]);
  const [dataSourceKeys, setDataSourceKeys] = useState<string[]>(['data-source-config']);
  /** 父指标选择弹窗（源 `SelectIndexModal`） */
  const [parentPickerOpen, setParentPickerOpen] = useState(false);

  const patch = useCallback((p: Partial<EditorForm>) => setForm((prev) => ({ ...prev, ...p })), []);

  /* ---- 显隐条件（与源模板逐条对应，顺序别改） ---- */
  const isCharAuto = form.paramType === 'CHAR' && form.dataMethod === 'Auto';
  const showReadOnly = isCharAuto;
  const showInitMethod = form.paramType === 'LIST' || isCharAuto;
  const showCodeConfig = isCharAuto || (form.paramType === 'LIST' && form.dataMethod === 'Manual');
  const showDataSource = form.paramType === 'LIST' && form.dataMethod === 'Auto';
  /** 接口类数据源 → 展示接口字段（源工程由 DataSourceCard 内部管理，本工程挂在数据源面板里） */
  const isApi = showDataSource && (form.scriptType === 'Api' || form.scriptType === '接口' || form.scriptType === 'API');
  const inputMethodOptions = getInputMethodOptions(form.paramType, form.dataMethod);

  /* ---------------- 回显 ---------------- */
  useEffect(() => {
    if (!open) return;
    if (editType === 'add') {
      // 源：parentParamNo/parentParamName/scriptType 取自当前选中的分组
      setForm({
        ...EMPTY,
        parentParamNo: parentGroup?.groupId ?? '',
        parentParamName: parentGroup?.groupName ?? '',
        scriptType: toStr((parentGroup as Record<string, unknown> | null)?.scriptType),
      });
      setExtra({});
      setSemanticKeys([]);
      setDataSourceKeys(['data-source-config']);
      return;
    }
    if (!row) return;
    setLoading(true);
    queryInfo({ paramNo: row.paramNo })
      .then((detail) => {
        // 源：{...props.curParam, ...详情}，列表行兜底
        const d = { ...(row as unknown as Record<string, unknown>), ...((detail ?? {}) as Record<string, unknown>) };
        setExtra(d);
        setForm({
          paramNo: toStr(d.paramNo ?? row.paramNo),
          paramID: toStr(d.paramID ?? row.paramID),
          paramName: toStr(d.paramName ?? row.paramName),
          paramType: toStr(d.paramType) || 'CHAR',
          dataMethod: toStr(d.dataMethod) || 'Auto',
          inputMethod: toStr(d.inputMethod),
          readOnly: toStr(d.readOnly) || 'Y',
          defaultValue: toStr(d.defaultValue),
          initMethod: toStr(d.initMethod),
          codeMethod: toStr(d.codeMethod),
          codeNo: toStr(d.codeNo),
          parentParamNo: toStr(d.parentParamNo),
          parentParamName: toStr(d.parentParamName),
          withModelSummary: d.withModelSummary === true || d.withModelSummary === 'true',
          scriptType: toStr(d.scriptType),
          script: toStr(d.script),
          intfNo: toStr(d.intfNo),
          supplierId: toStr(d.supplierId),
          intfParams: toStr(d.intfParams),
          intfField: toStr(d.intfField),
          structure: toStr(d.structure),
          extendField: toStr(d.extendField),
          countField: toStr(d.countField),
          // 源 normalizeParamInfo：isOnline 兼容 semanticOnline；其余语义字段兼容旧列名
          isOnline: normalizeOnlineValue(d.isOnline !== undefined ? d.isOnline : d.semanticOnline),
          metricIntro: toStr(d.metricIntro || d.semanticDesc),
          dataUnit: toStr(d.dataUnit || d.unit),
          dataExample: toStr(d.dataExample || d.dataSample),
          dataType: toStr(d.dataType),
          dataContentParse: toStr(d.dataContentParse),
          paramKey: toStr(d.paramKey),
          modelNo: toStr(d.modelNo) || 'Public',
          reportVersion: toStr(d.reportVersion) || 'Public',
        });
        // 源 hasSemanticConfigValue：语义描述有内容才默认展开
        const hasSemantic =
          normalizeOnlineValue(d.isOnline) ||
          !!d.metricIntro ||
          !!d.dataUnit ||
          !!d.dataExample ||
          !!d.dataContentParse ||
          !!d.dataType;
        setSemanticKeys(hasSemantic ? ['semantic-config'] : []);
        setDataSourceKeys(['data-source-config']);
      })
      .catch((e) => message.error((e as Error)?.message || '指标详情加载失败'))
      .finally(() => setLoading(false));
  }, [open, editType, row, parentGroup]);

  /* ---------------- 保存 ---------------- */
  const doSave = async () => {
    // 源 rules：paramName / paramType / dataMethod / inputMethod / readOnly 必填
    if (!form.paramName.trim()) return message.warning('指标名称不能为空');
    if (!form.paramType) return message.warning('指标类型不能为空');
    if (!form.dataMethod) return message.warning('指标值获取方式不能为空');
    if (!form.inputMethod) return message.warning('输入形式不能为空');
    if (showReadOnly && !form.readOnly) return message.warning('是否只读不能为空');

    setSaving(true);
    try {
      // 源提交结构：详情全量 + 表单值 + isOnline 归一(1/0) + paramKey 空串转 null
      const payload: Record<string, unknown> = {
        ...extra,
        ...form,
        isOnline: form.isOnline ? 1 : 0,
        paramKey: form.paramKey === '' ? null : form.paramKey,
      };
      if (editType === 'add') {
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

  /** 源 `selectHandle`：选中父指标后回填名称/编号/scriptType */
  const onPickParent = (node: { paramName: string; paramNo: string }) => {
    patch({
      parentParamName: node.paramName,
      parentParamNo: node.paramNo,
      scriptType: toStr((node as unknown as Record<string, unknown>).scriptType),
    });
    setParentPickerOpen(false);
  };

  /** 源 `clearParentParam`：连 `withModelSummary` 一起复位 */
  const clearParentParam = () => patch({ parentParamName: '', parentParamNo: '', scriptType: '', withModelSummary: false });

  const title = editType === 'add' ? '新增配置' : '更新配置';
  /**
   * 标签列用**固定宽度**（flex）而不是 `span`。
   *
   * 缘由（2026-09-16 布局优化）：原先用 `{ span: 6 }`，而每个字段又各自套在
   * `<Col md={12}>` 里 —— 标签宽度 = 6/24 × 半个容器，随视口漂移：
   * 宽屏下标签与控件之间被拉出几百像素空档、窄屏下 8 字标签（如「指标值获取方式」）
   * 被压到换行。改成固定 120px 后，全屏/半屏下标签都对齐、都不换行。
   */
  const labelCol = { flex: '0 0 120px' };
  const wrapperCol = { flex: '1 1 auto' };

  return (
    <Modal
      open={open}
      title={title}
      onOk={() => void doSave()}
      onCancel={onClose}
      /* 整屏弹框：对齐公司前端 `views/index/EditorModal.vue` —— 它是
         `width="100%"` + `wrap-class-name="editor-modal-fullscreen"`，那段 CSS 干的三件事：
           `.ant-modal          { top:0; max-width:100%; margin:0; padding-bottom:0 }`
           `.ant-modal-content  { height:100vh; display:flex; flex-direction:column }`
           `.ant-modal-body     { flex:1; overflow-y:auto }`
         antd v6 里 `style` 打在 `.ant-modal` 上，而原 `.ant-modal-content` 改名为
         `.ant-modal-container`（见 @rc-component/dialog 的 Panel.js），故用 styles.container 承接。 */
      width="100%"
      style={{ top: 0, margin: 0, maxWidth: '100%', paddingBottom: 0 }}
      styles={{
        container: { height: '100vh', display: 'flex', flexDirection: 'column' },
        body: { flex: 1, overflow: 'auto', padding: 16 },
      }}
      destroyOnHidden
      okText="确定"
      cancelText="取消"
      okButtonProps={{ loading: saving }}
      confirmLoading={saving}
    >
      {/* 内容限宽居中：整屏弹窗在超宽屏上不再把单行控件拉到 800px+ */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Form layout="horizontal" labelCol={labelCol} wrapperCol={wrapperCol} disabled={loading}>
          {/* ── 基本信息（源模板 19~121 行；字段与顺序逐项对齐，仅重排栅格） ── */}
          <Section title="基本信息">
            <Row gutter={[20, 0]}>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="指标编号">
              <Input placeholder="请输入指" value={form.paramID} onChange={(e) => patch({ paramID: e.target.value })} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="指标名称" required>
              <Input placeholder="请输入" value={form.paramName} onChange={(e) => patch({ paramName: e.target.value })} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="指标类型" required>
              <Select
                showSearch
                optionFilterProp="label"
                options={PARAM_TYPE_OPTIONS}
                value={form.paramType || undefined}
                onChange={(v) => patch({ paramType: v })}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="指标值获取方式" required>
              <Select
                showSearch
                optionFilterProp="label"
                options={DATA_METHOD_OPTIONS}
                value={form.dataMethod || undefined}
                onChange={(v) => patch({ dataMethod: v })}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="输入形式" required>
              <Select
                showSearch
                optionFilterProp="label"
                options={inputMethodOptions}
                value={form.inputMethod || undefined}
                onChange={(v) => patch({ inputMethod: v })}
              />
            </Form.Item>
          </Col>

          {showReadOnly && (
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="是否只读">
                <Radio.Group value={form.readOnly} onChange={(e) => patch({ readOnly: e.target.value })}>
                  <Radio value="Y">是</Radio>
                  <Radio value="N">否</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          )}

          <Col xs={24} md={12} xl={8}>
            <Form.Item label="指标默认值">
              <Input placeholder="请输入" value={form.defaultValue} onChange={(e) => patch({ defaultValue: e.target.value })} />
            </Form.Item>
          </Col>

          {showInitMethod && (
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="初始化方法">
                <Input placeholder="请输入" value={form.initMethod} onChange={(e) => patch({ initMethod: e.target.value })} />
              </Form.Item>
            </Col>
          )}

          {showCodeConfig && (
            <>
              <Col xs={24} md={12} xl={8}>
                <Form.Item label="取值方式">
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="请选择"
                    options={CODE_METHOD_OPTIONS}
                    value={form.codeMethod || undefined}
                    onChange={(v) => patch({ codeMethod: v })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} xl={8}>
                <Form.Item label="取值字段">
                  <Input placeholder="请输入" value={form.codeNo} onChange={(e) => patch({ codeNo: e.target.value })} />
                </Form.Item>
              </Col>
            </>
          )}

          {/* 父指标：源工程这里是 `width:300px` 的定宽输入框 + 一个图标按钮 + 清空。
              定宽在半屏列里会把按钮挤到换行，改用 flex 自适应 + Space 收口（内容与行为不变）。 */}
          <Col xs={24} md={12} xl={12}>
            <Form.Item label="父指标">
              <Space.Compact style={{ width: '100%' }}>
                <Input disabled placeholder="请选择父指标" value={form.parentParamName} />
                <Button type="primary" onClick={() => setParentPickerOpen(true)}>
                  选择
                </Button>
                <Button onClick={clearParentParam}>清空</Button>
              </Space.Compact>
            </Form.Item>
          </Col>

          <Col xs={24} md={12} xl={12}>
            <Form.Item label="是否启用大模型">
              <Switch
                checked={form.withModelSummary}
                onChange={(v) => patch({ withModelSummary: v })}
                checkedChildren="启用"
                unCheckedChildren="禁用"
              />
            </Form.Item>
          </Col>
            </Row>
          </Section>

        {/* ── 折叠面板：指标语义描述配置（源 124~201） ── */}
        <Collapse
          activeKey={semanticKeys}
          onChange={(k) => setSemanticKeys(Array.isArray(k) ? k : [k])}
          items={[
            {
              key: 'semantic-config',
              label: '指标语义描述配置',
              children: (
                <Row gutter={[20, 0]}>
                  {/* 子项的 labelCol 覆盖已移除：统一继承外层 120px 定宽标签，
                      原先每项写 `{span:8}` 在 3 列栅格下只有 ~130px，8 字标签会换行。 */}
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="是否上线语义指标">
                      <Switch
                        checked={form.isOnline}
                        onChange={(v) => patch({ isOnline: v })}
                        checkedChildren="开启"
                        unCheckedChildren="未开启"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="数据样例">
                      <Input
                        placeholder="请输入数据样例，如：1234.56"
                        value={form.dataExample}
                        onChange={(e) => patch({ dataExample: e.target.value })}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="指标唯一标志">
                      <Input
                        placeholder="请输入指标唯一标志"
                        value={form.paramKey}
                        onChange={(e) => patch({ paramKey: e.target.value })}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="数值单位">
                      <AutoComplete
                        allowClear
                        options={DATA_UNIT_OPTIONS}
                        placeholder="请输入或选择数值单位"
                        value={form.dataUnit || undefined}
                        onChange={(v) => patch({ dataUnit: toStr(v) })}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <Form.Item label="数据类型">
                      <Select
                        showSearch
                        allowClear
                        optionFilterProp="label"
                        placeholder="请选择数据类型"
                        options={DATA_TYPE_OPTIONS}
                        value={form.dataType || undefined}
                        onChange={(v) => patch({ dataType: toStr(v) })}
                      />
                    </Form.Item>
                  </Col>
                  {/* 两个文本域保持两列（比其它字段宽一档，长文本更好读） */}
                  <Col xs={24} md={12}>
                    <Form.Item label="指标介绍">
                      <Input.TextArea
                        rows={4}
                        placeholder="请输入指标介绍，用于大模型语义检索匹配..."
                        value={form.metricIntro}
                        onChange={(e) => patch({ metricIntro: e.target.value })}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="数据内容解析">
                      <Input.TextArea
                        rows={3}
                        placeholder="请输入数据内容解析，例如字段含义、解析规则、输出内容说明..."
                        value={form.dataContentParse}
                        onChange={(e) => patch({ dataContentParse: e.target.value })}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
          ]}
        />

        {/* ── 折叠面板：数据源配置（源 203~225，条件 LIST + Auto） ── */}
        {showDataSource && (
          <Collapse
            style={{ marginTop: 16 }}
            activeKey={dataSourceKeys}
            onChange={(k) => setDataSourceKeys(Array.isArray(k) ? k : [k])}
            items={[
              {
                key: 'data-source-config',
                label: '数据源配置',
                children: (
                  <>
                    {/* 源工程此处挂 `DataSourceCard.vue`（1237 行），本工程对应 `IndexDataSourceCard.tsx`：
                        类型选择（Sql / Api / KnowledgeCode）+ 数据源下拉 + 选表 + SQL 编辑与结果预览，
                        并把选择结果序列化成 JSON 写回 `script` 字段（字段名与源 `getValue()` 一致）。 */}
                    <IndexDataSourceCard
                      scriptType={form.scriptType}
                      onScriptTypeChange={(v) => patch({ scriptType: v })}
                      value={form.script}
                      onChange={(next) => patch({ script: next })}
                    />

                    {isApi && (
                      <Row gutter={24} style={{ marginTop: 12 }}>
                        <Col md={8} sm={24}>
                          <Form.Item label="接口编号">
                            <Input placeholder="intfNo" value={form.intfNo} onChange={(e) => patch({ intfNo: e.target.value })} />
                          </Form.Item>
                        </Col>
                        <Col md={8} sm={24}>
                          <Form.Item label="接口供应商">
                            <Input
                              placeholder="supplierId"
                              value={form.supplierId}
                              onChange={(e) => patch({ supplierId: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                        <Col md={8} sm={24}>
                          <Form.Item label="接口参数">
                            <Input
                              placeholder="intfParams"
                              value={form.intfParams}
                              onChange={(e) => patch({ intfParams: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                        <Col md={8} sm={24}>
                          <Form.Item label="接口字段">
                            <Input
                              placeholder="intfField"
                              value={form.intfField}
                              onChange={(e) => patch({ intfField: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                        <Col md={8} sm={24}>
                          <Form.Item label="结构">
                            <Input
                              placeholder="structure"
                              value={form.structure}
                              onChange={(e) => patch({ structure: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                        <Col md={8} sm={24}>
                          <Form.Item label="扩展字段">
                            <Input
                              placeholder="extendField"
                              value={form.extendField}
                              onChange={(e) => patch({ extendField: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                        <Col md={8} sm={24}>
                          <Form.Item label="计数字段">
                            <Input
                              placeholder="countField"
                              value={form.countField}
                              onChange={(e) => patch({ countField: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
        </Form>
      </div>

      {/* 父指标选择（源 `SelectIndexModal`，本工程复用 `IndexTreePicker`） */}
      <Modal
        open={parentPickerOpen}
        title="选择父指标"
        footer={null}
        width={720}
        destroyOnHidden
        onCancel={() => setParentPickerOpen(false)}
      >
        <IndexTreePicker onSelect={onPickParent} height={420} />
      </Modal>
    </Modal>
  );
}
