import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Usar service role key para tener permisos completos
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * API endpoint para marcar un lead como "llamada" cuando no responde al seguimiento
 * 
 * Este endpoint debe ser llamado desde n8n cuando:
 * 1. Se envió un follow-up
 * 2. Pasaron X minutos (ej: 15 minutos)
 * 3. El usuario NO respondió (responded = false)
 * 
 * POST /api/leads/mark-as-call
 * Body: { phone: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Normalizar el número de teléfono (solo dígitos)
    const digitsOnly = phone.replace(/[^\d]/g, '');
    
    if (!digitsOnly) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    console.log(`📞 Marcando lead como "llamada" para teléfono: ${digitsOnly}`);

    // Buscar el lead usando múltiples variantes (similar a findLeadByPhone)
    // Intentar primero con el número exacto (solo dígitos)
    let { data: leads, error: searchError } = await supabase
      .from('leads')
      .select('id, whatsapp_id, telefono, estado, nombre')
      .eq('whatsapp_id', digitsOnly)
      .limit(1);

    // Si no se encuentra, intentar con + al inicio
    if ((!leads || leads.length === 0) && !searchError) {
      const result2 = await supabase
        .from('leads')
        .select('id, whatsapp_id, telefono, estado, nombre')
        .eq('whatsapp_id', `+${digitsOnly}`)
        .limit(1);
      
      if (result2.data && result2.data.length > 0) {
        leads = result2.data;
        searchError = result2.error;
      }
    }

    // Si aún no se encuentra, intentar con búsqueda parcial (ilike)
    if ((!leads || leads.length === 0) && !searchError) {
      const result3 = await supabase
        .from('leads')
        .select('id, whatsapp_id, telefono, estado, nombre')
        .ilike('whatsapp_id', `%${digitsOnly}%`)
        .limit(1);
      
      if (result3.data && result3.data.length > 0) {
        leads = result3.data;
        searchError = result3.error;
      }
    }

    if (searchError) {
      console.error('Error buscando lead:', searchError);
      return NextResponse.json(
        { error: 'Error searching for lead', details: searchError.message },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      console.warn(`⚠️ No se encontró lead con teléfono: ${digitsOnly}`);
      return NextResponse.json(
        { error: 'Lead not found', phone: digitsOnly },
        { status: 404 }
      );
    }

    // Tomar el primer lead encontrado
    const lead = leads[0];
    
    // Si ya está en estado "llamada", no hacer nada
    if (lead.estado === 'llamada') {
      console.log(`ℹ️ Lead ${lead.id} ya está en estado "llamada"`);
      return NextResponse.json({
        success: true,
        message: 'Lead already marked as call',
        lead: {
          id: lead.id,
          estado: lead.estado,
          nombre: lead.nombre
        }
      });
    }

    // Actualizar el estado del lead a "llamada"
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({ 
        estado: 'llamada',
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id)
      .select('id, estado, nombre, whatsapp_id')
      .single();

    if (updateError) {
      console.error('Error actualizando lead:', updateError);
      return NextResponse.json(
        { error: 'Error updating lead status', details: updateError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Lead ${updatedLead.id} marcado como "llamada" exitosamente`);

    return NextResponse.json({
      success: true,
      message: 'Lead marked as call successfully',
      lead: {
        id: updatedLead.id,
        estado: updatedLead.estado,
        nombre: updatedLead.nombre,
        whatsapp_id: updatedLead.whatsapp_id
      }
    });

  } catch (error: any) {
    console.error('Error en mark-as-call:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint para verificar el estado de un lead
 * Útil para debugging
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone parameter is required' },
        { status: 400 }
      );
    }

    const digitsOnly = phone.replace(/[^\d]/g, '');
    
    if (!digitsOnly) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Buscar usando múltiples variantes
    let { data: leads, error } = await supabase
      .from('leads')
      .select('id, whatsapp_id, telefono, estado, nombre, seguimientos_count')
      .eq('whatsapp_id', digitsOnly)
      .limit(1);

    if ((!leads || leads.length === 0) && !error) {
      const result2 = await supabase
        .from('leads')
        .select('id, whatsapp_id, telefono, estado, nombre, seguimientos_count')
        .eq('whatsapp_id', `+${digitsOnly}`)
        .limit(1);
      
      if (result2.data && result2.data.length > 0) {
        leads = result2.data;
        error = result2.error;
      } else {
        const result3 = await supabase
          .from('leads')
          .select('id, whatsapp_id, telefono, estado, nombre, seguimientos_count')
          .ilike('whatsapp_id', `%${digitsOnly}%`)
          .limit(1);
        
        if (result3.data && result3.data.length > 0) {
          leads = result3.data;
          error = result3.error;
        }
      }
    }

    if (error) {
      return NextResponse.json(
        { error: 'Error searching for lead', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      found: leads && leads.length > 0,
      leads: leads || []
    });

  } catch (error: any) {
    console.error('Error en GET mark-as-call:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
