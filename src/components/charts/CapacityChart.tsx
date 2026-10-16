import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CapacityBucket } from "../../domain/planningVersion";

interface Props {
  buckets: readonly CapacityBucket[];
  loadLabel: string;
  availableLabel: string;
  normalLabel: string;
}

/** Load versus available capacity per period for one work centre. */
export function CapacityChart({ buckets, loadLabel, availableLabel, normalLabel }: Props) {
  const data = buckets.map((bucket) => ({
    period: bucket.period,
    load: Math.round(bucket.loadHours * 10) / 10,
    available: Math.round(bucket.availableHours * 10) / 10,
    normal: Math.round(bucket.normalCapacityHours * bucket.capacityFactor * 10) / 10,
    overloaded: bucket.balanceHours < 0,
  }));
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
          <XAxis dataKey="period" />
          <YAxis unit=" h" width={56} />
          <Tooltip />
          <Legend />
          <Bar dataKey="load" name={loadLabel} fill="#4f81bd" isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.period} fill={entry.overloaded ? "#b42318" : "#4f81bd"} />
            ))}
          </Bar>
          <Line type="stepAfter" dataKey="normal" name={normalLabel} stroke="#8a5a00" strokeDasharray="5 4" dot={false} />
          <Line type="stepAfter" dataKey="available" name={availableLabel} stroke="#b42318" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
