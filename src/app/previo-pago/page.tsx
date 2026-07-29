'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { WHATSAPP_TEMPLATES } from '@/lib/whatsapp-templates';
import {
  getPrevioPagoResumen,
  getPhonesYaCargados,
  cargarPrevioPago,
  type PrevioPagoResumen,
  type PrevioPagoContacto,
} from '../services/previoPagoService';

function formatFecha(value: string | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

const ESTADO_PILL_CLASS: Record<string, string> = {
  previopago: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  cancelled: 'bg-orange-50 text-orange-700',
  pending: 'bg-gray-100 text-gray-600',
  in_mediation: 'bg-gray-100 text-gray-600',
  refunded: 'bg-purple-50 text-purple-700',
};

export default function PrevioPagoPage() {
  const [resumen, setResumen] = useState<PrevioPagoResumen | null>(null);
  const [yaCargados, setYaCargados] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mostrarCompradores, setMostrarCompradores] = useState(false);

  const [templateKey, setTemplateKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [resumenData, cargados] = await Promise.all([getPrevioPagoResumen(), getPhonesYaCargados()]);
      setResumen(resumenData);
      setYaCargados(cargados);
      setSelected(new Set());
    } catch (e) {
      console.error('Error cargando previo pago:', e);
      setLoadError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const contactos = resumen?.contactos ?? [];

  const contactosFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return contactos.filter((c) => {
      if (statusFilter !== 'all' && !c.estados.includes(statusFilter)) return false;
      if (q && !c.nombre.toLowerCase().includes(q) && !c.telefonoRaw.includes(searchTerm.trim())) return false;
      return true;
    });
  }, [contactos, searchTerm, statusFilter]);

  const compradoresFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const compradores = resumen?.compradores ?? [];
    if (!q) return compradores;
    return compradores.filter(
      (c) => c.nombre.toLowerCase().includes(q) || c.telefonoRaw.includes(searchTerm.trim())
    );
  }, [resumen, searchTerm]);

  const seleccionables = useMemo(
    () => contactosFiltrados.filter((c) => !yaCargados.has(c.telefonoNormalizado)),
    [contactosFiltrados, yaCargados]
  );
  const todosSeleccionados = seleccionables.length > 0 && seleccionables.every((c) => selected.has(c.remoteJid));

  const toggleSeleccion = (remoteJid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(remoteJid)) next.delete(remoteJid);
      else next.add(remoteJid);
      return next;
    });
  };

  const toggleSeleccionarTodos = () => {
    setSelected((prev) => {
      if (todosSeleccionados) return new Set();
      const next = new Set(prev);
      seleccionables.forEach((c) => next.add(c.remoteJid));
      return next;
    });
  };

  const handleCargar = async () => {
    if (selected.size === 0 || !templateKey) return;
    const confirmado = window.confirm(
      `Esto crea/etiqueta ${selected.size} lead${selected.size === 1 ? '' : 's'} y dispara el envío REAL de WhatsApp ahora (no se programa para después). ¿Confirmás?`
    );
    if (!confirmado) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const items = contactos
        .filter((c) => selected.has(c.remoteJid))
        .map((c) => ({ remoteJid: c.remoteJid, nombre: c.nombre, estados: c.estados }));
      const resultado = await cargarPrevioPago(items, templateKey);
      if (resultado.success) {
        setFeedback({
          tipo: 'ok',
          texto: `Batch creado: ${resultado.total_efectivo} efectivos, ${resultado.total_excluido} excluidos (${resultado.leads_nuevos} leads nuevos, ${resultado.leads_existentes} ya existían).${resultado.warning ? ` ⚠ ${resultado.warning}` : ''}`,
        });
        const nuevosCargados = new Set(yaCargados);
        items.forEach((i) => nuevosCargados.add(i.remoteJid.replace(/\D/g, '').slice(-10)));
        setYaCargados(nuevosCargados);
        setSelected(new Set());
      } else {
        setFeedback({ tipo: 'error', texto: resultado.error });
      }
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error desconocido' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const estadosDisponibles = resumen ? Object.keys(resumen.porEstado).sort() : [];

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-5">
          <nav className="text-xs text-gray-500 mb-2">Outbound · Previo Pago</nav>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold text-gray-900">Previo Pago</h1>
                <p className="text-xs text-gray-500">
                  Contactos que iniciaron el pago pero nunca llegaron a <code>approved</code> — fuente:{' '}
                  <code>optingsha.com.ar/estado.log</code>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start">
              {!isLoading && !loadError && (
                <button
                  onClick={() => setMostrarCompradores((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    mostrarCompradores
                      ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {mostrarCompradores ? 'Ocultar' : 'Ver'} approved ({resumen!.compraron.toLocaleString('es-AR')})
                </button>
              )}
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
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
            Error al cargar el log: {loadError}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Líneas en el log" value={resumen!.totalLineas} />
              <StatTile label="Teléfonos únicos" value={resumen!.telefonosUnicos} />
              <StatTile label="Compraron" value={resumen!.compraron} />
              <StatTile label="Nunca pagaron" value={resumen!.abandonaron} highlight />
              <StatTile label="Tasa de abandono" value={resumen!.tasaAbandono} suffix="%" highlight />
              <StatTile
                label="Ya cargados como lead"
                value={contactos.filter((c) => yaCargados.has(c.telefonoNormalizado)).length}
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <input
                  type="text"
                  placeholder="Buscar por nombre o teléfono"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 flex-1"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                      statusFilter === 'all'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    todos
                  </button>
                  {estadosDisponibles.map((estado) => (
                    <button
                      key={estado}
                      onClick={() => setStatusFilter(estado)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                        statusFilter === estado
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {estado} · {resumen!.porEstado[estado]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {contactosFiltrados.length} contacto{contactosFiltrados.length === 1 ? '' : 's'} ·{' '}
                {seleccionables.length} disponibles para cargar · {selected.size} seleccionados
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                      <th className="px-4 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={todosSeleccionados}
                          onChange={toggleSeleccionarTodos}
                          disabled={seleccionables.length === 0}
                          className="accent-blue-600"
                        />
                      </th>
                      <th className="px-4 py-2.5">Nombre</th>
                      <th className="px-4 py-2.5">Teléfono</th>
                      <th className="px-4 py-2.5">Estados</th>
                      <th className="px-4 py-2.5">Intentos</th>
                      <th className="px-4 py-2.5">Último intento</th>
                      <th className="px-4 py-2.5">Lead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contactosFiltrados.map((c) => (
                      <ContactoRow
                        key={c.remoteJid}
                        contacto={c}
                        yaCargado={yaCargados.has(c.telefonoNormalizado)}
                        seleccionado={selected.has(c.remoteJid)}
                        onToggle={() => toggleSeleccion(c.remoteJid)}
                      />
                    ))}
                  </tbody>
                </table>
                {contactosFiltrados.length === 0 && (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">Sin resultados para ese filtro.</div>
                )}
              </div>
            </div>

            {mostrarCompradores && (
              <div className="bg-white border border-emerald-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800">
                  Compraron ({compradoresFiltrados.length}) — solo lectura, no necesitan seguimiento.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                        <th className="px-4 py-2.5">Nombre</th>
                        <th className="px-4 py-2.5">Teléfono</th>
                        <th className="px-4 py-2.5">Estados</th>
                        <th className="px-4 py-2.5">Intentos</th>
                        <th className="px-4 py-2.5">Último intento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {compradoresFiltrados.map((c) => (
                        <tr key={c.remoteJid} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{c.nombre}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">{c.telefonoRaw}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {c.estados.map((estado) => (
                                <span
                                  key={estado}
                                  className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded ${
                                    estado === 'approved'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : ESTADO_PILL_CLASS[estado] ?? 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {estado}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 tabular-nums">{c.intentos}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatFecha(c.ultimoIntento)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {compradoresFiltrados.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-gray-500">Sin resultados para ese filtro.</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!isLoading && !loadError && (
        <div className="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur px-4 md:px-6 py-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="text-sm text-gray-700 font-medium whitespace-nowrap">
              {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
            </div>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 flex-1 md:max-w-xs"
            >
              <option value="">Seleccioná una plantilla</option>
              {WHATSAPP_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.displayName}
                </option>
              ))}
            </select>
            <button
              onClick={handleCargar}
              disabled={selected.size === 0 || !templateKey || isSubmitting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSubmitting ? 'Enviando…' : 'Cargar y enviar ahora'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            No programa: dispara el envío real por WhatsApp (mismo mecanismo que Envíos masivos) al confirmar.
          </p>
          {feedback && (
            <p className={`text-xs mt-2 ${feedback.tipo === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
              {feedback.texto}
            </p>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function StatTile({
  label,
  value,
  highlight,
  suffix,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  suffix?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5">
      <div className={`text-2xl font-semibold tabular-nums ${highlight ? 'text-amber-600' : 'text-gray-900'}`}>
        {value.toLocaleString('es-AR')}
        {suffix}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function ContactoRow({
  contacto,
  yaCargado,
  seleccionado,
  onToggle,
}: {
  contacto: PrevioPagoContacto;
  yaCargado: boolean;
  seleccionado: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className={`hover:bg-gray-50 ${seleccionado ? 'bg-blue-50/50' : ''}`}>
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          checked={seleccionado}
          disabled={yaCargado}
          onChange={onToggle}
          className="accent-blue-600 disabled:opacity-30"
        />
      </td>
      <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{contacto.nombre}</td>
      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap tabular-nums">{contacto.telefonoRaw}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {contacto.estados.map((estado) => (
            <span
              key={estado}
              className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded ${
                ESTADO_PILL_CLASS[estado] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {estado}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5 text-gray-600 tabular-nums">{contacto.intentos}</td>
      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatFecha(contacto.ultimoIntento)}</td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {yaCargado ? (
          <span className="inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded bg-emerald-50 text-emerald-700">
            ya cargado
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}
