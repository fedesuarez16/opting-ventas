'use client';

import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Lead } from '../types';
import { WHATSAPP_TEMPLATES, getTemplateByKey } from '@/lib/whatsapp-templates';
import { isAllowedPhoneFrom } from '@/lib/whatsapp-lines';

export interface BulkSendResult {
  batch_id: string;
  total_seleccionado: number;
  total_efectivo: number;
  total_excluido: number;
  excluded_by_reason: {
    estado_bloqueado: number;
    deriva_humano: number;
    phone_from_null: number;
    phone_from_invalido: number;
    duplicado: number;
  };
  warning?: string;
}

interface BulkSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeads: Lead[];
  onSuccess?: (result: BulkSendResult) => void;
}

export default function BulkSendModal({ open, onOpenChange, selectedLeads, onSuccess }: BulkSendModalProps) {
  const [templateKey, setTemplateKey] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { counts, efectivo } = useMemo(() => {
    const counts = {
      estado_bloqueado: 0,
      deriva_humano: 0,
      phone_from_null: 0,
      phone_from_invalido: 0,
      duplicado: 0,
    };
    const seenPhones = new Set<string>();
    let efectivo = 0;
    for (const lead of selectedLeads) {
      if (lead.estado === 'llamada') { counts.estado_bloqueado++; continue; }
      if (lead.deriva_humano === true) { counts.deriva_humano++; continue; }
      if (!lead.phone_from) { counts.phone_from_null++; continue; }
      if (!isAllowedPhoneFrom(lead.phone_from)) { counts.phone_from_invalido++; continue; }
      if (lead.phone && seenPhones.has(lead.phone)) { counts.duplicado++; continue; }
      if (lead.phone) seenPhones.add(lead.phone);
      efectivo++;
    }
    return { counts, efectivo };
  }, [selectedLeads]);

  const selectedTemplate = templateKey ? getTemplateByKey(templateKey) : undefined;

  const totalExcluido =
    counts.estado_bloqueado +
    counts.deriva_humano +
    counts.phone_from_null +
    counts.phone_from_invalido +
    counts.duplicado;

  const handleSubmit = async () => {
    if (!templateKey || efectivo === 0) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/leads/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: selectedLeads.map((l) => Number(l.id)),
          templateKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error || 'Error desconocido');
        return;
      }
      onSuccess?.(json as BulkSendResult);
    } catch {
      setErrorMessage('Error de red. Intentá de nuevo.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-6 shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            Enviar plantilla a {selectedLeads.length} {selectedLeads.length === 1 ? 'lead' : 'leads'}
          </Dialog.Title>

          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Plantillas placeholder — los nombres HSM deben aprobarse en Meta antes del primer envío real.
          </div>

          <div className="mt-4 space-y-1">
            <label htmlFor="template-select" className="block text-sm font-medium text-gray-700">
              Plantilla
            </label>
            <select
              id="template-select"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Seleccioná una plantilla</option>
              {WHATSAPP_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {selectedTemplate.description}
            </div>
          )}

          <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Total seleccionados</span>
              <span className="font-medium text-gray-900">{selectedLeads.length}</span>
            </div>
            {counts.estado_bloqueado > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Excluidos por estado &apos;llamada&apos;</span>
                <span>{counts.estado_bloqueado}</span>
              </div>
            )}
            {counts.deriva_humano > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Excluidos por deriva humano</span>
                <span>{counts.deriva_humano}</span>
              </div>
            )}
            {counts.phone_from_null > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Excluidos por línea nula</span>
                <span>{counts.phone_from_null}</span>
              </div>
            )}
            {counts.phone_from_invalido > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Excluidos por línea inválida</span>
                <span>{counts.phone_from_invalido}</span>
              </div>
            )}
            {counts.duplicado > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Excluidos por teléfono duplicado</span>
                <span>{counts.duplicado}</span>
              </div>
            )}
            {totalExcluido > 0 && (
              <div className="flex justify-between text-gray-500 border-t border-gray-200 pt-1">
                <span>Total excluidos</span>
                <span>{totalExcluido}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold text-gray-900">
              <span>Efectivos a enviar</span>
              <span>{efectivo}</span>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!templateKey || efectivo === 0 || isSending}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isSending ? 'Enviando…' : `Confirmar envío de ${efectivo} ${efectivo === 1 ? 'mensaje' : 'mensajes'}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
