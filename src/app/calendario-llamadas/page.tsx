import Link from 'next/link';
import AppLayout from '../components/AppLayout';
import CalendarioSemana from './CalendarioSemana';

export const metadata = {
  title: 'Calendario de llamadas | Opting',
};

export default function CalendarioLlamadasPage() {
  return (
    <AppLayout>
      <div className="mb-8 sm:mx-1">
        <div className="bg-white border mt-2 border-gray-200/80 rounded-2xl shadow-sm ring-1 ring-black/[0.02] mb-4 mx-2 overflow-hidden">
          {/* Topbar */}
          <div className="px-6 pt-4 pb-4 bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/30 border-b border-gray-100">
            <nav className="flex mb-3" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1.5 text-xs">
                <li className="inline-flex items-center">
                  <Link href="/" className="inline-flex items-center font-medium text-slate-500 hover:text-indigo-600 transition-colors">
                    Inicio
                  </Link>
                </li>
                <li className="flex items-center">
                  <svg className="h-3 w-3 mx-1 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-slate-500">Agenda</span>
                </li>
                <li className="flex items-center">
                  <svg className="h-3 w-3 mx-1 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-slate-700" aria-current="page">Calendario de llamadas</span>
                </li>
              </ol>
            </nav>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Calendario de llamadas</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Agendá llamadas a leads. Hacé click en cualquier slot para crear una.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Calendario */}
          <div className="p-4">
            <CalendarioSemana />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
