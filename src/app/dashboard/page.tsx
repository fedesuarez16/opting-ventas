'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from "../components/AppLayout";
import { Lead } from "../types";
import { getAllLeads } from "../services/leadService";
import { getLlamadasInRange, LlamadaAgendada } from "../services/llamadasService";
import { ChartAreaInteractive } from "@/components/ui/chart-area-interactive";
import { ChartPie } from "@/components/ui/chart-pie";
import { ChartBar } from "@/components/ui/chart-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from 'next/link';

// ===== Colores y constantes globales del dashboard =====
const ESTADO_COLORS: Record<string, string> = {
  'frío':     '#4169E1',
  'tibio':    '#FFA500',
  'caliente': '#FF4500',
  'llamada':  '#10B981',
  'visita':   '#3B82F6',
  'inicial':  '#94A3B8',
  'frio':     '#4169E1',
};
const NEUTRAL_GRAY = '#94A3B8';
const CHART_COLORS = [
  "#1E90FF", "#FFA500", "#4169E1", "#FF4500", "#10B981",
  "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6",
  "#F97316", "#6366F1",
];

// ===== Helper: zona normalization (inline, no external dep) =====
const normalizeZona = (zona: string): string => {
  return zona
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
};

// ===== Helpers: filtros de fechas y semanas ISO =====

// Clone before setHours — never mutate state Dates
const filterLeadsByDate = (leads: Lead[], from: Date, to: Date): Lead[] => {
  const fromMs = new Date(from).setHours(0, 0, 0, 0);
  const toMs   = new Date(to).setHours(23, 59, 59, 999);
  return leads.filter(l => {
    const d = new Date(l.fechaContacto || l.created_at || '').getTime();
    return !isNaN(d) && d >= fromMs && d <= toMs;
  });
};

const filterLlamadasByDate = (llamadas: LlamadaAgendada[], from: Date, to: Date): LlamadaAgendada[] => {
  const fromMs = new Date(from).setHours(0, 0, 0, 0);
  const toMs   = new Date(to).setHours(23, 59, 59, 999);
  return llamadas.filter(l => {
    const d = new Date(l.created_at).getTime();
    return !isNaN(d) && d >= fromMs && d <= toMs;
  });
};

const filterLlamadasByInicio = (llamadas: LlamadaAgendada[], from: Date, to: Date): LlamadaAgendada[] => {
  const fromMs = new Date(from).setHours(0, 0, 0, 0);
  const toMs   = new Date(to).setHours(23, 59, 59, 999);
  return llamadas.filter(l => {
    const d = new Date(l.inicio || l.created_at || '').getTime();
    return !isNaN(d) && d >= fromMs && d <= toMs;
  });
};

