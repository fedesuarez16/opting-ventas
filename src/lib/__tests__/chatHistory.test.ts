import { describe, it, expect } from 'vitest';
import { buildChatHistoryMessage } from '../chatHistory';

const fecha = '2026-08-07T14:02:01.468Z';
const contenido = '[Plantilla enviada: Previo Pago — Seguimiento mismo día]';
const phone = '+5491125077636';

describe('buildChatHistoryMessage', () => {
  it("declara type: sin ese campo LangChain tira 'Got unexpected type: undefined' y mata al agente", () => {
    expect(buildChatHistoryMessage({ phone, contenido, fecha }).type).toBe('ai');
  });

  it('replica el shape plano que escribe el Postgres Chat Memory de n8n', () => {
    expect(buildChatHistoryMessage({ phone, contenido, fecha })).toMatchObject({
      type: 'ai',
      content: contenido,
      tool_calls: [],
      invalid_tool_calls: [],
      additional_kwargs: {},
      response_metadata: {},
    });
  });

  it('mantiene los campos que /chat usa para pintar la burbuja como saliente', () => {
    expect(buildChatHistoryMessage({ phone, contenido, fecha })).toMatchObject({
      text: contenido,
      message_type: 1,
      direction: 'outbound',
      phone_number: phone,
      from: phone,
      status: 'sent',
      created_at: fecha,
    });
  });

  it("marca entrante cuando el turno es 'human'", () => {
    expect(
      buildChatHistoryMessage({ phone, contenido, fecha, type: 'human' })
    ).toMatchObject({
      type: 'human',
      message_type: 0,
      direction: 'inbound',
    });
  });
});
