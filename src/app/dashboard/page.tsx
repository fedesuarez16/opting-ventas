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

// ===== Helper: empty state para charts sin datos =====
const EmptyChart = ({ message = 'Sin datos en el período' }: { message?: string }) => (
  <div className="flex h-[350px] w-full items-center justify-center bg-slate-50 rounded-lg text-sm text-slate-500">
    {message}
  </div>
);

export default function Page() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [llamadas, setLlamadasData] = useState<LlamadaAgendada[]>([]);
  const [isLoadingLlamadas, setIsLoadingLlamadas] = useState(true);

  useEffect(() => {
    const now = new Date();
    const past30 = new Date(now); past30.setDate(past30.getDate() - 30);
    const future7 = new Date(now); future7.setDate(future7.getDate() + 7);

    setIsLoading(true);
    setIsLoadingLlamadas(true);

    Promise.allSettled([
      getAllLeads()
        .then((d) => { setLeads(d); setIsLoading(false); })
        .catch((e) => { console.error('[dashboard] leads error:', e); setIsLoading(false); }),
      getLlamadasInRange(past30, future7)
        .then((d) => { setLlamadasData(d); setIsLoadingLlamadas(false); })
        .catch((e) => { console.error('[dashboard] llamadas error:', e); setIsLoadingLlamadas(false); }),
    ]);
  }, []);

  // Agrupar leads por fecha
  const leadsByDate = useMemo(() => {
    const grouped: Record<string, { total: number; tibios: number; frios: number; calientes: number }> = {};
    
    // Obtener los últimos 30 días
    const today = new Date();
    const dates: string[] = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
      grouped[dateStr] = { total: 0, tibios: 0, frios: 0, calientes: 0 };
    }

    // Contar leads por fecha
    leads.forEach(lead => {
      const leadDate = new Date(lead.fechaContacto || lead.created_at || new Date());
      const dateStr = leadDate.toISOString().split('T')[0];
      
      if (grouped[dateStr] !== undefined) {
        grouped[dateStr].total++;
        if (lead.estado === 'tibio') {
          grouped[dateStr].tibios++;
        } else if (lead.estado === 'frío') {
          grouped[dateStr].frios++;
        } else if (lead.estado === 'caliente') {
          grouped[dateStr].calientes++;
        }
      }
    });

    // Convertir a array para el gráfico
    return dates.map(date => ({
      date,
      leads: grouped[date].total,
      tibios: grouped[date].tibios,
      frios: grouped[date].frios,
      calientes: grouped[date].calientes,
    }));
  }, [leads]);

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
    const today = new Date();
    const dates: string[] = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
    }

    // Crear estructura para cada campaña
    const campaignData: Record<string, Record<string, number>> = {};
    
    // Inicializar todas las campañas con 0 para todas las fechas
    uniqueCampaigns.forEach(campaign => {
      campaignData[campaign] = {};
      dates.forEach(date => {
        campaignData[campaign][date] = 0;
      });
    });

    // Contar leads por campaña y fecha
    leads.forEach(lead => {
      if (lead.propiedad_interes && lead.propiedad_interes.trim() !== '') {
        const campaign = lead.propiedad_interes.trim();
        const leadDate = new Date(lead.fechaContacto || lead.created_at || new Date());
        const dateStr = leadDate.toISOString().split('T')[0];
        
        if (campaignData[campaign] && campaignData[campaign][dateStr] !== undefined) {
          campaignData[campaign][dateStr]++;
        }
      }
    });

    // Convertir a formato para el gráfico
    // Crear un objeto con todas las campañas como series
    const result = dates.map(date => {
      const dataPoint: any = { date };
      uniqueCampaigns.forEach(campaign => {
        // Usar un nombre de clave seguro para la campaña (reemplazar caracteres especiales)
        const safeKey = campaign.replace(/[^a-zA-Z0-9]/g, '_');
        dataPoint[safeKey] = campaignData[campaign][date] || 0;
      });
      return dataPoint;
    });

    return { data: result, campaigns: uniqueCampaigns };
  }, [leads, uniqueCampaigns]);

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
    const today = new Date();
    const dates: string[] = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
    }

    const campaignsData: Record<string, Array<{ date: string; leads: number }>> = {};
    
    // Inicializar todas las campañas
    uniqueCampaigns.forEach(campaign => {
      campaignsData[campaign] = dates.map(date => ({ date, leads: 0 }));
    });

    // Contar leads por campaña y fecha
    leads.forEach(lead => {
      if (lead.propiedad_interes && lead.propiedad_interes.trim() !== '') {
        const campaign = lead.propiedad_interes.trim();
        const leadDate = new Date(lead.fechaContacto || lead.created_at || new Date());
        const dateStr = leadDate.toISOString().split('T')[0];
        
        if (campaignsData[campaign]) {
          const dateIndex = campaignsData[campaign].findIndex(d => d.date === dateStr);
          if (dateIndex !== -1) {
            campaignsData[campaign][dateIndex].leads++;
          }
        }
      }
    });

    return campaignsData;
  }, [leads, uniqueCampaigns]);

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
  const leadsLast7Days = useMemo(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return leads.filter(lead => {
      const leadDate = new Date(lead.fechaContacto || lead.created_at || new Date());
      return leadDate >= sevenDaysAgo;
    }).length;
  }, [leads]);

  const leadsLast30Days = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return leads.filter(lead => {
      const leadDate = new Date(lead.fechaContacto || lead.created_at || new Date());
      return leadDate >= thirtyDaysAgo;
    }).length;
  }, [leads]);

  // ===== Grupo 1: Pipeline & Conversión =====

  // T5 — funnelData (R1): funnel de estados
  const funnelData = useMemo(() => {
    const canonicalOrder = ['frío', 'tibio', 'caliente', 'llamada', 'visita'];
    const counts: Record<string, number> = {};
    leads.forEach(l => {
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
      // canonical order first, then by value for others
      const ia = canonicalOrder.indexOf(a.name.toLowerCase());
      const ib = canonicalOrder.indexOf(b.name.toLowerCase());
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b.value - a.value;
    });
    return rows;
  }, [leads]);

  const funnelChartConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // T6 — estadoDistData (R2): distribución por estado para donut
  const estadoDistData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      const e = l.estado ?? 'inicial';
      counts[e] = (counts[e] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: ESTADO_COLORS[name] ?? NEUTRAL_GRAY,
    }));
  }, [leads]);

  const estadoDistConfig: ChartConfig = Object.fromEntries(
    estadoDistData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T7 — kpiConversionLlamadas (R3): tasa de conversión
  const kpiConversionLlamadas = useMemo(() => {
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    const relevant = llamadas.filter(l => {
      try {
        const d = new Date(l.created_at);
        return !isNaN(d.getTime()) && d >= last30;
      } catch { return false; }
    });
    const realizadas = relevant.filter(l => l.estado === 'realizada').length;
    const agendadas = relevant.filter(l => l.estado === 'agendada').length;
    const den = realizadas + agendadas;
    const ratio = den > 0 ? Math.round((realizadas / den) * 1000) / 10 : null;
    const leadsMarcados = leads.filter(l => l.llamada_agendada === true).length;
    return { ratio, realizadas, agendadas, den, leadsMarcados };
  }, [llamadas, leads]);

  // ===== Grupo 2: Calidad y Origen =====

  // T8 — calidadData (R4)
  const calidadData = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, sin: 0 };
    leads.forEach(l => {
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
  }, [leads]);

  const calidadConfig: ChartConfig = Object.fromEntries(
    calidadData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T9 — origenData (R5)
  const origenData = useMemo(() => {
    const syh = leads.filter(l => !l.phone_from || l.phone_from.trim() === '').length;
    const pago = leads.length - syh;
    return [
      { name: 'S&H (Orgánico)', value: syh, fill: '#10B981' },
      { name: 'Campaña Paga', value: pago, fill: '#F97316' },
    ].filter(d => d.value > 0);
  }, [leads]);

  const origenConfig: ChartConfig = Object.fromEntries(
    origenData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // origenByDate: leads de últimos 30 días por tipo de origen
  const origenByDate = useMemo(() => {
    const today = new Date();
    const dates: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const grouped: Record<string, { syh: number; pago: number }> = {};
    dates.forEach(d => { grouped[d] = { syh: 0, pago: 0 }; });
    leads.forEach(l => {
      try {
        const d = new Date(l.fechaContacto || l.created_at || new Date()).toISOString().split('T')[0];
        if (!grouped[d]) return;
        if (!l.phone_from || l.phone_from.trim() === '') grouped[d].syh++;
        else grouped[d].pago++;
      } catch { /* skip malformed dates */ }
    });
    return dates.map(d => ({ date: d, syh: grouped[d].syh, pago: grouped[d].pago }));
  }, [leads]);

  const origenAreaConfig: ChartConfig = {
    syh: { label: 'S&H', color: '#10B981' },
    pago: { label: 'Pago', color: '#F97316' },
  };

  // T10 — etiquetasData (R6): 8 etiquetas booleanas
  const etiquetasData = useMemo(() => {
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
        value: leads.filter(l => (l as any)[t.key] === true).length,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  const etiquetasConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // ===== Grupo 3: Segmentación de Demanda =====

  // T11 — zonasTopData (R7): top 10 zonas con normalización simple
  const zonasTopData = useMemo(() => {
    const counts: Record<string, number> = {};
    const firstLabel: Record<string, string> = {};
    leads.forEach(l => {
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
  }, [leads]);

  const zonasConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // T12 — tipoPropiedadData (R8)
  const tipoPropiedadData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      const t = l.tipo_propiedad || l.tipoPropiedad || '';
      const key = t.trim() || 'Sin especificar';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: name === 'Sin especificar' ? NEUTRAL_GRAY : CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [leads]);

  const tipoPropiedadConfig: ChartConfig = Object.fromEntries(
    tipoPropiedadData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T13 — motivoData (R9)
  const motivoData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      const m = l.intencion || l.motivoInteres || '';
      const key = m.trim() || 'Sin especificar';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: name === 'Sin especificar' ? NEUTRAL_GRAY : CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [leads]);

  const motivoConfig: ChartConfig = Object.fromEntries(
    motivoData.map(d => [d.name, { label: d.name, color: d.fill }])
  );

  // T14 — presupuestoData (R10): 5 buckets
  const presupuestoData = useMemo(() => {
    const buckets = [
      { label: 'Sin dato', count: 0, fill: NEUTRAL_GRAY },
      { label: '0–50k', count: 0, fill: '#BAE6FD' },
      { label: '50–100k', count: 0, fill: '#7DD3FC' },
      { label: '100–200k', count: 0, fill: '#38BDF8' },
      { label: '+200k', count: 0, fill: '#0284C7' },
    ];
    leads.forEach(l => {
      const p = l.presupuesto ?? 0;
      const num = typeof p === 'number' ? p : parseFloat(String(p));
      if (!num || isNaN(num) || num === 0) { buckets[0].count++; return; }
      if (num <= 50000) { buckets[1].count++; return; }
      if (num <= 100000) { buckets[2].count++; return; }
      if (num <= 200000) { buckets[3].count++; return; }
      buckets[4].count++;
    });
    return buckets.map(b => ({ name: b.label, value: b.count, fill: b.fill }));
  }, [leads]);

  const presupuestoConfig: ChartConfig = { value: { label: 'Leads', color: '#1E90FF' } };

  // ===== Grupo 4: Operación de Llamadas =====

  // T15 — llamadasEstadoData (R11): llamadas por estado (últimos 30d)
  const llamadasEstadoData = useMemo(() => {
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    const recent = llamadas.filter(l => {
      try {
        const d = new Date(l.created_at);
        return !isNaN(d.getTime()) && d >= last30;
      } catch { return false; }
    });
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
  }, [llamadas]);

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

  // T17 — llamadasPorAgenteData (R13): top 10 agentes (últimos 30d)
  const llamadasPorAgenteData = useMemo(() => {
    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    const recent = llamadas.filter(l => {
      try {
        const d = new Date(l.created_at);
        return !isNaN(d.getTime()) && d >= last30;
      } catch { return false; }
    });
    const counts: Record<string, number> = {};
    recent.forEach(l => {
      const a = l.agente?.trim() || 'Sin asignar';
      counts[a] = (counts[a] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [llamadas]);

  const agenteConfig: ChartConfig = { value: { label: 'Llamadas', color: '#1E90FF' } };

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
                Últimos 7 días
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
              <div className="text-2xl font-bold">{leadsLast7Days}</div>
              <p className="text-xs text-muted-foreground">
                Leads ingresados esta semana
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Últimos 30 días
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
              <div className="text-2xl font-bold">{leadsLast30Days}</div>
              <p className="text-xs text-muted-foreground">
                Leads ingresados este mes
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

        {/* Gráfico de leads por campaña */}
        {uniqueCampaigns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Leads por Campaña</CardTitle>
              <CardDescription>
                Cantidad de leads ingresados por campaña (propiedad_interes) en los últimos 30 días
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
                        Leads de esta campaña en los últimos 30 días
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
                <CardDescription>Llamadas realizadas vs. total (últimos 30d)</CardDescription>
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
                      {kpiConversionLlamadas.realizadas} realizadas / {kpiConversionLlamadas.den} totales (ult. 30d)
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
                {leads.length === 0
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
                {leads.length === 0
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
          </div>

          {/* Origen por fecha área apilada */}
          <Card>
            <CardHeader>
              <CardTitle>Origen por Fecha</CardTitle>
              <CardDescription>S&H vs campaña paga en los últimos 30 días</CardDescription>
            </CardHeader>
            <CardContent>
              {leads.length === 0
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
                {leads.length === 0
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
                {leads.length === 0
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
                <CardDescription>Distribución últimos 30 días</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas
                  ? <Skeleton className="h-[350px] w-full" />
                  : llamadasEstadoData.length === 0
                    ? <EmptyChart message="Sin llamadas en los últimos 30 días" />
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
                <CardDescription>Top 10 agentes — últimos 30 días</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLlamadas
                  ? <Skeleton className="h-[350px] w-full" />
                  : llamadasPorAgenteData.length === 0
                    ? <EmptyChart message="Sin llamadas registradas" />
                    : <ChartBar data={llamadasPorAgenteData} config={agenteConfig} layout="horizontal" />}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
