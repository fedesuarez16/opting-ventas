import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildConversacionUrl } from './llamadasService';

describe('buildConversacionUrl', () => {
  it('returns null for null', () => expect(buildConversacionUrl(null)).toBeNull());
  it('returns null for undefined', () => expect(buildConversacionUrl(undefined)).toBeNull());
  it('returns null for empty string', () => expect(buildConversacionUrl('')).toBeNull());
  it('returns null for whitespace-only', () => expect(buildConversacionUrl('   ')).toBeNull());
  it('builds URL from E164 phone', () =>
    expect(buildConversacionUrl('+5491141872290')).toBe('/chat?phoneNumber=%2B5491141872290'));
  it('builds URL from digits-only phone', () =>
    expect(buildConversacionUrl('5491141872290')).toBe('/chat?phoneNumber=%2B5491141872290'));
  it('strips formatting chars', () =>
    expect(buildConversacionUrl('+549 114 187-2290')).toBe('/chat?phoneNumber=%2B5491141872290'));
});

// ─── getLlamadasAll ───────────────────────────────────────────────────────────
// The service reads env vars at module-load time, so we must reset the module
// registry and re-import the service fresh for each test group. We use
// vi.resetModules() + vi.doMock() + dynamic import inside a single describe
// block that runs its own beforeAll.

describe('getLlamadasAll', () => {
  // Shared mock refs — re-assigned in beforeEach so each test gets fresh spies
  let mockEq: ReturnType<typeof vi.fn>;
  let mockOrder: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockFrom: ReturnType<typeof vi.fn>;
  let getLlamadasAll: (estado?: string) => Promise<unknown[]>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key');

    mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
    mockOrder = vi.fn().mockReturnValue(
      Object.assign(Promise.resolve({ data: [], error: null }), { eq: mockEq }),
    );
    mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ from: mockFrom })),
    }));

    const mod = await import('./llamadasService');
    getLlamadasAll = mod.getLlamadasAll as any;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin estado: devuelve todas las filas ordenadas DESC', async () => {
    const rows = [
      { id: '1', inicio: '2026-06-19T10:00:00Z', estado: 'agendada', lead: { id: 1, nombre: 'Ana', phone: '+54911' } },
      { id: '2', inicio: '2026-06-18T09:00:00Z', estado: 'realizada', lead: null },
    ];
    mockOrder.mockReturnValue(
      Object.assign(Promise.resolve({ data: rows, error: null }), { eq: mockEq }),
    );

    const result = await getLlamadasAll();

    expect(mockFrom).toHaveBeenCalledWith('llamadas_agendadas');
    expect(mockOrder).toHaveBeenCalledWith('inicio', { ascending: false });
    expect(mockEq).not.toHaveBeenCalled();
    expect(result).toEqual(rows);
  });

  it('con estado "agendada": agrega filtro eq', async () => {
    const rows = [{ id: '3', estado: 'agendada', lead: null }];
    mockEq.mockResolvedValue({ data: rows, error: null });

    const result = await getLlamadasAll('agendada');

    expect(mockEq).toHaveBeenCalledWith('estado', 'agendada');
    expect(result).toEqual(rows);
  });

  it('resultado vacío: retorna []', async () => {
    mockOrder.mockReturnValue(
      Object.assign(Promise.resolve({ data: null, error: null }), { eq: mockEq }),
    );

    const result = await getLlamadasAll();

    expect(result).toEqual([]);
  });

  it('error de supabase: lanza el error', async () => {
    const supabaseError = { message: 'DB error', code: '42P01' };
    mockOrder.mockReturnValue(
      Object.assign(Promise.resolve({ data: null, error: supabaseError }), { eq: mockEq }),
    );

    await expect(getLlamadasAll()).rejects.toEqual(supabaseError);
  });
});
