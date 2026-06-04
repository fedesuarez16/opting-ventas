"use client"

import * as React from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

interface ChartBarProps {
  data: Array<Record<string, any>>
  config: ChartConfig
  nameKey?: string
  valueKey?: string
  layout?: "vertical" | "horizontal"
  showGrid?: boolean
  showLegend?: boolean
  showValueLabels?: boolean
  axisLabelMaxLength?: number
  className?: string
}

export function ChartBar({
  data,
  config,
  nameKey = "name",
  valueKey = "value",
  layout = "vertical",
  showGrid = true,
  showLegend = false,
  showValueLabels = false,
  axisLabelMaxLength = 18,
  className,
}: ChartBarProps) {
  const truncate = (str: string) => {
    if (!str) return str
    return str.length > axisLabelMaxLength
      ? str.slice(0, axisLabelMaxLength) + "…"
      : str
  }

  const resolveColor = (d: Record<string, any>): string => {
    if (d.fill) return d.fill
    const nameVal = d[nameKey]
    if (nameVal && config[nameVal]?.color) return config[nameVal].color as string
    if (config[valueKey]?.color) return config[valueKey].color as string
    return "#1E90FF"
  }

  // layout="vertical" → standard bar chart (bars rise upward)
  // layout="horizontal" → horizontal bar chart (bars extend right)
  if (layout === "horizontal") {
    return (
      <ChartContainer config={config} className={className}>
        <BarChart data={data} layout="horizontal">
          {showGrid && <CartesianGrid strokeDasharray="3 3" horizontal={false} />}
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={120}
            tickLine={false}
            axisLine={false}
            tickFormatter={truncate}
          />
          <ChartTooltip content={<ChartTooltipContent nameKey={nameKey} />} />
          <Bar dataKey={valueKey} radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={resolveColor(entry)} />
            ))}
            {showValueLabels && <LabelList dataKey={valueKey} position="right" />}
          </Bar>
        </BarChart>
      </ChartContainer>
    )
  }

  // Default: vertical bars (bars rise upward)
  return (
    <ChartContainer config={config} className={className}>
      <BarChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
        <XAxis
          dataKey={nameKey}
          tickLine={false}
          axisLine={false}
          tickFormatter={truncate}
        />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent nameKey={nameKey} />} />
        <Bar dataKey={valueKey} radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={resolveColor(entry)} />
          ))}
          {showValueLabels && <LabelList dataKey={valueKey} position="top" />}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
