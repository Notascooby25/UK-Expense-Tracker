import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Repeat,
  Tag,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  EyeOff,
  RotateCcw,
  CheckCheck,
  TrendingDown,
  TrendingUp,
  Zap,
  PiggyBank,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../api';
import { AccountScope, IntelligencePayload } from '../types';

interface IntelligencePageProps {
  scope: AccountScope;
  onRefreshBootstrap?: () => void;
}

const HORIZON_OPTIONS = [
  { label: '2026', value: '2026' },
  { label: '2025', value: '2025' },
  { label: '2024', value: '2024' },
  { label: 'Last 6 Months', value: 'Last 6 Months' },
  { label: 'All Time', value: 'All Time' },
];

export const IntelligencePage: React.FC<IntelligencePageProps> = ({
  scope,
  onRefreshBootstrap,
}) => {
  const [selectedHorizon, setSelectedHorizon] = useState<string>('2026');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [showIgnoredDrawer, setShowIgnoredDrawer] = useState(false);

  const loadIntelligence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getIntelligence(scope, selectedHorizon);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to scan intelligence');
    } finally {
      setLoading(false);
    }
  }, [scope, selectedHorizon]);

  useEffect(() => {
    loadIntelligence();
  }, [loadIntelligence]);

  const triggerStatus = (msg: string) => {
    setActionStatus(msg);
    setTimeout(() => setActionStatus(null), 3000);
  };

  const handleAction = async (payload: {
    action: string;
    category?: string;
    merchant?: string;
    merchants?: string[];
    from_category?: string;
    to_category?: string;
    row_id?: number;
    signature?: string;
    horizon?: string;
  }) => {
    try {
      const res = await api.executeIntelligenceAction(scope, {
        ...payload,
        horizon: payload.horizon || selectedHorizon,
      });
      setData(res.intelligence);
      triggerStatus('Action executed successfully');
      if (onRefreshBootstrap) onRefreshBootstrap();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const oneOffCount = data?.one_off_candidates?.length || 0;
  const rescueCount = data?.spend_rescue_opportunities?.length || 0;
  const creepCount = data?.category_creep_warnings?.length || 0;
  const recurringCount = data?.recurring_candidates?.length || 0;
  const subscriptionCount = data?.subscription_candidates?.length || 0;
  const standardiseCount = data?.standardisation_suggestions?.length || 0;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-cyan-400" />
              <span>Spend Intelligence & Rescuer</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
              {scope}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated spending helper: detect out-of-character one-off spikes, rescue monthly cashflow from lifestyle leaks, and catch category creep.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {actionStatus && (
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{actionStatus}</span>
            </div>
          )}

          <button
            onClick={loadIntelligence}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-[#1b262c] hover:bg-slate-700/60 text-slate-200 border border-slate-700/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-scan Ledger</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Horizon Selector Toolbar */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Lookback Horizon:</span>
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {HORIZON_OPTIONS.map((opt) => {
              const isSelected = selectedHorizon === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedHorizon(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-[#263238] text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <span className="text-[11px] text-slate-400">
          Auditing spending patterns for <strong className="text-slate-200">{selectedHorizon}</strong>
        </span>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>One-Off Spikes</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-amber-400 font-mono mt-1">
            {oneOffCount} <span className="text-[10px] font-sans font-normal text-slate-400">spikes</span>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Spend Rescuer</span>
            <PiggyBank className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
            {rescueCount} <span className="text-[10px] font-sans font-normal text-slate-400">habits</span>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Category Creep</span>
            <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-lg font-bold text-rose-400 font-mono mt-1">
            {creepCount} <span className="text-[10px] font-sans font-normal text-slate-400">alerts</span>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Recurring</span>
            <Repeat className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-slate-100 font-mono mt-1">
            {recurringCount} <span className="text-[10px] font-sans font-normal text-slate-400">merchants</span>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Subscriptions</span>
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-slate-100 font-mono mt-1">
            {subscriptionCount} <span className="text-[10px] font-sans font-normal text-slate-400">untagged</span>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-3 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Categories</span>
            <Tag className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-slate-100 font-mono mt-1">
            {standardiseCount} <span className="text-[10px] font-sans font-normal text-slate-400">conflicts</span>
          </div>
        </div>
      </div>

      {/* Section: Out-of-Character Spikes & One-Off Candidates */}
      <div className="bg-[#1b262c] border border-amber-900/40 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Out-of-Character Spikes & One-Off Candidates</span>
              {oneOffCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {oneOffCount} detected
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Purchases ≥ £150 that significantly exceed their category baseline (e.g. phone replacements, DIY projects, appliances). Tagging them as One-Off prevents them from distorting your regular monthly living run-rate.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="py-2.5 px-3 w-28 whitespace-nowrap">Date</th>
                <th className="py-2.5 px-3 min-w-[180px]">Merchant / Description</th>
                <th className="py-2.5 px-3 w-36">Category</th>
                <th className="py-2.5 px-3 w-28 text-right">Amount (£)</th>
                <th className="py-2.5 px-3 min-w-[200px]">Anomaly Insight</th>
                <th className="py-2.5 px-3 text-right w-56">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!data?.one_off_candidates || data.one_off_candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                    No out-of-character spikes detected for {selectedHorizon}. Variable expenses align with typical category spending.
                  </td>
                </tr>
              ) : (
                data.one_off_candidates.map((cand) => (
                  <tr key={`${cand.row_id}-${cand.signature}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">
                      {cand.date}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-100 font-sans">
                      <div>{cand.name}</div>
                      {cand.notes && (
                        <div className="text-[11px] text-slate-400 font-normal">{cand.notes}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-xs text-cyan-300">
                        {cand.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                      £{cand.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-[11px] text-slate-300">
                      {cand.category_median > 0 ? (
                        <span>
                          <strong className="text-amber-400">
                            {(cand.amount / cand.category_median).toFixed(1)}x
                          </strong>{' '}
                          typical {cand.category} spend (median £{cand.category_median.toFixed(2)})
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          Rare/first spend in {cand.category} (≥ £150.00)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleAction({
                              action: 'mark_one_off',
                              row_id: cand.row_id,
                            })
                          }
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-sm"
                          title="Exclude from recurring living costs"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Mark as One-Off</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAction({
                              action: 'dismiss_one_off',
                              signature: cand.signature,
                            })
                          }
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition-colors"
                          title="Keep as regular monthly spend and don't ask again"
                        >
                          Keep Regular
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section: Monthly Spend Rescuer */}
      <div className="bg-[#1b262c] border border-emerald-900/40 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-emerald-400" />
              <span>Monthly Spend Rescuer (Discretionary Leaks)</span>
              {rescueCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {rescueCount} lifestyle habits
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifies frequent discretionary micro-spending habits. Trimming these by 25% to 50% unlocks significant monthly cashflow and annual savings without disrupting essentials.
            </p>
          </div>
        </div>

        {!data?.spend_rescue_opportunities || data.spend_rescue_opportunities.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No frequent lifestyle leak clusters detected for {selectedHorizon}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.spend_rescue_opportunities.map((opp) => (
              <div
                key={opp.habit}
                className="bg-[#202d35] border border-slate-700/60 rounded-lg p-4 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-slate-100">{opp.habit}</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 font-mono font-medium">
                      {opp.transaction_count} purchases
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-400">
                    Spent in period:{' '}
                    <strong className="text-slate-200 font-mono">
                      £{opp.total_spend.toFixed(2)}
                    </strong>
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    Projected annual run-rate:{' '}
                    <strong className="text-amber-300 font-mono font-semibold">
                      £{opp.annual_projected.toFixed(2)} / yr
                    </strong>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-700/50 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300">Savings Potential:</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-[#1b262c] border border-emerald-800/40">
                      <div className="text-[10px] text-slate-400">Trim 25%</div>
                      <div className="text-sm font-bold text-emerald-400 font-mono">
                        +£{opp.annual_savings_25pct.toFixed(0)}
                        <span className="text-[10px] font-normal text-slate-400">/yr</span>
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[#1b262c] border border-emerald-800/40">
                      <div className="text-[10px] text-slate-400">Trim 50%</div>
                      <div className="text-sm font-bold text-emerald-300 font-mono">
                        +£{opp.annual_savings_50pct.toFixed(0)}
                        <span className="text-[10px] font-normal text-slate-400">/yr</span>
                      </div>
                    </div>
                  </div>

                  {opp.sample_merchants && opp.sample_merchants.length > 0 && (
                    <div className="text-[10px] text-slate-400 truncate pt-1">
                      Includes: {opp.sample_merchants.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: Category Creep Alerts */}
      <div className="bg-[#1b262c] border border-rose-900/40 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-rose-400" />
              <span>Category Creep Alerts</span>
              {creepCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {creepCount} escalating
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Categories where recent 3-month spending is exceeding your 6-month historical baseline by more than 20% and £50/month.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="py-2.5 px-3 min-w-[160px]">Category</th>
                <th className="py-2.5 px-3 text-right w-36">6-Mo Baseline /Mo</th>
                <th className="py-2.5 px-3 text-right w-36">Recent 3-Mo /Mo</th>
                <th className="py-2.5 px-3 text-right w-36">Monthly Increase</th>
                <th className="py-2.5 px-3 text-right w-32">% Jump</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!data?.category_creep_warnings || data.category_creep_warnings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans text-xs">
                    No category spend creep detected. Spending rates across categories are steady.
                  </td>
                </tr>
              ) : (
                data.category_creep_warnings.map((creep) => (
                  <tr key={creep.category} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-100 font-sans">
                      {creep.category}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      £{creep.baseline_avg_monthly.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200 font-medium">
                      £{creep.recent_avg_monthly.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                      +£{creep.monthly_increase.toFixed(2)}/mo
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-400 font-sans">
                      <span className="px-2 py-0.5 rounded bg-rose-950/50 border border-rose-800/60 text-xs">
                        +{creep.pct_increase.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 1: Recurring Spend Detection */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-cyan-400" />
              <span>Recurring Spend Candidates</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Merchants that occur across 3 or more distinct calendar months but are not marked as committed bills.
            </p>
          </div>

          <button
            onClick={() => setShowIgnoredDrawer((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-[#263238] hover:bg-slate-700/60 border border-slate-700 rounded-md transition-colors self-start sm:self-auto"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>
              {showIgnoredDrawer ? 'Hide Ignored List' : `Ignored (${data?.ignored_recurring?.length || 0})`}
            </span>
          </button>
        </div>

        {/* Ignored recurring drawer */}
        {showIgnoredDrawer && (
          <div className="p-4 bg-[#263238]/60 border border-slate-700/60 rounded-lg space-y-2">
            <div className="text-xs font-medium text-slate-300">Ignored Recurring Merchants:</div>
            {(!data?.ignored_recurring || data.ignored_recurring.length === 0) ? (
              <div className="text-xs text-slate-500">No merchants are currently ignored.</div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {data.ignored_recurring.map((merchant) => (
                  <span
                    key={merchant}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#1b262c] border border-slate-700 rounded-md text-slate-300"
                  >
                    <span>{merchant}</span>
                    <button
                      onClick={() =>
                        handleAction({
                          action: 'restore_ignored_recurring',
                          merchant,
                        })
                      }
                      className="text-cyan-400 hover:text-cyan-300 ml-1"
                      title="Restore to recurring candidates"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recurring Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="py-2.5 px-3 min-w-[200px]">Merchant</th>
                <th className="py-2.5 px-3 min-w-[150px]">Current Category</th>
                <th className="py-2.5 px-3 text-center w-32">Months Active</th>
                <th className="py-2.5 px-3 text-right w-36">Avg Monthly Spend</th>
                <th className="py-2.5 px-3 text-right w-52">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!data?.recurring_candidates || data.recurring_candidates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans text-xs">
                    No uncommitted recurring candidates detected. Everything looks tidy!
                  </td>
                </tr>
              ) : (
                data.recurring_candidates.map((item) => (
                  <tr key={item.Merchant} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-100 font-sans">
                      {item.Merchant}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-xs text-cyan-300">
                        {item.Category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-300 font-semibold">
                      {item.Freq_Months} months
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-100 font-semibold">
                      £{item.Avg_Monthly.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            handleAction({
                              action: 'mark_committed',
                              category: item.Category,
                              merchant: item.Merchant,
                            })
                          }
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-medium transition-colors"
                        >
                          + Mark Committed
                        </button>
                        <button
                          onClick={() =>
                            handleAction({
                              action: 'ignore_recurring',
                              merchant: item.Merchant,
                            })
                          }
                          className="px-2.5 py-1 bg-[#263238] hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded text-[11px] font-medium transition-colors"
                        >
                          Ignore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Auto-Tag Subscriptions */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-400" />
              <span>Untagged Subscription Candidates</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Merchants matching known subscription keywords (Netflix, Spotify, GitHub, gym memberships, etc.) that have untagged transactions.
            </p>
          </div>

          {subscriptionCount > 0 && (
            <button
              onClick={() =>
                handleAction({
                  action: 'flag_subscriptions_all',
                  merchants: data?.subscription_candidates.map((c) => c.merchant) || [],
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-md transition-colors self-start sm:self-auto"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Flag All as Subscriptions</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="py-2.5 px-3 min-w-[200px]">Merchant</th>
                <th className="py-2.5 px-3 min-w-[150px]">Category</th>
                <th className="py-2.5 px-3 text-center w-36">Untagged Rows</th>
                <th className="py-2.5 px-3 text-right w-36">Total Spend</th>
                <th className="py-2.5 px-3 text-right w-44">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!data?.subscription_candidates || data.subscription_candidates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans text-xs">
                    All known recurring subscription services are already tagged.
                  </td>
                </tr>
              ) : (
                data.subscription_candidates.map((sub) => (
                  <tr key={sub.merchant} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-100 font-sans">
                      {sub.merchant}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-xs text-amber-300">
                        {sub.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-300 font-semibold">
                      {sub.count} transactions
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-100 font-semibold">
                      £{sub.total_amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <button
                        onClick={() =>
                          handleAction({
                            action: 'flag_subscriptions',
                            merchant: sub.merchant,
                          })
                        }
                        className="px-3 py-1 bg-amber-600/90 hover:bg-amber-600 text-white rounded text-[11px] font-medium transition-colors"
                      >
                        Flag as Subscription
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Category Standardisation */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Tag className="w-4 h-4 text-purple-400" />
              <span>Category Standardisation Suggestions</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifies transactions where a merchant is categorised inconsistently compared to its dominant category across your database.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="py-2.5 px-3 min-w-[200px]">Merchant</th>
                <th className="py-2.5 px-3 w-44">Current (Minority)</th>
                <th className="py-2.5 px-3 w-44">Suggested (Majority)</th>
                <th className="py-2.5 px-3 text-right w-48">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!data?.standardisation_suggestions || data.standardisation_suggestions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500 font-sans text-xs">
                    No categorisation conflicts found. Your category assignments are uniform.
                  </td>
                </tr>
              ) : (
                data.standardisation_suggestions.map((sug, idx) => (
                  <tr key={`${sug.Merchant}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-100 font-sans">
                      {sug.Merchant}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-red-300">
                      <span className="px-2 py-0.5 rounded bg-red-950/40 border border-red-800/50 text-xs">
                        {sug.From}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-emerald-300">
                      <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/50 text-xs">
                        {sug.Suggested}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <button
                        onClick={() =>
                          handleAction({
                            action: 'standardise_category',
                            merchant: sug.Merchant,
                            from_category: sug.From,
                            to_category: sug.Suggested,
                          })
                        }
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium transition-colors"
                      >
                        Apply Standardisation
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
