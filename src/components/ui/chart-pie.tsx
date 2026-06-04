"use client"

import * as React from "react"
import { PieChart, Pie, Cell, Label } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"

interface ChartPieProps {
  data: Array<{ name: string; value: number; fill?: string }>
  config: ChartConfig
  innerRadius?: number
  outerRadius?: number
  showLegend?: boolean
  showLabels?: boolean
  centerLabel?: string | number
  centerSubLabel?: string
  className?: string
}

export function ChartPie({
  data,
  config,
  innerRadius = 60,
  outerRadius = 100,
  showLegend = true,
  showLabels = false,
  centerLabel,
  centerSubLabel,
  className,
}: ChartPieProps) {
  const resolveColor = (d: { name: string; fill?: string }): string => {
    if (d.fill) return d.fill
    if (config[d.name]?.color) return config[d.name].color as string
    return "#94A3B8"
  }

  return (
    <ChartContainer config={config} className={className}>
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={resolveColor(entry)} />
          ))}
          {centerLabel !== undefined && (
            <Label
              position="center"
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                const cx = viewBox.cx as number
                const cy = viewBox.cy as number
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={cx}
                      y={centerSubLabel ? cy - 8 : cy}
                      fontSize="24"
                      fontWeight="bold"
                      fill="currentColor"
                    >
                      {centerLabel}
                    </tspan>
                    {centerSubLabel && (
                      <tspan x={cx} y={cy + 16} fontSize="12" fill="#94A3B8">
                        {centerSubLabel}
                      </tspan>
                    )}
                  </text>
                )
              }}
            />
          )}
        </Pie>
        {showLegend && (
          <ChartLegend
            verticalAlign="bottom"
            content={<ChartLegendContent />}
          />
        )}
      </PieChart>
    </ChartContainer>
  )
}
