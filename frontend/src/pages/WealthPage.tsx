import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRightLeft,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api } from '../api';
import { AccountScope, WealthPayload } from '../types';

interface WealthPageProps {
  scope: AccountScope;
}

const ASSET_LINE_COLORS = [
  '#2ecc71',
  '#3498db',
  '#9b59b6',
  '#f39c12',
  '#e74c3c',
  '#1abc9c',
  '#f1c40f',
  '#e67e22',
  '#34495e',
];

export const WealthPage: React.FC<WealthPageProps> = ({ scope }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Timeframe and legacy toggle
  const [timeframe, setTimeframe] = useState('All Time');
  const [ignoreLegacy, setIgnoreLegacy] = useState(true);

  // Monthly balance logger form state
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [assetBalances, setAssetBalances] = useState<Record<string, number | ''>>({});
  const [newAssetName, setNewAssetName] = useState('');

  const loadWealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWealth(scope, ignoreLegacy, timeframe);
      setData(res);

      // Pre-fill balances for the selected month if available
      if (res.assets_by_month && res.assets_by_month[selectedMonth]) {
        setAssetBalances(res.assets_by_month[selectedMonth]);
      } else if (res.latest_balances) {
        // Fallback to latest balances as baseline
        setAssetBalances(res.latest_balances);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load wealth data');
    } finally {
      setLoading(false);
    }
  }, [scope, ignoreLegacy, timeframe, selectedMonth]);

  useEffect(() => {
    loadWealth();
  }, [loadWealth]);

  // Update asset balances when month changes
  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    if (data?.assets_by_month && data.assets_by_month[month]) {
      setAssetBalances(data.assets_by_month[month]);
    } else {
      // Keep keys with empty or latest baseline
      const blank: Record<string, number | ''> = {};
      (data?.known_assets || []).forEach((asset) => {
        blank[asset] = data?.latest_balances?.[asset] ?? '';
      });
      setAssetBalances(blank);
    }
  };

  const handleBalanceChange = (asset: string, valStr: string) => {
    const val = valStr === '' ? '' : parseFloat(valStr);
    setAssetBalances((prev) => ({
      ...prev,
      [asset]: isNaN(val as number) ? '' : val,
    }));
  };

  const handleAddNewAsset = () => {
    const trimmed = newAssetName.trim();
    if (!trimmed) return;
    if (assetBalances[trimmed] !== undefined) {
      alert(`Asset "${trimmed}" already exists.`);
      return;
    }
    setAssetBalances((prev) => ({ ...prev, [trimmed]: '' }));
    setNewAssetName('');
  };

  const handleSaveBalances = async () => {
    try {
      // Filter out non-numeric values
      const numericPayload: Record<string, number> = {};
      Object.entries(assetBalances).forEach(([asset, val]) => {
        if (typeof val === 'number') {
          numericPayload[asset] = val;
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = parseFloat(val);
          if (!isNaN(num)) numericPayload[asset] = num;
        }
      });

      const res = await api.saveWealthBalances(scope, selectedMonth, numericPayload);
      setData(res.wealth);
      setStatusMsg(`Balances for ${selectedMonth} saved!`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save asset balances');
    }
  };

  const currentAssets = Array.from(
    new Set([...(data?.known_assets || []), ...Object.keys(assetBalances)])
  ).sort();

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span className="flex items-center gap-2">
              <Wallet className="w-6 h-6 text-emerald-400" />
              <span>Wealth & Net Worth</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
              {scope}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Track historical account balances, investment holdings, and monitor internal wealth transfers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {statusMsg && (
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2 bg-[#1b262c] border border-slate-700/50 rounded-lg p-1">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-2 py-1 text-xs bg-[#263238] border border-slate-700 rounded text-slate-200 focus:outline-none"
            >
              <option value="All Time">All Time</option>
              <option value="1 Year">Past 1 Year</option>
              <option value="2 Years">Past 2 Years</option>
            </select>

            <button
              onClick={loadWealth}
              disabled={loading}
              className="p-1.5 rounded hover:bg-slate-700/60 text-slate-300 transition-colors disabled:opacity-50"
              title="Refresh Wealth Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Net Worth Headline KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 font-medium">Total Net Worth</div>
          <div className="text-2xl font-bold text-slate-100 font-mono mt-1">
            £{(data?.latest_net_worth || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Recorded balance as of <span className="font-semibold text-slate-300">{data?.latest_month || 'Latest'}</span>
          </div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 font-medium">Monthly Change</div>
          <div
            className={`text-2xl font-bold font-mono mt-1 flex items-center gap-2 ${
              (data?.net_worth_delta || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {(data?.net_worth_delta || 0) >= 0 ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
            <span>
              {(data?.net_worth_delta || 0) >= 0 ? '+' : ''}
              £{Math.abs(data?.net_worth_delta || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Delta against previous recorded month</div>
        </div>

        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Accounts Tracked</div>
            <div className="text-2xl font-bold text-slate-100 font-mono mt-1">
              {currentAssets.length}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer pt-2 border-t border-slate-800">
            <input
              type="checkbox"
              checked={ignoreLegacy}
              onChange={(e) => setIgnoreLegacy(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-0"
            />
            <span>Ignore legacy transactions & outliers</span>
          </label>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Monthly Asset Balance Logger Card */}
        <div className="lg:col-span-5 bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-5">
          <div className="border-b border-slate-700/50 pb-3">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>Monthly Balance Logger</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Record account balances for each month to build your net worth progression curve.
            </p>
          </div>

          {/* Month Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Selected Month (YYYY-MM)</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Asset Inputs */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Account Balances (£)
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {currentAssets.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  No assets configured yet. Add your first account below.
                </div>
              ) : (
                currentAssets.map((asset) => (
                  <div key={asset} className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-medium w-40 truncate" title={asset}>
                      {asset}
                    </span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                        £
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={assetBalances[asset] ?? ''}
                        onChange={(e) => handleBalanceChange(asset, e.target.value)}
                        className="w-full pl-6 pr-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add New Asset Input */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                placeholder="New account name (e.g. Vanguard S&P 500)"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNewAsset();
                }}
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleAddNewAsset}
                disabled={!newAssetName.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 flex items-center gap-1 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveBalances}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs shadow-md transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save {selectedMonth} Balances</span>
          </button>
        </div>

        {/* Right Column (7 cols): Charts */}
        <div className="lg:col-span-7 space-y-6">
          {/* Net Worth Progression Area Chart */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Total Net Worth Over Time</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated sum of all reported account balances per calendar month.
              </p>
            </div>

            <div className="h-64 w-full">
              {(!data?.net_worth_series || data.net_worth_series.length === 0) ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  No historical net worth data recorded yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.net_worth_series}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2ecc71" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1b262c',
                        borderColor: '#475569',
                        borderRadius: '0.375rem',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                      formatter={(val: number) => [`£${val.toLocaleString()}`, 'Net Worth']}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#2ecc71"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#netWorthGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Asset Balances Multi-line Chart */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-cyan-400" />
                <span>Account Holdings Breakdown</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Balance progression across individual bank accounts and investments.
              </p>
            </div>

            <div className="h-64 w-full">
              {(!data?.asset_timeline || data.asset_timeline.length === 0) ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  No individual asset history to display.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.asset_timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1b262c',
                        borderColor: '#475569',
                        borderRadius: '0.375rem',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                      formatter={(val: number, name: string) => [
                        `£${val.toLocaleString()}`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                    {currentAssets.map((asset, idx) => (
                      <Line
                        key={asset}
                        type="monotone"
                        dataKey={asset}
                        stroke={ASSET_LINE_COLORS[idx % ASSET_LINE_COLORS.length]}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Internal Movements Table */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-700/50 pb-3">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
            <span>Internal Account Transfers</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Transactions identified as internal transfers or savings movements. These do not count as external spending.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
              <tr>
                <th className="py-2.5 px-3 w-28">Date</th>
                <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                <th className="py-2.5 px-3 w-32">Bank</th>
                <th className="py-2.5 px-3 w-36">Category</th>
                <th className="py-2.5 px-3 text-right w-32">Amount (£)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!data?.internal_transactions || data.internal_transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-sans text-xs">
                    No internal transfers recorded in this timeframe.
                  </td>
                </tr>
              ) : (
                data.internal_transactions.slice(0, 50).map((tx, idx) => (
                  <tr key={`${tx.Date}-${tx.Name}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 text-slate-400">{tx.Date}</td>
                    <td className="py-2 px-3 font-medium text-slate-200 font-sans">{tx.Name}</td>
                    <td className="py-2 px-3 font-sans text-slate-300">{tx.Bank}</td>
                    <td className="py-2 px-3 font-sans text-cyan-300">{tx.Category}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-100">
                      £{tx.Amount.toFixed(2)}
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
