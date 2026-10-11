import React, { useEffect, useState } from 'react';
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
import { AccountScope, DashboardPayload, CategoryDrilldownPayload, NavPage } from '../types';

interface DashboardPageProps {
  scope: AccountScope;
  masterCategories: string[];
  onNavigateToTransactions: (prefilterCategory?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  scope,
  masterCategories,
  onNavigateToTransactions,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);

  // Filters state
  const [timeMode, setTimeMode] = useState('Financial Year');
  const [selectedPeriod, setSelectedPeriod] = useState('All');
  const [bank, setBank] = useState('All Banks');
  const [hideInternal, setHideInternal] = useState(true);
  const [netSpendMode, setNetSpendMode] = useState(false);
  const [ignoreLegacy, setIgnoreLegacy] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [includeCategories, setIncludeCategories] = useState<string[]>([]);
  const [excludeCategories, setExcludeCategories] = useState<string[]>([]);

  // What-If Calculator state
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [whatIfSalary, setWhatIfSalary] = useState<number | ''>('');

  // Click-to-inspect Category Drilldown state
  const [inspectCategory, setInspectCategory] = useState<string | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<CategoryDrilldownPayload | null>(null);

  // Chart visibility toggles
  const [showMonthlyChart, setShowMonthlyChart] = useState(true);
  const [showTopCatsChart, setShowTopCatsChart] = useState(true);
  const [showCumulativeChart, setShowCumulativeChart] = useState(false);
  const [showTopMerchChart, setShowTopMerchChart] = useState(false);
  const [showBankCatChart, setShowBankCatChart] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard(scope, {
        time_mode: timeMode,
        selected_period: selectedPeriod,
        bank,
        hide_internal: hideInternal,
        net_spend_mode: netSpendMode,
        ignore_legacy: ignoreLegacy,
        months: selectedMonths,
        include_categories: includeCategories,
        exclude_categories: excludeCategories,
      });
      setData(res);
      if (inspectCategory) {
        loadDrilldown(inspectCategory);
      }
    } catch (err) {
      console.error('Failed to load dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDrilldown = async (cat: string) => {
    setInspectCategory(cat);
    setDrilldownLoading(true);
    try {
      const res = await api.getCategoryDrilldown(scope, cat, {
        time_mode: timeMode,
        selected_period: selectedPeriod,
        bank,
        hide_internal: hideInternal,
        net_spend_mode: netSpendMode,
        ignore_legacy: ignoreLegacy,
        months: selectedMonths,
        include_categories: includeCategories,
        exclude_categories: excludeCategories,
      });
      setDrilldown(res);
    } catch (err) {
      console.error('Failed to load category drilldown', err);
    } finally {
      setDrilldownLoading(false);
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
    selectedMonths,
    includeCategories,
    excludeCategories,
  ]);

  const handleResetFilters = () => {
    setTimeMode('Financial Year');
    setSelectedPeriod('All');
    setBank('All Banks');
    setHideInternal(true);
    setNetSpendMode(false);
    setIgnoreLegacy(true);
    setSelectedMonths([]);
    setIncludeCategories([]);
    setExcludeCategories([]);
    setInspectCategory(null);
    setDrilldown(null);
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
        ? data?.filter_options.calendar_years || ['All']
        : data?.filter_options.rolling_periods || ['Last 3 Months'];

  const hypotheticalSalary =
    typeof whatIfSalary === 'number' && whatIfSalary > 0 ? whatIfSalary : metrics.avg_income;
  const newDiscretionary = hypotheticalSalary - metrics.avg_baseline;

  return (
    <div className="space-y-4">
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
                    setSelectedPeriod(m === 'Rolling Period' ? 'Last 3 Months' : 'All');
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
                  <div className="flex justify-between font-semibold">
                    <span>{catItem.category}</span>
                    <span className="tabular-nums text-[#3498db]">
                      £{catItem.avg_monthly.toFixed(2)}
                    </span>
                  </div>
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

        {/* Drill-down Drawer / Detail Panel */}
        {inspectCategory && (
          <div className="mt-4 pt-4 border-t border-[#d6dfe5] dark:border-[#32424a] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-[#e74c3c]/15 text-[#e74c3c]">
                  <Eye className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold">Category Inspection: {inspectCategory}</h3>
                {drilldown && (
                  <span className="text-xs text-[#485b69] dark:text-[#b0bec5] tabular-nums">
                    (Expenditure: £{drilldown.total_expenditure.toFixed(2)} | Refunds: £
                    {drilldown.total_refunds.toFixed(2)} | Net: £{drilldown.net_cost.toFixed(2)})
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onNavigateToTransactions(inspectCategory)}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-[#e74c3c] hover:bg-[#d64232] text-white"
              >
                <span>Open in Transactions Editor</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {drilldownLoading ? (
              <div className="text-xs text-[#485b69] dark:text-[#b0bec5] py-4 text-center">
                Loading merchants and transactions for {inspectCategory}...
              </div>
            ) : drilldown && drilldown.merchants.length > 0 ? (
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
                        <th className="py-1.5 px-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d6dfe5] dark:divide-[#32424a]">
                      {drilldown.transactions.slice(0, 50).map((tx) => (
                        <tr key={tx.row_id}>
                          <td className="py-1 px-2.5 tabular-nums whitespace-nowrap">
                            {tx.Date_Display}
                          </td>
                          <td className="py-1 px-2.5 font-medium truncate max-w-[140px]">
                            {tx.Name}
                          </td>
                          <td className="py-1 px-2.5 text-right tabular-nums">
                            £{tx.Amount.toFixed(2)}
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
