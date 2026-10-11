import React, { useEffect, useState, useRef } from 'react';
import {
  RotateCcw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calculator,
  ChevronDown,
  ChevronUp,
  Eye,
  ExternalLink,
  PieChart as PieIcon,
  Layers,
  Calendar,
  CalendarDays,
  RefreshCw,
  AlertCircle,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api } from '../api';
import {
  AccountScope,
  DashboardPayload,
  CategoryDrilldownPayload,
  TransactionsFilterHandoff,
} from '../types';

interface DashboardPageProps {
  scope: AccountScope;
  masterCategories: string[];
  onNavigateToTransactions: (handoff?: TransactionsFilterHandoff) => void;
}

const MONTH_OPTIONS = [
  { short: 'Jan', full: 'January' },
  { short: 'Feb', full: 'February' },
  { short: 'Mar', full: 'March' },
  { short: 'Apr', full: 'April' },
  { short: 'May', full: 'May' },
  { short: 'Jun', full: 'June' },
  { short: 'Jul', full: 'July' },
  { short: 'Aug', full: 'August' },
  { short: 'Sep', full: 'September' },
  { short: 'Oct', full: 'October' },
  { short: 'Nov', full: 'November' },
  { short: 'Dec', full: 'December' },
];

export const DashboardPage: React.FC<DashboardPageProps> = ({
  scope,
  masterCategories,
  onNavigateToTransactions,
}) => {
  const currentYear = new Date().getFullYear().toString();
  const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);

  // Filters state - Default to current calendar year and current month
  const [timeMode, setTimeMode] = useState<'Financial Year' | 'Calendar Year' | 'Rolling Period'>('Calendar Year');
  const [selectedPeriod, setSelectedPeriod] = useState(currentYear);
  const [bank, setBank] = useState('All Banks');
  const [hideInternal, setHideInternal] = useState(true);
  const [netSpendMode, setNetSpendMode] = useState(false);
  const [ignoreLegacy, setIgnoreLegacy] = useState(true);
  const [excludeExceptional, setExcludeExceptional] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([currentMonthName]);
  const [includeCategories, setIncludeCategories] = useState<string[]>([]);
  const [excludeCategories, setExcludeCategories] = useState<string[]>([]);

  // What-If Calculator state
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [whatIfSalary, setWhatIfSalary] = useState<number | ''>('');

  // Click-to-inspect Category Drilldown state
  const [inspectCategory, setInspectCategory] = useState<string | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<CategoryDrilldownPayload | null>(null);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [drilldownSaveStatus, setDrilldownSaveStatus] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Chart visibility toggles
  const [showMonthlyChart, setShowMonthlyChart] = useState(true);
  const [showTopCatsChart, setShowTopCatsChart] = useState(true);
  const [showCumulativeChart, setShowCumulativeChart] = useState(false);
  const [showTopMerchChart, setShowTopMerchChart] = useState(false);
  const [showBankCatChart, setShowBankCatChart] = useState(false);

  // Request ID refs to completely eliminate async race condition overwrites
  const latestRequestIdRef = useRef(0);
  const latestDrilldownIdRef = useRef(0);

  const fetchDashboard = async () => {
    const reqId = ++latestRequestIdRef.current;
    setLoading(true);
    setDashboardError(null);
    try {
      const res = await api.getDashboard(scope, {
        time_mode: timeMode,
        selected_period: selectedPeriod,
        bank,
        hide_internal: hideInternal,
        net_spend_mode: netSpendMode,
        ignore_legacy: ignoreLegacy,
        exclude_exceptional: excludeExceptional,
        months: selectedMonths,
        include_categories: includeCategories,
        exclude_categories: excludeCategories,
      });
      // Only commit data if this is still the most recently triggered request
      if (reqId === latestRequestIdRef.current) {
        setData(res);
        if (inspectCategory) {
          loadDrilldown(inspectCategory);
        }
      }
    } catch (err: unknown) {
      if (reqId === latestRequestIdRef.current) {
        console.error('Failed to load dashboard', err);
        const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
        setDashboardError(msg);
      }
    } finally {
      if (reqId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadDrilldown = async (cat: string) => {
    const reqId = ++latestDrilldownIdRef.current;
    setInspectCategory(cat);
    // Instantly clear previous category's drilldown to prevent stale data display
    setDrilldown(null);
    setDrilldownLoading(true);
    setDrilldownError(null);
    try {
      const res = await api.getCategoryDrilldown(scope, cat, {
        time_mode: timeMode,
        selected_period: selectedPeriod,
        bank,
        hide_internal: hideInternal,
        net_spend_mode: netSpendMode,
        ignore_legacy: ignoreLegacy,
        exclude_exceptional: excludeExceptional,
        months: selectedMonths,
        include_categories: includeCategories,
        exclude_categories: excludeCategories,
      });
      if (reqId === latestDrilldownIdRef.current) {
        setDrilldown(res);
      }
    } catch (err: unknown) {
      if (reqId === latestDrilldownIdRef.current) {
        console.error('Failed to load category drilldown', err);
        const msg = err instanceof Error ? err.message : 'Failed to load details';
        setDrilldownError(msg);
      }
    } finally {
      if (reqId === latestDrilldownIdRef.current) {
        setDrilldownLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [
    scope,
    timeMode,
    selectedPeriod,
    bank,
    hideInternal,
    netSpendMode,
    ignoreLegacy,
    excludeExceptional,
    selectedMonths,
    includeCategories,
    excludeCategories,
  ]);

  const handleToggleMonth = (monthFull: string, event: React.MouseEvent) => {
    if (event.altKey) {
      // Alt-click isolates single month
      setSelectedMonths([monthFull]);
      return;
    }
    setSelectedMonths((prev) => {
      // If no months are filtered (full year), clicking one isolates it
      if (prev.length === 0) {
        return [monthFull];
      }
      if (prev.includes(monthFull)) {
        return prev.filter((m) => m !== monthFull && m !== monthFull.slice(0, 3));
      } else {
        return [...prev, monthFull];
      }
    });
  };

  const handleSelectLast3Months = () => {
    const curIdx = new Date().getMonth();
    const last3 = [
      MONTH_OPTIONS[(curIdx - 2 + 12) % 12].full,
      MONTH_OPTIONS[(curIdx - 1 + 12) % 12].full,
      MONTH_OPTIONS[curIdx].full,
    ];
    setSelectedMonths(last3);
  };

  const handleResetFilters = () => {
    setTimeMode('Calendar Year');
    setSelectedPeriod(currentYear);
    setSelectedMonths([currentMonthName]);
    setBank('All Banks');
    setHideInternal(true);
    setNetSpendMode(false);
    setIgnoreLegacy(true);
    setIncludeCategories([]);
    setExcludeCategories([]);
    setInspectCategory(null);
    setDrilldown(null);
  };

  const buildTransactionsHandoff = (categoryName: string): TransactionsFilterHandoff => {
    const normalizedBank = bank && bank !== 'All Banks' ? bank : 'All';
    const pad = (n: number) => String(n).padStart(2, '0');

    if (timeMode === 'Financial Year') {
      return {
        category: categoryName,
        bank: normalizedBank,
        financial_year: selectedPeriod || 'All',
        date_from: selectedPeriod === 'All' && ignoreLegacy ? '2021-01-01' : '',
        date_to: '',
        months: [],
      };
    }

    if (timeMode === 'Calendar Year') {
      const monthIndices = selectedMonths
        .map((sm) => MONTH_OPTIONS.findIndex((m) => m.full === sm || m.short === sm))
        .filter((idx) => idx >= 0);

      if (selectedPeriod !== 'All' && /^\d{4}$/.test(selectedPeriod)) {
        const yearNum = parseInt(selectedPeriod, 10);
        if (monthIndices.length === 0) {
          return {
            category: categoryName,
            bank: normalizedBank,
            financial_year: 'All',
            date_from: `${selectedPeriod}-01-01`,
            date_to: `${selectedPeriod}-12-31`,
            months: [],
          };
        }
        const uniqueSorted = Array.from(new Set(monthIndices)).sort((a, b) => a - b);
        const minMonth = uniqueSorted[0];
        const maxMonth = uniqueSorted[uniqueSorted.length - 1];
        const lastDay = new Date(yearNum, maxMonth + 1, 0).getDate();
        const isContiguous = maxMonth - minMonth + 1 === uniqueSorted.length;

        return {
          category: categoryName,
          bank: normalizedBank,
          financial_year: 'All',
          date_from: `${yearNum}-${pad(minMonth + 1)}-01`,
          date_to: `${yearNum}-${pad(maxMonth + 1)}-${pad(lastDay)}`,
          months: isContiguous ? [] : selectedMonths,
        };
      }

      return {
        category: categoryName,
        bank: normalizedBank,
        financial_year: 'All',
        date_from: ignoreLegacy ? '2021-01-01' : '',
        date_to: '',
        months: selectedMonths.length > 0 ? selectedMonths : [],
      };
    }

    // Rolling Period mode
    const now = new Date();
    let dateFrom = '';
    if (selectedPeriod === 'This Month') {
      dateFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    } else {
      const rollingMap: Record<string, number> = {
        'Last 3 Months': 3,
        'Last 6 Months': 6,
        'Last 12 Months': 12,
        'Last 18 Months': 18,
        'Last 2 Years': 24,
      };
      const monthsBack = rollingMap[selectedPeriod] ?? 3;
      const targetYear = now.getFullYear();
      const targetMonth = now.getMonth() - monthsBack;
      const maxDayInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
      const cutoffDate = new Date(
        targetYear,
        targetMonth,
        Math.min(now.getDate(), maxDayInTarget)
      );
      dateFrom = `${cutoffDate.getFullYear()}-${pad(cutoffDate.getMonth() + 1)}-${pad(cutoffDate.getDate())}`;
    }

    return {
      category: categoryName,
      bank: normalizedBank,
      financial_year: 'All',
      date_from: dateFrom,
      date_to: '',
      months: [],
    };
  };

  const handleDrilldownCategoryChange = async (rowId: number, newCategory: string) => {
    setDrilldownSaveStatus('Saving...');
    setDrilldownError(null);
    try {
      await api.patchTransaction(scope, rowId, { Category: newCategory });
      setDrilldownSaveStatus('Category updated');
      setTimeout(() => {
        setDrilldownSaveStatus((cur) => (cur === 'Category updated' ? null : cur));
      }, 2500);
      await fetchDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update category';
      setDrilldownError(msg);
      setDrilldownSaveStatus(null);
    }
  };


  const metrics = data?.metrics || {
    total_income: 0,
    committed_expenses: 0,
    variable_expenses: 0,
    net_expenses: 0,
    net_flow: 0,
    months_in_period: 1,
    avg_income: 0,
    avg_baseline: 0,
    spare_cash: 0,
    avg_monthly_spend: 0,
  };

  const periodOptions =
    timeMode === 'Financial Year'
      ? data?.filter_options.financial_years || ['All']
      : timeMode === 'Calendar Year'
        ? (data?.filter_options.calendar_years?.includes(currentYear)
            ? data.filter_options.calendar_years
            : [currentYear, ...(data?.filter_options.calendar_years || ['All'])])
        : data?.filter_options.rolling_periods || ['This Month', 'Last 3 Months', 'Last 6 Months', 'Last 12 Months'];

  const hypotheticalSalary =
    typeof whatIfSalary === 'number' && whatIfSalary > 0 ? whatIfSalary : metrics.avg_income;
  const newDiscretionary = hypotheticalSalary - metrics.avg_baseline;

  return (
    <div className="space-y-4">
      {/* Dashboard Network/Server Error Notice */}
      {dashboardError && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center justify-between gap-2 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{dashboardError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchDashboard()}
            className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. Compact Filter Bar */}
      <section className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Time Mode */}
            <div className="inline-flex rounded-lg p-0.5 bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]">
              {(['Financial Year', 'Calendar Year', 'Rolling Period'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setTimeMode(m);
                    if (m === 'Rolling Period') {
                      setSelectedPeriod('This Month');
                      setSelectedMonths([]);
                    } else if (m === 'Calendar Year') {
                      setSelectedPeriod(currentYear);
                      setSelectedMonths([currentMonthName]);
                    } else {
                      setSelectedPeriod('All');
                      setSelectedMonths([]);
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    timeMode === m
                      ? 'bg-[#e74c3c] text-white'
                      : 'text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Selected Period Dropdown */}
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] font-semibold"
            >
              {periodOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            {/* Bank Dropdown */}
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
            >
              {(data?.filter_options.banks || ['All Banks']).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Toggles + Reset */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-[#485b69] dark:text-[#b0bec5]">
              <input
                type="checkbox"
                checked={hideInternal}
                onChange={(e) => setHideInternal(e.target.checked)}
                className="rounded border-[#32424a]"
              />
              <span>Hide Internal</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-[#485b69] dark:text-[#b0bec5]">
              <input
                type="checkbox"
                checked={netSpendMode}
                onChange={(e) => setNetSpendMode(e.target.checked)}
                className="rounded border-[#32424a]"
              />
              <span>Net Spend Only</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-[#485b69] dark:text-[#b0bec5]">
              <input
                type="checkbox"
                checked={ignoreLegacy}
                onChange={(e) => setIgnoreLegacy(e.target.checked)}
                className="rounded border-[#32424a]"
              />
              <span>Post-2020 Only</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white">
              <input
                type="checkbox"
                checked={excludeExceptional}
                onChange={(e) => setExcludeExceptional(e.target.checked)}
                className="rounded border-[#32424a] text-amber-500 focus:ring-0"
              />
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-500" />
                <span>Exclude One-Offs</span>
              </span>
            </label>

            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[#485b69] dark:text-[#b0bec5] hover:text-[#e74c3c] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Month Selection Toolbar (Visible when Calendar Year is active) */}
        {timeMode === 'Calendar Year' && (
          <div className="pt-2.5 mt-2.5 border-t border-[#d6dfe5] dark:border-[#32424a] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#485b69] dark:text-[#b0bec5] mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-cyan-500" />
                <span>Months:</span>
              </span>

              {MONTH_OPTIONS.map((m) => {
                const isSelected = selectedMonths.includes(m.full) || selectedMonths.includes(m.short);
                return (
                  <button
                    key={m.short}
                    type="button"
                    onClick={(e) => handleToggleMonth(m.full, e)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${
                      isSelected
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-[#eef2f5] dark:bg-[#202d35] text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white border border-[#d6dfe5] dark:border-[#32424a]'
                    }`}
                    title={`Toggle ${m.full} (Alt+click to view only ${m.full})`}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>

            {/* Quick Presets & Status */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400 font-mono text-[10px] hidden sm:inline">
                {selectedMonths.length === 0
                  ? `Full Year ${selectedPeriod}`
                  : selectedMonths.length === 1
                    ? `${selectedMonths[0]} (Single Month)`
                    : `${selectedMonths.length} Months Selected (${selectedMonths.map((m) => m.slice(0, 3)).join(', ')})`}
              </span>

              <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonths([currentMonthName])}
                  className="px-2 py-0.5 rounded font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                >
                  This Month
                </button>
                <span className="text-[#32424a]">•</span>
                <button
                  type="button"
                  onClick={handleSelectLast3Months}
                  className="px-2 py-0.5 rounded font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                >
                  Last 3 Months
                </button>
                <span className="text-[#32424a]">•</span>
                <button
                  type="button"
                  onClick={() => setSelectedMonths([])}
                  className="px-2 py-0.5 rounded font-medium text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white transition-colors"
                >
                  All Year
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. KPI Metrics Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5">
          <div className="text-xs text-[#485b69] dark:text-[#b0bec5] mb-1 font-medium">
            Avg Income /Mo
          </div>
          <div className="text-xl font-bold text-[#2ecc71] tabular-nums">
            £{metrics.avg_income.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#485b69] dark:text-[#b0bec5] mt-1 tabular-nums">
            Total: £{metrics.total_income.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5">
          <div className="text-xs text-[#485b69] dark:text-[#b0bec5] mb-1 font-medium">
            Baseline Bills /Mo
          </div>
          <div className="text-xl font-bold text-[#ff5252] tabular-nums">
            £{metrics.avg_baseline.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#485b69] dark:text-[#b0bec5] mt-1 tabular-nums">
            Committed net: £
            {metrics.committed_expenses.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5">
          <div className="text-xs text-[#485b69] dark:text-[#b0bec5] mb-1 font-medium">
            Spare Cash /Mo
          </div>
          <div
            className={`text-xl font-bold tabular-nums ${
              metrics.spare_cash >= 0 ? 'text-[#3498db]' : 'text-[#ff5252]'
            }`}
          >
            £{metrics.spare_cash.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#485b69] dark:text-[#b0bec5] mt-1">
            True discretionary margin
          </div>
        </div>

        <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5">
          <div className="text-xs text-[#485b69] dark:text-[#b0bec5] mb-1 font-medium">
            Avg Spend /Mo
          </div>
          <div className="text-xl font-bold text-[#f39c12] tabular-nums">
            £{metrics.avg_monthly_spend.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-[#485b69] dark:text-[#b0bec5] mt-1 tabular-nums">
            Net flow: £{metrics.net_flow.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </section>

      {/* 3. Recent Month vs. Average Insight Banner & What-If Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {data?.recent_delta && (
          <div className="lg:col-span-2 bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  data.recent_delta.variable_diff <= 0
                    ? 'bg-[#2ecc71]/15 text-[#2ecc71]'
                    : 'bg-[#f39c12]/15 text-[#f39c12]'
                }`}
              >
                {data.recent_delta.variable_diff <= 0 ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold">
                  Recent Month Insight ({data.recent_delta.month})
                </h2>
                <p className="text-xs text-[#485b69] dark:text-[#b0bec5] mt-0.5">
                  Variable lifestyle spend was{' '}
                  <span className="font-semibold text-white">
                    £{data.recent_delta.variable_actual.toFixed(2)}
                  </span>{' '}
                  (
                  <span
                    className={
                      data.recent_delta.variable_diff <= 0 ? 'text-[#2ecc71]' : 'text-[#f39c12]'
                    }
                  >
                    {data.recent_delta.variable_diff <= 0 ? '£' : '+£'}
                    {data.recent_delta.variable_diff.toFixed(2)} vs historical avg
                  </span>
                  ). Committed bills were £{data.recent_delta.committed_actual.toFixed(2)}.
                </p>
              </div>
            </div>
          </div>
        )}

        <div
          className={`${
            data?.recent_delta ? 'lg:col-span-1' : 'lg:col-span-3'
          } bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-3.5`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowWhatIf(!showWhatIf)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#121a21] dark:text-white"
            >
              <Calculator className="w-4 h-4 text-[#e74c3c]" />
              <span>Wage Reduction What-If</span>
              {showWhatIf ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            <span className="text-xs font-bold text-[#3498db] tabular-nums">
              £{newDiscretionary.toFixed(2)} margin
            </span>
          </div>

          {showWhatIf && (
            <div className="mt-3 pt-3 border-t border-[#d6dfe5] dark:border-[#32424a] space-y-2">
              <label className="block text-[11px] text-[#485b69] dark:text-[#b0bec5]">
                Hypothetical Monthly Income (£)
              </label>
              <input
                type="number"
                step="50"
                placeholder={metrics.avg_income.toFixed(2)}
                value={whatIfSalary}
                onChange={(e) =>
                  setWhatIfSalary(e.target.value === '' ? '' : parseFloat(e.target.value))
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] tabular-nums"
              />
              <div
                className={`p-2 rounded text-xs ${
                  newDiscretionary >= 0
                    ? 'bg-[#2ecc71]/15 text-[#2ecc71]'
                    : 'bg-[#8b0000]/25 text-[#ff5252]'
                }`}
              >
                {newDiscretionary >= 0
                  ? `Committed bills (£${metrics.avg_baseline.toFixed(2)}) are covered.`
                  : `Committed bills exceed this income by £${Math.abs(newDiscretionary).toFixed(2)}!`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Cash Flow Breakdown + Click-to-Inspect Category Drilldown */}
      <section className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold">Cash Flow Breakdown (Monthly Averages)</h2>
            <p className="text-xs text-[#485b69] dark:text-[#b0bec5]">
              Click any category row to immediately inspect merchants and transactions
            </p>
          </div>
          {inspectCategory && (
            <button
              type="button"
              onClick={() => setInspectCategory(null)}
              className="text-xs text-[#e74c3c] hover:underline"
            >
              Close Drill-Down
            </button>
          )}
        </div>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-[#1b262c]/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-lg">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 bg-[#263238] px-3.5 py-2 rounded-md border border-cyan-500/40 shadow-xl">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Calculating Cash Flow Breakdown...</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Column 1: Income Streams */}
          <div className="p-3 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-[#2ecc71]">Income Streams</span>
              <span className="text-xs font-bold text-[#2ecc71] tabular-nums">
                £{(data?.cashflow_breakdown.income_total || 0).toFixed(2)}
              </span>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {data?.cashflow_breakdown.income.map((catItem) => (
                <div key={catItem.category} className="text-xs">
                  <button
                    type="button"
                    onClick={() => loadDrilldown(catItem.category)}
                    className="w-full text-left flex justify-between font-medium hover:text-[#2ecc71]"
                  >
                    <span>{catItem.category}</span>
                    <span className="tabular-nums">£{catItem.avg_monthly.toFixed(2)}</span>
                  </button>
                  {catItem.merchants.map((m) => (
                    <div
                      key={m.name}
                      className="flex justify-between text-[11px] text-[#485b69] dark:text-[#b0bec5] pl-2 py-0.5"
                    >
                      <span className="truncate pr-1">• {m.name}</span>
                      <span className="tabular-nums">£{m.avg_monthly.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Committed Bills */}
          <div className="p-3 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-[#ff5252]">Committed Bills</span>
              <span className="text-xs font-bold text-[#ff5252] tabular-nums">
                £{(data?.cashflow_breakdown.committed_total || 0).toFixed(2)}
              </span>
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {data?.cashflow_breakdown.committed.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => loadDrilldown(item.category)}
                  className={`w-full flex justify-between items-center p-1.5 rounded text-xs transition-colors ${
                    inspectCategory === item.category
                      ? 'bg-[#ff5252]/20 font-bold text-white'
                      : 'hover:bg-[#263238]'
                  }`}
                >
                  <span className="truncate pr-1">{item.category}</span>
                  <span className="tabular-nums text-[#ff5252] font-semibold">
                    £{item.avg_monthly.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Column 3: Variable Spend */}
          <div className="p-3 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-[#f39c12]">Variable Spend</span>
              <span className="text-xs font-bold text-[#f39c12] tabular-nums">
                £{(data?.cashflow_breakdown.variable_total || 0).toFixed(2)}
              </span>
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {data?.cashflow_breakdown.variable.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => loadDrilldown(item.category)}
                  className={`w-full flex justify-between items-center p-1.5 rounded text-xs transition-colors ${
                    inspectCategory === item.category
                      ? 'bg-[#f39c12]/20 font-bold text-white'
                      : 'hover:bg-[#263238]'
                  }`}
                >
                  <span className="truncate pr-1">{item.category}</span>
                  <span className="tabular-nums text-[#f39c12] font-semibold">
                    £{item.avg_monthly.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Column 4: Savings & Transfers */}
          <div className="p-3 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-[#3498db]">Savings & Transfers</span>
              <span className="text-xs text-[#485b69] dark:text-[#b0bec5]">Net /Mo</span>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {data?.cashflow_breakdown.savings.map((catItem) => (
                <div key={catItem.category} className="text-xs">
                  <button
                    type="button"
                    onClick={() => loadDrilldown(catItem.category)}
                    className={`w-full text-left flex justify-between font-medium p-1 rounded transition-colors ${
                      inspectCategory === catItem.category
                        ? 'bg-[#3498db]/20 font-bold text-white'
                        : 'hover:text-[#3498db] hover:bg-[#263238]'
                    }`}
                  >
                    <span className="truncate pr-1">{catItem.category}</span>
                    <span className="tabular-nums text-[#3498db]">
                      £{catItem.avg_monthly.toFixed(2)}
                    </span>
                  </button>
                  {catItem.merchants.map((m) => (
                    <div
                      key={m.name}
                      className="flex justify-between text-[11px] text-[#485b69] dark:text-[#b0bec5] pl-2 py-0.5"
                    >
                      <span className="truncate pr-1">• {m.name}</span>
                      <span className="tabular-nums">£{m.avg_monthly.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

        {/* Excluded One-Off Spend Callout Banner */}
        {excludeExceptional && data?.exceptional_summary && data.exceptional_summary.length > 0 && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-500/20 text-amber-400">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <span>
                <strong className="text-amber-300">Excluded One-Off Spend:</strong>{' '}
                {data.exceptional_summary.map((item, idx) => (
                  <span key={item.category}>
                    {idx > 0 && ', '}
                    <strong className="text-white">{item.category}</strong>{' '}
                    (£{item.total.toFixed(2)} across {item.count} {item.count === 1 ? 'transaction' : 'transactions'})
                  </span>
                ))}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {data.exceptional_summary.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => loadDrilldown(item.category)}
                  className="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800/80 text-amber-100 font-semibold text-[11px] border border-amber-700/60 transition-colors"
                >
                  Inspect {item.category}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drill-down Drawer / Detail Panel */}
        {inspectCategory && (
          <div className="mt-4 pt-4 border-t border-[#d6dfe5] dark:border-[#32424a] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-[#e74c3c]/15 text-[#e74c3c]">
                  <Eye className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold">Category Inspection: {inspectCategory}</h3>
                {drilldown && drilldown.category === inspectCategory && (
                  <span className="text-xs text-[#485b69] dark:text-[#b0bec5] tabular-nums">
                    (Expenditure: £{drilldown.total_expenditure.toFixed(2)} | Refunds: £
                    {drilldown.total_refunds.toFixed(2)} | Net: £{drilldown.net_cost.toFixed(2)})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {drilldownSaveStatus && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{drilldownSaveStatus}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onNavigateToTransactions(buildTransactionsHandoff(inspectCategory))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-[#e74c3c] hover:bg-[#d64232] text-white"
                >
                  <span>Open in Transactions Editor</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectCategory(null);
                    setDrilldown(null);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {drilldownLoading ? (
              <div className="text-xs text-[#485b69] dark:text-[#b0bec5] py-4 text-center flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
                <span>Loading merchants and transactions for {inspectCategory}...</span>
              </div>
            ) : drilldownError ? (
              <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center justify-between gap-2 text-xs text-red-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>{drilldownError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => loadDrilldown(inspectCategory)}
                  className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white font-medium transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : drilldown && drilldown.category === inspectCategory && drilldown.merchants.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Merchants Table */}
                <div className="border border-[#d6dfe5] dark:border-[#32424a] rounded-lg overflow-x-auto max-h-56">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#f4f6f8] dark:bg-[#263238] text-[#485b69] dark:text-[#b0bec5] border-b border-[#d6dfe5] dark:border-[#32424a]">
                      <tr>
                        <th className="py-1.5 px-2.5">Merchant</th>
                        <th className="py-1.5 px-2.5 text-right">Total</th>
                        <th className="py-1.5 px-2.5 text-right">Count</th>
                        <th className="py-1.5 px-2.5">Last Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d6dfe5] dark:divide-[#32424a]">
                      {drilldown.merchants.map((m) => (
                        <tr key={m.Name}>
                          <td className="py-1.5 px-2.5 font-medium">{m.Name}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">
                            £{m.Total_Amount.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">
                            {m.Transactions}
                          </td>
                          <td className="py-1.5 px-2.5 text-[#485b69] dark:text-[#b0bec5]">
                            {m.Last_Date}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Individual Transactions Preview */}
                <div className="border border-[#d6dfe5] dark:border-[#32424a] rounded-lg overflow-x-auto max-h-56">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#f4f6f8] dark:bg-[#263238] text-[#485b69] dark:text-[#b0bec5] border-b border-[#d6dfe5] dark:border-[#32424a]">
                      <tr>
                        <th className="py-1.5 px-2.5">Date</th>
                        <th className="py-1.5 px-2.5">Name</th>
                        <th className="py-1.5 px-2.5 text-right">Amount</th>
                        <th className="py-1.5 px-2.5">Category</th>
                        <th className="py-1.5 px-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d6dfe5] dark:divide-[#32424a]">
                      {drilldown.transactions.slice(0, 50).map((tx) => (
                        <tr key={tx.row_id}>
                          <td className="py-1 px-2.5 tabular-nums whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  tx.Transaction_Type === 'Expense'
                                    ? 'bg-[#ff5252]'
                                    : 'bg-[#2ecc71]'
                                }`}
                                title={tx.Transaction_Type}
                              />
                              <span>{tx.Date_Display || tx.Date}</span>
                            </div>
                          </td>
                          <td className="py-1 px-2.5 font-medium truncate max-w-[140px]">
                            {tx.Name}
                          </td>
                          <td className="py-1 px-2.5 text-right tabular-nums">
                            £{tx.Amount.toFixed(2)}
                          </td>
                          <td className="py-1 px-2.5">
                            <select
                              aria-label={`Category for ${tx.Name}`}
                              value={tx.Category}
                              onChange={(e) =>
                                handleDrilldownCategoryChange(tx.row_id, e.target.value)
                              }
                              className="bg-[#eef2f5] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] hover:border-cyan-500/60 focus:border-cyan-500 rounded px-1.5 py-0.5 text-[11px] text-[#121a21] dark:text-[#f8fafc] outline-none cursor-pointer max-w-[135px]"
                            >
                              {!tx.Category && <option value="">Uncategorized</option>}
                              {tx.Category && !masterCategories.includes(tx.Category) && (
                                <option value={tx.Category}>{tx.Category}</option>
                              )}
                              {masterCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 px-2.5 text-[#485b69] dark:text-[#b0bec5] truncate max-w-[120px]">
                            {tx.Notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#485b69] dark:text-[#b0bec5]">
                No transactions found for this category in the current filter period.
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. Interactive Charts Section with Visibility Toggles */}
      <section className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Financial Visualizations</h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowMonthlyChart(!showMonthlyChart)}
              className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                showMonthlyChart
                  ? 'bg-[#263238] text-white border-[#32424a]'
                  : 'text-[#485b69] dark:text-[#b0bec5] border-transparent'
              }`}
            >
              Monthly Cash Flow
            </button>
            <button
              type="button"
              onClick={() => setShowTopCatsChart(!showTopCatsChart)}
              className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                showTopCatsChart
                  ? 'bg-[#263238] text-white border-[#32424a]'
                  : 'text-[#485b69] dark:text-[#b0bec5] border-transparent'
              }`}
            >
              Top Categories
            </button>
            <button
              type="button"
              onClick={() => setShowCumulativeChart(!showCumulativeChart)}
              className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                showCumulativeChart
                  ? 'bg-[#263238] text-white border-[#32424a]'
                  : 'text-[#485b69] dark:text-[#b0bec5] border-transparent'
              }`}
            >
              Cumulative Wealth
            </button>
            <button
              type="button"
              onClick={() => setShowTopMerchChart(!showTopMerchChart)}
              className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                showTopMerchChart
                  ? 'bg-[#263238] text-white border-[#32424a]'
                  : 'text-[#485b69] dark:text-[#b0bec5] border-transparent'
              }`}
            >
              Top Merchants
            </button>
            <button
              type="button"
              onClick={() => setShowBankCatChart(!showBankCatChart)}
              className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                showBankCatChart
                  ? 'bg-[#263238] text-white border-[#32424a]'
                  : 'text-[#485b69] dark:text-[#b0bec5] border-transparent'
              }`}
            >
              Bank & Categories
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Cash Flow Grouped Bar Chart */}
          {showMonthlyChart && data?.charts.monthly_cashflow && (
            <div className="p-3.5 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
              <h3 className="text-xs font-bold mb-2">Monthly Cash Flow (Income vs. Bills vs. Variable)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.monthly_cashflow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#32424a" opacity={0.4} />
                    <XAxis dataKey="month" tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1b262c', borderColor: '#32424a', color: '#fff' }}
                      formatter={(val: number) => `£${val.toFixed(2)}`}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#b0bec5' }} />
                    <Bar dataKey="income" name="True Income" fill="#2ecc71" />
                    <Bar dataKey="committed" name="Committed Baseline" fill="#ff5252" stackId="spend" />
                    <Bar dataKey="variable" name="Variable Lifestyle" fill="#f39c12" stackId="spend" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top 10 Categories Horizontal Bar Chart */}
          {showTopCatsChart && data?.charts.top_categories && (
            <div className="p-3.5 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
              <h3 className="text-xs font-bold mb-2">Top 10 Expense Categories</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.charts.top_categories}
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#32424a" opacity={0.4} />
                    <XAxis type="number" tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <YAxis dataKey="category" type="category" tick={{ fill: '#b0bec5', fontSize: 11 }} width={90} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1b262c', borderColor: '#32424a', color: '#fff' }}
                      formatter={(val: number) => `£${val.toFixed(2)}`}
                    />
                    <Bar dataKey="amount" name="Total Spend" fill="#9b59b6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Cumulative Wealth Line Chart */}
          {showCumulativeChart && data?.charts.cumulative_wealth && (
            <div className="p-3.5 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
              <h3 className="text-xs font-bold mb-2">Cumulative Wealth Trajectory</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.charts.cumulative_wealth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#32424a" opacity={0.4} />
                    <XAxis dataKey="date" tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1b262c', borderColor: '#32424a', color: '#fff' }}
                      formatter={(val: number) => `£${val.toFixed(2)}`}
                    />
                    <Line type="monotone" dataKey="cumulative" stroke="#3498db" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top 10 Merchants Horizontal Bar Chart */}
          {showTopMerchChart && data?.charts.top_merchants && (
            <div className="p-3.5 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
              <h3 className="text-xs font-bold mb-2">Top 10 Merchants (Spend)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.charts.top_merchants}
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#32424a" opacity={0.4} />
                    <XAxis type="number" tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <YAxis dataKey="merchant" type="category" tick={{ fill: '#b0bec5', fontSize: 11 }} width={90} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1b262c', borderColor: '#32424a', color: '#fff' }}
                      formatter={(val: number) => `£${val.toFixed(2)}`}
                    />
                    <Bar dataKey="amount" name="Merchant Spend" fill="#e67e22" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Bank & Category Breakdown Chart */}
          {showBankCatChart && data?.charts.bank_category_breakdown && (
            <div className="p-3.5 rounded-lg bg-[#f4f6f8] dark:bg-[#202d35] border border-[#d6dfe5] dark:border-[#32424a]">
              <h3 className="text-xs font-bold mb-2">Bank &amp; Category Distribution</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.bank_category_breakdown.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#32424a" opacity={0.4} />
                    <XAxis dataKey="category" tick={{ fill: '#b0bec5', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#b0bec5', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1b262c', borderColor: '#32424a', color: '#fff' }}
                      formatter={(val: number) => `£${val.toFixed(2)}`}
                    />
                    <Bar dataKey="amount" name="Spend (£)" fill="#2ecc71" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
