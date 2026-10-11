import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Download,
  Filter,
  Save,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  X,
  AlertCircle,
  Tag,
  Repeat,
} from 'lucide-react';
import { api } from '../api';
import { AccountScope, FilterPreset, TransactionRow } from '../types';

interface TransactionsPageProps {
  scope: AccountScope;
  masterCategories: string[];
  masterBanks: string[];
  financialYears: string[];
  savedFilters: Record<string, FilterPreset>;
  onSavedFiltersChange: (presets: Record<string, FilterPreset>) => void;
  initialCategory?: string | null;
  onClearInitialCategory?: () => void;
}

export const TransactionsPage: React.FC<TransactionsPageProps> = ({
  scope,
  masterCategories,
  masterBanks,
  financialYears,
  savedFilters,
  onSavedFiltersChange,
  initialCategory,
  onClearInitialCategory,
}) => {
  // Filter states
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [bank, setBank] = useState('All');
  const [category, setCategory] = useState(initialCategory || 'All');
  const [transactionType, setTransactionType] = useState('Both');
  const [financialYear, setFinancialYear] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination states
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  // Data states
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk selection states
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Save indicator / status
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Preset management modal / state
  const [selectedPresetName, setSelectedPresetName] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);

  // Bulk action values
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkType, setBulkType] = useState('');

  // Synchronize initialCategory if passed from dashboard
  useEffect(() => {
    if (initialCategory) {
      setCategory(initialCategory);
      setCurrentPage(1);
      if (onClearInitialCategory) onClearInitialCategory();
    }
  }, [initialCategory, onClearInitialCategory]);

  // Load transactions
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (currentPage - 1) * pageSize;
      const res = await api.getTransactions(scope, {
        search,
        notes,
        bank,
        category,
        transaction_type: transactionType,
        financial_year: financialYear,
        date_from: dateFrom,
        date_to: dateTo,
        limit: pageSize,
        offset,
      });
      setRows(res.rows);
      setTotalRows(res.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load transactions';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [
    scope,
    currentPage,
    pageSize,
    search,
    notes,
    bank,
    category,
    transactionType,
    financialYear,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Reset pagination on filter change
  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const handleResetFilters = () => {
    setSearch('');
    setNotes('');
    setBank('All');
    setCategory('All');
    setTransactionType('Both');
    setFinancialYear('All');
    setDateFrom('');
    setDateTo('');
    setSelectedPresetName('');
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  // Load preset
  const handleSelectPreset = (name: string) => {
    setSelectedPresetName(name);
    if (!name || !savedFilters[name]) return;
    const p = savedFilters[name];
    if (p.type !== undefined) setTransactionType(p.type);
    if (p.fy !== undefined) setFinancialYear(p.fy);
    if (p.cats && p.cats.length > 0) setCategory(p.cats[0]);
    else setCategory('All');
    if (p.merchant !== undefined) setSearch(p.merchant);
    if (p.notes !== undefined) setNotes(p.notes);
    if (p.bank !== undefined) setBank(p.bank);
    if (p.date_from !== undefined) setDateFrom(p.date_from);
    if (p.date_to !== undefined) setDateTo(p.date_to);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  // Save new preset
  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    const updated: Record<string, FilterPreset> = {
      ...savedFilters,
      [newPresetName.trim()]: {
        type: transactionType,
        fy: financialYear,
        cats: category !== 'All' ? [category] : [],
        merchant: search,
        notes: notes,
        bank: bank,
        date_from: dateFrom,
        date_to: dateTo,
      },
    };
    try {
      const res = await api.updateFilterPresets(scope, updated);
      onSavedFiltersChange(res.saved_filters);
      setSelectedPresetName(newPresetName.trim());
      setNewPresetName('');
      setShowSavePresetModal(false);
      triggerSaveIndicator('Preset saved');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save preset');
    }
  };

  // Delete preset
  const handleDeletePreset = async () => {
    if (!selectedPresetName || !savedFilters[selectedPresetName]) return;
    if (!window.confirm(`Delete preset "${selectedPresetName}"?`)) return;
    const updated = { ...savedFilters };
    delete updated[selectedPresetName];
    try {
      const res = await api.updateFilterPresets(scope, updated);
      onSavedFiltersChange(res.saved_filters);
      setSelectedPresetName('');
      triggerSaveIndicator('Preset deleted');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  const triggerSaveIndicator = (msg = 'Changes saved') => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Inline patch cell
  const handleInlineChange = async (
    rowId: number,
    field: keyof TransactionRow,
    value: string | number | boolean
  ) => {
    // Optimistic UI update
    setRows((prev) =>
      prev.map((r) => (r.row_id === rowId ? { ...r, [field]: value } : r))
    );

    try {
      await api.patchTransaction(scope, rowId, { [field]: value });
      triggerSaveIndicator('Saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update transaction';
      setError(msg);
      // Re-sync with backend on error
      loadTransactions();
    }
  };

  // Single delete
  const handleDeleteRow = async (rowId: number, merchant: string) => {
    if (!window.confirm(`Delete transaction for "${merchant}"?`)) return;
    try {
      await api.bulkUpdateTransactions(scope, { action: 'delete', row_ids: [rowId] });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
      loadTransactions();
      triggerSaveIndicator('Deleted');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete transaction');
    }
  };

  // Bulk actions
  const handleSelectAllCurrentPage = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
    } else {
      setSelectedIds(new Set(rows.map((r) => r.row_id)));
    }
  };

  const handleToggleSelectRow = (
    rowId: number,
    rowIndex: number,
    event?: React.MouseEvent
  ) => {
    const isShift = Boolean(event?.shiftKey) && lastSelectedIndex !== null;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isShift && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, rowIndex);
        const end = Math.max(lastSelectedIndex, rowIndex);
        for (let i = start; i <= end; i++) {
          if (rows[i]) {
            next.add(rows[i].row_id);
          }
        }
      } else {
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
      }
      return next;
    });

    setLastSelectedIndex(rowIndex);
  };

  const handleApplyBulkCategory = async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    try {
      await api.bulkUpdateTransactions(scope, {
        action: 'update',
        row_ids: Array.from(selectedIds),
        category: bulkCategory,
      });
      triggerSaveIndicator(`Updated category on ${selectedIds.size} rows`);
      setSelectedIds(new Set());
      setBulkCategory('');
      loadTransactions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk update failed');
    }
  };

  const handleApplyBulkType = async () => {
    if (!bulkType || selectedIds.size === 0) return;
    try {
      await api.bulkUpdateTransactions(scope, {
        action: 'update',
        row_ids: Array.from(selectedIds),
        transaction_type: bulkType,
      });
      triggerSaveIndicator(`Updated type on ${selectedIds.size} rows`);
      setSelectedIds(new Set());
      setBulkType('');
      loadTransactions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk update failed');
    }
  };

  const handleApplyBulkSubscription = async (isSub: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      await api.bulkUpdateTransactions(scope, {
        action: 'update',
        row_ids: Array.from(selectedIds),
        is_subscription: isSub,
      });
      triggerSaveIndicator(`Updated subscription flag on ${selectedIds.size} rows`);
      setSelectedIds(new Set());
      loadTransactions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk update failed');
    }
  };

  const handleApplyBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedIds.size} selected transaction(s)? This cannot be undone.`
      )
    )
      return;
    try {
      await api.bulkUpdateTransactions(scope, {
        action: 'delete',
        row_ids: Array.from(selectedIds),
      });
      triggerSaveIndicator(`Deleted ${selectedIds.size} rows`);
      setSelectedIds(new Set());
      loadTransactions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  // CSV Export URL
  const exportUrl = useMemo(() => {
    return api.getExportUrl(scope, {
      search,
      notes,
      bank,
      category,
      transaction_type: transactionType,
      financial_year: financialYear,
      date_from: dateFrom,
      date_to: dateTo,
    });
  }, [
    scope,
    search,
    notes,
    bank,
    category,
    transactionType,
    financialYear,
    dateFrom,
    dateTo,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-6 pb-24">
      {/* Top Header & Save Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span>Transactions</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
              {scope}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            View, filter, edit, and export your entire ledger with immediate auto-save.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveStatus && (
            <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{saveStatus}</span>
            </div>
          )}

          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-[#1b262c] hover:bg-slate-700/60 text-slate-200 border border-slate-700/50 transition-colors"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Export CSV</span>
          </a>

          <button
            onClick={loadTransactions}
            disabled={loading}
            className="p-2 rounded-lg bg-[#1b262c] hover:bg-slate-700/60 text-slate-300 border border-slate-700/50 transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 space-y-4">
        {/* Preset Selector & Management */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-700/40">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-slate-300">Filter Presets:</span>
            <select
              value={selectedPresetName}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Select Saved Preset --</option>
              {Object.keys(savedFilters).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {selectedPresetName && (
              <button
                onClick={handleDeletePreset}
                className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                title="Delete this preset"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => setShowSavePresetModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-slate-400" />
              <span>Save As Preset</span>
            </button>
          </div>

          <button
            onClick={handleResetFilters}
            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
          >
            Reset Filters
          </button>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Merchant Search */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Merchant / Name</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search merchant..."
                value={search}
                onChange={(e) => handleFilterChange(setSearch, e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Notes Search */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Notes Contains</label>
            <input
              type="text"
              placeholder="Filter notes..."
              value={notes}
              onChange={(e) => handleFilterChange(setNotes, e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Bank */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Bank</label>
            <select
              value={bank}
              onChange={(e) => handleFilterChange(setBank, e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Banks</option>
              {masterBanks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Category</label>
            <select
              value={category}
              onChange={(e) => handleFilterChange(setCategory, e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Categories</option>
              {masterCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Transaction Type */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Type</label>
            <select
              value={transactionType}
              onChange={(e) => handleFilterChange(setTransactionType, e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="Both">Both (Expenses & Income)</option>
              <option value="Expense">Expense Only</option>
              <option value="Income">Income Only</option>
            </select>
          </div>

          {/* Financial Year */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Financial Year</label>
            <select
              value={financialYear}
              onChange={(e) => handleFilterChange(setFinancialYear, e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Financial Years</option>
              {financialYears.map((fy) => (
                <option key={fy} value={fy}>
                  {fy}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400">Date Range</label>
            <div className="grid grid-cols-2 gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFilterChange(setDateFrom, e.target.value)}
                className="w-full px-1.5 py-1.5 text-[11px] bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
                title="Date From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
                className="w-full px-1.5 py-1.5 text-[11px] bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
                title="Date To"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center justify-between gap-2 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadTransactions()}
            className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table & Pagination Card */}
      <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg overflow-hidden flex flex-col">
        {/* Table summary & page size header */}
        <div className="px-4 py-3 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Showing{' '}
              <strong className="text-slate-200 font-semibold">
                {totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
                {Math.min(currentPage * pageSize, totalRows)}
              </strong>{' '}
              of <strong className="text-slate-200 font-semibold">{totalRows.toLocaleString()}</strong>{' '}
              transactions
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-[#263238] border border-slate-700 rounded text-slate-200 focus:outline-none"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
                className="p-1 rounded bg-[#263238] hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-slate-300">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="p-1 rounded bg-[#263238] hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60 sticky top-0">
              <tr>
                <th className="py-2.5 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    onChange={handleSelectAllCurrentPage}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 w-28">Date</th>
                <th className="py-2.5 px-3 min-w-[180px]">Merchant / Name</th>
                <th className="py-2.5 px-3 w-24 text-right">Amount (£)</th>
                <th className="py-2.5 px-3 w-24">Type</th>
                <th className="py-2.5 px-3 w-28">Bank</th>
                <th className="py-2.5 px-3 min-w-[150px]">Category</th>
                <th className="py-2.5 px-3 min-w-[160px]">Notes</th>
                <th className="py-2.5 px-3 w-16 text-center">Sub?</th>
                <th className="py-2.5 px-3 w-12 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 font-sans text-xs">
                    {loading ? 'Loading transactions...' : 'No transactions match current filters.'}
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isSelected = selectedIds.has(row.row_id);
                  const isIncome = row.Transaction_Type === 'Income';

                  return (
                    <tr
                      key={row.row_id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-cyan-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => handleToggleSelectRow(row.row_id, idx, e)}
                          onChange={() => {}}
                          className="rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Date */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          defaultValue={row.Date}
                          onBlur={(e) => {
                            if (e.target.value !== row.Date) {
                              handleInlineChange(row.row_id, 'Date', e.target.value);
                            }
                          }}
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs text-slate-300 font-mono focus:bg-[#263238] rounded-sm outline-none"
                        />
                      </td>

                      {/* Name / Merchant */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          defaultValue={row.Name}
                          onBlur={(e) => {
                            if (e.target.value !== row.Name) {
                              handleInlineChange(row.row_id, 'Name', e.target.value);
                            }
                          }}
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs text-slate-200 font-sans focus:bg-[#263238] rounded-sm outline-none"
                        />
                      </td>

                      {/* Amount */}
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={row.Amount}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== row.Amount) {
                              handleInlineChange(row.row_id, 'Amount', val);
                            }
                          }}
                          className={`w-full text-right bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs font-mono font-medium focus:bg-[#263238] rounded-sm outline-none ${
                            isIncome ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        />
                      </td>

                      {/* Type */}
                      <td className="py-2 px-3 font-sans">
                        <select
                          value={row.Transaction_Type}
                          onChange={(e) =>
                            handleInlineChange(row.row_id, 'Transaction_Type', e.target.value)
                          }
                          className={`bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs rounded-sm outline-none cursor-pointer ${
                            isIncome ? 'text-emerald-400 font-medium' : 'text-slate-300'
                          }`}
                        >
                          <option value="Expense" className="bg-[#1b262c] text-slate-200">
                            Expense
                          </option>
                          <option value="Income" className="bg-[#1b262c] text-emerald-400">
                            Income
                          </option>
                        </select>
                      </td>

                      {/* Bank */}
                      <td className="py-2 px-3 font-sans">
                        <select
                          value={row.Bank}
                          onChange={(e) =>
                            handleInlineChange(row.row_id, 'Bank', e.target.value)
                          }
                          className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs text-slate-300 rounded-sm outline-none cursor-pointer"
                        >
                          {masterBanks.map((b) => (
                            <option key={b} value={b} className="bg-[#1b262c] text-slate-200">
                              {b}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Category */}
                      <td className="py-2 px-3 font-sans">
                        <select
                          value={row.Category}
                          onChange={(e) =>
                            handleInlineChange(row.row_id, 'Category', e.target.value)
                          }
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs text-cyan-300 rounded-sm outline-none cursor-pointer"
                        >
                          {masterCategories.map((c) => (
                            <option key={c} value={c} className="bg-[#1b262c] text-slate-200">
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Notes */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          defaultValue={row.Notes}
                          placeholder="Add notes..."
                          onBlur={(e) => {
                            if (e.target.value !== row.Notes) {
                              handleInlineChange(row.row_id, 'Notes', e.target.value);
                            }
                          }}
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-600 focus:border-cyan-500 px-1 py-0.5 text-xs text-slate-400 font-sans focus:bg-[#263238] rounded-sm outline-none"
                        />
                      </td>

                      {/* Subscription */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.Is_Subscription}
                          onChange={(e) =>
                            handleInlineChange(row.row_id, 'Is_Subscription', e.target.checked)
                          }
                          className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-0 cursor-pointer"
                          title="Subscription flag"
                        />
                      </td>

                      {/* Single Action */}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleDeleteRow(row.row_id, row.Name)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bulk Action Bar (when rows are selected) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1b262c]/95 backdrop-blur border border-cyan-500/40 rounded-xl px-5 py-3 shadow-2xl flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-cyan-900/60 text-cyan-300 font-semibold rounded-full border border-cyan-700/60">
              {selectedIds.size} selected
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Bulk Category */}
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="px-2 py-1 bg-[#263238] border border-slate-700 rounded text-slate-200 focus:outline-none"
            >
              <option value="">Set Category...</option>
              {masterCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={handleApplyBulkCategory}
              disabled={!bulkCategory}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Bulk Type */}
          <div className="flex items-center gap-1.5">
            <select
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value)}
              className="px-2 py-1 bg-[#263238] border border-slate-700 rounded text-slate-200 focus:outline-none"
            >
              <option value="">Set Type...</option>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
            </select>
            <button
              onClick={handleApplyBulkType}
              disabled={!bulkType}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Bulk Subscription */}
          <div className="flex items-center gap-1">
            <Repeat className="w-3.5 h-3.5 text-slate-400" />
            <button
              onClick={() => handleApplyBulkSubscription(true)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded font-medium transition-colors"
              title="Flag selected as subscriptions"
            >
              + Sub
            </button>
            <button
              onClick={() => handleApplyBulkSubscription(false)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
              title="Remove subscription flag"
            >
              - Sub
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Bulk Delete */}
          <button
            onClick={handleApplyBulkDelete}
            className="flex items-center gap-1 px-3 py-1 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 rounded font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* Clear Selection */}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors ml-1"
            title="Deselect all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1b262c] border border-slate-700 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Save className="w-4 h-4 text-cyan-400" />
                <span>Save Current Filters</span>
              </h3>
              <button
                onClick={() => setShowSavePresetModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Provide a name to save your current search, bank, category, and date parameters.
            </p>

            <input
              type="text"
              placeholder="e.g. Groceries 2025-2026"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
              autoFocus
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSavePresetModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="px-3.5 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-md disabled:opacity-40 transition-colors"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
