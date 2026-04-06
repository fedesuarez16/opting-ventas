import React, { useState, useEffect } from 'react';
import { Lead, LeadStatus, PropertyType, InterestReason } from '../types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Save, User, Mail, Phone, DollarSign, MapPin, Home, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

function toDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface LeadEditSidebarProps {
  lead: Lead | null; // null para crear nuevo
  onClose: () => void;
  onSave: (leadData: Partial<Lead>) => Promise<void>;
  isOpen: boolean;
  /** Solo campos alineados con la tabla / public.leads */
  variant?: 'full' | 'leads-table';
}

const LeadEditSidebar: React.FC<LeadEditSidebarProps> = ({ 
  lead, 
  onClose, 
  onSave,
  isOpen,
  variant = 'full',
}) => {
  const isNewLead = !lead;
  
  const [formData, setFormData] = useState<Partial<Lead>>({
    nombreCompleto: '',
    email: '',
    telefono: '',
    estado: 'inicial',
    presupuesto: 0,
    zonaInteres: '',
    tipoPropiedad: 'departamento',
    superficieMinima: 0,
    cantidadAmbientes: 0,
    motivoInteres: 'otro',
    observaciones: '',
    etiqueta: '',
    calidad: undefined,
    llamada_agendada: false,
    llamar: false,
    deriva_humano: false,
    presupuesto_etiqueta: false,
    inspeccion: false,
    empleado: false,
    dueno: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [contactAtLocal, setContactAtLocal] = useState('');

  // Cargar datos del lead cuando se abre el sidebar
  useEffect(() => {
    if (lead) {
      const calRaw = (lead as any).calidad ?? (lead as any).lead_quality;
      const calNum =
        calRaw === null || calRaw === undefined || calRaw === ''
          ? undefined
          : Math.max(1, Math.min(3, Math.trunc(Number(calRaw))));
      setFormData({
        nombreCompleto: lead.nombreCompleto || (lead as any).nombre || '',
        email: lead.email || '',
        telefono: String((lead as any).phone || lead.telefono || lead.whatsapp_id || ''),
        estado: lead.estado,
        presupuesto: lead.presupuesto || 0,
        zonaInteres: lead.zonaInteres || '',
        tipoPropiedad: lead.tipoPropiedad,
        superficieMinima: lead.superficieMinima || 0,
        cantidadAmbientes: lead.cantidadAmbientes || 0,
        motivoInteres: lead.motivoInteres,
        observaciones: lead.observaciones || '',
        etiqueta: (lead as any).etiqueta ?? lead.propiedad_interes ?? '',
        calidad: Number.isFinite(calNum as number) ? calNum : undefined,
        llamada_agendada: lead.llamada_agendada === true,
        llamar: lead.llamar === true,
        deriva_humano: lead.deriva_humano === true,
        presupuesto_etiqueta: lead.presupuesto_etiqueta === true,
        inspeccion: lead.inspeccion === true,
        empleado: lead.empleado === true,
        dueno: lead.dueno === true,
      });
      setContactAtLocal(toDatetimeLocalValue(lead.created_at || lead.fechaContacto));
    } else {
      // Reset para nuevo lead
      setFormData({
        nombreCompleto: '',
        email: '',
        telefono: '',
        estado: variant === 'leads-table' ? 'frio' : 'inicial',
        presupuesto: 0,
        zonaInteres: '',
        tipoPropiedad: 'departamento',
        superficieMinima: 0,
        cantidadAmbientes: 0,
        motivoInteres: 'otro',
        observaciones: '',
        etiqueta: '',
        calidad: undefined,
        llamada_agendada: false,
        llamar: false,
        deriva_humano: false,
        presupuesto_etiqueta: false,
        inspeccion: false,
        empleado: false,
        dueno: false,
      });
      setContactAtLocal(variant === 'leads-table' ? toDatetimeLocalValue(new Date().toISOString()) : '');
    }
    setErrors({});
  }, [lead, isOpen, variant]);

  const handleChange = (field: keyof Lead, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo cuando se modifica
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (variant === 'leads-table') {
      if (!formData.telefono || !String(formData.telefono).trim()) {
        newErrors.telefono = 'El teléfono es obligatorio';
      }
    } else if (formData.email && formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      if (variant === 'leads-table') {
        const et = formData.etiqueta?.trim();
        const payload: Partial<Lead> = {
          nombreCompleto: formData.nombreCompleto?.trim() || '',
          telefono: String(formData.telefono || '').trim(),
          estado: formData.estado as LeadStatus,
          etiqueta: et === '' || et === undefined ? null : et,
          calidad:
            formData.calidad != null && formData.calidad >= 1 && formData.calidad <= 3
              ? formData.calidad
              : null,
          llamada_agendada: !!formData.llamada_agendada,
          llamar: !!formData.llamar,
          deriva_humano: !!formData.deriva_humano,
          presupuesto_etiqueta: !!formData.presupuesto_etiqueta,
          inspeccion: !!formData.inspeccion,
          empleado: !!formData.empleado,
          dueno: !!formData.dueno,
        };
        if (contactAtLocal) {
          const t = new Date(contactAtLocal);
          if (!Number.isNaN(t.getTime())) {
            payload.created_at = t.toISOString();
          }
        }
        await onSave(payload);
      } else {
        await onSave(formData);
      }
      onClose();
    } catch (error) {
      console.error('Error saving lead:', error);
      alert('Error al guardar el lead. Por favor intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isSaving) return;
    
    // Preguntar si hay cambios sin guardar
    const hasChanges = lead
      ? variant === 'leads-table'
        ? (formData.nombreCompleto || '') !== (lead.nombreCompleto || (lead as any).nombre || '') ||
          String(formData.telefono || '').trim() !== String((lead as any).phone || lead.telefono || '').trim() ||
          String(formData.estado || '') !== String(lead.estado || '') ||
          contactAtLocal !== toDatetimeLocalValue(lead.created_at || lead.fechaContacto) ||
          (formData.etiqueta || '').trim() !==
            String((lead as any).etiqueta ?? lead.propiedad_interes ?? '').trim() ||
          (formData.calidad ?? null) !==
            (() => {
              const c = (lead as any).calidad;
              if (c == null || c === '') return null;
              const n = Math.trunc(Number(c));
              return n >= 1 && n <= 3 ? n : null;
            })() ||
          !!formData.llamada_agendada !== (lead.llamada_agendada === true) ||
          !!formData.llamar !== (lead.llamar === true) ||
          !!formData.deriva_humano !== (lead.deriva_humano === true) ||
          !!formData.presupuesto_etiqueta !== (lead.presupuesto_etiqueta === true) ||
          !!formData.inspeccion !== (lead.inspeccion === true) ||
          !!formData.empleado !== (lead.empleado === true) ||
          !!formData.dueno !== (lead.dueno === true)
        : JSON.stringify(formData) !== JSON.stringify({
            nombreCompleto: lead.nombreCompleto,
            email: lead.email,
            telefono: lead.telefono,
            estado: lead.estado,
            presupuesto: lead.presupuesto,
            zonaInteres: lead.zonaInteres,
            tipoPropiedad: lead.tipoPropiedad,
            superficieMinima: lead.superficieMinima,
            cantidadAmbientes: lead.cantidadAmbientes,
            motivoInteres: lead.motivoInteres,
            observaciones: lead.observaciones || '',
          })
      : Object.values(formData).some(val => val !== '' && val !== 0 && val !== 'inicial' && val !== 'frio' && val !== 'departamento' && val !== 'otro');

    if (hasChanges) {
      if (confirm('¿Descartar cambios?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40" 
          onClick={handleCancel}
        />
      )}
      
      {/* Sidebar */}
      <div 
        className={cn(
          "fixed top-0 right-0 h-full w-[500px] bg-background shadow-xl z-50 transform transition-transform duration-300 ease-in-out border-l",
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="p-6 border-b bg-card sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">
                {isNewLead ? 'Nuevo Lead' : 'Editar Lead'}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              disabled={isSaving}
              className="hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="p-6 bg-muted/50 border-b flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancelar
          </Button>
        </div>
        
        {/* Scrollable content */}
        <ScrollArea className="flex-1 h-[calc(100vh-200px)]">
          <div className="p-6 space-y-6">
            {variant === 'leads-table' ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Datos del lead (tabla)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="lt-nombre">Nombre</Label>
                    <Input
                      id="lt-nombre"
                      value={formData.nombreCompleto}
                      onChange={(e) => handleChange('nombreCompleto', e.target.value)}
                      placeholder="Nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lt-phone">Teléfono (phone)</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="lt-phone"
                        value={formData.telefono}
                        onChange={(e) => handleChange('telefono', e.target.value)}
                        placeholder="+54911..."
                        className={`pl-10 ${errors.telefono ? 'border-red-500' : ''}`}
                      />
                    </div>
                    {errors.telefono && <p className="text-xs text-red-500">{errors.telefono}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lt-created">Fecha / hora de contacto (created_at)</Label>
                    <Input
                      id="lt-created"
                      type="datetime-local"
                      value={contactAtLocal}
                      onChange={(e) => setContactAtLocal(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lt-estado">Estado</Label>
                    <Input
                      id="lt-estado"
                      value={String(formData.estado ?? '')}
                      onChange={(e) => handleChange('estado', e.target.value)}
                      placeholder="frio, tibio, caliente..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lt-etiqueta">Etiqueta</Label>
                    <Input
                      id="lt-etiqueta"
                      value={formData.etiqueta ?? ''}
                      onChange={(e) => handleChange('etiqueta', e.target.value)}
                      placeholder="Etiqueta o campaña"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lt-calidad">Calidad (1–3)</Label>
                    <Select
                      value={
                        formData.calidad != null && formData.calidad >= 1 && formData.calidad <= 3
                          ? String(formData.calidad)
                          : 'none'
                      }
                      onValueChange={(v) =>
                        handleChange('calidad', v === 'none' ? null : parseInt(v, 10))
                      }
                    >
                      <SelectTrigger id="lt-calidad">
                        <SelectValue placeholder="Sin definir" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin definir</SelectItem>
                        <SelectItem value="1">1 estrella</SelectItem>
                        <SelectItem value="2">2 estrellas</SelectItem>
                        <SelectItem value="3">3 estrellas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-sm font-medium text-foreground">Etiquetas (columnas)</p>
                    <p className="text-xs text-muted-foreground">
                      Marcá las que correspondan; se guardan en la tabla de leads.
                    </p>
                    {(
                      [
                        ['llamada_agendada', 'Llamada agendada'],
                        ['llamar', 'Llamar'],
                        ['deriva_humano', 'Deriva humano'],
                        ['presupuesto_etiqueta', 'Presupuesto'],
                        ['inspeccion', 'Inspección'],
                        ['empleado', 'Empleado'],
                        ['dueno', 'Dueño'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          checked={!!formData[key]}
                          onChange={(e) => handleChange(key, e.target.checked)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
            <>
            {/* Información básica */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Información Básica
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nombreCompleto">
                    Nombre Completo
                  </Label>
                  <Input
                    id="nombreCompleto"
                    value={formData.nombreCompleto}
                    onChange={(e) => handleChange('nombreCompleto', e.target.value)}
                    placeholder="Juan Pérez"
                    className={errors.nombreCompleto ? 'border-red-500' : ''}
                  />
                  {errors.nombreCompleto && (
                    <p className="text-xs text-red-500">{errors.nombreCompleto}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefono">
                    WhatsApp ID
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="telefono"
                      value={formData.telefono}
                      onChange={(e) => handleChange('telefono', e.target.value)}
                      placeholder="5491112345678 o +54 9 11 1234-5678"
                      className={`pl-10 ${errors.telefono ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.telefono && (
                    <p className="text-xs text-red-500">{errors.telefono}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    El ID de WhatsApp del contacto
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <Select 
                    value={formData.estado} 
                    onValueChange={(value) => handleChange('estado', value as LeadStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inicial">🆕 Inicial</SelectItem>
                      <SelectItem value="frío">❄️ Frío</SelectItem>
                      <SelectItem value="tibio">🌤️ Tibio</SelectItem>
                      <SelectItem value="caliente">🔥 Caliente</SelectItem>
                      <SelectItem value="llamada">📞 Llamada</SelectItem>
                      <SelectItem value="visita">👁️ Visita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Preferencias de búsqueda */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Preferencias de Búsqueda
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="zonaInteres">
                    Zona de Interés
                  </Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="zonaInteres"
                      value={formData.zonaInteres}
                      onChange={(e) => handleChange('zonaInteres', e.target.value)}
                      placeholder="Palermo, Recoleta, etc."
                      className={`pl-10 ${errors.zonaInteres ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.zonaInteres && (
                    <p className="text-xs text-red-500">{errors.zonaInteres}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipoPropiedad">Tipo de Propiedad</Label>
                  <Select 
                    value={formData.tipoPropiedad} 
                    onValueChange={(value) => handleChange('tipoPropiedad', value as PropertyType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="departamento">🏢 Departamento</SelectItem>
                      <SelectItem value="casa">🏠 Casa</SelectItem>
                      <SelectItem value="PH">🏘️ PH</SelectItem>
                      <SelectItem value="terreno">🌍 Terreno</SelectItem>
                      <SelectItem value="local">🏪 Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                <div className="space-y-2">
                  <Label htmlFor="presupuesto">Presupuesto (USD)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="presupuesto"
                      type="number"
                      min="0"
                      step="1000"
                      value={formData.presupuesto}
                      onChange={(e) => handleChange('presupuesto', parseInt(e.target.value) || 0)}
                      placeholder="150000"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="motivoInteres">Intención</Label>
                  <Select 
                    value={formData.motivoInteres} 
                    onValueChange={(value) => handleChange('motivoInteres', value as InterestReason)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar intención" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compra">🏠 Compra</SelectItem>
                      <SelectItem value="venta">💰 Venta</SelectItem>
                      <SelectItem value="alquiler">📋 Alquiler</SelectItem>
                      <SelectItem value="inversión">💼 Inversión</SelectItem>
                      <SelectItem value="otro">📋 Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Características Buscadas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Características Buscadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => handleChange('observaciones', e.target.value)}
                  placeholder="Detalles sobre lo que busca el lead..."
                  rows={4}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
              </CardContent>
            </Card>
            </>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
};

export default LeadEditSidebar;

