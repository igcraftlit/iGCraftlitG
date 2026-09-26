/**
 * 文件路径：apps/web/src/iGM_Components/iGM_StatsCharts/iGM_StatsCharts.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Dashboard、G_StatsDetail
 * 模块：iGM_StatsCharts
 * 作用：运营图表封装（recharts），极简配色，无装饰动画
 * 内容：折线图、柱状图、饼图
 * 说明：recharts 依赖 window/ResizeObserver，必须由调用方用
 *       next/dynamic({ ssr: false }) 引入，避免构建期崩溃
 */

// 导入依赖 //
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { iGM_StatsTrendPoint } from "../../iGM_Services/iGM_StatsClient";

// 类型定义 //
export interface iGM_ChartPieItem {
  name: string;
  value: number;
}

// 核心逻辑 //
/** 极简配色：使用 CSS 变量适配明暗模式 */
const iGM_ChartColors = {
  primary: "var(--igm-accent)",
  secondary: "var(--igm-success)",
  tertiary: "var(--igm-warning)",
  grid: "var(--igm-border)",
  text: "var(--igm-text-muted)",
};

/** 饼图填充色板（按序取色） */
const iGM_PiePalette = [
  "var(--igm-accent)",
  "var(--igm-success)",
  "var(--igm-warning)",
  "var(--igm-danger)",
  "var(--igm-text-subtle)",
];

/** 折线图（单序列） */
export function iGM_StatsLineChart({
  data,
  dataKey,
  name,
}: {
  data: iGM_StatsTrendPoint[];
  dataKey: string;
  name: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={iGM_ChartColors.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fill: iGM_ChartColors.text, fontSize: 11 }}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis tick={{ fill: iGM_ChartColors.text, fontSize: 11 }} width={30} />
        <Tooltip
          contentStyle={{
            background: "var(--igm-surface)",
            border: "1px solid var(--igm-border)",
            borderRadius: "var(--igm-radius)",
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--igm-text)" }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={iGM_ChartColors.primary}
          strokeWidth={2}
          dot={false}
          name={name}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 柱状图（单序列） */
export function iGM_StatsBarChart({
  data,
  dataKey,
  name,
}: {
  data: iGM_StatsTrendPoint[];
  dataKey: string;
  name: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={iGM_ChartColors.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fill: iGM_ChartColors.text, fontSize: 11 }}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis tick={{ fill: iGM_ChartColors.text, fontSize: 11 }} width={30} />
        <Tooltip
          contentStyle={{
            background: "var(--igm-surface)",
            border: "1px solid var(--igm-border)",
            borderRadius: "var(--igm-radius)",
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--igm-text)" }}
        />
        <Bar dataKey={dataKey} fill={iGM_ChartColors.primary} radius={[4, 4, 0, 0]} name={name} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 饼图 */
export function iGM_StatsPieChart({
  data,
  nameKey,
  dataKey,
}: {
  data: iGM_ChartPieItem[];
  nameKey: string;
  dataKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell
              key={index}
              fill={iGM_PiePalette[index % iGM_PiePalette.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--igm-surface)",
            border: "1px solid var(--igm-border)",
            borderRadius: "var(--igm-radius)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: iGM_ChartColors.text }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// 导出 //
export default {
  iGM_StatsLineChart,
  iGM_StatsBarChart,
  iGM_StatsPieChart,
};
