import React, { useState, useMemo } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, ScatterChart, Scatter, ZAxis, Cell, ReferenceLine, LabelList
} from 'recharts';
import {
  TrendingUp, Target, AlertCircle, MapPin, CheckCircle2, Bot, Loader2, Printer, 
  Upload, Building, UserCheck, BarChart3, PieChart, Users, LayoutDashboard, FileSpreadsheet
} from 'lucide-react';

/**
 * [医药销售数据看板 - 生产级可复用模板]
 * 功能特性：
 * 1. 自动解析：支持标准医药 CSV 数据导入，自动计算 YTD、YoY、达成率
 * 2. 交互增强：趋势图高亮聚焦逻辑，四象限气泡动态中心化
 * 3. 深度下钻：从“西区整体”平滑穿透至“TAM 代表”层级
 * 4. 视觉规范：统一保留 1 位小数，适配移动端/PC端
 */

const PRODUCT_MAP = {
  'ALL': '整体产品管线',
  'HERCEPTIN_IV': 'HERCEPTIN IV',
  'HERCEPTIN_SC': 'HERCEPTIN SC',
  'ITOVEBI': 'ITOVEBI',
  'KADCYLA': 'KADCYLA',
  'PERJETA': 'PERJETA',
  'PHESGO_SMALL': 'PHESGO 赫小妥 (600/600mg)',
  'PHESGO_LARGE': 'PHESGO 赫大妥 (1200/600mg)'
};

const LEL_OPTIONS = ["西区整体", "陈小竞", "邓丽娅", "韩雪泉", "马晓琴", "石扬", "王纳舟", "巫疆", "杨成", "张海荣", "章海"];

const LEL_COLORS = {
  "陈小竞": "#0066CC", "邓丽娅": "#10b981", "韩雪泉": "#f59e0b", "马晓琴": "#ef4444", "石扬": "#8b5cf6",
  "王纳舟": "#ec4899", "巫疆": "#06b6d4", "杨成": "#f97316", "张海荣": "#64748b", "章海": "#14b8a6"
};

const SUB_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1"];

