'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export const formatDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

const AXIS = { stroke: 'var(--chart-grid)', tick: { fill: 'var(--muted-foreground)', fontSize: 11, style: { fontVariantNumeric: 'tabular-nums' } }, tickLine: false };

interface TooltipEntry {
  name?: string | number;
  value?: number | string | null;
  color?: string;
  dataKey?: string | number;
}

/** Values lead, series names follow, keyed with a short line in the series colour. */
function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatLabel?: (label: string) => string;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-border px-3 py-2 text-xs shadow-glow">
      <p className="mb-1 text-muted-foreground">{formatLabel ? formatLabel(String(label)) : label}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
            <span className="font-semibold text-foreground">
              {entry.value === null || entry.value === undefined ? '—' : formatValue ? formatValue(Number(entry.value)) : Number(entry.value).toLocaleString()}
            </span>
            <span className="text-muted-foreground">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Direct label on the last point only (selective labelling); text uses ink, not the series colour. */
function endLabel(count: number, format: (v: number) => string) {
  return function EndLabel(props: { x?: unknown; y?: unknown; value?: unknown; index?: number }) {
    if (props.index !== count - 1 || props.value === undefined || props.value === null) return null;
    return (
      <text x={Number(props.x) + 8} y={Number(props.y)} dy={4} fontSize={11} fill="var(--foreground)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {format(Number(props.value))}
      </text>
    );
  };
}

export function VolumeChart({ data }: { data: { day: string; inbound: number; outbound: number }[] }) {
  return (
    <div className="space-y-3">
      <ul className="flex gap-4 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" aria-hidden /> Received
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-2)]" aria-hidden /> Sent
        </li>
      </ul>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 44, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="day" tickFormatter={formatDay} minTickGap={24} {...AXIS} />
          <YAxis allowDecimals={false} tickFormatter={(v: number) => compact.format(v)} width={44} {...AXIS} axisLine={false} />
          <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }} content={(p) => <ChartTooltip {...(p as object)} formatLabel={formatDay} />} />
          <Line type="monotone" dataKey="inbound" name="Received" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} label={endLabel(data.length, (v) => compact.format(v))} isAnimationActive={false} />
          <Line type="monotone" dataKey="outbound" name="Sent" stroke="var(--chart-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} label={endLabel(data.length, (v) => compact.format(v))} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ResponseTimeChart({ data }: { data: { day: string; medianMinutes: number | null }[] }) {
  const formatMinutes = (v: number) => (v >= 60 ? `${(v / 60).toFixed(1)}h` : `${Math.round(v)}m`);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 44, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tickFormatter={formatDay} minTickGap={24} {...AXIS} />
        <YAxis tickFormatter={formatMinutes} width={44} {...AXIS} axisLine={false} />
        <Tooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
          content={(p) => <ChartTooltip {...(p as object)} formatLabel={formatDay} formatValue={formatMinutes} />}
        />
        <Line
          type="monotone"
          dataKey="medianMinutes"
          name="Median first response"
          stroke="var(--chart-1)"
          strokeWidth={2}
          connectNulls
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data }: { data: { label: string; cost: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44 + 24)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" tickFormatter={(v: number) => `$${compact.format(v)}`} {...AXIS} />
        <YAxis type="category" dataKey="label" width={104} {...AXIS} axisLine={false} />
        <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={(p) => <ChartTooltip {...(p as object)} formatValue={(v) => `$${v.toFixed(2)}`} />} />
        <Bar dataKey="cost" name="Estimated cost" fill="var(--chart-1)" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey="cost" position="right" formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} style={{ fill: 'var(--foreground)', fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CsatChart({ data }: { data: { score: number; responses: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="score" tickFormatter={(v: number) => `${v}★`} {...AXIS} />
        <YAxis allowDecimals={false} tickFormatter={(v: number) => compact.format(v)} width={44} {...AXIS} axisLine={false} />
        <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={(p) => <ChartTooltip {...(p as object)} formatLabel={(l) => `${l} star${l === '1' ? '' : 's'}`} />} />
        <Bar dataKey="responses" name="Responses" fill="var(--chart-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          <LabelList dataKey="responses" position="top" style={{ fill: 'var(--foreground)', fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
