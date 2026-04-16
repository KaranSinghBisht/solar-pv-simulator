import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import type { PVCurveResult } from '../types/simulation';

interface Props {
  curve: PVCurveResult;
  operating?: { v: number; i: number };
  title?: string;
}

export default function IVCurveChart({ curve, operating, title }: Props) {
  const data = curve.iv.map((p) => ({ v: Number(p.v.toFixed(3)), i: Number(p.i.toFixed(4)) }));
  return (
    <div className="chart-block">
      <h3>{title ?? 'I–V curve'}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#1e2a44" strokeDasharray="3 3" />
          <XAxis
            dataKey="v"
            type="number"
            domain={[0, 'dataMax']}
            tick={{ fill: '#9fb4d9', fontSize: 11 }}
            label={{ value: 'Voltage (V)', position: 'insideBottom', offset: -2, fill: '#8aa1c4', fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: '#9fb4d9', fontSize: 11 }}
            label={{ value: 'Current (A)', angle: -90, position: 'insideLeft', fill: '#8aa1c4', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: '#101a2e', border: '1px solid #2b3a5e', fontSize: 12 }}
            labelFormatter={(v) => `V = ${Number(v).toFixed(2)} V`}
            formatter={(val: number) => `${val.toFixed(3)} A`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line name="I(V)" dataKey="i" stroke="#5fb8ff" dot={false} strokeWidth={2} isAnimationActive={false} />
          <ReferenceDot x={curve.vmp} y={curve.imp} r={5} fill="#ffbd4a" stroke="#ffe6a8" />
          {operating ? (
            <ReferenceDot x={operating.v} y={operating.i} r={5} fill="#46e8a5" stroke="#ffffff" />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
