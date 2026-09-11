'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { normalizarTelefonoAR } from '@/lib/telefonoAR';
import { useAgenteTelefono } from './useAgenteTelefono';

/**
 * Marcado manual: escribís un número y llama, sin pasar por lead ni por la base.
 * Muestra la normalización EN VIVO para que se vea a qué número va a discar
 * realmente antes de apretar.
 */
export default function MarcadorRapido({ onLlamada }: { onLlamada?: () => void }) {
  const { agenteTelefono, setAgenteTelefono } = useAgenteTelefono();
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [llamando, setLlamando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const destino = useMemo(
    () => (telefono.trim() ? normalizarTelefonoAR(telefono) : null),
    [telefono],
  );
  const agente = useMemo(
    () => (agenteTelefono.trim() ? normalizarTelefonoAR(agenteTelefono) : null),
    [agenteTelefono],
  );

  const puedeLlamar = !!destino?.e164 && !!agente?.e164 && !llamando;

  const llamar = async () => {
    if (!puedeLlamar) return;
    setLlamando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch('/api/llamadas/manual/disparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, nombre, agenteTelefono }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo llamar');

      setAviso(`Llamando a ${json.destino}. Atendé tu teléfono: suena primero el del agente.`);
      setTelefono('');
      setNombre('');
      onLlamada?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo llamar');
    } finally {
      setLlamando(false);
    }
  };

  return (
    <div className="mb-4 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="mrAgente" className="text-xs font-medium text-muted-foreground">
            Teléfono del agente (suena primero)
          </label>
          <input
            id="mrAgente"
            type="tel"
            value={agenteTelefono}
            onChange={(e) => setAgenteTelefono(e.target.value)}
            placeholder="+54 9 11 5555-1234"
            className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mrDestino" className="text-xs font-medium text-muted-foreground">
            Número a llamar
          </label>
          <input
            id="mrDestino"
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void llamar(); }}
            placeholder="11 5555-1234"
            className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="mrNombre" className="text-xs font-medium text-muted-foreground">
            Nombre (opcional)
          </label>
          <input
            id="mrNombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Para identificarlo después"
            className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <Button size="sm" disabled={!puedeLlamar} onClick={() => void llamar()}>
          {llamando ? 'Llamando…' : 'Llamar'}
        </Button>
      </div>

      {/* Qué número se va a discar realmente */}
      {destino && (
        <div className="mt-2 font-mono text-xs">
          {destino.e164 ? (
            <span className={destino.asumido ? 'text-amber-700' : 'text-emerald-700'}>
              → {destino.e164} ({destino.tipo})
              {destino.asumido && ' · formato asumido, revisalo'}
            </span>
          ) : (
            <span className="text-red-600">→ {destino.motivo}</span>
          )}
        </div>
      )}

      {agenteTelefono.trim() && !agente?.e164 && (
        <div className="mt-1 text-xs text-red-600">
          El teléfono del agente no es válido: {agente?.motivo}
        </div>
      )}

      {aviso && <div className="mt-2 text-xs text-emerald-700">{aviso}</div>}
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
