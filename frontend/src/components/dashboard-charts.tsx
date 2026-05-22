"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  Available: "#15803d",
  "Checked Out": "#2563eb",
  Maintenance: "#d97706",
  Overdue: "#c0392b",
};

const CONDITION_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#75803a",
  Fair: "#d97706",
  Poor: "#c0392b",
};

export function StatusPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} stroke="none" cx="50%" cy="50%">
            {data.map((entry) => (
              <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#75803a"} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#1c2530", border: "1px solid #4d5d2d" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 mt-2 text-xs w-full">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
            <span className="text-steel-300">{d.name}</span>
            <span className="ml-auto text-olive-200 font-mono">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConditionBarChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[180px]">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#2c3641" strokeDasharray="3 3" />
          <XAxis dataKey="name" stroke="#aeb771" fontSize={10} />
          <YAxis stroke="#aeb771" fontSize={10} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "#1c2530", border: "1px solid #4d5d2d" }} />
          <Bar dataKey="value">
            {data.map((c) => (
              <Cell key={c.name} fill={CONDITION_COLORS[c.name] ?? "#75803a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs w-full">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: CONDITION_COLORS[d.name] }} />
            <span className="text-steel-300">{d.name}</span>
            <span className="ml-auto text-olive-200 font-mono">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
