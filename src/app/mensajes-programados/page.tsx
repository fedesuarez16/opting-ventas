'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../components/AppLayout';
import {
  getSeguimientosWhatsapp,
  SeguimientoWhatsapp,
} from '../services/seguimientoWhatsappService';
import { getLeadEstadoPillClass } from '@/app/utils/leadEstadoBadge';
import { Skeleton } from '@/components/ui/skeleton';

function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

type SectionKey = 'pendientes' | 'enviados';

interface SectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  emptyMessage: string;
}

function Section({ title, count, expanded, onToggle, children, emptyMessage }: SectionProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-900">{title}</span>
          <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
            {count}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100">
          {count === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">{emptyMessage}</div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

interface RowProps {
  s: SeguimientoWhatsapp;
  variant: 'pendiente' | 'enviado';
}

function Row({ s, variant }: RowProps) {
  const nombre = s.lead_nombre || s.customer_name || '—';
  const telefono = s.phone || s.lead_phone || '—';
  const estado = s.lead_estado;

  return (
    <li className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {s.lead_id ? (
              <Link
                href={`/leads/tabla?id=${s.lead_id}`}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
              >
                {nombre}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-900 truncate">{nombre}</span>
            )}
            {estado && (
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md capitalize ${getLeadEstadoPillClass(estado)}`}
              >
                {estado}
              </span>
            )}
            {!s.lead_id && (
              <span className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md bg-gray-100 text-gray-600">
                sin lead
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {telefono} · {variant === 'enviado' ? 'enviado' : 'último msg del bot'}:{' '}
            {formatDateTime(s.last_bot_message_at)}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function MensajesProgramadosPage() {
  const [pendientes, setPendientes] = useState<SeguimientoWhatsapp[]>([]);
  const [enviados, setEnviados] = useState<SeguimientoWhatsapp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    pendientes: true,
    enviados: false,
  });

  const cargar = async () => {
    setIsLoading(true);
    try {
      const data = await getSeguimientosWhatsapp();
      setPendientes(data.pendientes);
      setEnviados(data.enviados);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const toggle = (key: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const matchesSearch = (s: SeguimientoWhatsapp): boolean => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    const nombre = (s.lead_nombre || s.customer_name || '').toLowerCase();
    const tel = String(s.phone || '');
    return nombre.includes(q) || tel.includes(searchTerm.trim());
  };

  const pendientesFiltrados = useMemo(() => pendientes.filter(matchesSearch), [pendientes, searchTerm]);
  const enviadosFiltrados = useMemo(() => enviados.filter(matchesSearch), [enviados, searchTerm]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-5">
          <nav className="text-xs text-gray-500 mb-2">Outbound · Mensajes programados</nav>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold text-gray-900">Mensajes programados</h1>
                <p className="text-xs text-gray-500">
                  {pendientes.length} pendientes · {enviados.length} enviados
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar por nombre o teléfono"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
              <button
                onClick={cargar}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Actualizar
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <Section
              title="Pendientes"
              count={pendientesFiltrados.length}
              expanded={expanded.pendientes}
              onToggle={() => toggle('pendientes')}
              emptyMessage={
                pendientes.length === 0
                  ? 'No hay seguimientos pendientes.'
                  : 'No se encontraron resultados con ese filtro.'
              }
            >
              <ul className="divide-y divide-gray-100">
                {pendientesFiltrados.map((s) => (
                  <Row key={`p-${s.phone}`} s={s} variant="pendiente" />
                ))}
              </ul>
            </Section>

            <Section
              title="Enviados"
              count={enviadosFiltrados.length}
              expanded={expanded.enviados}
              onToggle={() => toggle('enviados')}
              emptyMessage={
                enviados.length === 0
                  ? 'Todavía no hay seguimientos enviados.'
                  : 'No se encontraron resultados con ese filtro.'
              }
            >
              <ul className="divide-y divide-gray-100">
                {enviadosFiltrados.map((s) => (
                  <Row key={`e-${s.phone}`} s={s} variant="enviado" />
                ))}
              </ul>
            </Section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
