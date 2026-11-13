import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { HemicycleChart } from './components/HemicycleChart';
import {
  allocateCollegeSeatsByCensus,
  calculateCommitteeSummary,
  suggestLegalSeats,
  type CalcCandidacy,
  type CalcCollege,
} from './utils/electoralCalc';
import { exportSimpleCSV, exportSimplePDF } from './utils/simpleExport';

interface SavedMultiState {
  companyName: string;
  thresholdPct: number;
  autoAllocateSeats: boolean;
  colleges: CalcCollege[];
}

const STORAGE_KEY = 'actaclara_calc_v3';

const PRESET_UNIONS: Array<{ acronym: string; name: string; color: string }> = [
  { acronym: 'CCOO', name: 'Comisiones Obreras', color: '#DC2626' },
  { acronym: 'UGT', name: 'Unión General de Trabajadores', color: '#EA580C' },
  { acronym: 'USO', name: 'Unión Sindical Obrera', color: '#2563EB' },
  { acronym: 'CGT', name: 'Confederación General del Trabajo', color: '#059669' },
  { acronym: 'CSIF', name: 'Central Sindical Independiente', color: '#7C3AED' },
  { acronym: 'IND', name: 'Candidatura Independiente', color: '#0D9488' },
];

const DEFAULT_CANDIDACIES: CalcCandidacy[] = [
  { id: 'c_1', acronym: 'CCOO', name: 'Comisiones Obreras', color: '#DC2626', votes: 0 },
  { id: 'c_2', acronym: 'UGT', name: 'Unión General de Trabajadores', color: '#EA580C', votes: 0 },
  { id: 'c_3', acronym: 'USO', name: 'Unión Sindical Obrera', color: '#2563EB', votes: 0 },
];

const DEFAULT_STATE: SavedMultiState = {
  companyName: '',
  thresholdPct: 5,
  autoAllocateSeats: true,
  colleges: [
    {
      id: 'col_1',
      name: 'Colegio Único',
      census: 120,
      seats: 9,
      candidacies: DEFAULT_CANDIDACIES,
      blankVotes: 0,
      nullVotes: 0,
      seniorityWinnerId: null,
    },
  ],
};

