'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'centro-llamadas:agente-telefono';

/**
 * Teléfono del agente que recibe el primer leg de la llamada.
 *
 * Es una comodidad de ESTE navegador, no un dato del CRM: se guarda en
 * localStorage para no reescribirlo en cada llamada. Si el storage está
 * bloqueado (modo privado), simplemente se escribe a mano cada vez.
 */
export function useAgenteTelefono() {
  const [agenteTelefono, setAgenteTelefono] = useState('');

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) setAgenteTelefono(guardado);
    } catch {
      /* storage no disponible */
    }
  }, []);

  useEffect(() => {
    try {
      if (agenteTelefono) localStorage.setItem(STORAGE_KEY, agenteTelefono);
    } catch {
      /* storage no disponible */
    }
  }, [agenteTelefono]);

  return { agenteTelefono, setAgenteTelefono };
}