// Returns the Monday of the ISO week containing d
const getISOWeekStart = (d: Date): Date => {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

// Returns ISO week number (1–53)
const getISOWeek = (d: Date): number => {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Generates one ISO date string per calendar day in [from, to]
const eachDayInRange = (from: Date, to: Date): string[] => {
  const days: string[] = [];
  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to);   end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

// Parses <input type="date"> value as LOCAL date (avoids UTC midnight → day-before bug)
const parseInputDate = (v: string): Date => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Formats a Date as YYYY-MM-DD for <input type="date"> value prop
const toInputValue = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ===== Helper: empty state para charts sin datos =====
const EmptyChart = ({ message = 'Sin datos en el período' }: { message?: string }) => (
  <div className="flex h-[350px] w-full items-center justify-center bg-slate-50 rounded-lg text-sm text-slate-500">
    {message}
  </div>
);

type Preset = '7d' | '30d' | '90d' | 'todo' | 'custom';

export default function Page() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [llamadas, setLlamadasData] = useState<LlamadaAgendada[]>([]);
  const [isLoadingLlamadas, setIsLoadingLlamadas] = useState(true);
  const [preset, setPreset] = useState<Preset>('30d');
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d;
  });
  const [dateTo, setDateTo] = useState<Date>(() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d;
  });

  const earliestDate = useMemo(() => {
    if (!leads.length) { const d = new Date(); d.setDate(d.getDate() - 30); return d; }
    return leads.reduce((min, l) => {
      const d = new Date(l.fechaContacto || l.created_at || '');
      return !isNaN(d.getTime()) && d < min ? d : min;
    }, new Date());
  }, [leads]);

  const applyPreset = (p: Preset) => {
    const now = new Date();
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    setPreset(p);
    setDateTo(to);
    if (p === '7d')  { const f = new Date(now); f.setDate(f.getDate() - 6);  f.setHours(0, 0, 0, 0); setDateFrom(f); }
    if (p === '30d') { const f = new Date(now); f.setDate(f.getDate() - 29); f.setHours(0, 0, 0, 0); setDateFrom(f); }
    if (p === '90d') { const f = new Date(now); f.setDate(f.getDate() - 89); f.setHours(0, 0, 0, 0); setDateFrom(f); }
    if (p === 'todo') { const f = new Date(earliestDate); f.setHours(0, 0, 0, 0); setDateFrom(f); }
  };

  useEffect(() => {
    const now = new Date();
    const past90 = new Date(now); past90.setDate(past90.getDate() - 90);
    const future7 = new Date(now); future7.setDate(future7.getDate() + 7);

    setIsLoading(true);
    setIsLoadingLlamadas(true);

    Promise.allSettled([
      getAllLeads()
        .then((d) => { setLeads(d); setIsLoading(false); })
        .catch((e) => { console.error('[dashboard] leads error:', e); setIsLoading(false); }),
      getLlamadasInRange(past90, future7)
        .then((d) => { setLlamadasData(d); setIsLoadingLlamadas(false); })
        .catch((e) => { console.error('[dashboard] llamadas error:', e); setIsLoadingLlamadas(false); }),
    ]);
  }, []);

  // Agrupar leads por fecha
  const leadsByDate = useMemo(() => {
    const dates = eachDayInRange(dateFrom, dateTo);
    const grouped: Record<string, { total: number; tibios: number; frios: number; calientes: number }> = {};
    dates.forEach(d => { grouped[d] = { total: 0, tibios: 0, frios: 0, calientes: 0 }; });

    const filtered = filterLeadsByDate(leads, dateFrom, dateTo);
    filtered.forEach(lead => {
      const dateStr = new Date(lead.fechaContacto || lead.created_at || '').toISOString().split('T')[0];
      if (grouped[dateStr] !== undefined) {
        grouped[dateStr].total++;
        if (lead.estado === 'tibio') grouped[dateStr].tibios++;
        else if (lead.estado === 'frío') grouped[dateStr].frios++;
        else if (lead.estado === 'caliente') grouped[dateStr].calientes++;
      }
    });

    return dates.map(date => ({
      date,
      leads: grouped[date].total,
      tibios: grouped[date].tibios,
      frios: grouped[date].frios,
      calientes: grouped[date].calientes,
    }));
  }, [leads, dateFrom, dateTo]);

  // Obtener todas las campañas únicas de propiedad_interes
  const uniqueCampaigns = useMemo(() => {
    const campaigns = new Set<string>();
    leads.forEach(lead => {
      if (lead.propiedad_interes && lead.propiedad_interes.trim() !== '') {
        campaigns.add(lead.propiedad_interes.trim());
      }
    });
    return Array.from(campaigns).sort();
  }, [leads]);

  // Agrupar leads por campaña y fecha
  const leadsByCampaign = useMemo(() => {
    const dates = eachDayInRange(dateFrom, dateTo);

    // Crear estructura para cada campaña
    const campaignData: Record<string, Record<string, number>> = {};
    uniqueCampaigns.forEach(campaign => {
      campaignData[campaign] = {};
      dates.forEach(date => { campaignData[campaign][date] = 0; });
    });

    // Contar leads por campaña y fecha (sólo en el rango)
    const filtered = filterLeadsByDate(leads, dateFrom, dateTo);
    filtered.forEach(lead => {
      if (lead.propiedad_interes && lead.propiedad_interes.trim() !== '') {
        const campaign = lead.propiedad_interes.trim();
        const dateStr = new Date(lead.fechaContacto || lead.created_at || '').toISOString().split('T')[0];
        if (campaignData[campaign] && campaignData[campaign][dateStr] !== undefined) {
          campaignData[campaign][dateStr]++;
        }
      }
    });

    const result = dates.map(date => {
      const dataPoint: any = { date };
      uniqueCampaigns.forEach(campaign => {
        const safeKey = campaign.replace(/[^a-zA-Z0-9]/g, '_');
        dataPoint[safeKey] = campaignData[campaign][date] || 0;
      });
      return dataPoint;
    });

    return { data: result, campaigns: uniqueCampaigns };
  }, [leads, uniqueCampaigns, dateFrom, dateTo]);

  // Configuración del gráfico de campañas (generar colores dinámicamente)
  const campaignsChartConfig = useMemo(() => {
    const colors = [
      "#1E90FF", // Celeste
      "#FFA500", // Naranja
      "#4169E1", // Azul
      "#FF4500", // Rojo/Naranja oscuro
      "#10B981", // Verde
      "#3B82F6", // Azul
      "#F59E0B", // Amarillo/Naranja
      "#8B5CF6", // Púrpura
      "#EC4899", // Rosa
      "#14B8A6", // Turquesa
      "#F97316", // Naranja oscuro
      "#6366F1", // Índigo
    ];
    
    const config: ChartConfig = {};
    uniqueCampaigns.forEach((campaign, index) => {
      const safeKey = campaign.replace(/[^a-zA-Z0-9]/g, '_');
      config[safeKey] = {
        label: campaign,
        color: colors[index % colors.length],
      };
    });
    return config;
  }, [uniqueCampaigns]);

  // Datos individuales por campaña para gráficos separados
  const individualCampaignsData = useMemo(() => {
    const dates = eachDayInRange(dateFrom, dateTo);

    const campaignsData: Record<string, Array<{ date: string; leads: number }>> = {};
    uniqueCampaigns.forEach(campaign => {
      campaignsData[campaign] = dates.map(date => ({ date, leads: 0 }));
    });

    const filtered = filterLeadsByDate(leads, dateFrom, dateTo);
    filtered.forEach(lead => {
      if (lead.propiedad_interes && lead.propiedad_interes.trim() !== '') {
        const campaign = lead.propiedad_interes.trim();
        const dateStr = new Date(lead.fechaContacto || lead.created_at || '').toISOString().split('T')[0];
        if (campaignsData[campaign]) {
          const dateIndex = campaignsData[campaign].findIndex(d => d.date === dateStr);
          if (dateIndex !== -1) campaignsData[campaign][dateIndex].leads++;
        }
      }
    });

    return campaignsData;
  }, [leads, uniqueCampaigns, dateFrom, dateTo]);

  // Configuración del gráfico
  const chartConfig: ChartConfig = {
    leads: {
      label: "Leads Totales",
      color: "#1E90FF", // Celeste
    },
    tibios: {
      label: "Leads Tibios",
      color: "#FFA500", // Naranja
    },
    frios: {
      label: "Leads Fríos",
      color: "#4169E1", // Azul
    },
    calientes: {
      label: "Leads Calientes",
      color: "#FF4500", // Rojo/Naranja oscuro
    },
  };

  // Calcular totales
  const totalLeads = leads.length;
  const leadsEnElPeriodo = useMemo(() =>
    filterLeadsByDate(leads, dateFrom, dateTo).length,
    [leads, dateFrom, dateTo]
  );

  const llamadasEnElPeriodo = useMemo(() =>
    filterLlamadasByDate(llamadas, dateFrom, dateTo).length,
    [llamadas, dateFrom, dateTo]
  );

  // ===== Grupo 1: Pipeline & Conversión =====

  // T5 — funnelData (R1): funnel de estados
  const funnelData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const canonicalOrder = ['frío', 'tibio', 'caliente', 'llamada', 'visita'];
    const counts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const e = l.estado ?? 'inicial';
      const key = canonicalOrder.includes(e) ? e : '__otros__';
      counts[key] = (counts[key] || 0) + 1;
    });
    const rows = canonicalOrder
      .filter(e => counts[e] !== undefined)
      .map(e => ({ name: e.charAt(0).toUpperCase() + e.slice(1), value: counts[e], fill: ESTADO_COLORS[e] ?? NEUTRAL_GRAY }));
    if (counts['__otros__']) {
      rows.push({ name: 'Otros', value: counts['__otros__'], fill: NEUTRAL_GRAY });
    }
    rows.sort((a, b) => {
      const ia = canonicalOrder.indexOf(a.name.toLowerCase());
      const ib = canonicalOrder.indexOf(b.name.toLowerCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b.value - a.value;
    });
    return rows;
  }, [leads, dateFrom, dateTo]);

  const funnelChartConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // T6 — estadoDistData (R2): distribución por estado para donut
  const estadoDistData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const counts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const e = l.estado ?? 'inicial';
      counts[e] = (counts[e] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: ESTADO_COLORS[name] ?? NEUTRAL_GRAY,
    }));
  }, [leads, dateFrom, dateTo]);

  const estadoDistConfig: ChartConfig = Object.fromEntries(
    estadoDistData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T7 — kpiConversionLlamadas (R3): tasa de conversión
  const kpiConversionLlamadas = useMemo(() => {
    const relevant = filterLlamadasByDate(llamadas, dateFrom, dateTo);
    const realizadas = relevant.filter(l => l.estado === 'realizada').length;
    const agendadas = relevant.filter(l => l.estado === 'agendada').length;
    const den = realizadas + agendadas;
    const ratio = den > 0 ? Math.round((realizadas / den) * 1000) / 10 : null;
    const leadsMarcados = leads.filter(l => l.llamada_agendada === true).length;
    return { ratio, realizadas, agendadas, den, leadsMarcados };
  }, [llamadas, leads, dateFrom, dateTo]);

  // ===== Grupo 2: Calidad y Origen =====

  // T8 — calidadData (R4)
  const calidadData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const counts = { 1: 0, 2: 0, 3: 0, sin: 0 };
    filteredLeads.forEach(l => {
      if (l.calidad === 1) counts[1]++;
      else if (l.calidad === 2) counts[2]++;
      else if (l.calidad === 3) counts[3]++;
      else counts.sin++;
    });
    return [
      { name: 'Calidad 1', value: counts[1], fill: '#22C55E' },
      { name: 'Calidad 2', value: counts[2], fill: '#F59E0B' },
      { name: 'Calidad 3', value: counts[3], fill: '#EF4444' },
      { name: 'Sin calificar', value: counts.sin, fill: NEUTRAL_GRAY },
    ].filter(d => d.value > 0);
  }, [leads, dateFrom, dateTo]);

  const calidadConfig: ChartConfig = Object.fromEntries(
    calidadData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T9 — origenData (R5)
  const origenData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const syh = filteredLeads.filter(l => !l.phone_from || l.phone_from.trim() === '').length;
    const pago = filteredLeads.length - syh;
    return [
      { name: 'S&H (Orgánico)', value: syh, fill: '#10B981' },
      { name: 'Campaña Paga', value: pago, fill: '#F97316' },
    ].filter(d => d.value > 0);
  }, [leads, dateFrom, dateTo]);

  const origenConfig: ChartConfig = Object.fromEntries(
    origenData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // origenByDate: leads por tipo de origen en el período seleccionado
  const origenByDate = useMemo(() => {
    const dates = eachDayInRange(dateFrom, dateTo);
    const grouped: Record<string, { syh: number; pago: number }> = {};
    dates.forEach(d => { grouped[d] = { syh: 0, pago: 0 }; });
    const filtered = filterLeadsByDate(leads, dateFrom, dateTo);
    filtered.forEach(l => {
      try {
        const d = new Date(l.fechaContacto || l.created_at || '').toISOString().split('T')[0];
        if (!grouped[d]) return;
        if (!l.phone_from || l.phone_from.trim() === '') grouped[d].syh++;
        else grouped[d].pago++;
      } catch { /* skip malformed dates */ }
    });
    return dates.map(d => ({ date: d, syh: grouped[d].syh, pago: grouped[d].pago }));
  }, [leads, dateFrom, dateTo]);

  const origenAreaConfig: ChartConfig = {
    syh: { label: 'S&H', color: '#10B981' },
    pago: { label: 'Pago', color: '#F97316' },
  };

  // T10 — etiquetasData (R6): 8 etiquetas booleanas
  const etiquetasData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const tags = [
      { key: 'llamada_agendada', label: 'Llamada agendada' },
      { key: 'llamar', label: 'Llamar' },
      { key: 'deriva_humano', label: 'Deriva humano' },
      { key: 'dueno', label: 'Dueño' },
      { key: 'empleado', label: 'Empleado' },
      { key: 'presupuesto_etiqueta', label: 'Presupuesto' },
      { key: 'inspeccion', label: 'Inspección' },
      { key: 'lista_difusion', label: 'Lista difusión' },
    ] as const;
    return tags
      .map((t, i) => ({
        name: t.label,
        value: filteredLeads.filter(l => (l as any)[t.key] === true).length,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [leads, dateFrom, dateTo]);

  const etiquetasConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // ===== Grupo 3: Segmentación de Demanda =====

  // T11 — zonasTopData (R7): top 10 zonas con normalización simple
  const zonasTopData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const counts: Record<string, number> = {};
    const firstLabel: Record<string, string> = {};
    filteredLeads.forEach(l => {
      const z = l.zonaInteres || l.zona || '';
      if (!z.trim()) return;
      const norm = normalizeZona(z);
      counts[norm] = (counts[norm] || 0) + 1;
      if (!firstLabel[norm]) firstLabel[norm] = z;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([norm, value], i) => ({
        name: firstLabel[norm].charAt(0).toUpperCase() + firstLabel[norm].slice(1),
        value,
        fill: '#1E90FF',
      }));
  }, [leads, dateFrom, dateTo]);

  const zonasConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // T12 — tipoPropiedadData (R8)
  const tipoPropiedadData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const counts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const t = l.tipo_propiedad || l.tipoPropiedad || '';
      const key = t.trim() || 'Sin especificar';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: name === 'Sin especificar' ? NEUTRAL_GRAY : CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [leads, dateFrom, dateTo]);

  const tipoPropiedadConfig: ChartConfig = Object.fromEntries(
    tipoPropiedadData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T13 — motivoData (R9)
  const motivoData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const counts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const m = l.intencion || l.motivoInteres || '';
      const key = m.trim() || 'Sin especificar';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: name === 'Sin especificar' ? NEUTRAL_GRAY : CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [leads, dateFrom, dateTo]);

  const motivoConfig: ChartConfig = Object.fromEntries(
    motivoData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T14 — presupuestoData (R10): 5 buckets
  const presupuestoData = useMemo(() => {
    const filteredLeads = filterLeadsByDate(leads, dateFrom, dateTo);
    const buckets = [
      { label: 'Sin dato', count: 0, fill: NEUTRAL_GRAY },
      { label: '0–50k', count: 0, fill: '#BAE6FD' },
      { label: '50–100k', count: 0, fill: '#7DD3FC' },
      { label: '100–200k', count: 0, fill: '#38BDF8' },
      { label: '+200k', count: 0, fill: '#0284C7' },
    ];
    filteredLeads.forEach(l => {
      const p = l.presupuesto ?? 0;
      const num = typeof p === 'number' ? p : parseFloat(String(p));
      if (!num || isNaN(num) || num === 0) { buckets[0].count++; return; }
      if (num <= 50000) { buckets[1].count++; return; }
      if (num <= 100000) { buckets[2].count++; return; }
      if (num <= 200000) { buckets[3].count++; return; }
      buckets[4].count++;
    });
    return buckets.map(b => ({ name: b.label, value: b.count, fill: b.fill }));
  }, [leads, dateFrom, dateTo]);

  const presupuestoConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // ===== Grupo 4: Operación de Llamadas =====

  // T15 — llamadasEstadoData (R11): llamadas por estado en el período seleccionado
  const llamadasEstadoData = useMemo(() => {
    const recent = filterLlamadasByDate(llamadas, dateFrom, dateTo);
    const counts = { agendada: 0, realizada: 0, cancelada: 0, otros: 0 };
    recent.forEach(l => {
      if (l.estado === 'agendada') counts.agendada++;
      else if (l.estado === 'realizada') counts.realizada++;
      else if (l.estado === 'cancelada') counts.cancelada++;
      else counts.otros++;
    });
    return [
      { name: 'Agendada', value: counts.agendada, fill: '#3B82F6' },
      { name: 'Realizada', value: counts.realizada, fill: '#10B981' },
      { name: 'Cancelada', value: counts.cancelada, fill: '#EF4444' },
      { name: 'Otros', value: counts.otros, fill: NEUTRAL_GRAY },
    ].filter(d => d.value > 0);
  }, [llamadas, dateFrom, dateTo]);

  const llamadasEstadoConfig: ChartConfig = Object.fromEntries(
    llamadasEstadoData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T16 — llamadasProximas7dData (R12): próximos 7 días [hoy, hoy+6]
  const llamadasProximas7dData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });
    const counts: Record<string, number> = {};
    days.forEach(d => { counts[d] = 0; });
    llamadas.forEach(l => {
      try {
        const d = new Date(l.inicio);
        if (isNaN(d.getTime())) return;
        const dateStr = d.toISOString().split('T')[0];
        if (counts[dateStr] !== undefined) counts[dateStr]++;
      } catch { /* skip malformed */ }
    });
    return days.map(d => {
      const date = new Date(d + 'T00:00:00');
      const label = date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
      return { name: label, value: counts[d], fill: '#3B82F6' };
    });
  }, [llamadas]);

  const llamadas7dConfig: ChartConfig = { value: { label: 'Llamadas', color: '#3B82F6' } };

  // T17 — llamadasPorAgenteData (R13): top 10 agentes en el período seleccionado
  const llamadasPorAgenteData = useMemo(() => {
    const recent = filterLlamadasByDate(llamadas, dateFrom, dateTo);
    const counts: Record<string, number> = {};
    recent.forEach(l => {
      const a = l.agente?.trim() || 'Sin asignar';
      counts[a] = (counts[a] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [llamadas, dateFrom, dateTo]);

  const agenteConfig: ChartConfig = { value: { label: 'Llamadas', color: '#1E90FF' } };

  // T15 — leadsPorSemana: leads agrupados por semana ISO
  const leadsPorSemana = useMemo(() => {
    const filtered = filterLeadsByDate(leads, dateFrom, dateTo);
    const byWeek: Record<string, { count: number; monday: Date }> = {};
    filtered.forEach(l => {
      const d = new Date(l.fechaContacto || l.created_at || '');
      if (isNaN(d.getTime())) return;
      const monday = getISOWeekStart(d);
      const key = monday.toISOString().split('T')[0];
      if (!byWeek[key]) byWeek[key] = { count: 0, monday };
      byWeek[key].count++;
    });
    return Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { count, monday }]) => {
        const weekNum = getISOWeek(monday);
        const dd = String(monday.getDate()).padStart(2, '0');
        const mm = String(monday.getMonth() + 1).padStart(2, '0');
        return { name: `Sem ${weekNum} (${dd}/${mm})`, value: count, fill: '#1E90FF' };
      });
  }, [leads, dateFrom, dateTo]);

  const leadsPorSemanaConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // T16 — campaniaPieData: torta de leads por propiedad_interes (top 8 + Otros)
  const campaniaPieData = useMemo(() => {
    const filtered = filterLeadsByDate(leads, dateFrom, dateTo);
    const counts: Record<string, number> = {};
    filtered.forEach(l => {
      const key = l.propiedad_interes?.trim() || 'Sin campaña';
      counts[key] = (counts[key] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const top8 = sorted.slice(0, 8);
    const rest = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
    const result = top8.map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
    if (rest > 0) result.push({ name: 'Otros', value: rest, fill: NEUTRAL_GRAY });
    return result;
  }, [leads, dateFrom, dateTo]);

  const campaniaPieConfig: ChartConfig = Object.fromEntries(
    campaniaPieData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T17 — tendenciaLlamadasData: llamadas realizadas por día en el período
  const tendenciaLlamadasData = useMemo(() => {
    const realizadas = filterLlamadasByInicio(llamadas, dateFrom, dateTo)
      .filter(l => l.estado === 'realizada');
    const counts: Record<string, number> = {};
    eachDayInRange(dateFrom, dateTo).forEach(d => { counts[d] = 0; });
    realizadas.forEach(l => {
      const d = new Date(l.inicio || l.created_at || '');
      if (isNaN(d.getTime())) return;
      const key = d.toISOString().split('T')[0];
      if (counts[key] !== undefined) counts[key]++;
    });
    return Object.entries(counts).map(([date, value]) => ({ date, value }));
  }, [llamadas, dateFrom, dateTo]);

  const tendenciaLlamadasConfig: ChartConfig = { value: { label: 'Realizadas', color: '#10B981' } };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8 m-2 space-y-6">
          {/* Breadcrumbs skeleton */}
          <div className="px-2 py-2  bg-slate-100 z-10 backdrop-blur  border-b border-slate-200 mb-6">
            <Skeleton className="h-4 w-48" />
          </div>
          
          {/* Header skeleton */}
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Cards skeleton */}
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main chart skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>

          {/* Category charts skeleton */}
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[200px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Skeletons para las 4 nuevas secciones */}
          {[1, 2, 3, 4].map((section) => (
            <div key={section}>
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-32 mb-2" />
                      <Skeleton className="h-3 w-48" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-[300px] w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8 px-2 space-y-6">
         {/* Breadcrumbs */}
         <div className="px-3 py-3 sticky top-0 z-10   bg-slate-100 border-b border-slate-200 mb-6">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1 md:space-x-3">
                <li className="inline-flex items-center">
                  <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
                    </svg>
                    Inicio
                  </Link>
                </li>
                <li>
                  <div className="flex items-center">
                    <svg className="w-6  h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path>
                    </svg>
                    <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">Dashboard</span>
                  </div>
                </li>
               
              </ol>
            </nav>
          </div>

        {/* Barra de filtro de fechas */}
        <div className="flex flex-wrap items-center gap-2 py-2">
          {(['7d', '30d', '90d', 'todo'] as Preset[]).map((p) => {
            const labels: Record<Preset, string> = { '7d': '7 días', '30d': '30 días', '90d': '90 días', 'todo': 'Todo', 'custom': '' };
            return (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? 'default' : 'outline'}
                onClick={() => applyPreset(p)}
              >
                {labels[p]}
              </Button>
            );
          })}
          <div className="flex items-center gap-1 ml-2">
            <label className="text-sm text-slate-600">Desde</label>
            <input
              type="date"
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              value={toInputValue(dateFrom)}
              onChange={e => { if (!e.target.value) return; setDateFrom(parseInputDate(e.target.value)); setPreset('custom'); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-sm text-slate-600">Hasta</label>
            <input
              type="date"
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              value={toInputValue(dateTo)}
              onChange={e => { if (!e.target.value) return; setDateTo(parseInputDate(e.target.value)); setPreset('custom'); }}
            />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Dashboard</h1>
          <p className="text-gray-600">Métricas y estadísticas de leads</p>
        </div>

        {/* Cards de métricas */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center  justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Leads
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLeads}</div>
              <p className="text-xs text-muted-foreground">
                Todos los leads registrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                En el período
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                className="h-4 w-4 text-muted-foreground"
              >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leadsEnElPeriodo}</div>
              <p className="text-xs text-muted-foreground">
                Leads ingresados en el período
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Llamadas en el período
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{llamadasEnElPeriodo}</div>
              <p className="text-xs text-muted-foreground">
                Llamadas en el período seleccionado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico de leads por período */}
        <Card>
          <CardHeader>
            <CardTitle>Leads por Período</CardTitle>
            <CardDescription>
              Cantidad de leads ingresados en los últimos 30 días (total, tibios, fríos y calientes)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartAreaInteractive
              data={leadsByDate}
              config={chartConfig}
              dateKey="date"
              valueKey="leads"
            />
          </CardContent>
        </Card>

        {/* Gráfico: Leads por Semana */}
        <Card>
          <CardHeader>
            <CardTitle>Leads por Semana</CardTitle>
            <CardDescription>Leads agrupados por semana ISO en el período seleccionado</CardDescription>
          </CardHeader>
          <CardContent>
            {leadsPorSemana.length === 0
              ? <EmptyChart message="Sin leads en el período seleccionado" />
              : <ChartBar data={leadsPorSemana} config={leadsPorSemanaConfig} layout="vertical" />}
          </CardContent>
        </Card>

        {/* Gráfico de leads por campaña */}
        {uniqueCampaigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Leads por Campaña</CardTitle>
              <CardDescription>
                Cantidad de leads ingresados por campaña (propiedad_interes) en el período seleccionado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartAreaInteractive
                data={leadsByCampaign.data}
                config={campaignsChartConfig}
                dateKey="date"
                valueKey="leads"
              />
            </CardContent>
          </Card>
        )}

        {/* Gráficos individuales por campaña (máximo 6 campañas más importantes) */}
        {uniqueCampaigns.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Leads por Campaña Individual</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {uniqueCampaigns.slice(0, 6).map((campaign) => {
                const campaignData = individualCampaignsData[campaign] || [];
                const safeKey = campaign.replace(/[^a-zA-Z0-9]/g, '_');
                const campaignChartConfig: ChartConfig = {
                  leads: {
                    label: campaign,
                    color: campaignsChartConfig[safeKey]?.color || "#1E90FF",
                  },
                };

                return (
                  <Card key={campaign}>
                    <CardHeader>
                      <CardTitle className="text-sm">{campaign}</CardTitle>
                      <CardDescription className="text-xs">
                        Leads de esta campaña en el período seleccionado
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartAreaInteractive
                        data={campaignData}
                        config={campaignChartConfig}
                        dateKey="date"
                        valueKey="leads"
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {uniqueCampaigns.length > 6 && (
              <p className="text-sm text-gray-500 mt-4">
                Mostrando las 6 campañas con más leads. Total de campañas: {uniqueCampaigns.length}
              </p>
            )}
          </div>
        )}

        {/* ===== Grupo 1: Pipeline & Conversión ===== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Pipeline y Conversión</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* KPI Tasa de conversión */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
                <CardDescription>Llamadas realizadas vs. total (período seleccionado)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas ? (
                  <Skeleton className="h-[120px] w-full" />
                ) : kpiConversionLlamadas.den === 0 ? (
                  <div className="py-6 text-sm text-slate-500">Sin llamadas en el período</div>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-slate-800">{kpiConversionLlamadas.ratio}%</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpiConversionLlamadas.realizadas} realizadas / {kpiConversionLlamadas.den} totales (período)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpiConversionLlamadas.leadsMarcados} leads marcados para llamar
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Distribución por estado donut */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Estado</CardTitle>
                <CardDescription>Snapshot actual del pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                {estadoDistData.length === 0
                  ? <EmptyChart message="Sin datos de pipeline disponibles" />
                  : <ChartPie data={estadoDistData} config={estadoDistConfig} showLegend />}
              </CardContent>
            </Card>

            {/* Funnel snapshot barras horizontales */}
            <Card>
              <CardHeader>
                <CardTitle>Snapshot del Pipeline</CardTitle>
                <CardDescription>Leads en cada etapa actualmente</CardDescription>
              </CardHeader>
              <CardContent>
                {funnelData.length === 0
                  ? <EmptyChart message="Sin datos de pipeline disponibles" />
                  : <ChartBar data={funnelData} config={funnelChartConfig} layout="horizontal" />}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ===== Grupo 2: Calidad y Origen ===== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Calidad y Origen</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Calidad de leads donut */}
            <Card>
              <CardHeader>
                <CardTitle>Calidad de Leads</CardTitle>
                <CardDescription>Distribución de calidad 1–3 asignada por el agente</CardDescription>
              </CardHeader>
              <CardContent>
                {calidadData.length === 0
                  ? <EmptyChart />
                  : <ChartPie data={calidadData} config={calidadConfig} showLegend />}
              </CardContent>
            </Card>

            {/* Origen donut */}
            <Card>
              <CardHeader>
                <CardTitle>Origen del Lead</CardTitle>
                <CardDescription>S&H orgánico vs campaña paga</CardDescription>
              </CardHeader>
              <CardContent>
                {origenData.length === 0
                  ? <EmptyChart />
                  : <ChartPie data={origenData} config={origenConfig} showLegend />}
              </CardContent>
            </Card>

            {/* Etiquetas activas barras verticales */}
            <Card>
              <CardHeader>
                <CardTitle>Etiquetas Activas</CardTitle>
                <CardDescription>Leads con cada etiqueta activa</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartBar data={etiquetasData} config={etiquetasConfig} layout="vertical" />
              </CardContent>
            </Card>

            {/* Torta: Leads por Campaña */}
            <Card>
              <CardHeader>
                <CardTitle>Leads por Campaña</CardTitle>
                <CardDescription>Distribución de leads por propiedad_interes en el período</CardDescription>
              </CardHeader>
              <CardContent>
                {campaniaPieData.length === 0
                  ? <EmptyChart message="Sin leads con campaña en el período" />
                  : <ChartPie data={campaniaPieData} config={campaniaPieConfig} showLegend />}
              </CardContent>
            </Card>
          </div>

          {/* Origen por fecha área apilada */}
          <Card>
            <CardHeader>
              <CardTitle>Origen por Fecha</CardTitle>
              <CardDescription>S&H vs campaña paga en el período seleccionado</CardDescription>
            </CardHeader>
            <CardContent>
              {origenByDate.every(d => d.syh === 0 && d.pago === 0)
                ? <EmptyChart />
                : <ChartAreaInteractive data={origenByDate} config={origenAreaConfig} dateKey="date" valueKey="syh" />}
            </CardContent>
          </Card>
        </section>

        {/* ===== Grupo 3: Segmentación de Demanda ===== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Segmentación de Demanda</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Top 10 zonas barras horizontales */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Top 10 Zonas</CardTitle>
                <CardDescription className="text-xs">Zonas con más leads</CardDescription>
              </CardHeader>
              <CardContent>
                {zonasTopData.length === 0
                  ? <EmptyChart message="Sin datos de zona disponibles" />
                  : <ChartBar data={zonasTopData} config={zonasConfig} layout="horizontal" />}
              </CardContent>
            </Card>

            {/* Tipo de propiedad donut */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tipo de Propiedad</CardTitle>
                <CardDescription className="text-xs">Distribución de búsqueda</CardDescription>
              </CardHeader>
              <CardContent>
                {tipoPropiedadData.length === 0
                  ? <EmptyChart />
                  : <ChartPie data={tipoPropiedadData} config={tipoPropiedadConfig} showLegend />}
              </CardContent>
            </Card>

            {/* Motivo de interés donut */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Motivo de Interés</CardTitle>
                <CardDescription className="text-xs">Inversión, mudanza, etc.</CardDescription>
              </CardHeader>
              <CardContent>
                {motivoData.length === 0
                  ? <EmptyChart />
                  : <ChartPie data={motivoData} config={motivoConfig} showLegend />}
              </CardContent>
            </Card>
          </div>

          {/* Presupuesto — fila separada para darle ancho completo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Distribución de Presupuesto</CardTitle>
              <CardDescription className="text-xs">Distribución por rango en USD</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartBar data={presupuestoData} config={presupuestoConfig} layout="vertical" />
            </CardContent>
          </Card>
        </section>

        {/* ===== Grupo 4: Operación de Llamadas ===== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Operación de Llamadas</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Estado de llamadas donut */}
            <Card>
              <CardHeader>
                <CardTitle>Estado de Llamadas</CardTitle>
                <CardDescription>Distribución en el período seleccionado</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas
                  ? <Skeleton className="h-[350px] w-full" />
                  : llamadasEstadoData.length === 0
                    ? <EmptyChart message="Sin llamadas en el período seleccionado" />
                    : <ChartPie data={llamadasEstadoData} config={llamadasEstadoConfig} showLegend />}
              </CardContent>
            </Card>

            {/* Llamadas próximos 7 días barras verticales */}
            <Card>
              <CardHeader>
                <CardTitle>Llamadas Próximos 7 Días</CardTitle>
                <CardDescription>
                  Agenda de hoy a {(() => {
                    const d = new Date(); d.setDate(d.getDate() + 6);
                    return d.toLocaleDateString('es-AR');
                  })()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas
                  ? <Skeleton className="h-[350px] w-full" />
                  : <ChartBar data={llamadasProximas7dData} config={llamadas7dConfig} layout="vertical" />}
              </CardContent>
            </Card>

            {/* Llamadas por agente barras horizontales */}
            <Card>
              <CardHeader>
                <CardTitle>Llamadas por Agente</CardTitle>
                <CardDescription>Top 10 agentes — período seleccionado</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas
                  ? <Skeleton className="h-[350px] w-full" />
                  : llamadasPorAgenteData.length === 0
                    ? <EmptyChart message="Sin llamadas registradas" />
                    : <ChartBar data={llamadasPorAgenteData} config={agenteConfig} layout="horizontal" />}
              </CardContent>
            </Card>

            {/* Área: Tendencia de Llamadas Realizadas */}
            <Card>
              <CardHeader>
                <CardTitle>Tendencia de Llamadas Realizadas</CardTitle>
                <CardDescription>Llamadas realizadas por día en el período seleccionado</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas
                  ? <Skeleton className="h-[350px] w-full" />
                  : tendenciaLlamadasData.every(d => d.value === 0)
                    ? <EmptyChart message="Sin llamadas realizadas en el período" />
                    : <ChartAreaInteractive data={tendenciaLlamadasData} config={tendenciaLlamadasConfig} dateKey="date" valueKey="value" />}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
