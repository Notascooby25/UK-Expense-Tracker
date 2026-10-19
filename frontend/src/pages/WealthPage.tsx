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
  Pencil,
  Trash2,
  X,
  Landmark,
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

const formatSnapshotLabel = (dateStr: string): string => {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [y, m] = dateStr.split('-');
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return dateObj.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  return dateStr;
};

const getTodayDateStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const WealthPage: React.FC<WealthPageProps> = ({ scope }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Timeframe and legacy toggle
  const [timeframe, setTimeframe] = useState('All Time');
  const [ignoreLegacy, setIgnoreLegacy] = useState(true);

  // Balance logger form state (defaults to today's exact date YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr);
  const [assetBalances, setAssetBalances] = useState<Record<string, number | ''>>({});
  const [newAssetName, setNewAssetName] = useState('');
  const [debtBalances, setDebtBalances] = useState<Record<string, number | ''>>({});
  const [newDebtName, setNewDebtName] = useState('');
  const [newDebtOriginalAmount, setNewDebtOriginalAmount] = useState<number | ''>('');
  const [loansMetadata, setLoansMetadata] = useState<Record<string, { original_amount: number }>>({});

  // Edit History & Manage Accounts Popup Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalTab, setModalTab] = useState<'months' | 'accounts'>('months');
  const [modalMonthEdits, setModalMonthEdits] = useState<
    Record<string, Record<string, number | ''>>
  >({});
  const [modalDebtEdits, setModalDebtEdits] = useState<
    Record<string, Record<string, number | ''>>
  >({});
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [renameDebtDrafts, setRenameDebtDrafts] = useState<Record<string, string>>({});
  const [modalSaving, setModalSaving] = useState(false);

  const syncModalStateFromWealth = useCallback((wealth: WealthPayload) => {
    const nextEdits: Record<string, Record<string, number | ''>> = {};
    const allKnown = wealth.known_assets || [];
    Object.entries(wealth.assets_by_month || {}).forEach(([m, balances]) => {
      const row: Record<string, number | ''> = {};
      allKnown.forEach((a) => {
        row[a] = balances[a] !== undefined ? balances[a] : '';
      });
      Object.entries(balances).forEach(([a, val]) => {
        row[a] = val;
      });
      nextEdits[m] = row;
    });
    setModalMonthEdits(nextEdits);

    const nextRenames: Record<string, string> = {};
    allKnown.forEach((a) => {
      nextRenames[a] = a;
    });
    setRenameDrafts(nextRenames);

    const nextDebtEdits: Record<string, Record<string, number | ''>> = {};
    const allKnownDebts = wealth.known_debts || [];
    Object.entries(wealth.debts_by_month || {}).forEach(([m, balances]) => {
      const row: Record<string, number | ''> = {};
      allKnownDebts.forEach((d) => {
        row[d] = balances[d] !== undefined ? balances[d] : '';
      });
      Object.entries(balances).forEach(([d, val]) => {
        row[d] = val;
      });
      nextDebtEdits[m] = row;
    });
    setModalDebtEdits(nextDebtEdits);

    const nextDebtRenames: Record<string, string> = {};
    allKnownDebts.forEach((d) => {
      nextDebtRenames[d] = d;
    });
    setRenameDebtDrafts(nextDebtRenames);

    if (wealth.loans_summary) {
      const meta: Record<string, { original_amount: number }> = {};
      wealth.loans_summary.forEach((ls) => {
        meta[ls.name] = { original_amount: ls.original_amount };
      });
      setLoansMetadata(meta);
    }
  }, []);

  const applyUpdatedWealth = useCallback(
    (wealth: WealthPayload, message: string) => {
      setData(wealth);
      syncModalStateFromWealth(wealth);
      if (wealth.assets_by_month && wealth.assets_by_month[selectedDate]) {
        setAssetBalances(wealth.assets_by_month[selectedDate]);
      } else if (wealth.latest_balances && Object.keys(wealth.latest_balances).length > 0) {
        setAssetBalances(wealth.latest_balances);
      } else {
        const blank: Record<string, number | ''> = {};
        (wealth.known_assets || []).forEach((a) => {
          blank[a] = '';
        });
        setAssetBalances(blank);
      }

      if (wealth.debts_by_month && wealth.debts_by_month[selectedDate]) {
        setDebtBalances(wealth.debts_by_month[selectedDate]);
      } else if (wealth.latest_debts && Object.keys(wealth.latest_debts).length > 0) {
        setDebtBalances(wealth.latest_debts);
      } else {
        const blankD: Record<string, number | ''> = {};
        (wealth.known_debts || []).forEach((d) => {
          blankD[d] = '';
        });
        setDebtBalances(blankD);
      }

      setStatusMsg(message);
      setTimeout(() => setStatusMsg((cur) => (cur === message ? null : cur)), 3000);
    },
    [selectedDate, syncModalStateFromWealth]
  );

  const loadWealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWealth(scope, ignoreLegacy, timeframe);
      setData(res);
      syncModalStateFromWealth(res);

      // Pre-fill balances for the selected date if available
      if (res.assets_by_month && res.assets_by_month[selectedDate]) {
        setAssetBalances(res.assets_by_month[selectedDate]);
      } else if (res.latest_balances) {
        setAssetBalances(res.latest_balances);
      }

      if (res.debts_by_month && res.debts_by_month[selectedDate]) {
        setDebtBalances(res.debts_by_month[selectedDate]);
      } else if (res.latest_debts) {
        setDebtBalances(res.latest_debts);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load wealth data');
    } finally {
      setLoading(false);
    }
  }, [scope, ignoreLegacy, timeframe, selectedDate, syncModalStateFromWealth]);

  useEffect(() => {
    loadWealth();
  }, [loadWealth]);

  useEffect(() => {
    if (!showEditModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEditModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEditModal]);

  // Update asset balances when month changes
  // Update asset balances when date changes
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    if (data?.assets_by_month && data.assets_by_month[date]) {
      setAssetBalances(data.assets_by_month[date]);
    } else {
      const blank: Record<string, number | ''> = {};
      (data?.known_assets || []).forEach((asset) => {
        blank[asset] = data?.latest_balances?.[asset] ?? '';
      });
      setAssetBalances(blank);
    }

    if (data?.debts_by_month && data.debts_by_month[date]) {
      setDebtBalances(data.debts_by_month[date]);
    } else {
      const blankD: Record<string, number | ''> = {};
      (data?.known_debts || []).forEach((debt) => {
        blankD[debt] = data?.latest_debts?.[debt] ?? '';
      });
      setDebtBalances(blankD);
    }
  };

  const handleBalanceChange = (asset: string, valStr: string) => {
    const val = valStr === '' ? '' : parseFloat(valStr);
    setAssetBalances((prev) => ({
      ...prev,
      [asset]: isNaN(val as number) ? '' : val,
    }));
  };

  const handleDebtBalanceChange = (debt: string, valStr: string) => {
    const val = valStr === '' ? '' : parseFloat(valStr);
    setDebtBalances((prev) => ({
      ...prev,
      [debt]: isNaN(val as number) ? '' : val,
    }));
  };

  const handleClearOrRemoveAssetRow = (asset: string) => {
    setAssetBalances((prev) => {
      const next = { ...prev };
      if (data?.known_assets?.includes(asset)) {
        next[asset] = '';
      } else {
        delete next[asset];
      }
      return next;
    });
  };

  const handleClearOrRemoveDebtRow = (debt: string) => {
    setDebtBalances((prev) => {
      const next = { ...prev };
      if (data?.known_debts?.includes(debt)) {
        next[debt] = '';
      } else {
        delete next[debt];
      }
      return next;
    });
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

  const handleAddNewDebt = () => {
    const trimmed = newDebtName.trim();
    if (!trimmed) return;
    if (debtBalances[trimmed] !== undefined) {
      alert(`Loan/debt "${trimmed}" already exists.`);
      return;
    }
    setDebtBalances((prev) => ({ ...prev, [trimmed]: '' }));
    if (typeof newDebtOriginalAmount === 'number' && newDebtOriginalAmount > 0) {
      setLoansMetadata((prev) => ({
        ...prev,
        [trimmed]: { original_amount: newDebtOriginalAmount },
      }));
    }
    setNewDebtName('');
    setNewDebtOriginalAmount('');
  };

  const handleSaveBalances = async () => {
    try {
      const numericAssetPayload: Record<string, number> = {};
      Object.entries(assetBalances).forEach(([asset, val]) => {
        if (typeof val === 'number' && val > 0) {
          numericAssetPayload[asset] = val;
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = parseFloat(val);
          if (!isNaN(num) && num > 0) numericAssetPayload[asset] = num;
        }
      });

      const numericDebtPayload: Record<string, number> = {};
      Object.entries(debtBalances).forEach(([debt, val]) => {
        if (typeof val === 'number' && val >= 0) {
          numericDebtPayload[debt] = val;
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = parseFloat(val);
          if (!isNaN(num) && num >= 0) numericDebtPayload[debt] = num;
        }
      });

      const res = await api.saveWealthBalances(scope, {
        date: selectedDate,
        asset_balances: numericAssetPayload,
        debt_balances: numericDebtPayload,
        loans_metadata: loansMetadata,
      });
      applyUpdatedWealth(
        res.wealth,
        `Balances for ${formatSnapshotLabel(selectedDate) || selectedDate} saved!`
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save balances');
    }
  };

  const handleModalBalanceChange = (month: string, asset: string, valStr: string) => {
    const val = valStr === '' ? '' : parseFloat(valStr);
    setModalMonthEdits((prev) => ({
      ...prev,
      [month]: {
        ...(prev[month] || {}),
        [asset]: isNaN(val as number) ? '' : val,
      },
    }));
  };

  const handleModalDebtBalanceChange = (month: string, debt: string, valStr: string) => {
    const val = valStr === '' ? '' : parseFloat(valStr);
    setModalDebtEdits((prev) => ({
      ...prev,
      [month]: {
        ...(prev[month] || {}),
        [debt]: isNaN(val as number) ? '' : val,
      },
    }));
  };

  const handleSaveModalMonth = async (month: string) => {
    setModalSaving(true);
    try {
      const monthAssetRow = modalMonthEdits[month] || {};
      const numericAssets: Record<string, number> = {};
      Object.entries(monthAssetRow).forEach(([asset, val]) => {
        if (typeof val === 'number' && val > 0) {
          numericAssets[asset] = val;
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = parseFloat(val);
          if (!isNaN(num) && num > 0) numericAssets[asset] = num;
        }
      });

      const monthDebtRow = modalDebtEdits[month] || {};
      const numericDebts: Record<string, number> = {};
      Object.entries(monthDebtRow).forEach(([debt, val]) => {
        if (typeof val === 'number' && val >= 0) {
          numericDebts[debt] = val;
        } else if (typeof val === 'string' && val.trim() !== '') {
          const num = parseFloat(val);
          if (!isNaN(num) && num >= 0) numericDebts[debt] = num;
        }
      });

      const res = await api.saveWealthBalances(scope, {
        date: month,
        asset_balances: numericAssets,
        debt_balances: numericDebts,
      });
      applyUpdatedWealth(res.wealth, `Updated ${formatSnapshotLabel(month) || month} balances`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to update ${month}`);
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteMonth = async (month: string, target: 'assets' | 'debts' | 'all' = 'all') => {
    setModalSaving(true);
    try {
      const res = await api.deleteWealthMonth(scope, month, target);
      applyUpdatedWealth(res.wealth, `Deleted ${formatSnapshotLabel(month) || month} snapshot`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to delete ${month}`);
    } finally {
      setModalSaving(false);
    }
  };

  const handleDeleteAccountEverywhere = async (account: string, account_type: 'asset' | 'debt' = 'asset') => {
    setModalSaving(true);
    try {
      if (account_type === 'debt') {
        setDebtBalances((prev) => {
          const next = { ...prev };
          delete next[account];
          return next;
        });
      } else {
        setAssetBalances((prev) => {
          const next = { ...prev };
          delete next[account];
          return next;
        });
      }
      const res = await api.manageWealthAccount(scope, {
        action: 'delete',
        account,
        account_type,
      });
      applyUpdatedWealth(res.wealth, `Deleted ${account_type} "${account}"`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to delete account "${account}"`);
    } finally {
      setModalSaving(false);
    }
  };

  const handleRenameAccountEverywhere = async (account: string, account_type: 'asset' | 'debt' = 'asset') => {
    const drafts = account_type === 'debt' ? renameDebtDrafts : renameDrafts;
    const newName = (drafts[account] || '').trim();
    if (!newName || newName === account) return;
    setModalSaving(true);
    try {
      const res = await api.manageWealthAccount(scope, {
        action: 'rename',
        account,
        new_name: newName,
        account_type,
      });
      applyUpdatedWealth(res.wealth, `Renamed "${account}" to "${newName}"`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to rename account "${account}"`);
    } finally {
      setModalSaving(false);
    }
  };

  const currentAssets = Array.from(
    new Set([...(data?.known_assets || []), ...Object.keys(assetBalances)])
  ).sort();

  const currentDebts = Array.from(
    new Set([...(data?.known_debts || []), ...Object.keys(debtBalances)])
  ).sort();

  const allRecordedDates = Array.from(
    new Set([
      ...Object.keys(data?.assets_by_month || {}),
      ...Object.keys(data?.debts_by_month || {}),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const hasDebts =
    (data?.latest_debts_total || 0) > 0 ||
    (data?.loans_summary && data.loans_summary.length > 0) ||
    currentDebts.length > 0;

  const primaryLoan = data?.loans_summary?.[0];


  const recordedMonthsDesc = Object.keys(data?.assets_by_month || {}).sort((a, b) =>
    b.localeCompare(a)
  );

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
      <div className={`grid grid-cols-1 ${hasDebts ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
        <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4">
          <div className="text-xs text-slate-400 font-medium">Total Net Worth</div>
          <div className="text-2xl font-bold text-slate-100 font-mono mt-1">
            £{(data?.latest_net_worth || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </div>
          {hasDebts ? (
            <div className="text-[11px] text-slate-400 mt-1">
              Total Assets: <span className="text-slate-300 font-semibold">£{(data?.latest_assets_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
              {' − '}
              Debt: <span className="text-rose-400 font-semibold">£{(data?.latest_debts_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-1">
              Recorded balance as of <span className="font-semibold text-slate-300">{data?.latest_month || 'Latest'}</span>
            </div>
          )}
        </div>

        {hasDebts && (
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>{primaryLoan ? primaryLoan.name : 'Outstanding Loan'}</span>
                <span className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold">Liability</span>
              </div>
              <div className="text-2xl font-bold font-mono mt-1 text-rose-400">
                £{(data?.latest_debts_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </div>
            </div>
            {primaryLoan && (
              <div className="pt-2">
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-amber-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, primaryLoan.pct_repaid))}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 flex items-center justify-between font-mono">
                  <span>Original: £{primaryLoan.original_amount.toLocaleString('en-GB')}</span>
                  <span>Repaid: £{primaryLoan.repaid_amount.toLocaleString('en-GB')} ({primaryLoan.pct_repaid}%)</span>
                </div>
              </div>
            )}
          </div>
        )}

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
              {currentAssets.length + currentDebts.length}
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
          <div className="border-b border-slate-700/50 pb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Wealth Balance Logger</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Record account balances on any specific date to build your net worth progression curve.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (data) syncModalStateFromWealth(data);
                setShowEditModal(true);
              }}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#263238] hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors"
              title="Open popup to scroll, edit, or delete saved dates and accounts"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit History</span>
            </button>
          </div>

          {/* Date Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Snapshot Date (DD/MM/YYYY)
              </label>
              <button
                type="button"
                onClick={() => handleDateChange(getTodayDateStr())}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                Set Today
              </button>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Asset Inputs */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Account Balances (£)
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {currentAssets.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  No assets configured yet. Add your first account below.
                </div>
              ) : (
                currentAssets.map((asset) => (
                  <div key={asset} className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-medium w-36 truncate" title={asset}>
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
                    <button
                      type="button"
                      onClick={() => handleClearOrRemoveAssetRow(asset)}
                      className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      title={`Clear ${asset} for ${formatSnapshotLabel(selectedDate) || selectedDate}`}
                      aria-label={`Clear ${asset} for ${formatSnapshotLabel(selectedDate) || selectedDate}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                type="button"
                onClick={handleAddNewAsset}
                disabled={!newAssetName.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 flex items-center gap-1 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Debt & Loan Inputs */}
          <div className="space-y-3 pt-3 border-t border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-rose-400" />
                <span>Loans & Liabilities (£)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Deducted from Net Worth</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {currentDebts.length === 0 ? (
                <div className="text-xs text-slate-500 py-2 text-center">
                  No active loans or debts. Add one below if you hold debt.
                </div>
              ) : (
                currentDebts.map((debt) => (
                  <div key={debt} className="flex items-center gap-2">
                    <span className="text-xs text-rose-300/90 font-medium w-36 truncate" title={debt}>
                      {debt}
                    </span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rose-400/60 font-mono text-xs">
                        £
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={debtBalances[debt] ?? ''}
                        onChange={(e) => handleDebtBalanceChange(debt, e.target.value)}
                        className="w-full pl-6 pr-2.5 py-1.5 text-xs bg-[#263238] border border-rose-900/50 rounded-md text-rose-200 font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClearOrRemoveDebtRow(debt)}
                      className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      title={`Clear ${debt} for ${formatSnapshotLabel(selectedDate) || selectedDate}`}
                      aria-label={`Clear ${debt} for ${formatSnapshotLabel(selectedDate) || selectedDate}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add New Loan Input */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New loan name (e.g. Monzo Loan)"
                  value={newDebtName}
                  onChange={(e) => setNewDebtName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Original £"
                  value={newDebtOriginalAmount}
                  onChange={(e) =>
                    setNewDebtOriginalAmount(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  className="w-28 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={handleAddNewDebt}
                  disabled={!newDebtName.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 rounded-md border border-rose-800/60 flex items-center gap-1 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Loan</span>
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveBalances}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs shadow-md transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Balances for {formatSnapshotLabel(selectedDate) || selectedDate}</span>
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
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={formatSnapshotLabel}
                    />
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
                      labelFormatter={(label) => formatSnapshotLabel(String(label))}
                      formatter={(val: number, _name: string, item: { payload?: { assets?: number; debts?: number } }) => {
                        const p = item?.payload;
                        if (p && p.debts !== undefined && p.debts > 0) {
                          return [
                            `£${val.toLocaleString('en-GB', { minimumFractionDigits: 2 })} (Assets: £${(p.assets || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })} − Debt: £${(p.debts || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })})`,
                            'Net Worth',
                          ];
                        }
                        return [`£${val.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`, 'Net Worth'];
                      }}
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
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={formatSnapshotLabel}
                    />
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
                      labelFormatter={(label) => formatSnapshotLabel(String(label))}
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

      {/* Edit Wealth History & Manage Accounts Popup Modal */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={() => setShowEditModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wealth-editor-modal-title"
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-[#1b262c] border border-slate-700 text-slate-100 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-700/70 bg-[#222f36] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="wealth-editor-modal-title" className="text-base font-bold leading-tight">
                    Edit Wealth Balances & Accounts
                  </h2>
                  <p className="text-xs text-slate-400">
                    Scroll through saved monthly snapshots or rename/delete tracked accounts ({scope})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
                aria-label="Close wealth editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="px-5 pt-3 border-b border-slate-800 bg-[#1b262c] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalTab('months')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === 'months'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Recorded Snapshots ({allRecordedDates.length})
              </button>
              <button
                type="button"
                onClick={() => setModalTab('accounts')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === 'accounts'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Manage Accounts ({currentAssets.length + currentDebts.length})
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {modalTab === 'months' ? (
                allRecordedDates.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No snapshots saved yet. Use the Wealth Balance Logger to record your first snapshot.
                  </div>
                ) : (
                  allRecordedDates.map((month) => {
                    const monthAssetRow = modalMonthEdits[month] || {};
                    const monthDebtRow = modalDebtEdits[month] || {};
                    const monthAssets = Array.from(
                      new Set([...currentAssets, ...Object.keys(monthAssetRow)])
                    ).sort();
                    const monthDebts = Array.from(
                      new Set([...currentDebts, ...Object.keys(monthDebtRow)])
                    ).sort();
                    const monthAssetsTotal = Object.values(monthAssetRow).reduce<number>((acc, v) => {
                      const num = typeof v === 'number' ? v : parseFloat(String(v));
                      return acc + (!isNaN(num) && num > 0 ? num : 0);
                    }, 0);
                    const monthDebtsTotal = Object.values(monthDebtRow).reduce<number>((acc, v) => {
                      const num = typeof v === 'number' ? v : parseFloat(String(v));
                      return acc + (!isNaN(num) && num > 0 ? num : 0);
                    }, 0);
                    const monthNetWorth = monthAssetsTotal - monthDebtsTotal;

                    return (
                      <div
                        key={month}
                        className="p-4 rounded-lg bg-[#222f36] border border-slate-700/70 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-700/60">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className="px-2.5 py-0.5 rounded bg-[#1b262c] border border-slate-700 font-mono text-xs font-bold text-emerald-400"
                              title={month}
                            >
                              {formatSnapshotLabel(month)}
                            </span>
                            <span className="text-xs text-slate-300 font-mono">
                              Net Worth:{' '}
                              <strong className="text-white">
                                £{monthNetWorth.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                              </strong>
                              {monthDebtsTotal > 0 && (
                                <span className="text-slate-400 text-[11px] ml-1.5">
                                  (Assets: £{monthAssetsTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })} − Debt: £{monthDebtsTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })})
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={modalSaving}
                              onClick={() => handleSaveModalMonth(month)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              disabled={modalSaving}
                              onClick={() => handleDeleteMonth(month, 'all')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 disabled:opacity-50 text-red-200 text-xs font-medium transition-colors"
                              title={`Delete snapshot for ${formatSnapshotLabel(month)}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Assets subgrid */}
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Asset Accounts
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {monthAssets.map((asset) => (
                              <div
                                key={`${month}-${asset}`}
                                className="flex items-center gap-2 bg-[#1b262c] border border-slate-700/60 rounded-md px-2.5 py-1"
                              >
                                <span
                                  className="text-xs text-slate-300 font-medium w-28 truncate"
                                  title={asset}
                                >
                                  {asset}
                                </span>
                                <div className="relative flex-1">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                                    £
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={monthAssetRow[asset] ?? ''}
                                    onChange={(e) =>
                                      handleModalBalanceChange(month, asset, e.target.value)
                                    }
                                    className="w-full pl-5 pr-2 py-1 text-xs bg-[#263238] border border-slate-700 rounded text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleModalBalanceChange(month, asset, '')}
                                  className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                                  title={`Clear ${asset} in ${month}`}
                                  aria-label={`Clear ${asset} in ${month}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Debts subgrid if debts exist */}
                        {monthDebts.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-800">
                            <div className="text-[11px] font-semibold text-rose-300/80 uppercase tracking-wider">
                              Loans & Debts
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {monthDebts.map((debt) => (
                                <div
                                  key={`${month}-${debt}`}
                                  className="flex items-center gap-2 bg-[#1b262c] border border-rose-900/40 rounded-md px-2.5 py-1"
                                >
                                  <span
                                    className="text-xs text-rose-300 font-medium w-28 truncate"
                                    title={debt}
                                  >
                                    {debt}
                                  </span>
                                  <div className="relative flex-1">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-400/60 font-mono text-xs">
                                      £
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={monthDebtRow[debt] ?? ''}
                                      onChange={(e) =>
                                        handleModalDebtBalanceChange(month, debt, e.target.value)
                                      }
                                      className="w-full pl-5 pr-2 py-1 text-xs bg-[#263238] border border-slate-700 rounded text-rose-200 font-mono focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleModalDebtBalanceChange(month, debt, '')}
                                    className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                                    title={`Clear ${debt} in ${month}`}
                                    aria-label={`Clear ${debt} in ${month}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              ) : currentAssets.length === 0 && currentDebts.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No accounts tracked yet.
                </div>
              ) : (
                <div className="space-y-5">
                  <p className="text-xs text-slate-400">
                    Rename an account to fix a typo across all saved months, or delete an account to remove it from every recorded snapshot.
                  </p>

                  {/* Asset Accounts */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Asset Accounts ({currentAssets.length})</span>
                    </div>
                    {currentAssets.map((account) => {
                      const draftVal = renameDrafts[account] ?? account;
                      const isChanged = draftVal.trim() !== '' && draftVal.trim() !== account;
                      return (
                        <div
                          key={account}
                          className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-3 rounded-lg bg-[#222f36] border border-slate-700/70"
                        >
                          <input
                            type="text"
                            value={draftVal}
                            onChange={(e) =>
                              setRenameDrafts((prev) => ({
                                ...prev,
                                [account]: e.target.value,
                              }))
                            }
                            className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs bg-[#1b262c] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                            aria-label={`Account name for ${account}`}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!isChanged || modalSaving}
                              onClick={() => handleRenameAccountEverywhere(account, 'asset')}
                              className="px-2.5 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              disabled={modalSaving}
                              onClick={() => handleDeleteAccountEverywhere(account, 'asset')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 disabled:opacity-50 text-red-200 text-xs font-medium transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Loan & Debt Accounts */}
                  {currentDebts.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-slate-800">
                      <div className="text-xs font-semibold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-rose-400" />
                        <span>Loan & Debt Accounts ({currentDebts.length})</span>
                      </div>
                      {currentDebts.map((debt) => {
                        const draftVal = renameDebtDrafts[debt] ?? debt;
                        const isChanged = draftVal.trim() !== '' && draftVal.trim() !== debt;
                        return (
                          <div
                            key={debt}
                            className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-3 rounded-lg bg-[#222f36] border border-rose-900/40"
                          >
                            <input
                              type="text"
                              value={draftVal}
                              onChange={(e) =>
                                setRenameDebtDrafts((prev) => ({
                                  ...prev,
                                  [debt]: e.target.value,
                                }))
                              }
                              className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs bg-[#1b262c] border border-slate-700 rounded text-rose-200 focus:outline-none focus:border-rose-500"
                              aria-label={`Debt name for ${debt}`}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!isChanged || modalSaving}
                                onClick={() => handleRenameAccountEverywhere(debt, 'debt')}
                                className="px-2.5 py-1.5 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                disabled={modalSaving}
                                onClick={() => handleDeleteAccountEverywhere(debt, 'debt')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 disabled:opacity-50 text-red-200 text-xs font-medium transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-700/70 bg-[#222f36] flex items-center justify-between text-xs text-slate-400">
              <span>Changes update your Net Worth chart immediately when saved</span>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