export default function PharmaceuticalSalesDashboard() {
  const [rawData, setRawData] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [activeProductKey, setActiveProductKey] = useState('ALL');
  const [activeL1Key, setActiveL1Key] = useState('西区整体');
  const [hoveredLine, setHoveredLine] = useState(null);

  // 数据解析引擎
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim());
      const parsedData = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = []; let inQuotes = false; let currentVal = '';
        for (let char of lines[i]) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { values.push(currentVal); currentVal = ''; }
          else currentVal += char;
        }
        values.push(currentVal);
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = values[idx] ? values[idx].replace(/"/g, '').trim() : ''; });
        if (LEL_OPTIONS.includes(obj['l1_name'])) {
          parsedData.push({
            yq: obj['yq'], brand_ta: obj['brand_ta'], province: obj['province'],
            l1_name: obj['l1_name'], rep_name: obj['rep_name'] || '未知代表', 
            ins_name: obj['ins_name'],
            sales_value: parseFloat(obj['sales_value']) || 0,
            target_value: parseFloat(obj['target_value']) || 0,
            sales_value_ly: parseFloat(obj['sales_value_ly']) || 0
          });
        }
      }
      setRawData(parsedData); setIsDataLoaded(true);
    };
    reader.readAsText(file, 'GBK');
  };

  // 核心计算逻辑
  const data = useMemo(() => {
    if (!rawData.length) return null;
    let filtered = rawData;
    if (activeProductKey !== 'ALL') {
      filtered = filtered.filter(row => {
        const ta = (row.brand_ta || '').toUpperCase();
        if (activeProductKey === 'HERCEPTIN_IV') return ta.includes('HERCEPTIN IV');
        if (activeProductKey === 'HERCEPTIN_SC') return ta.includes('HERCEPTIN SC');
        if (activeProductKey === 'ITOVEBI') return ta.includes('ITOVEBI');
        if (activeProductKey === 'KADCYLA') return ta.includes('KADCYLA');
        if (activeProductKey === 'PERJETA') return ta.includes('PERJETA');
        if (activeProductKey === 'PHESGO_SMALL') return ta.includes('PHESGO') && (row.package_name || '').includes('600/600');
        if (activeProductKey === 'PHESGO_LARGE') return ta.includes('PHESGO') && (row.package_name || '').includes('1200/600');
        return false;
      });
    }

    const isGlobal = activeL1Key === '西区整体';
    const scopeData = isGlobal ? filtered : filtered.filter(r => r.l1_name === activeL1Key);

    // 聚合各维度
    const qMap = { '2025Q1': { name: 'Q1', sales: 0, target: 0, s_ly: 0 }, '2025Q2': { name: 'Q2', sales: 0, target: 0, s_ly: 0 }, '2025Q3': { name: 'Q3', sales: 0, target: 0, s_ly: 0 }, '2025Q4': { name: 'Q4', sales: 0, target: 0, s_ly: 0 } };
    const drillMap = { '2025Q1': { quarter: 'Q1' }, '2025Q2': { quarter: 'Q2' }, '2025Q3': { quarter: 'Q3' }, '2025Q4': { quarter: 'Q4' } };
    const subMap = {}; const pMap = {}; const hMap = {};
    let [ts, tt, tly] = [0, 0, 0];

    scopeData.forEach(r => {
      const subName = isGlobal ? r.l1_name : r.rep_name;
      ts += r.sales_value; tt += r.target_value; tly += r.sales_value_ly;
      if (qMap[r.yq]) { qMap[r.yq].sales += r.sales_value; qMap[r.yq].target += r.target_value; qMap[r.yq].s_ly += r.sales_value_ly; }
      if (drillMap[r.yq]) drillMap[r.yq][subName] = (drillMap[r.yq][subName] || 0) + r.sales_value;
      if (!subMap[subName]) subMap[subName] = { name: subName, sales_ytd: 0, target_ytd: 0, s_ly: 0 };
      subMap[subName].sales_ytd += r.sales_value; subMap[subName].target_ytd += r.target_value; subMap[subName].s_ly += r.sales_value_ly;
      if (!pMap[r.province]) pMap[r.province] = { name: r.province, sales_ytd: 0, s_ly: 0 };
      pMap[r.province].sales_ytd += r.sales_value; pMap[r.province].s_ly += r.sales_value_ly;
      if (!hMap[r.ins_name]) hMap[r.ins_name] = { name: r.ins_name, sales_ytd: 0, target_ytd: 0 };
      hMap[r.ins_name].sales_ytd += r.sales_value; hMap[r.ins_name].target_ytd += r.target_value;
    });

    const formatMetrics = (item) => {
      const achv = item.target_ytd > 0 ? (item.sales_ytd / item.target_ytd * 100) : 0;
      const yoy = item.s_ly > 0 ? ((item.sales_ytd - item.s_ly) / item.s_ly * 100) : 0;
      return { ...item, achv_num: parseFloat(achv.toFixed(1)), yoy_num: parseFloat(yoy.toFixed(1)), achv: achv.toFixed(1), yoy: yoy.toFixed(1) };
    };

    const subList = Object.values(subMap).map(formatMetrics).sort((a,b) => b.sales_ytd - a.sales_ytd);
    const avgAchv = subList.reduce((s,i) => s + i.achv_num, 0) / (subList.length || 1);
    const avgYoy = subList.reduce((s,i) => s + i.yoy_num, 0) / (subList.length || 1);

    return {
      QUARTER_DATA: Object.values(qMap).map(q => ({ ...q, achv_num: q.target > 0 ? (q.sales/q.target*100) : 0, yoy_num: q.s_ly > 0 ? ((q.sales-q.s_ly)/q.s_ly*100) : 0 })),
      DRILL_TREND_DATA: Object.values(drillMap),
      SUB_LEVEL_LIST: subList,
      PROVINCE_DATA: Object.values(pMap).map(p => { const res = formatMetrics({...p, target_ytd:0}); res.displayName = res.name.replace('自治区',''); return res; }).sort((a,b)=>b.sales_ytd-a.sales_ytd),
      HOSPITAL_DATA: Object.values(hMap).map(h => formatMetrics({...h, s_ly:0})).sort((a,b)=>b.sales_ytd-a.sales_ytd),
      metrics: { sales_ytd: ts, achv: (tt>0 ? ts/tt*100 : 0).toFixed(1), yoy: (tly>0 ? (ts-tly)/tly*100 : 0).toFixed(1), q3: qMap['2025Q3']?.sales || 0 },
      stats: { avgAchv: parseFloat(avgAchv.toFixed(1)), avgYoy: parseFloat(avgYoy.toFixed(1)) }
    };
  }, [rawData, activeProductKey, activeL1Key]);

  if (!isDataLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 font-sans">
        <div className="bg-white p-12 rounded-3xl shadow-xl border border-slate-100 text-center max-w-lg">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Upload className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">医药销售分析系统</h1>
          <p className="text-slate-500 mb-8 text-sm">请上传您的业务 CSV 数据文件，系统将自动生成可视化看板。</p>
          <label className="block w-full py-4 bg-blue-600 text-white rounded-xl font-bold cursor-pointer hover:bg-blue-700 transition-all shadow-md">
            选择文件导入
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 导航与过滤器 */}
        <div className="bg-white p-4 rounded-2xl shadow-sm space-y-4 border border-slate-100 print:hidden">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRODUCT_MAP).map(k => (
                <button key={k} onClick={() => setActiveProductKey(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${activeProductKey === k ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{PRODUCT_MAP[k]}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-emerald-700 shadow-md transition-all active:scale-95"><FileSpreadsheet size={14}/> 重新导入数据 <input type="file" className="hidden" onChange={handleFileUpload} /></label>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar border-t pt-3">
            {LEL_OPTIONS.map(n => (
              <button key={n} onClick={() => setActiveL1Key(n)} className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${activeL1Key === n ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 hover:bg-indigo-50'}`}>{n}</button>
            ))}
          </div>
        </div>

        {/* 核心 KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-blue-500">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">YTD 累计营收</h3>
            <div className="text-3xl font-black text-blue-600 tracking-tighter">{data.metrics.sales_ytd.toLocaleString(undefined, {maximumFractionDigits:1})}</div>
            <div className="mt-4 flex justify-between text-xs font-bold border-t pt-2 text-slate-500">
               <span>达成: <span className="text-blue-600">{data.metrics.achv}%</span></span>
               <span>同比: <span className={parseFloat(data.metrics.yoy) >= 0 ? 'text-green-600' : 'text-red-600'}>{data.metrics.yoy}%</span></span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-emerald-500">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Q3 业务实绩</h3>
            <div className="text-3xl font-black text-slate-800 tracking-tighter">{data.metrics.q3.toLocaleString(undefined, {maximumFractionDigits:1})}</div>
            <div className="mt-4 text-[10px] font-bold text-slate-400 border-t pt-2 uppercase">Current Scope Statistics</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-indigo-500">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">领跑区域</h3>
            <div className="text-3xl font-black text-indigo-600 tracking-tighter truncate">{data.PROVINCE_DATA[0]?.displayName || '-'}</div>
            <div className="mt-4 text-[10px] font-bold text-indigo-600 border-t pt-2 font-mono uppercase">Top Performing Region</div>
          </div>
        </div>

        {/* 走势分析 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-black mb-6 border-b pb-4 flex items-center gap-2"><LayoutDashboard className="text-blue-600"/> 业务季度走势分析：实际 vs 预估</h2>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.QUARTER_DATA} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 700}} axisLine={false} />
                <YAxis yAxisId="left" tick={{fontSize: 11}} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" unit="%" tick={{fontSize: 11}} axisLine={false} />
                <Tooltip formatter={(v) => v.toLocaleString(undefined, {maximumFractionDigits: 1})} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}} />
                <Bar yAxisId="left" dataKey="sales" name="实际营收" fill="#0066CC" barSize={40} radius={[6,6,0,0]} />
                <Bar yAxisId="left" dataKey="target" name="指标预估" fill="#93c5fd" barSize={18} radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="achv_num" name="达成率 (%)" stroke="#10b981" strokeWidth={4} dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 矩阵分析 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-indigo-400">
            <h2 className="text-lg font-black text-indigo-900 mb-6 border-b pb-4 flex items-center gap-2"><BarChart3 size={20}/> 业绩趋势高亮对比 (鼠标悬停)</h2>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.DRILL_TREND_DATA} onMouseLeave={() => setHoveredLine(null)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                  <XAxis dataKey="quarter" tick={{fontSize: 11}} axisLine={false} />
                  <YAxis fontSize={11} axisLine={false} />
                  <Tooltip formatter={(v) => v.toLocaleString(undefined, {maximumFractionDigits: 1})} />
                  <Legend onMouseEnter={(o) => setHoveredLine(o.value)} onMouseLeave={() => setHoveredLine(null)} wrapperStyle={{fontSize: '10px'}} iconType="circle" />
                  {data.SUB_LEVEL_LIST.slice(0, 10).map((item, idx) => (
                    <Line 
                      key={item.name} name={item.name} type="monotone" dataKey={item.name} 
                      stroke={activeL1Key === '西区整体' ? LEL_COLORS[item.name] : SUB_COLORS[idx % SUB_COLORS.length]} 
                      strokeWidth={hoveredLine === item.name ? 5 : 2.5} 
                      strokeOpacity={hoveredLine === null || hoveredLine === item.name ? 1 : 0.1}
                      dot={hoveredLine === item.name ? { r: 5 } : { r: 1.5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-orange-400">
            <h2 className="text-lg font-black text-orange-900 mb-6 border-b pb-4 flex items-center gap-2"><PieChart size={20}/> 绩效分布矩阵：达成 vs 增长率</h2>
            <div className="h-[380px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 35, right: 35, bottom: 25, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="achv_num" name="达成率" unit="%" domain={['auto', 'auto']} label={{ value: '达成率 (%)', position: 'insideBottom', offset: -5, fontSize: 10, fontWeight: 'bold' }} />
                  <YAxis type="number" dataKey="yoy_num" name="增长率" unit="%" domain={['auto', 'auto']} label={{ value: '同比增长 (%)', angle: -90, position: 'insideLeft', fontSize: 10, fontWeight: 'bold' }} />
                  <ZAxis type="number" dataKey="sales_ytd" range={[150, 4500]} />
                  <ReferenceLine x={data.stats.avgAchv} stroke="#94a3b8" strokeDasharray="5 5" label={{ position: 'top', value: `均值:${data.stats.avgAchv}%`, fontSize: 10, fill: '#94a3b8' }} />
                  <ReferenceLine y={data.stats.avgYoy} stroke="#94a3b8" strokeDasharray="5 5" label={{ position: 'right', value: `均值:${data.stats.avgYoy}%`, fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border shadow-2xl rounded-xl border-slate-100">
                          <p className="font-black text-slate-800 border-b pb-1 mb-2 text-sm">{d.name}</p>
                          <p className="text-[11px] text-blue-600 font-bold">营收: {d.sales_ytd.toLocaleString(undefined, {maximumFractionDigits:1})}</p>
                          <p className="text-[11px] text-green-600 font-bold">达成率: {d.achv}%</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Scatter data={data.SUB_LEVEL_LIST} animationDuration={1000}>
                    <LabelList dataKey="name" position="top" style={{fontSize: '10px', fill: '#475569', fontWeight: 800, pointerEvents: 'none'}} />
                    {data.SUB_LEVEL_LIST.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={activeL1Key === '西区整体' ? LEL_COLORS[entry.name] : SUB_COLORS[index % SUB_COLORS.length]} fillOpacity={0.7} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 详细列表 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-violet-500 overflow-hidden">
          <h2 className="text-lg font-black mb-5 flex items-center gap-2 text-violet-900"><UserCheck size={22}/> 实绩明细排行榜</h2>
          <div className="overflow-x-auto max-h-[500px] no-scrollbar">
            <table className="w-full text-sm text-left relative border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="bg-slate-50 text-slate-500 font-black text-[10px] uppercase border-y border-slate-100">
                  <th className="p-4 text-center w-16">排名</th>
                  <th className="p-4">业务单元/人员</th>
                  <th className="p-4 text-right">YTD 累计</th>
                  <th className="p-4 text-right">达成率</th>
                  <th className="p-4 text-right">同比 (YoY)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.SUB_LEVEL_LIST.map((row, i) => (
                  <tr key={i} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="p-4 text-center text-slate-400 font-black">{i+1}</td>
                    <td className="p-4 font-black flex items-center gap-2 text-slate-800">
                       <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: activeL1Key === '西区整体' ? LEL_COLORS[row.name] : SUB_COLORS[i % SUB_COLORS.length]}}></span>
                       {row.name}
                    </td>
                    <td className="p-4 text-right font-black text-slate-900">{row.sales_ytd.toLocaleString(undefined, {maximumFractionDigits: 1})}</td>
                    <td className={`p-4 text-right font-black ${row.achv_num >= 100 ? 'text-green-600' : 'text-orange-500'}`}>{row.achv}%</td>
                    <td className={`p-4 text-right font-black ${row.yoy_num >= 0 ? 'text-green-600' : 'text-red-600'}`}>{row.yoy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="py-12 text-center border-t border-slate-200">
           <p className="text-slate-400 text-[10px] font-black tracking-widest uppercase opacity-60">Roche BC Intelligence | Auto-Update Engine Active</p>
        </div>
      </div>
    </div>
  );
}