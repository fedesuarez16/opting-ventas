'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getContactos,
  getLotes,
  previsualizar,
  importarContactos,
  corregirTelefono,
  cambiarEstado,
  dispararContacto,
  type ContactoDiscado,
  type EstadoContacto,
} from '../services/contactosDiscadoService';
import type { ResultadoImport } from '@/lib/contactosDiscadoImport';
import { useAgenteTelefono } from './useAgenteTelefono';

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
  const [texto, setTexto] = useState('');
  const [lote, setLote] = useState('');
  const [importando, setImportando] = useState(false);

  const { agenteTelefono, setAgenteTelefono } = useAgenteTelefono();
  const [llamando, setLlamando] = useState<Set<string>>(new Set());
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
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setImportAbierto((v) => !v)}>
            {importAbierto ? 'Cerrar' : 'Importar base'}
          </Button>
        </div>
      </div>

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
            placeholder={'Pegá la base acá.\nUna fila por línea: nombre, dirección, teléfono separados por TAB.'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
          />

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
            <Button size="sm" disabled={!texto.trim() || importando} onClick={onImportar}>
              {importando ? 'Importando…' : 'Importar'}
            </Button>
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
              <th className="px-3 py-2">Comercio</th>
              <th className="px-3 py-2">Dirección</th>
              <th className="px-3 py-2">Original</th>
              <th className="px-3 py-2">A discar</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contactos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No hay contactos. Usá “Importar base” para cargar una.
                </td>
              </tr>
            )}

            {contactos.map((c) => {
              const enEdicion = editando?.id === c.id;
              const discable = !!c.telefono_e164 && c.estado !== 'descartado';
              const ocupado = llamando.has(c.id) || c.estado === 'llamando';

              return (
                <tr key={c.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium text-foreground">{c.nombre}</td>
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
