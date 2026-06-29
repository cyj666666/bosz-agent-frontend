/**
 * 报告查看页 — 三栏式交互报告（匹配贷后管理报告.html风格）
 * 左栏：目录导航 | 中栏：15板块正文 | 右栏：侧边溯源/深度分析
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, message, Space, Tag, Table } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, FileTextOutlined, NodeIndexOutlined, HistoryOutlined, UserOutlined, SearchOutlined } from '@ant-design/icons';
import { reportApi } from '../../api/report';

const DOMAIN_LABELS: Record<string, string> = {
  FINANCE: '财务信息', CREDIT: '征信信息', TAX: '税务信息', JUDICIAL: '司法信息',
  SETTLEMENT: '结算信息', INDUSTRY_COMMERCE: '工商信息', SOCIAL_SECURITY: '社保信息',
  CUSTOMS: '海关信息', UTILITY: '水电气', PROPERTY: '产权信息', GRAPH: '图谱信息',
  MANAGEMENT: '经营管理', OTHER: '其他',
};

const DOMAIN_ORDER = ['INDUSTRY_COMMERCE','FINANCE','CREDIT','TAX','SETTLEMENT','SOCIAL_SECURITY','CUSTOMS','UTILITY','JUDICIAL','GRAPH','MANAGEMENT','PROPERTY','OTHER'];

const RULE_TYPE_MAP: Record<string, string> = { THRESHOLD: '阈值判断', BOOLEAN: '布尔判断', COMPOSITE: '复合规则' };
const OPERATOR_MAP: Record<string, string> = { GT:'>', GTE:'≥', LT:'<', LTE:'≤', EQ:'=', NEQ:'≠', CONTAINS:'包含', EXISTS:'存在', NOT_EXISTS:'不存在' };

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sideTitle, setSideTitle] = useState('');
  const [sideContent, setSideContent] = useState<any>(null);
  const [sideVisible, setSideVisible] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const r = await reportApi.getById(Number(id));
        setReport(r.data);
        const d = await reportApi.getData(r.data.customerId);
        setData(d.data);
      } catch { message.error('加载报告失败'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  /** 滚动监听：高亮当前章节 */
  const handleScroll = useCallback(() => {
    const els = document.querySelectorAll('[data-section]');
    let current = '';
    els.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top <= 140) current = el.getAttribute('data-section') || '';
    });
    setActiveSection(current);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    main.addEventListener('scroll', handleScroll, { passive: true });
    return () => main.removeEventListener('scroll', handleScroll);
  }, [handleScroll, data]);

  /** 侧边栏 */
  const openSide = (title: string, content: any) => { setSideTitle(title); setSideContent(content); setSideVisible(true); };
  const closeSide = () => setSideVisible(false);

  /** 导出 Word */
  const exportWord = () => {
    const rulesDiv = document.getElementById('report-rules');
    const html = rulesDiv ? rulesDiv.outerHTML : '';
    const full = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="UTF-8"><style>
      body{font-family:"Microsoft YaHei",sans-serif;color:#333;line-height:1.8}
      h1{font-size:20pt}h2{font-size:14pt;border-bottom:2px solid #1664ff;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
      th{background:#eef4ff}</style></head><body>${html}</body></html>`;
    const blob = new Blob(['﻿' + full], { type: 'application/msword' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${report?.reportTitle || '报告'}.doc`; a.click();
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>报告数据不可用</div>;

  const { customer, domains, rules, summary } = data;
  const hitCount: number = summary?.hitRules || 0;
  const domainKeys = DOMAIN_ORDER.filter(d => domains[d]);
  // 补充 ORDER 之外的域
  Object.keys(domains).forEach(d => { if (!domainKeys.includes(d)) domainKeys.push(d); });

  const sections: { id: string; title: string; anchor: string }[] = [
    { id: 'basic', title: '一、客户基本信息', anchor: 'basic' },
    ...domainKeys.map((d, i) => ({ id: d, title: `${dn(i)}、${DOMAIN_LABELS[d] || d}`, anchor: d })),
    { id: 'rules', title: `${dn(domainKeys.length)}、规则命中清单`, anchor: 'rules' },
  ];

  function dn(i: number) { const n = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五']; return n[i+1] || String(i+2); }

  /** 侧边栏：溯源数据 */
  const provenancePanel = (domain: string) => {
    const items = domains[domain] || [];
    if (!items.length) return <p>暂无数据</p>;
    return <Table size="small" pagination={false} dataSource={items} rowKey="indicatorKey"
      columns={[
        { title: '指标', dataIndex: 'indicatorName', ellipsis: true },
        { title: '当前值', dataIndex: 'currentValue', width: 100 },
        { title: '上期值', dataIndex: 'previousValue', width: 100 },
        { title: '变动', dataIndex: 'changeDesc', width: 90 },
      ]} />;
  };

  /** 侧边栏：规则命中详情 */
  const ruleDetailPanel = () => {
    return <div>
      {rules.filter((r: any) => r.hit).map((r: any) => (
        <div key={r.ruleCode} style={{ marginBottom: 16, padding: 12, background: '#fff5f5', borderRadius: 8, border: '1px solid #ffccc7' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{r.ruleCode} {r.ruleName}</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{RULE_TYPE_MAP[r.ruleType] || r.ruleType}</div>
          <div style={{ fontSize: 13 }}>{r.description}</div>
          <div style={{ marginTop: 6 }}>
            {r.conditions.map((c: any) => (
              <Tag key={c.indicatorKey} style={{ marginBottom: 4 }}>
                {c.indicatorName || c.indicatorKey} {OPERATOR_MAP[c.operator] || c.operator} {c.threshold || ''}
              </Tag>
            ))}
          </div>
        </div>
      ))}
      {rules.filter((r: any) => r.hit).length === 0 && <p>无命中规则</p>}
    </div>;
  };

  return <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
    {/* 顶部工具栏 */}
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid #e8e8e8', background: '#fff' }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>返回</Button>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{customer?.companyName} - 贷后管理报告</span>
        {hitCount > 0 ? <Tag color="red">命中 {hitCount} 条规则</Tag> : <Tag color="green">无规则命中</Tag>}
      </Space>
      <Space>
        <Button icon={<NodeIndexOutlined />} onClick={() => openSide('风险洞察 - 命中规则', ruleDetailPanel())}>风险洞察</Button>
        <Button icon={<FileTextOutlined />} onClick={exportWord}>导出 Word</Button>
      </Space>
    </div>

    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* 左栏：目录导航 */}
      <nav style={{ width: 220, flexShrink: 0, overflow: 'auto', padding: '16px 12px', borderRight: '1px solid #e8e8e8', background: '#fafbfc' }}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: '#1664ff' }}>报告目录</div>
        {sections.map(s => (
          <a key={s.id} href={`#${s.anchor}`} onClick={(e) => {
            e.preventDefault();
            document.getElementById(s.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          style={{ display: 'block', padding: '7px 10px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
            color: activeSection === s.anchor ? '#1664ff' : '#555',
            background: activeSection === s.anchor ? '#e8f0fe' : 'transparent',
            marginBottom: 2 }}>
            {s.title}
            {s.id === 'rules' && hitCount > 0 && <span style={{ color: '#f5222d', marginLeft: 6, fontSize: 12 }}>⚠{hitCount}</span>}
          </a>
        ))}
      </nav>

      {/* 中栏：报告正文 */}
      <div ref={mainRef} style={{ flex: 1, overflow: 'auto', padding: '24px 32px', background: 'linear-gradient(180deg,#fdfefe,#f3f8ff,#eef5ff)' }}>
        {/* 客户基本信息 */}
        <section id="basic" data-section="basic" style={sectionStyle}>
          <h2 style={h2Style}>一、客户基本信息</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 14 }}>
            <KV label="企业名称" v={customer?.companyName} />
            <KV label="统一信用代码" v={customer?.creditCode} />
            <KV label="法定代表人" v={customer?.legalPerson} />
            <KV label="实际控制人" v={customer?.actualController} />
            <KV label="注册资本" v={customer?.registeredCapital} />
            <KV label="实缴资本" v={customer?.paidCapital} />
            <KV label="所属行业" v={customer?.industry} />
            <KV label="客户类型" v={customer?.customerType} />
            <KV label="控股类型" v={customer?.holdingType} />
            <KV label="集团归属" v={customer?.groupName} />
            <KV label="成立日期" v={customer?.establishDate} />
            <KV label="状态" v={customer?.status} />
            <KV label="首次贷款" v={customer?.firstLoanDate} />
            <KV label="最新批复" v={customer?.lastApprovalDate} />
            <KV label="基本开户行" v={customer?.mainBank} />
            <KV label="主要结算行" v={customer?.settlementBank} />
            <div style={{ gridColumn: '1/-1' }}>
              <KV label="主营业务" v={customer?.bizScope} />
              <KV label="注册地址" v={customer?.registerAddress} />
              <KV label="股东" v={customer?.shareholder} />
            </div>
          </div>
        </section>

        {/* 分域指标 */}
        {domainKeys.map(d => {
          const items = domains[d] || [];
          const domainLabel = DOMAIN_LABELS[d] || d;
          const idx = domainKeys.indexOf(d);
          const num = ['二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五'][idx] || String(idx+2);
          return (
            <section key={d} id={d} data-section={d} style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={h2Style}>{`${num}、${domainLabel}`}</h2>
                <Button size="small" type="link" icon={<SearchOutlined />}
                  onClick={() => openSide(`${domainLabel} / 溯源数据`, provenancePanel(d))}>溯源</Button>
              </div>
              {items.length === 0 ? <p style={{ color: '#999' }}>暂无数据</p> : (
                <table style={tableStyle}>
                  <thead><tr>
                    <th style={thStyle}>指标名称</th><th style={thStyle}>当前值</th>
                    <th style={thStyle}>上期值</th><th style={thStyle}>变动</th><th style={thStyle}>单位</th>
                  </tr></thead>
                  <tbody>
                    {items.map((ind: any) => (
                      <tr key={ind.indicatorKey}>
                        <td style={tdStyle}>{ind.indicatorName || '-'}</td>
                        <td style={tdStyle}>{ind.currentValue || '-'}</td>
                        <td style={tdStyle}>{ind.previousValue || '-'}</td>
                        <td style={tdStyle}>{ind.changeDesc || '-'}</td>
                        <td style={tdStyle}>{ind.dataUnit || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}

        {/* 规则命中清单 */}
        <section id="rules" data-section="rules" style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={h2Style}>{dn(domainKeys.length)}、规则命中清单</h2>
            <Button size="small" type="link" onClick={() => openSide('风险洞察', ruleDetailPanel())}>查看详情</Button>
          </div>
          <table style={tableStyle}>
            <thead><tr>
              <th style={thStyle}>编号</th><th style={thStyle}>规则名称</th><th style={thStyle}>类型</th>
              <th style={thStyle}>命中</th><th style={thStyle}>条件</th>
            </tr></thead>
            <tbody>
              {rules.map((r: any) => (
                <tr key={r.ruleCode} style={r.hit ? { background: '#fff2f0' } : {}}>
                  <td style={tdStyle}><code>{r.ruleCode}</code></td>
                  <td style={tdStyle}>{r.ruleName}</td>
                  <td style={tdStyle}><Tag>{RULE_TYPE_MAP[r.ruleType] || r.ruleType}</Tag></td>
                  <td style={tdStyle}>{r.hit ? <Tag color="red">⚠ 命中</Tag> : <span style={{ color: '#999' }}>未命中</span>}</td>
                  <td style={tdStyle}>
                    {r.conditions.map((c: any) => (
                      <span key={c.indicatorKey} style={{ marginRight: 8, fontSize: 12, color: '#888' }}>
                        {c.indicatorName || c.indicatorKey} {OPERATOR_MAP[c.operator] || c.operator} {c.threshold || ''}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 页脚 */}
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#999', fontSize: 13 }}>
          苏州银行贷后管理智能体 · 报告生成时间：{new Date().toLocaleString()}
        </div>
      </div>

      {/* 右栏：侧边面板 */}
      {sideVisible && (
        <aside style={{ width: 360, flexShrink: 0, borderLeft: '1px solid #e8e8e8', background: '#fafbfc', overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>{sideTitle}</h4>
            <Button size="small" type="text" onClick={closeSide}>✕</Button>
          </div>
          {sideContent}
        </aside>
      )}
    </div>
  </div>;
}

/** 小工具 */
const KV = ({ label, v }: { label: string; v: any }) => (
  <div style={{ display: 'flex', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
    <span style={{ color: '#888', width: 110, flexShrink: 0 }}>{label}</span>
    <span>{v || '—'}</span>
  </div>
);

const sectionStyle: React.CSSProperties = {
  padding: '24px 28px', marginBottom: 20, borderRadius: 16,
  background: 'rgba(255,255,255,.94)', border: '1px solid rgba(31,90,181,.12)',
  boxShadow: '0 20px 56px rgba(35,88,176,.08)',
};

const h2Style: React.CSSProperties = { margin: '0 0 16px', fontSize: 18, paddingBottom: 8, borderBottom: '2px solid #1664ff' };

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };

const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e8e8', color: '#888', fontWeight: 600, fontSize: 13, background: 'rgba(237,244,255,.6)' };

const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' };
