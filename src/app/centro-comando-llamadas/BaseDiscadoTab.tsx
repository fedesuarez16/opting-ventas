'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getContactos,
  getLotes,
  previsualizar,
  importarContactos,
  agregarContacto,
  corregirTelefono,
  actualizarObservacion,
  cambiarEstado,
  dispararContacto,
  type ContactoDiscado,
  type EstadoContacto,
} from '../services/contactosDiscadoService';
import type { ResultadoImport } from '@/lib/contactosDiscadoImport';
import { useAgenteTelefono } from './useAgenteTelefono';
import NotasModal from './NotasModal';
import { normalizarTelefonoAR } from '@/lib/telefonoAR';

const ESTADO_BADGE: Record<EstadoContacto, string> = {
  pendiente: 'bg-slate-100 text-slate-700 border-slate-200',
  llamando: 'bg-amber-100 text-amber-800 border-amber-200',
  llamado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  descartado: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

export default function BaseDiscadoTab() {
  const [contactos, setContactos] = useState<ContactoDiscado[]>([]);
  const [lotes, setLotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [estadoFilter, setEstadoFilter] = useState<EstadoContacto | 'todos'>('todos');
  const [loteFilter, setLoteFilter] = useState<string>('todos');

  const [importAbierto, setImportAbierto] = useState(false);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [alta, setAlta] = useState({ nombre: '', telefono: '', direccion: '', observacion: '' });
  const [guardandoAlta, setGuardandoAlta] = useState(false);
  const [texto, setTexto] = useState('');
  const [lote, setLote] = useState('');
  const [importando, setImportando] = useState(false);

  const { agenteTelefono, setAgenteTelefono } = useAgenteTelefono();
  const [llamando, setLlamando] = useState<Set<string>>(new Set());
  const [sesion, setSesion] = useState<any | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [tandaBusy, setTandaBusy] = useState(false);
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [filas, ls] = await Promise.all([
        getContactos({ estado: estadoFilter, lote: loteFilter }),
        getLotes(),
      ]);
      setContactos(filas);
      setLotes(ls);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron cargar los contactos');
    } finally {
      setLoading(false);
    }
  }, [estadoFilter, loteFilter]);

  useEffect(() => { void reload(); }, [reload]);

  // Estado de la tanda: mientras hay una sesión abierta se refresca sola, así
  // se ve avanzar la cola sin tocar nada.
  const cargarSesion = useCallback(async () => {
    try {
      const res = await fetch('/api/llamadas/discado/sesion/estado');
      const json = await res.json();
      setSesion(json?.sesion ?? null);
      return json?.sesion ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => { void cargarSesion(); }, [cargarSesion]);

  useEffect(() => {
    if (!sesion) return;
    const t = setInterval(() => {
      void cargarSesion().then((s) => { if (s) void reload(); });
    }, 5000);
    return () => clearInterval(t);
  }, [sesion, cargarSesion, reload]);

  // Sólo tiene sentido seleccionar lo que se puede discar.
  const seleccionables = useMemo(
    () => contactos.filter((c) => c.telefono_e164 && c.estado === 'pendiente'),
    [contactos],
  );

  const toggleUno = (id: string) => {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleTodos = () => {
    setSeleccion((prev) =>
      prev.size === seleccionables.length ? new Set() : new Set(seleccionables.map((c) => c.id)),
    );
  };

  const iniciarTanda = async () => {
    if (!agenteTelefono.trim()) {
      setError('Cargá el teléfono del agente antes de arrancar la tanda.');
      return;
    }
    setTandaBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/llamadas/discado/sesion/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenteTelefono,
          lote: loteFilter === 'todos' ? null : loteFilter,
          contactoIds: seleccion.size > 0 ? Array.from(seleccion) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo iniciar la tanda');
      setAviso(
        seleccion.size > 0
          ? `Tanda iniciada con ${seleccion.size} contactos seleccionados. Atendé tu teléfono y quedate en línea.`
          : 'Tanda iniciada. Atendé tu teléfono y quedate en línea: no vuelve a sonar.',
      );
      setSeleccion(new Set());
      await cargarSesion();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo iniciar la tanda');
    } finally {
      setTandaBusy(false);
    }
  };

  const detenerTanda = async () => {
    if (!sesion) return;
    setTandaBusy(true);
    try {
      await fetch('/api/llamadas/discado/sesion/detener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sesionId: sesion.id }),
      });
      setAviso('Tanda detenida.');
      await cargarSesion();
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo detener');
    } finally {
      setTandaBusy(false);
    }
  };

  const preview: ResultadoImport | null = useMemo(
    () => (texto.trim() ? previsualizar(texto) : null),
    [texto],
  );

  const previewStats = useMemo(() => {
    if (!preview) return null;
    const ok = preview.contactos.filter((c) => c.telefono_e164);
    return {
      ok: ok.length,
      asumidos: ok.filter((c) => c.asumido).length,
      invalidos: preview.contactos.length - ok.length,
      duplicados: preview.duplicados,
      descartadas: preview.descartadas.length,
    };
  }, [preview]);

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTexto(await file.text());
    if (!lote) setLote(file.name.replace(/\.[^.]+$/, ''));
  };

  const onImportar = async () => {
    if (!texto.trim()) return;
    setImportando(true);
    setError(null);
    try {
      const r = await importarContactos(texto, lote);
      setAviso(
        `Importados ${r.insertados}. Ya existían ${r.yaExistian}. ` +
        `Sin teléfono válido ${r.invalidos}. Repetidos en el pegado ${r.duplicadosEnElArchivo}.`,
      );
      setTexto('');
      setImportAbierto(false);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo importar');
    } finally {
      setImportando(false);
    }
  };

  const altaDestino = useMemo(
    () => (alta.telefono.trim() ? normalizarTelefonoAR(alta.telefono) : null),
    [alta.telefono],
  );

  const onAgregar = async () => {
    setGuardandoAlta(true);
    setError(null);
    try {
      await agregarContacto({
        nombre: alta.nombre,
        telefono: alta.telefono,
        direccion: alta.direccion,
        observacion: alta.observacion,
        lote: loteFilter === 'todos' ? null : loteFilter,
      });
      setAviso(`${alta.nombre.trim()} agregado a la base.`);
      setAlta({ nombre: '', telefono: '', direccion: '', observacion: '' });
      setAltaAbierta(false);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo agregar');
    } finally {
      setGuardandoAlta(false);
    }
  };

  const onLlamar = async (c: ContactoDiscado) => {
    if (!agenteTelefono.trim()) {
      setError('Cargá el teléfono del agente antes de llamar: es el que suena primero.');
      return;
    }
    setLlamando((prev) => new Set(prev).add(c.id));
    setError(null);
    try {
      await dispararContacto(c.id, agenteTelefono);
      setAviso(`Llamando a ${c.nombre}. Atendé tu teléfono: suena primero el del agente.`);
      await reload();
    } catch (e: any) {
      setError(`${c.nombre}: ${e?.message ?? 'no se pudo llamar'}`);
      await reload();
    } finally {
      setLlamando((prev) => {
        const s = new Set(prev);
        s.delete(c.id);
        return s;
      });
    }
  };

  const onGuardarTelefono = async () => {
    if (!editando) return;
    try {
      await corregirTelefono(editando.id, editando.valor);
      setEditando(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Teléfono inválido');
    }
  };

  const onDescartar = async (c: ContactoDiscado) => {
    try {
      await cambiarEstado(c.id, c.estado === 'descartado' ? 'pendiente' : 'descartado');
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cambiar el estado');
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Barra: agente + filtros + importar */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="agenteTel" className="text-xs font-medium text-muted-foreground">
            Teléfono del agente (suena primero)
          </label>
          <input
            id="agenteTel"
            type="tel"
            value={agenteTelefono}
            onChange={(e) => setAgenteTelefono(e.target.value)}
            placeholder="+54 9 11 5555-1234"
            className="w-52 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="estadoContacto" className="text-xs font-medium text-muted-foreground">Estado</label>
          <select
            id="estadoContacto"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value as EstadoContacto | 'todos')}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="llamando">Llamando</option>
            <option value="llamado">Llamado</option>
            <option value="error">Error</option>
            <option value="descartado">Descartado</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="loteContacto" className="text-xs font-medium text-muted-foreground">Lote</label>
          <select
            id="loteContacto"
            value={loteFilter}
            onChange={(e) => setLoteFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="todos">Todos</option>
            {lotes.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{contactos.length} contactos</span>
          {sesion ? (
            <Button size="sm" variant="destructive" className="text-xs" disabled={tandaBusy} onClick={() => void detenerTanda()}>
              {tandaBusy ? 'Deteniendo…' : 'Detener tanda'}
            </Button>
          ) : (
            <Button size="sm" className="text-xs" disabled={tandaBusy} onClick={() => void iniciarTanda()}>
              {tandaBusy
                ? 'Iniciando…'
                : seleccion.size > 0
                  ? `Llamar a los ${seleccion.size} seleccionados`
                  : 'Iniciar tanda'}
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setAltaAbierta((v) => !v)}>
            {altaAbierta ? 'Cerrar' : 'Agregar contacto'}
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setImportAbierto((v) => !v)}>
            {importAbierto ? 'Cerrar' : 'Importar base'}
          </Button>
        </div>
      </div>

      {/* Alta manual */}
      {altaAbierta && (
        <div className="mb-4 rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="altaNombre" className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <input
                id="altaNombre"
                value={alta.nombre}
                onChange={(e) => setAlta({ ...alta, nombre: e.target.value })}
                placeholder="Nombre del comercio"
                className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="altaTel" className="text-xs font-medium text-muted-foreground">Teléfono *</label>
              <input
                id="altaTel"
                type="tel"
                value={alta.telefono}
                onChange={(e) => setAlta({ ...alta, telefono: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void onAgregar(); }}
                placeholder="11 5555-1234"
                className="w-44 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="altaDir" className="text-xs font-medium text-muted-foreground">Dirección</label>
              <input
                id="altaDir"
                value={alta.direccion}
                onChange={(e) => setAlta({ ...alta, direccion: e.target.value })}
                className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="altaObs" className="text-xs font-medium text-muted-foreground">Nota</label>
              <input
                id="altaObs"
                value={alta.observacion}
                onChange={(e) => setAlta({ ...alta, observacion: e.target.value })}
                className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={!alta.nombre.trim() || !altaDestino?.e164 || guardandoAlta}
              onClick={() => void onAgregar()}
            >
              {guardandoAlta ? 'Guardando…' : 'Agregar'}
            </Button>
          </div>

          {altaDestino && (
            <div className="mt-2 font-mono text-xs">
              {altaDestino.e164 ? (
                <span className={altaDestino.asumido ? 'text-amber-700' : 'text-emerald-700'}>
                  → {altaDestino.e164} ({altaDestino.tipo})
                  {altaDestino.asumido && ' · formato asumido, revisalo'}
                </span>
              ) : (
                <span className="text-red-600">→ {altaDestino.motivo}</span>
              )}
            </div>
          )}

          {loteFilter !== 'todos' && (
            <div className="mt-1 text-xs text-muted-foreground">
              Se va a guardar en el lote <strong>{loteFilter}</strong>.
            </div>
          )}
        </div>
      )}

      {/* Importador */}
      {importAbierto && (
        <div className="mb-4 rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="Nombre del lote (ej: gastronomía-caba)"
              className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
            <input type="file" accept=".csv,.tsv,.txt" onChange={onArchivo} className="text-xs" />
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={8}
            placeholder={'Pegá la base acá, o subí el CSV.\nReconoce comas, tabs y punto y coma, y ubica las columnas solo.'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
          />

          {preview?.mapeo && (
            <div className="mt-2 rounded border border-border bg-muted/40 px-2 py-1.5 text-xs">
              <span className="font-medium text-muted-foreground">Columnas detectadas</span>{' '}
              <span className="text-muted-foreground">({preview.mapeo.separador})</span>:{' '}
              nombre <code>#{preview.mapeo.nombre + 1}</code>
              {preview.mapeo.direccion !== null && <> · dirección <code>#{preview.mapeo.direccion + 1}</code></>}
              {' '}· teléfono <code>#{preview.mapeo.telefono + 1}</code>
              {preview.mapeo.observacion !== null && <> · observación <code>#{preview.mapeo.observacion + 1}</code></>}
            </div>
          )}

          {preview && !preview.mapeo && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
              No pude reconocer ninguna columna de teléfonos. Revisá que el archivo tenga una
              columna con números argentinos.
            </div>
          )}

          {previewStats && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-emerald-700">{previewStats.ok} listos para llamar</span>
              {previewStats.asumidos > 0 && (
                <span className="text-amber-700">{previewStats.asumidos} con número asumido (revisalos)</span>
              )}
              {previewStats.invalidos > 0 && (
                <span className="text-red-700">{previewStats.invalidos} sin teléfono argentino válido</span>
              )}
              {previewStats.duplicados > 0 && (
                <span className="text-muted-foreground">{previewStats.duplicados} repetidos</span>
              )}
              {previewStats.descartadas > 0 && (
                <span className="text-muted-foreground">{previewStats.descartadas} filas ilegibles</span>
              )}
            </div>
          )}

          <div className="mt-3">
            <Button size="sm" disabled={!texto.trim() || !preview?.mapeo || importando} onClick={onImportar}>
              {importando ? 'Importando…' : 'Importar'}
            </Button>
            {importando && previewStats && previewStats.ok > 500 && (
              <span className="ml-2 text-xs text-muted-foreground">
                Son {previewStats.ok} contactos, va por tandas: puede tardar un rato.
              </span>
            )}
          </div>
        </div>
      )}

      {seleccion.size > 0 && !sesion && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>
            <strong>{seleccion.size}</strong> seleccionados. Al iniciar la tanda se va a llamar
            sólo a estos, en orden, y cada uno queda marcado según cómo salga la llamada.
          </span>
          <button type="button" onClick={() => setSeleccion(new Set())} className="ml-3 text-xs text-blue-700 hover:underline">
            Limpiar
          </button>
        </div>
      )}

      {sesion && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">
              {sesion.estado === 'esperando_agente'
                ? 'Esperando que atiendas…'
                : 'Tanda en curso'}
            </span>
            <span>Llamadas hechas: {sesion.llamadas_hechas}</span>
            {sesion.contacto && (
              <span>
                Llamando a: <strong>{sesion.contacto.nombre || 'sin nombre'}</strong>
                {sesion.contacto.telefono_e164 && (
                  <span className="ml-1 font-mono text-xs text-blue-700">
                    {sesion.contacto.telefono_e164}
                  </span>
                )}
              </span>
            )}
            {sesion.lote && <span className="text-blue-700">Lote: {sesion.lote}</span>}
          </div>
          <div className="mt-1 text-xs text-blue-700">
            Quedate en línea: entre llamada y llamada vas a escuchar música de espera, tu teléfono no vuelve a sonar.
          </div>
        </div>
      )}

      {aviso && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="ml-3 text-xs text-emerald-600 hover:underline">Cerrar</button>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-3 text-xs text-red-600 hover:underline">Cerrar</button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={seleccionables.length > 0 && seleccion.size === seleccionables.length}
                  onChange={toggleTodos}
                  disabled={seleccionables.length === 0 || !!sesion}
                />
              </th>
              <th className="px-3 py-2">Comercio</th>
              <th className="px-3 py-2">Dirección</th>
              <th className="px-3 py-2">Original</th>
              <th className="px-3 py-2">A discar</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Notas</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contactos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No hay contactos. Usá “Importar base” para cargar una.
                </td>
              </tr>
            )}

            {contactos.map((c) => {
              const enEdicion = editando?.id === c.id;
              const discable = !!c.telefono_e164 && c.estado !== 'descartado';
              const ocupado = llamando.has(c.id) || c.estado === 'llamando';

              return (
                <tr
                  key={c.id}
                  className={
                    'border-t border-border align-top ' +
                    (seleccion.has(c.id) ? 'bg-blue-50/60' : '')
                  }
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${c.nombre}`}
                      checked={seleccion.has(c.id)}
                      onChange={() => toggleUno(c.id)}
                      disabled={!c.telefono_e164 || c.estado !== 'pendiente' || !!sesion}
                      title={
                        !c.telefono_e164
                          ? 'Sin teléfono válido'
                          : c.estado !== 'pendiente'
                            ? `Ya está en estado "${c.estado}"`
                            : undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {c.nombre}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.direccion ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.telefono_crudo}</td>
                  <td className="px-3 py-2">
                    {enEdicion ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editando.valor}
                          onChange={(e) => setEditando({ id: c.id, valor: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void onGuardarTelefono();
                            if (e.key === 'Escape') setEditando(null);
                          }}
                          className="w-44 rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                        />
                        <button type="button" onClick={() => void onGuardarTelefono()} className="text-xs text-blue-600 hover:underline">Guardar</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditando({ id: c.id, valor: c.telefono_e164 ?? c.telefono_crudo })}
                        className="text-left font-mono text-xs hover:underline"
                        title="Click para corregir"
                      >
                        {c.telefono_e164 ? (
                          <span className={c.asumido ? 'text-amber-700' : 'text-foreground'}>
                            {c.telefono_e164}
                            {c.asumido && <span className="ml-1" title="Se asumió el formato: revisalo">~</span>}
                            {c.tipo && <span className="ml-1 text-muted-foreground">({c.tipo})</span>}
                          </span>
                        ) : (
                          <span className="text-red-600">sin número válido</span>
                        )}
                      </button>
                    )}
                    {c.ultimo_error && (
                      <div className="mt-0.5 text-[11px] text-red-600">{c.ultimo_error}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded border px-2 py-0.5 text-xs ${ESTADO_BADGE[c.estado]}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <NotasModal
                      valor={c.observacion}
                      titulo={c.nombre}
                      onGuardar={async (observacion) => {
                        const actualizado = await actualizarObservacion(c.id, observacion);
                        setContactos((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        className="text-xs"
                        disabled={!discable || ocupado}
                        title={!c.telefono_e164 ? 'Corregí el teléfono antes de llamar' : undefined}
                        onClick={() => void onLlamar(c)}
                      >
                        {ocupado ? 'Llamando…' : 'Llamar'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => void onDescartar(c)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {c.estado === 'descartado' ? 'Recuperar' : 'Descartar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
