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
} from 'lucide-react';
import { api } from '../api';
import { AccountScope, IntelligencePayload } from '../types';

interface IntelligencePageProps {
  scope: AccountScope;
  onRefreshBootstrap?: () => void;
}

export const IntelligencePage: React.FC<IntelligencePageProps> = ({
  scope,
  onRefreshBootstrap,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [showIgnoredDrawer, setShowIgnoredDrawer] = useState(false);

  const loadIntelligence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getIntelligence(scope);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to scan intelligence');
    } finally {
      setLoading(false);
    }
  }, [scope]);

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
  }) => {
    try {
      const res = await api.executeIntelligenceAction(scope, payload);
      setData(res.intelligence);
      triggerStatus('Action executed successfully');
      if (onRefreshBootstrap) onRefreshBootstrap();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    }
  };

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
              <span>Intelligence & Auditing</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
              {scope}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            1-click automated auditing for recurring spend, untagged subscriptions, and categorisation consistency.
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

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-950/60 border border-cyan-700/40 flex items-center justify-center text-cyan-400">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Recurring Candidates</div>
            <div className="text-xl font-bold text-slate-100 font-mono mt-0.5">
              {recurringCount}{' '}
              <span className="text-xs font-sans font-normal text-slate-400">found</span>
            </div>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-700/40 flex items-center justify-center text-amber-400">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Subscription Candidates</div>
            <div className="text-xl font-bold text-slate-100 font-mono mt-0.5">
              {subscriptionCount}{' '}
              <span className="text-xs font-sans font-normal text-slate-400">untagged</span>
            </div>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-950/60 border border-purple-700/40 flex items-center justify-center text-purple-400">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Category Suggestions</div>
            <div className="text-xl font-bold text-slate-100 font-mono mt-0.5">
              {standardiseCount}{' '}
              <span className="text-xs font-sans font-normal text-slate-400">conflicts</span>
            </div>
          </div>
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
