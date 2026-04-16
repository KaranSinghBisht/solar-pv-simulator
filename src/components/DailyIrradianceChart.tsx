import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  samples: { hour: number; poa: number }[];
  currentHour: number;
}

export default function DailyIrradianceChart({ samples, currentHour }: Props) {
  const data = samples.map((s) => ({
    hour: s.hour,
    poa: Number(s.poa.toFixed(1)),
  }));
  return (
    <div className="chart-block">
      <h3>Daily POA irradiance profile</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="poaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffbd4a" stopOpacity={0.75} />
              <stop offset="100%" stopColor="#ffbd4a" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e2a44" strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 24]}
            ticks={[0, 4, 8, 12, 16, 20, 24]}
            tick={{ fill: '#9fb4d9', fontSize: 11 }}
            label={{ value: 'Solar time (h)', position: 'insideBottom', offset: -2, fill: '#8aa1c4', fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: '#9fb4d9', fontSize: 11 }}
            label={{ value: 'POA (W/m²)', angle: -90, position: 'insideLeft', fill: '#8aa1c4', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: '#101a2e', border: '1px solid #2b3a5e', fontSize: 12 }}
            labelFormatter={(h) => `t = ${Number(h).toFixed(2)} h`}
            formatter={(v: number) => `${v.toFixed(0)} W/m²`}
          />
          <ReferenceLine x={currentHour} stroke="#46e8a5" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="poa" stroke="#ffbd4a" fill="url(#poaFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