function loadInitialState(): SavedMultiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SavedMultiState>;
    if (!Array.isArray(parsed.colleges) || parsed.colleges.length === 0) {
      return DEFAULT_STATE;
    }
    return {
      ...DEFAULT_STATE,
      ...parsed,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

type ChartTab = 'quotient' | 'bars' | 'breakdown';
type BarMetric = 'votes' | 'pct' | 'seats';

export default function App() {
  const [state, setState] = useState<SavedMultiState>(() => loadInitialState());
  const [activeView, setActiveView] = useState<string>(() => state.colleges[0]?.id ?? 'col_1');
  const [configOpen, setConfigOpen] = useState(true);
  const [chartTab, setChartTab] = useState<ChartTab>('quotient');
  const [barMetric, setBarMetric] = useState<BarMetric>('votes');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }, [state]);

  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  const committee = useMemo(
    () => calculateCommitteeSummary(state.colleges, state.thresholdPct),
    [state.colleges, state.thresholdPct]
  );

  const isTotalView = activeView === 'TOTAL' && state.colleges.length > 1;
  const activeCollege =
    state.colleges.find((c) => c.id === activeView) ?? state.colleges[0];
  const activeSummary =
    committee.collegeSummaries.find((s) => s.collegeId === activeCollege.id) ??
    committee.collegeSummaries[0];

  const recomputeSeatsIfAuto = (
    colleges: CalcCollege[],
    auto: boolean,
    explicitTotalSeats?: number
  ): CalcCollege[] => {
    if (!auto) return colleges;
    const totalCensus = colleges.reduce((a, c) => a + Math.max(0, Math.floor(c.census)), 0);
    const totalSeats = explicitTotalSeats ?? suggestLegalSeats(totalCensus);
    const alloc = allocateCollegeSeatsByCensus(colleges, totalSeats);
    return colleges.map((col) => ({
      ...col,
      seats: alloc[col.id] ?? col.seats,
    }));
  };

  const handleAddCollege = () => {
    setState((prev) => {
      const existingCount = prev.colleges.length;
      const firstCol = prev.colleges[0];

      // Smart naming for standard Spanish 2-college setup
      let updatedColleges = [...prev.colleges];
      if (existingCount === 1 && firstCol.name === 'Colegio Único') {
        updatedColleges = [
          { ...firstCol, name: 'Especialistas y No Cualificados' },
        ];
      }

      const newId = `col_${Date.now()}`;
      const newName =
        existingCount === 1 ? 'Técnicos y Administrativos' : `Colegio ${existingCount + 1}`;

      const clonedCandidacies: CalcCandidacy[] = firstCol.candidacies.map((c, idx) => ({
        id: `${newId}_c_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        acronym: c.acronym,
        name: c.name,
        color: c.color,
        votes: 0,
      }));

      const newCol: CalcCollege = {
        id: newId,
        name: newName,
        census: 50,
        seats: 2,
        candidacies: clonedCandidacies,
        blankVotes: 0,
        nullVotes: 0,
        seniorityWinnerId: null,
      };

      const nextList = recomputeSeatsIfAuto(
        [...updatedColleges, newCol],
        prev.autoAllocateSeats
      );
      setActiveView(newId);
      return { ...prev, colleges: nextList };
    });
  };

  const handleRemoveCollege = (collegeId: string) => {
    if (state.colleges.length <= 1) return;
    setState((prev) => {
      const filtered = prev.colleges.filter((c) => c.id !== collegeId);
      const renamed =
        filtered.length === 1 &&
        (filtered[0].name === 'Especialistas y No Cualificados' ||
          filtered[0].name === 'Técnicos y Administrativos')
          ? [{ ...filtered[0], name: 'Colegio Único' }]
          : filtered;
      const nextList = recomputeSeatsIfAuto(renamed, prev.autoAllocateSeats);
      if (activeView === collegeId || (activeView === 'TOTAL' && nextList.length < 2)) {
        setActiveView(nextList[0].id);
      }
      return { ...prev, colleges: nextList };
    });
  };

  const updateCollegeField = (
    collegeId: string,
    updater: (col: CalcCollege) => CalcCollege,
    reallocateSeats = false
  ) => {
    setState((prev) => {
      const updated = prev.colleges.map((c) => (c.id === collegeId ? updater(c) : c));
      return {
        ...prev,
        colleges: reallocateSeats
          ? recomputeSeatsIfAuto(updated, prev.autoAllocateSeats)
          : updated,
      };
    });
  };

  const handleTotalSeatsOverride = (newTotal: number) => {
    const cleanTotal = Math.max(state.colleges.length, Math.min(75, Math.floor(newTotal || 1)));
    setState((prev) => ({
      ...prev,
      autoAllocateSeats: true,
      colleges: recomputeSeatsIfAuto(prev.colleges, true, cleanTotal),
    }));
  };

  const adjustCandidacyVotes = (collegeId: string, candId: string, delta: number) => {
    updateCollegeField(collegeId, (col) => ({
      ...col,
      candidacies: col.candidacies.map((c) =>
        c.id === candId ? { ...c, votes: Math.max(0, c.votes + delta) } : c
      ),
    }));
  };

  const setCandidacyField = (
    collegeId: string,
    candId: string,
    field: 'acronym' | 'name' | 'color' | 'votes',
    value: string | number
  ) => {
    updateCollegeField(collegeId, (col) => ({
      ...col,
      candidacies: col.candidacies.map((c) => {
        if (c.id !== candId) return c;
        if (field === 'votes') {
          return { ...c, votes: Math.max(0, Math.floor(Number(value) || 0)) };
        }
        return { ...c, [field]: String(value) };
      }),
    }));
  };

  const addCandidacyToCollege = (
    collegeId: string,
    preset?: { acronym: string; name: string; color: string }
  ) => {
    updateCollegeField(collegeId, (col) => {
      const idx = col.candidacies.length;
      const fallbackColor = PRESET_UNIONS[idx % PRESET_UNIONS.length].color;
      return {
        ...col,
        candidacies: [
          ...col.candidacies,
          {
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            acronym: preset ? preset.acronym : `LISTA ${idx + 1}`,
            name: preset ? preset.name : '',
            color: preset ? preset.color : fallbackColor,
            votes: 0,
          },
        ],
      };
    });
  };

  const removeCandidacyFromCollege = (collegeId: string, candId: string) => {
    updateCollegeField(collegeId, (col) => {
      if (col.candidacies.length <= 1) return col;
      return {
        ...col,
        candidacies: col.candidacies.filter((c) => c.id !== candId),
        seniorityWinnerId: col.seniorityWinnerId === candId ? null : col.seniorityWinnerId,
      };
    });
  };

  const handleResetCollegeVotes = (collegeId: string) => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    updateCollegeField(collegeId, (col) => ({
      ...col,
      candidacies: col.candidacies.map((c) => ({ ...c, votes: 0 })),
      blankVotes: 0,
      nullVotes: 0,
      seniorityWinnerId: null,
    }));
    setConfirmReset(false);
  };

  const existingAcronyms = new Set(
    activeCollege.candidacies.map((c) => c.acronym.trim().toUpperCase())
  );
  const availablePresets = PRESET_UNIONS.filter((p) => !existingAcronyms.has(p.acronym));

  const barData = useMemo(() => {
    if (isTotalView) {
      return committee.combinedRows.map((row) => ({
        acronym: row.acronym,
        color: row.color,
        votes: row.totalVotes,
        pct: Number(row.pctOfValid.toFixed(1)),
        seats: row.totalSeats,
      }));
    }
    return activeSummary.results.map((r) => ({
      acronym: r.candidacy.acronym || 'Lista',
      color: r.candidacy.color,
      votes: r.candidacy.votes,
      pct: Number(r.pctOfValid.toFixed(1)),
      seats: r.seats,
    }));
  }, [isTotalView, committee.combinedRows, activeSummary.results]);

  const pieData = useMemo(() => {
    if (isTotalView) {
      const items = committee.combinedRows
        .filter((r) => r.totalVotes > 0)
        .map((r) => ({ name: r.acronym, value: r.totalVotes, color: r.color }));
      if (committee.totalBlankVotes > 0) {
        items.push({ name: 'En blanco', value: committee.totalBlankVotes, color: '#94A3B8' });
      }
      if (committee.totalNullVotes > 0) {
        items.push({ name: 'Nulos', value: committee.totalNullVotes, color: '#475569' });
      }
      if (committee.totalAbstention > 0) {
        items.push({ name: 'Abstención', value: committee.totalAbstention, color: '#E2E8F0' });
      }
      return items;
    }

    const items = activeSummary.results
      .filter((r) => r.candidacy.votes > 0)
      .map((r) => ({
        name: r.candidacy.acronym || 'Lista',
        value: r.candidacy.votes,
        color: r.candidacy.color,
      }));
    if (activeSummary.blankVotes > 0) {
      items.push({ name: 'En blanco', value: activeSummary.blankVotes, color: '#94A3B8' });
    }
    if (activeSummary.nullVotes > 0) {
      items.push({ name: 'Nulos', value: activeSummary.nullVotes, color: '#475569' });
    }
    if (activeSummary.abstention > 0) {
      items.push({ name: 'Abstención', value: activeSummary.abstention, color: '#E2E8F0' });
    }
    return items;
  }, [isTotalView, committee, activeSummary]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-10">
      {/* Top Bar (3-Zone Contract, Pantone 186 C Institutional Header) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#C8102E]/20">
        <div className="h-1.5 w-full bg-[#C8102E]" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-[54px] md:h-[68px] flex items-center justify-between gap-4 md:gap-8">
          <a
            href="#colegios"
            className="flex items-center shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]"
          >
            <img
              src="/assets/aistudio/Logo_UGT_FeSMC_Castilla_La_Mancha_transparente_4K_5f4d32d0.png"
              alt="UGT FeSMC Castilla-La Mancha"
              className="h-8 sm:h-9 md:h-11 w-auto object-contain shrink-0"
            />
          </a>

          <nav
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700"
            aria-label="Secciones"
          >
            <a
              href="#colegios"
              className="py-1 border-b-2 border-transparent hover:text-[#C8102E] hover:border-[#C8102E] transition-colors whitespace-nowrap shrink-0"
            >
              Colegios
            </a>
            <a
              href="#recuento"
              className="py-1 border-b-2 border-transparent hover:text-[#C8102E] hover:border-[#C8102E] transition-colors whitespace-nowrap shrink-0"
            >
              Recuento en vivo
            </a>
            <a
              href="#resultados"
              className="py-1 border-b-2 border-transparent hover:text-[#C8102E] hover:border-[#C8102E] transition-colors whitespace-nowrap shrink-0"
            >
              Resultados
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => exportSimplePDF(state.companyName, committee)}
              className="min-h-[42px] md:min-h-[40px] px-3.5 md:px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A40D25] active:scale-[0.98] rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden="true" />
              <span>Exportar PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-5 sm:pt-7 space-y-5">
        {/* Global Scrutiny Progress Bar */}
        <section
          aria-label="Progreso global del escrutinio"
          className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-display font-semibold text-slate-900">
                Progreso global del escrutinio
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-600 tabular-nums">
                {committee.completedCollegesCount} de {committee.totalCollegesCount}{' '}
                {committee.totalCollegesCount === 1 ? 'colegio' : 'colegios'} con votos registrados
              </span>
            </div>

            <div className="flex items-center gap-2 tabular-nums shrink-0">
              <span
                className={`text-xs font-medium ${
                  committee.scrutinyProgressPct === 100
                    ? 'text-emerald-700'
                    : committee.completedCollegesCount > 0
                      ? 'text-[#C8102E]'
                      : 'text-slate-500'
                }`}
              >
                {committee.scrutinyProgressPct === 100
                  ? 'Completado'
                  : committee.completedCollegesCount > 0
                    ? 'En curso'
                    : 'Sin votos'}
              </span>
              <span className="font-display text-sm sm:text-base font-bold text-slate-900">
                {Number.isInteger(committee.scrutinyProgressPct)
                  ? committee.scrutinyProgressPct.toFixed(0)
                  : committee.scrutinyProgressPct.toFixed(1)}
                %
              </span>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="Porcentaje de colegios donde se ha completado el escrutinio"
            aria-valuenow={Math.round(committee.scrutinyProgressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2.5 h-2.5 w-full bg-slate-100 rounded-full overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                committee.scrutinyProgressPct === 100 ? 'bg-emerald-600' : 'bg-[#C8102E]'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, committee.scrutinyProgressPct))}%`,
              }}
            />
          </div>
        </section>

        {/* Title Strip */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-[#C8102E]/15">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Calculadora de Escrutinio Sindical
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {state.companyName.trim()
                ? `${state.companyName.trim()} · Cociente electoral y mayor resto (Art. 12 RD 1844/1994)`
                : 'Cociente electoral y mayor resto por colegio electoral (Art. 12 RD 1844/1994)'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>Censo total: {committee.totalCensus}</span>
            <span aria-hidden="true">·</span>
            <span>Puestos comité: {committee.totalSeats}</span>
            <span aria-hidden="true">·</span>
            <span>
              {state.colleges.length}{' '}
              {state.colleges.length === 1 ? 'colegio' : 'colegios'}
            </span>
          </div>
        </div>

        {/* College Selector Tabs + Add College */}
        <div id="colegios" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl">
            {state.colleges.map((col) => {
              const selected = activeView === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setActiveView(col.id)}
                  className={`min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selected
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {col.name} ({col.seats})
                </button>
              );
            })}

            {state.colleges.length > 1 && (
              <button
                type="button"
                onClick={() => setActiveView('TOTAL')}
                className={`min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isTotalView
                    ? 'bg-[#C8102E] text-white shadow-xs font-semibold'
                    : 'text-[#C8102E] hover:bg-[#FDF2F4]'
                }`}
              >
                Total Comité ({committee.totalSeats})
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddCollege}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-[#FDF2F4] hover:border-[#C8102E]/40 text-xs sm:text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#C8102E]" aria-hidden="true" />
            <span>Añadir colegio</span>
          </button>
        </div>

        {/* If Total Committee View is Selected */}
        {isTotalView ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <p className="text-xs text-slate-500">Censo total empresa</p>
                <p className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                  {committee.totalCensus.toLocaleString('es-ES')}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {state.colleges.length} colegios electorales
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <p className="text-xs text-slate-500">Participación global</p>
                <p className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                  {committee.participationPct.toFixed(1)}%
                </p>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {committee.totalVoters} votantes · {committee.totalAbstention} abst.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <p className="text-xs text-slate-500">Votos válidos totales</p>
                <p className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                  {committee.totalValidVotes.toLocaleString('es-ES')}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {committee.totalBlankVotes} bl. · {committee.totalNullVotes} nul.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <p className="text-xs text-slate-500">Comité asignado</p>
                <p className="mt-1 font-display text-2xl sm:text-3xl font-bold text-[#C8102E] tabular-nums">
                  {committee.assignedSeats} / {committee.totalSeats}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Suma de todos los colegios</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Combined Hemicycle + Summary Table */}
              <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Composición Total del Comité
                    </h2>
                    <p className="text-xs text-slate-500">
                      Suma de delegados obtenidos en cada colegio electoral
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportSimpleCSV(state.companyName, committee)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    <span>Excel CSV</span>
                  </button>
                </div>

                <div className="mt-4">
                  <HemicycleChart
                    items={committee.combinedRows.map((r) => ({
                      id: r.acronym,
                      acronym: r.acronym,
                      color: r.color,
                      seats: r.totalSeats,
                      pctOfValid: r.pctOfValid,
                    }))}
                    totalSeats={committee.totalSeats}
                  />
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-2 font-medium">Sindicato</th>
                        {committee.collegeSummaries.map((c) => (
                          <th key={c.collegeId} className="py-2 px-2 font-medium text-right">
                            {c.collegeName.split(' ')[0]}
                          </th>
                        ))}
                        <th className="py-2 px-2 font-medium text-right">Votos</th>
                        <th className="py-2 pl-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {committee.combinedRows.map((row) => (
                        <tr key={row.acronym} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-2 font-semibold text-slate-900">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: row.color }}
                              />
                              {row.acronym}
                            </span>
                          </td>
                          {committee.collegeSummaries.map((c) => (
                            <td key={c.collegeId} className="py-2.5 px-2 text-right text-slate-600">
                              {row.seatsByCollege[c.collegeId] ?? 0}
                            </td>
                          ))}
                          <td className="py-2.5 px-2 text-right text-slate-600">
                            {row.totalVotes.toLocaleString('es-ES')}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-display font-bold text-slate-900">
                            {row.totalSeats}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Combined Charts */}
              <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Comparativa Global por Candidatura
                  </h2>
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                    {[
                      { key: 'seats' as const, label: 'Delegados' },
                      { key: 'votes' as const, label: 'Votos' },
                      { key: 'pct' as const, label: '%' },
                    ].map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setBarMetric(m.key)}
                        className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg cursor-pointer ${
                          barMetric === m.key
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -12, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="acronym"
                        tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                        axisLine={{ stroke: '#CBD5E1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#64748B', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#F1F5F9' }}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E2E8F0',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey={barMetric} radius={[8, 8, 0, 0]} maxBarSize={56}>
                        {barData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">
                    Resumen por colegio electoral
                  </p>
                  {committee.collegeSummaries.map((col) => (
                    <button
                      key={col.collegeId}
                      type="button"
                      onClick={() => setActiveView(col.collegeId)}
                      className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between text-xs sm:text-sm cursor-pointer"
                    >
                      <span className="font-medium text-slate-900">{col.collegeName}</span>
                      <span className="text-slate-500 tabular-nums">
                        {col.totalVoters}/{col.census} vot. · {col.assignedSeats}/{col.totalSeats}{' '}
                        puestos
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          /* Single College Editor & Live Results */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Config + Live Vote Counter */}
            <div id="recuento" className="lg:col-span-6 space-y-5">
              {/* 1. Company & Active College Config */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setConfigOpen((v) => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      01. Empresa y datos de {activeCollege.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {state.companyName.trim() || 'Empresa sin nombre'} · Censo:{' '}
                      {activeCollege.census} · Puestos: {activeCollege.seats}
                    </p>
                  </div>
                  {configOpen ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                </button>

                {configOpen && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="company-name"
                          className="block text-xs font-medium text-slate-600 mb-1"
                        >
                          Nombre de la empresa
                        </label>
                        <input
                          id="company-name"
                          type="text"
                          placeholder="Ej.: Logística Central S.A."
                          value={state.companyName}
                          onChange={(e) =>
                            setState((prev) => ({ ...prev, companyName: e.target.value }))
                          }
                          className="w-full min-h-[44px] px-3.5 text-sm border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="college-name"
                          className="block text-xs font-medium text-slate-600 mb-1"
                        >
                          Nombre del colegio
                        </label>
                        <input
                          id="college-name"
                          type="text"
                          value={activeCollege.name}
                          onChange={(e) =>
                            updateCollegeField(activeCollege.id, (c) => ({
                              ...c,
                              name: e.target.value,
                            }))
                          }
                          className="w-full min-h-[44px] px-3.5 text-sm border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="college-census"
                          className="block text-xs font-medium text-slate-600 mb-1"
                        >
                          Censo colegio
                        </label>
                        <input
                          id="college-census"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={activeCollege.census}
                          onChange={(e) =>
                            updateCollegeField(
                              activeCollege.id,
                              (c) => ({
                                ...c,
                                census: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              }),
                              true
                            )
                          }
                          className="w-full min-h-[44px] px-3 text-sm font-semibold tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="college-seats"
                          className="block text-xs font-medium text-slate-600 mb-1"
                        >
                          Puestos colegio
                        </label>
                        <input
                          id="college-seats"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={75}
                          value={activeCollege.seats}
                          onChange={(e) => {
                            const val = Math.max(
                              1,
                              Math.min(75, Math.floor(Number(e.target.value) || 1))
                            );
                            setState((prev) => ({
                              ...prev,
                              autoAllocateSeats: false,
                              colleges: prev.colleges.map((c) =>
                                c.id === activeCollege.id ? { ...c, seats: val } : c
                              ),
                            }));
                          }}
                          className="w-full min-h-[44px] px-3 text-sm font-semibold tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="threshold-pct"
                          className="block text-xs font-medium text-slate-600 mb-1"
                        >
                          Umbral (%)
                        </label>
                        <input
                          id="threshold-pct"
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min={0}
                          max={25}
                          value={state.thresholdPct}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              thresholdPct: Math.max(
                                0,
                                Math.min(25, Number(e.target.value) || 0)
                              ),
                            }))
                          }
                          className="w-full min-h-[44px] px-3 text-sm font-semibold tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                        />
                      </div>
                    </div>

                    {/* Multi-college proportional seat helper */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span>
                          Comité total ({committee.totalCensus} trab.):{' '}
                          <strong className="text-slate-800">
                            {suggestLegalSeats(committee.totalCensus)} puestos legales
                          </strong>
                        </span>
                        {state.colleges.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTotalSeatsOverride(suggestLegalSeats(committee.totalCensus))
                            }
                            className="text-[#C8102E] font-medium hover:underline cursor-pointer"
                          >
                            Repartir por censo
                          </button>
                        )}
                      </div>

                      {state.colleges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCollege(activeCollege.id)}
                          className="text-red-600 hover:underline font-medium cursor-pointer"
                        >
                          Eliminar este colegio
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* 2. Live Ballot Counting Section */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      02. Recuento en {activeCollege.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Pulsa +1 / +5 mientras cantan los votos o escribe el total
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleResetCollegeVotes(activeCollege.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      confirmReset
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{confirmReset ? 'Confirmar cero' : 'Poner a 0'}</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {activeCollege.candidacies.map((cand) => (
                    <div key={cand.id} className="py-3 first:pt-1 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="color"
                            aria-label={`Color de ${cand.acronym}`}
                            value={cand.color}
                            onChange={(e) =>
                              setCandidacyField(activeCollege.id, cand.id, 'color', e.target.value)
                            }
                            className="w-7 h-7 p-0.5 border border-slate-200 rounded-lg bg-white cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            aria-label="Siglas de candidatura"
                            value={cand.acronym}
                            placeholder="SIGLAS"
                            onChange={(e) =>
                              setCandidacyField(
                                activeCollege.id,
                                cand.id,
                                'acronym',
                                e.target.value.toUpperCase()
                              )
                            }
                            className="w-28 sm:w-32 px-2 py-1 text-sm font-bold text-slate-900 border border-transparent hover:border-slate-200 focus:border-[#C8102E] rounded-lg focus:outline-none uppercase"
                          />
                          <input
                            type="text"
                            aria-label="Nombre completo de candidatura"
                            value={cand.name}
                            placeholder="Nombre opcional"
                            onChange={(e) =>
                              setCandidacyField(activeCollege.id, cand.id, 'name', e.target.value)
                            }
                            className="hidden sm:block flex-1 min-w-0 px-2 py-1 text-xs text-slate-500 border border-transparent hover:border-slate-200 focus:border-[#C8102E] rounded-lg focus:outline-none"
                          />
                        </div>

                        {activeCollege.candidacies.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCandidacyFromCollege(activeCollege.id, cand.id)}
                            aria-label={`Eliminar ${cand.acronym}`}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Restar 1 voto a ${cand.acronym}`}
                          onClick={() => adjustCandidacyVotes(activeCollege.id, cand.id, -1)}
                          className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-700 cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          aria-label={`Votos de ${cand.acronym}`}
                          value={cand.votes}
                          onChange={(e) =>
                            setCandidacyField(activeCollege.id, cand.id, 'votes', e.target.value)
                          }
                          className="flex-1 min-w-0 min-h-[44px] text-center font-display text-xl font-bold text-slate-900 tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                        />

                        <button
                          type="button"
                          aria-label={`Sumar 1 voto a ${cand.acronym}`}
                          onClick={() => adjustCandidacyVotes(activeCollege.id, cand.id, 1)}
                          className="min-w-[56px] min-h-[44px] rounded-xl bg-[#C8102E] hover:bg-[#A40D25] active:scale-95 text-white font-semibold text-sm flex items-center justify-center gap-0.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>1</span>
                        </button>

                        <button
                          type="button"
                          aria-label={`Sumar 5 votos a ${cand.acronym}`}
                          onClick={() => adjustCandidacyVotes(activeCollege.id, cand.id, 5)}
                          className="min-w-[48px] min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-semibold text-xs flex items-center justify-center cursor-pointer"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add Candidacy Row */}
                  <div className="py-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addCandidacyToCollege(activeCollege.id)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-dashed border-slate-300 hover:border-[#C8102E] text-xs font-semibold text-[#C8102E] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir candidatura</span>
                    </button>

                    {availablePresets.slice(0, 4).map((preset) => (
                      <button
                        key={preset.acronym}
                        type="button"
                        onClick={() => addCandidacyToCollege(activeCollege.id, preset)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 cursor-pointer"
                      >
                        + {preset.acronym}
                      </button>
                    ))}
                  </div>

                  {/* Blank Votes */}
                  <div className="py-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">Votos en blanco</span>
                      <span className="text-xs text-slate-500">
                        Computan para el 5 % · excluidos del cociente
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Restar 1 voto en blanco"
                        onClick={() =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            blankVotes: Math.max(0, c.blankVotes - 1),
                          }))
                        }
                        className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        aria-label="Votos en blanco"
                        value={activeCollege.blankVotes}
                        onChange={(e) =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            blankVotes: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          }))
                        }
                        className="flex-1 min-w-0 min-h-[44px] text-center font-display text-lg font-bold text-slate-900 tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                      <button
                        type="button"
                        aria-label="Sumar 1 voto en blanco"
                        onClick={() =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            blankVotes: c.blankVotes + 1,
                          }))
                        }
                        className="min-w-[56px] min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-semibold text-sm flex items-center justify-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>1</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Sumar 5 votos en blanco"
                        onClick={() =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            blankVotes: c.blankVotes + 5,
                          }))
                        }
                        className="min-w-[48px] min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-semibold text-xs flex items-center justify-center cursor-pointer"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  {/* Null Votes */}
                  <div className="pt-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">Votos nulos</span>
                      <span className="text-xs text-slate-500">No son votos válidos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Restar 1 voto nulo"
                        onClick={() =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            nullVotes: Math.max(0, c.nullVotes - 1),
                          }))
                        }
                        className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        aria-label="Votos nulos"
                        value={activeCollege.nullVotes}
                        onChange={(e) =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            nullVotes: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          }))
                        }
                        className="flex-1 min-w-0 min-h-[44px] text-center font-display text-lg font-bold text-slate-900 tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                      <button
                        type="button"
                        aria-label="Sumar 1 voto nulo"
                        onClick={() =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            nullVotes: c.nullVotes + 1,
                          }))
                        }
                        className="min-w-[56px] min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-semibold text-sm flex items-center justify-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>1</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Sumar 5 votos nulos"
                        onClick={() =>
                          updateCollegeField(activeCollege.id, (c) => ({
                            ...c,
                            nullVotes: c.nullVotes + 5,
                          }))
                        }
                        className="min-w-[48px] min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-800 font-semibold text-xs flex items-center justify-center cursor-pointer"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Ballot Validation Banner */}
                <div
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm tabular-nums ${
                    activeSummary.censusExceeded
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  {activeSummary.censusExceeded ? (
                    <div className="flex items-start gap-2 font-medium">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>
                        Atención: los votantes ({activeSummary.totalVoters}) superan el censo de este
                        colegio ({activeSummary.census}).
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Votantes: <strong>{activeSummary.totalVoters}</strong> /{' '}
                        {activeSummary.census} ({activeSummary.participationPct.toFixed(1)}%)
                      </span>
                      <span>
                        Mínimo {activeSummary.thresholdPct}%:{' '}
                        <strong>{activeSummary.minVotesForThreshold} votos</strong>
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Live Results for Active College */}
            <div id="resultados" className="lg:col-span-6 space-y-5">
              {/* 4 KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Votantes</p>
                  <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {activeSummary.totalVoters.toLocaleString('es-ES')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    {activeSummary.participationPct.toFixed(1)}% participación
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Votos válidos</p>
                  <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {activeSummary.validVotes.toLocaleString('es-ES')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    {activeSummary.blankVotes} bl. · {activeSummary.nullVotes} nul.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Cociente</p>
                  <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {activeSummary.electoralQuotient > 0
                      ? activeSummary.electoralQuotient.toFixed(2)
                      : '0.00'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    {activeSummary.admittedVotesTotal} adm. / {activeSummary.totalSeats}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Puestos</p>
                  <p className="mt-1 font-display text-2xl font-bold text-[#C8102E] tabular-nums">
                    {activeSummary.assignedSeats} / {activeSummary.totalSeats}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    {activeSummary.assignedByQuotient} coc. + {activeSummary.remainingSeatsCount}{' '}
                    resto
                  </p>
                </div>
              </div>

              {/* Tie Notice */}
              {activeSummary.hasTieOnLastSeat && (
                <div
                  role="status"
                  className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5 text-xs sm:text-sm text-amber-900"
                >
                  <p className="font-semibold">
                    Empate en el mayor resto para el último puesto (Art. 12 RD 1844/1994)
                  </p>
                  <p className="text-xs text-amber-800">
                    Corresponde al candidato de mayor antigüedad en la empresa. Selecciona la lista
                    desempatada:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeSummary.results
                      .filter((r) => activeSummary.tiedCandidacyIds.includes(r.candidacy.id))
                      .map((r) => (
                        <button
                          key={r.candidacy.id}
                          type="button"
                          onClick={() =>
                            updateCollegeField(activeCollege.id, (c) => ({
                              ...c,
                              seniorityWinnerId: r.candidacy.id,
                            }))
                          }
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                            r.remainderSeat > 0
                              ? 'bg-amber-900 text-white border-amber-900'
                              : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                          }`}
                        >
                          {r.candidacy.acronym} {r.remainderSeat > 0 ? '(Asignado)' : ''}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Hemicycle & Live Seat Table */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Reparto en {activeCollege.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Cociente electoral y mayor resto (Art. 12 RD 1844/1994)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => exportSimpleCSV(state.companyName, committee)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    <span>Excel CSV</span>
                  </button>
                </div>

                <div className="mt-4">
                  <HemicycleChart
                    items={activeSummary.results.map((r) => ({
                      id: r.candidacy.id,
                      acronym: r.candidacy.acronym || 'Lista',
                      color: r.candidacy.color,
                      seats: r.seats,
                      pctOfValid: r.pctOfValid,
                    }))}
                    totalSeats={activeSummary.totalSeats}
                  />
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                  {activeSummary.results.map((r) => {
                    const widthPct = Math.max(2, Math.min(100, r.pctOfValid));
                    return (
                      <div key={r.candidacy.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: r.candidacy.color }}
                              aria-hidden="true"
                            />
                            <span className="font-semibold text-sm text-slate-900 truncate">
                              {r.candidacy.acronym || 'Lista'}
                            </span>
                            {!r.meetsThreshold && activeSummary.validVotes > 0 ? (
                              <span className="text-[11px] text-amber-700 font-medium">
                                · Excluida (&lt;{activeSummary.thresholdPct}%)
                              </span>
                            ) : r.meetsThreshold ? (
                              <span className="text-[11px] text-slate-500 hidden sm:inline tabular-nums">
                                · {r.integerSeats} por cociente
                                {r.remainderSeat > 0 ? ' + 1 por resto' : ''}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-3 shrink-0 tabular-nums text-sm">
                            <span className="text-slate-600">
                              {r.candidacy.votes.toLocaleString('es-ES')}
                            </span>
                            <span className="text-slate-400 w-12 text-right">
                              {r.pctOfValid.toFixed(1)}%
                            </span>
                            <span className="font-display font-bold text-slate-900 w-14 text-right">
                              {r.seats} del.
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-200"
                            style={{
                              width: `${r.candidacy.votes > 0 ? widthPct : 0}%`,
                              backgroundColor: r.candidacy.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Interactive Charts & Quotient/Remainder Table */}
              <section id="graficos" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Desglose y Gráficos
                  </h2>

                  <div className="inline-flex p-1 bg-slate-100 rounded-xl self-start">
                    {[
                      { key: 'quotient' as const, label: 'Cociente y Resto' },
                      { key: 'bars' as const, label: 'Comparativa' },
                      { key: 'breakdown' as const, label: 'Participación' },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setChartTab(tab.key)}
                        className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          chartTab === tab.key
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {chartTab === 'quotient' && (
                  <div className="mt-4 space-y-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 tabular-nums">
                      Cociente electoral ={' '}
                      <strong className="text-slate-900">
                        {activeSummary.admittedVotesTotal} votos admitidos
                      </strong>{' '}
                      /{' '}
                      <strong className="text-slate-900">
                        {activeSummary.totalSeats} puestos
                      </strong>{' '}
                      ={' '}
                      <strong className="font-mono text-[#C8102E]">
                        {activeSummary.electoralQuotient > 0
                          ? activeSummary.electoralQuotient.toFixed(4)
                          : '0.0000'}
                      </strong>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm tabular-nums">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-2 font-medium">Lista</th>
                            <th className="py-2 px-2 font-medium text-right">Votos</th>
                            <th className="py-2 px-2 font-medium text-right">V / Coc.</th>
                            <th className="py-2 px-2 font-medium text-right">Enteros</th>
                            <th className="py-2 px-2 font-medium text-right">Resto</th>
                            <th className="py-2 px-2 font-medium text-right">+Resto</th>
                            <th className="py-2 pl-2 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeSummary.results.map((r) => (
                            <tr key={r.candidacy.id} className="hover:bg-slate-50">
                              <td className="py-2.5 pr-2 font-semibold text-slate-900">
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: r.candidacy.color }}
                                  />
                                  {r.candidacy.acronym}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right text-slate-700">
                                {r.candidacy.votes}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono text-xs text-slate-600">
                                {r.meetsThreshold ? r.exactRatio.toFixed(3) : '—'}
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                                {r.meetsThreshold ? r.integerSeats : 0}
                              </td>
                              <td
                                className={`py-2.5 px-2 text-right font-mono text-xs ${
                                  r.remainderSeat > 0
                                    ? 'font-semibold text-[#C8102E] bg-[#FDF2F4]'
                                    : 'text-slate-500'
                                }`}
                              >
                                {r.meetsThreshold ? r.remainderFraction.toFixed(3) : '—'}
                              </td>
                              <td className="py-2.5 px-2 text-right font-semibold text-[#C8102E]">
                                {r.remainderSeat > 0 ? '+1' : '0'}
                              </td>
                              <td className="py-2.5 pl-2 text-right font-display font-bold text-slate-900">
                                {r.seats}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {chartTab === 'bars' && (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center gap-1.5">
                      {[
                        { key: 'votes' as const, label: 'Votos' },
                        { key: 'pct' as const, label: '% Válidos' },
                        { key: 'seats' as const, label: 'Delegados' },
                      ].map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setBarMetric(m.key)}
                          className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            barMetric === m.key
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={barData}
                          margin={{ top: 10, right: 10, left: -12, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                          <XAxis
                            dataKey="acronym"
                            tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                            axisLine={{ stroke: '#CBD5E1' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: '#64748B', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={barMetric === 'pct'}
                          />
                          <Tooltip
                            cursor={{ fill: '#F1F5F9' }}
                            contentStyle={{
                              backgroundColor: '#FFFFFF',
                              borderColor: '#E2E8F0',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                            formatter={(value) => {
                              const v = Number(value ?? 0);
                              if (barMetric === 'votes') return [`${v} votos`, 'Votos'];
                              if (barMetric === 'pct') return [`${v}%`, '% Válidos'];
                              return [`${v} delegados`, 'Delegados'];
                            }}
                          />
                          <Bar dataKey={barMetric} radius={[8, 8, 0, 0]} maxBarSize={56}>
                            {barData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {chartTab === 'breakdown' && (
                  <div className="mt-4">
                    {pieData.length === 0 ? (
                      <p className="py-16 text-center text-sm text-slate-400">
                        Introduce votos o censo para visualizar el desglose.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="h-[240px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={52}
                                outerRadius={88}
                                paddingAngle={2}
                              >
                                {pieData.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#FFFFFF',
                                  borderColor: '#E2E8F0',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                }}
                                formatter={(val) => [`${Number(val ?? 0)} personas`, 'Total']}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="space-y-2 text-xs sm:text-sm tabular-nums">
                          {pieData.map((item) => {
                            const pct =
                              activeSummary.census > 0
                                ? (
                                    (item.value /
                                      Math.max(activeSummary.census, activeSummary.totalVoters)) *
                                    100
                                  ).toFixed(1)
                                : '0.0';
                            return (
                              <div
                                key={item.name}
                                className="flex items-center justify-between gap-3 py-1 border-b border-slate-100 last:border-b-0"
                              >
                                <span className="flex items-center gap-2 text-slate-700">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  {item.name}
                                </span>
                                <span className="font-semibold text-slate-900">
                                  {item.value}{' '}
                                  <span className="text-slate-400 font-normal">({pct}%)</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
