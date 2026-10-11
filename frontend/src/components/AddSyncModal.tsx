import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  PlusCircle,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import { AccountScope, AppSettings, TransactionRow } from '../types';

interface AddSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: AccountScope;
  settings: AppSettings;
  masterCategories: string[];
  onDataChanged: (toastMessage: string) => void;
}

type ModalTab = 'sync' | 'quick-add' | 'csv-paste';

export const AddSyncModal: React.FC<AddSyncModalProps> = ({
  isOpen,
  onClose,
  scope,
  settings,
  masterCategories,
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('sync');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monzo Google Sheets state
  const [sheetUrl, setSheetUrl] = useState(settings.monzo_sheet_url || '');
  const [worksheetName, setWorksheetName] = useState(settings.monzo_sheet_worksheet || '');

  // Quick Add state
  const todayStr = new Date().toISOString().slice(0, 10);
  const [qaDate, setQaDate] = useState(todayStr);
  const [qaName, setQaName] = useState('');
  const [qaAmount, setQaAmount] = useState('');
  const [qaType, setQaType] = useState<'Expense' | 'Income'>('Expense');
  const [qaCategory, setQaCategory] = useState(masterCategories[0] || 'Groceries');
  const [qaNotes, setQaNotes] = useState('');
  const [qaIsSub, setQaIsSub] = useState(false);

  // CSV / Paste state
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [bankFormat, setBankFormat] = useState('Auto-Detect');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');

  // Newly synced / imported rows preview (already saved to disk; inline edits auto-save)
  const [reviewRows, setReviewRows] = useState<TransactionRow[]>([]);
  const [syncSummary, setSyncSummary] = useState<{ newCount: number; updatedCount: number } | null>(
    null
  );

  if (!isOpen) return null;

  const handleGoogleSheetsSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.syncGoogleSheets(scope, sheetUrl, worksheetName);
      setReviewRows(res.new_rows);
      setSyncSummary({ newCount: res.new_count, updatedCount: res.updated_count });
      onDataChanged(
        `Synced Monzo Sheet: ${res.new_count} new, ${res.updated_count} updated (auto-saved)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sheets sync failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(qaAmount);
    if (!qaName.trim() || Number.isNaN(amt) || amt <= 0) {
      setError('Enter a merchant/person name and a positive amount.');
      return;
    }
    setLoading(true);
    try {
      await api.createTransaction(scope, {
        Date: qaDate,
        Name: qaName.trim(),
        Amount: amt,
        Transaction_Type: qaType,
        Bank: 'Manual',
        Category: qaCategory,
        Notes: qaNotes.trim(),
        Is_Subscription: qaIsSub,
      });
      setQaName('');
      setQaAmount('');
      setQaNotes('');
      setQaIsSub(false);
      onDataChanged(`Added "${qaName.trim()}" (£${amt.toFixed(2)}) and saved to disk`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (importMode === 'file') {
        if (!selectedFile) {
          setError('Choose a CSV file to upload.');
          setLoading(false);
          return;
        }
        const res = await api.importCsvFile(scope, selectedFile, bankFormat);
        setReviewRows(res.new_rows);
        setSyncSummary({ newCount: res.new_count, updatedCount: res.updated_count });
        onDataChanged(`Imported CSV: ${res.new_count} new, ${res.updated_count} updated`);
      } else {
        if (!pastedText.trim()) {
          setError('Paste spreadsheet rows first.');
          setLoading(false);
          return;
        }
        const res = await api.importPastedText(scope, pastedText, bankFormat);
        setReviewRows(res.new_rows);
        setSyncSummary({ newCount: res.new_count, updatedCount: res.updated_count });
        setPastedText('');
        onDataChanged(`Imported pasted data: ${res.new_count} new, ${res.updated_count} updated`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewRowPatch = async (
    rowId: number,
    patch: Partial<{ Category: string; Notes: string; Is_Subscription: boolean }>
  ) => {
    try {
      const res = await api.patchTransaction(scope, rowId, patch);
      setReviewRows((prev) => prev.map((r) => (r.row_id === rowId ? res.row : r)));
      onDataChanged('Updated synced transaction and auto-saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update row.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-sync-modal-title"
    >
      <div
        className={`w-full ${
          reviewRows.length > 0 ? 'max-w-4xl' : 'max-w-xl'
        } bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-lg overflow-hidden max-h-[90vh] flex flex-col`}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#d6dfe5] dark:border-[#32424a] flex items-center justify-between">
          <h2 id="add-sync-modal-title" className="text-base font-bold">
            Add or Sync Transactions ({scope})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-lg text-[#485b69] dark:text-[#b0bec5] hover:text-[#121a21] dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="px-5 pt-3 flex gap-2 border-b border-[#d6dfe5] dark:border-[#32424a] bg-[#f4f6f8] dark:bg-[#212f37]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('sync');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'sync'
                ? 'border-[#e74c3c] text-[#e74c3c] dark:text-white bg-white dark:bg-[#1b262c]'
                : 'border-transparent text-[#485b69] dark:text-[#b0bec5]'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Monzo Sheet Sync</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('quick-add');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'quick-add'
                ? 'border-[#e74c3c] text-[#e74c3c] dark:text-white bg-white dark:bg-[#1b262c]'
                : 'border-transparent text-[#485b69] dark:text-[#b0bec5]'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Quick Add</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('csv-paste');
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'csv-paste'
                ? 'border-[#e74c3c] text-[#e74c3c] dark:text-white bg-white dark:bg-[#1b262c]'
                : 'border-transparent text-[#485b69] dark:text-[#b0bec5]'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Upload / Paste</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-[#e74c3c]/15 border border-[#e74c3c] text-[#ff5252] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'sync' && (
            <form onSubmit={handleGoogleSheetsSync} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                  Monzo Google Sheet URL
                </label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                  Worksheet Name
                </label>
                <input
                  type="text"
                  value={worksheetName}
                  onChange={(e) => setWorksheetName(e.target.value)}
                  placeholder="Personal Account Transactions"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e74c3c] hover:bg-[#d64232] disabled:opacity-50 text-white text-sm font-semibold"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Syncing Live Sheet...' : 'Sync Now & Auto-Save'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'quick-add' && (
            <form onSubmit={handleQuickAdd} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={qaDate}
                    onChange={(e) => setQaDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                    Amount (£)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={qaAmount}
                    onChange={(e) => setQaAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                  Merchant or Person Name
                </label>
                <input
                  type="text"
                  value={qaName}
                  onChange={(e) => setQaName(e.target.value)}
                  placeholder="e.g. Tesco or British Gas"
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                    Transaction Type
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]">
                    {(['Expense', 'Income'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setQaType(t)}
                        className={`py-1 text-xs font-semibold rounded-md ${
                          qaType === t
                            ? t === 'Income'
                              ? 'bg-[#2ecc71] text-[#0b1f13]'
                              : 'bg-[#e74c3c] text-white'
                            : 'text-[#485b69] dark:text-[#b0bec5]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                    Category
                  </label>
                  <select
                    value={qaCategory}
                    onChange={(e) => setQaCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                  >
                    {masterCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-[#485b69] dark:text-[#b0bec5]">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={qaNotes}
                  onChange={(e) => setQaNotes(e.target.value)}
                  placeholder="Optional note or #tag"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-[#485b69] dark:text-[#b0bec5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qaIsSub}
                    onChange={(e) => setQaIsSub(e.target.checked)}
                    className="rounded border-[#32424a]"
                  />
                  <span>Recurring subscription</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[#e74c3c] hover:bg-[#d64232] disabled:opacity-50 text-white text-sm font-semibold"
                >
                  {loading ? 'Saving...' : 'Add & Auto-Save'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'csv-paste' && (
            <form onSubmit={handleImportSubmit} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg p-0.5 bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]">
                  <button
                    type="button"
                    onClick={() => setImportMode('file')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${
                      importMode === 'file'
                        ? 'bg-[#e74c3c] text-white'
                        : 'text-[#485b69] dark:text-[#b0bec5]'
                    }`}
                  >
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('paste')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${
                      importMode === 'paste'
                        ? 'bg-[#e74c3c] text-white'
                        : 'text-[#485b69] dark:text-[#b0bec5]'
                    }`}
                  >
                    Paste Spreadsheet Rows
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#485b69] dark:text-[#b0bec5]">Bank Format:</label>
                  <select
                    value={bankFormat}
                    onChange={(e) => setBankFormat(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                  >
                    {['Auto-Detect', 'Monzo', 'HSBC', 'Barclaycard'].map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {importMode === 'file' ? (
                <label className="block border border-dashed border-[#d6dfe5] dark:border-[#32424a] rounded-lg p-5 text-center cursor-pointer bg-[#f4f6f8] dark:bg-[#263238] hover:border-[#e74c3c]">
                  <Upload className="w-5 h-5 mx-auto mb-1.5 text-[#485b69] dark:text-[#b0bec5]" />
                  <span className="block text-xs font-medium">
                    {selectedFile ? selectedFile.name : 'Click to choose a bank CSV file'}
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              ) : (
                <textarea
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste tab-separated or comma-separated rows (including headers)..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] font-mono"
                />
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[#e74c3c] hover:bg-[#d64232] disabled:opacity-50 text-white text-sm font-semibold"
                >
                  {loading ? 'Processing...' : 'Process & Auto-Save'}
                </button>
              </div>
            </form>
          )}

          {/* Newly Synced / Imported Review Table */}
          {syncSummary && (
            <div className="pt-3 border-t border-[#d6dfe5] dark:border-[#32424a] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#2ecc71]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Saved {syncSummary.newCount} new transaction(s) and updated{' '}
                    {syncSummary.updatedCount} existing category match(es).
                  </span>
                </div>
                {reviewRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewRows([]);
                      setSyncSummary(null);
                    }}
                    className="text-xs text-[#485b69] dark:text-[#b0bec5] hover:underline"
                  >
                    Clear Preview
                  </button>
                )}
              </div>

              {reviewRows.length > 0 && (
                <div className="border border-[#d6dfe5] dark:border-[#32424a] rounded-lg overflow-x-auto max-h-60">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#f4f6f8] dark:bg-[#263238] text-[#485b69] dark:text-[#b0bec5] border-b border-[#d6dfe5] dark:border-[#32424a]">
                      <tr>
                        <th className="py-2 px-2.5">Date</th>
                        <th className="py-2 px-2.5">Merchant</th>
                        <th className="py-2 px-2.5 text-right">Amount</th>
                        <th className="py-2 px-2.5">Category (Auto-saves)</th>
                        <th className="py-2 px-2.5">Notes</th>
                        <th className="py-2 px-2.5 text-center">Sub?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d6dfe5] dark:divide-[#32424a]">
                      {reviewRows.map((row) => (
                        <tr key={row.row_id}>
                          <td className="py-1.5 px-2.5 whitespace-nowrap tabular-nums">
                            {row.Date_Display}
                          </td>
                          <td className="py-1.5 px-2.5 font-medium">{row.Name}</td>
                          <td className="py-1.5 px-2.5 text-right tabular-nums">
                            £{row.Amount.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2.5">
                            <select
                              value={row.Category}
                              onChange={(e) =>
                                handleReviewRowPatch(row.row_id, { Category: e.target.value })
                              }
                              className="px-2 py-1 rounded bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                            >
                              {masterCategories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1.5 px-2.5">
                            <input
                              type="text"
                              defaultValue={row.Notes}
                              onBlur={(e) => {
                                if (e.target.value !== row.Notes) {
                                  handleReviewRowPatch(row.row_id, { Notes: e.target.value });
                                }
                              }}
                              className="w-full px-2 py-1 rounded bg-[#f4f6f8] dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a]"
                            />
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={row.Is_Subscription}
                              onChange={(e) =>
                                handleReviewRowPatch(row.row_id, {
                                  Is_Subscription: e.target.checked,
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
