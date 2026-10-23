import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Save,
  Check,
  FileSpreadsheet,
  Activity,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import { AccountScope, AppSettings, AutoRule, StartupHealth } from '../types';

interface SettingsPageProps {
  scope: AccountScope;
  settings: AppSettings;
  masterCategories: string[];
  masterBanks: string[];
  health: StartupHealth;
  onSettingsUpdated: (updated: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  scope,
  settings,
  masterCategories,
  masterBanks,
  health,
  onSettingsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'committed' | 'system'>('rules');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-rules form state
  const [rules, setRules] = useState<AutoRule[]>(settings.auto_rules || []);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleNotes, setNewRuleNotes] = useState('');
  const [newRuleMaxAmount, setNewRuleMaxAmount] = useState<number | ''>('');
  const [newRuleCategory, setNewRuleCategory] = useState(masterCategories[0] || 'General');

  // Rule Tester state
  const [testMerchant, setTestMerchant] = useState('');
  const [testNotes, setTestNotes] = useState('');
  const [testAmount, setTestAmount] = useState<number | ''>('');
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    matched: boolean;
    ruleIndex?: number | null;
    rule?: AutoRule | null;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Apply to all state
  const [applying, setApplying] = useState(false);

  // Committed categories state
  const [committedCategories, setCommittedCategories] = useState<string[]>(
    settings.committed_categories || []
  );

  // Exceptional / One-off categories state
  const [exceptionalCategories, setExceptionalCategories] = useState<string[]>(
    settings.exceptional_categories || []
  );

  // Custom categories & banks state
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [customBankInput, setCustomBankInput] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>(
    settings.custom_categories || []
  );
  const [customBanks, setCustomBanks] = useState<string[]>(settings.custom_banks || []);

  // Google Sheets state
  const [monzoSheetUrl, setMonzoSheetUrl] = useState(settings.monzo_sheet_url || '');
  const [monzoSheetWorksheet, setMonzoSheetWorksheet] = useState(
    settings.monzo_sheet_worksheet || ''
  );

  const triggerSaveStatus = (msg = 'Settings saved') => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const persistSettings = async (patch: Partial<AppSettings>) => {
    try {
      const res = await api.updateSettings(scope, patch);
      onSettingsUpdated(res.settings);
      triggerSaveStatus('Changes saved automatically');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  // Rule management
  const handleAddRule = async () => {
    if (!newRuleName.trim() && !newRuleNotes.trim()) {
      alert('Please enter at least a merchant name or notes fragment to match.');
      return;
    }

    const rule: AutoRule = {
      name_contains: newRuleName.trim(),
      notes_contains: newRuleNotes.trim(),
      max_amount: typeof newRuleMaxAmount === 'number' ? newRuleMaxAmount : 0,
      category: newRuleCategory,
    };

    const updatedRules = [...rules, rule];
    setRules(updatedRules);
    setNewRuleName('');
    setNewRuleNotes('');
    setNewRuleMaxAmount('');

    await persistSettings({ auto_rules: updatedRules });
  };

  // Multi-select rules state
  const [selectedRuleIndices, setSelectedRuleIndices] = useState<Set<number>>(new Set());
  const [lastSelectedRuleIndex, setLastSelectedRuleIndex] = useState<number | null>(null);

  const handleToggleSelectRule = (index: number, event?: React.MouseEvent) => {
    const isShift = Boolean(event?.shiftKey) && lastSelectedRuleIndex !== null;

    setSelectedRuleIndices((prev) => {
      const next = new Set(prev);
      if (isShift && lastSelectedRuleIndex !== null) {
        const start = Math.min(lastSelectedRuleIndex, index);
        const end = Math.max(lastSelectedRuleIndex, index);
        const shouldSelect = !prev.has(index);
        for (let i = start; i <= end; i++) {
          if (shouldSelect) {
            next.add(i);
          } else {
            next.delete(i);
          }
        }
      } else {
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
      }
      return next;
    });

    setLastSelectedRuleIndex(index);
  };

  const handleSelectAllRules = () => {
    if (selectedRuleIndices.size === rules.length) {
      setSelectedRuleIndices(new Set());
      setLastSelectedRuleIndex(null);
    } else {
      setSelectedRuleIndices(new Set(rules.map((_, idx) => idx)));
    }
  };

  const handleDeselectAllRules = () => {
    setSelectedRuleIndices(new Set());
    setLastSelectedRuleIndex(null);
  };

  const handleBulkDeleteRules = async () => {
    const count = selectedRuleIndices.size;
    if (count === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} selected auto-rule${count === 1 ? '' : 's'}? This cannot be undone.`
    );
    if (!confirmed) return;

    const updatedRules = rules.filter((_, idx) => !selectedRuleIndices.has(idx));
    setRules(updatedRules);
    setSelectedRuleIndices(new Set());
    setLastSelectedRuleIndex(null);
    await persistSettings({ auto_rules: updatedRules });
    triggerSaveStatus(`${count} rule${count === 1 ? '' : 's'} removed`);
  };

  const handleDeleteRule = async (index: number) => {
    const updatedRules = rules.filter((_, idx) => idx !== index);
    setRules(updatedRules);
    setSelectedRuleIndices(new Set());
    setLastSelectedRuleIndex(null);
    await persistSettings({ auto_rules: updatedRules });
    triggerSaveStatus('Rule removed');
  };

  const handleMoveRule = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === rules.length - 1) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const copy = [...rules];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    setRules(copy);
    setSelectedRuleIndices(new Set());
    setLastSelectedRuleIndex(null);
    await persistSettings({ auto_rules: copy });
  };

  // Rule Match Tester
  const handleTestRule = async () => {
    if (!testMerchant.trim() && !testNotes.trim()) return;
    setTesting(true);
    try {
      const amount = typeof testAmount === 'number' ? testAmount : 0;
      const res = await api.testRuleMatch(scope, testMerchant, testNotes, amount);
      setTestResult({
        tested: true,
        matched: res.matched,
        ruleIndex: res.rule_index,
        rule: res.rule,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rule test failed');
    } finally {
      setTesting(false);
    }
  };

  // Apply rules to all existing data
  const handleApplyRulesToAll = async () => {
    if (
      !window.confirm(
        'Are you sure you want to run all auto-rules across your entire transaction history? Categories of existing matching rows will be updated.'
      )
    )
      return;

    setApplying(true);
    try {
      const res = await api.applyRulesToAll(scope);
      triggerSaveStatus(`Auto-rules evaluated across ${res.total} transactions!`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Apply rules failed');
    } finally {
      setApplying(false);
    }
  };

  // Committed category toggle
  const handleToggleCommittedCategory = async (cat: string) => {
    const next = committedCategories.includes(cat)
      ? committedCategories.filter((c) => c !== cat)
      : [...committedCategories, cat];

    setCommittedCategories(next);
    await persistSettings({ committed_categories: next });
  };

  // Exceptional / One-off category toggle
  const handleToggleExceptionalCategory = async (cat: string) => {
    const next = exceptionalCategories.includes(cat)
      ? exceptionalCategories.filter((c) => c !== cat)
      : [...exceptionalCategories, cat];

    setExceptionalCategories(next);
    await persistSettings({ exceptional_categories: next });
  };

  // Custom categories & banks
  const handleAddCustomCategory = async () => {
    const trimmed = customCategoryInput.trim();
    if (!trimmed || customCategories.includes(trimmed)) return;
    const next = [...customCategories, trimmed];
    setCustomCategories(next);
    setCustomCategoryInput('');
    await persistSettings({ custom_categories: next });
  };

  const handleDeleteCustomCategory = async (cat: string) => {
    const next = customCategories.filter((c) => c !== cat);
    setCustomCategories(next);
    await persistSettings({ custom_categories: next });
  };

  const handleAddCustomBank = async () => {
    const trimmed = customBankInput.trim();
    if (!trimmed || customBanks.includes(trimmed)) return;
    const next = [...customBanks, trimmed];
    setCustomBanks(next);
    setCustomBankInput('');
    await persistSettings({ custom_banks: next });
  };

  const handleDeleteCustomBank = async (bankName: string) => {
    const next = customBanks.filter((b) => b !== bankName);
    setCustomBanks(next);
    await persistSettings({ custom_banks: next });
  };

  const handleSaveGoogleSheetsConfig = async () => {
    await persistSettings({
      monzo_sheet_url: monzoSheetUrl.trim(),
      monzo_sheet_worksheet: monzoSheetWorksheet.trim(),
    });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span className="flex items-center gap-2">
              <Settings className="w-6 h-6 text-cyan-400" />
              <span>Settings & Rules Engine</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
              {scope}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure automated categorisation rules, fixed commitment criteria, and integrations.
          </p>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-700/60 pb-px">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Auto-Categorisation Rules ({rules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('committed')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'committed'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Committed & Exceptional Spend</span>
        </button>

        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'system'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Categories, Sheets & Health</span>
        </button>
      </div>

      {/* Tab 1: Auto-Categorisation Rules & Live Tester */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Rules Action Bar & Apply to all */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-200">Rule Priority & Evaluation</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Rules are evaluated top-to-bottom. The first matching rule automatically assigns the transaction category upon sync or import.
              </p>
            </div>

            <button
              onClick={handleApplyRulesToAll}
              disabled={applying || rules.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-40 transition-colors shadow-sm self-start sm:self-auto"
            >
              <Zap className={`w-3.5 h-3.5 ${applying ? 'animate-bounce' : ''}`} />
              <span>Apply Rules to All Existing Data</span>
            </button>
          </div>

          {/* Add New Rule Form */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              <span>Add New Auto-Categorisation Rule</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400">Merchant Name Contains</label>
                <input
                  type="text"
                  placeholder="e.g. Tesco, Sainsbury"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400">Notes / Memo Contains</label>
                <input
                  type="text"
                  placeholder="e.g. groceries, petrol"
                  value={newRuleNotes}
                  onChange={(e) => setNewRuleNotes(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400">
                  Max Amount (£) <span className="text-slate-500 font-normal">(0 = any)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newRuleMaxAmount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setNewRuleMaxAmount(isNaN(val) ? '' : val);
                  }}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400">Assign To Category</label>
                <select
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {masterCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleAddRule}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save New Rule</span>
              </button>
            </div>
          </div>

          {/* Current Rules Table */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Active Rules ({rules.length})
                </h2>
                {selectedRuleIndices.size > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-700/60 text-cyan-300 text-xs font-medium">
                    {selectedRuleIndices.size} selected
                  </span>
                )}
              </div>

              {selectedRuleIndices.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeselectAllRules}
                    className="px-2.5 py-1 rounded bg-[#263238] hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition-colors"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDeleteRules}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-xs text-white font-medium shadow-sm transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedRuleIndices.size})</span>
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#263238]/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/60">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={rules.length > 0 && selectedRuleIndices.size === rules.length}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              selectedRuleIndices.size > 0 &&
                              selectedRuleIndices.size < rules.length;
                          }
                        }}
                        onChange={handleSelectAllRules}
                        disabled={rules.length === 0}
                        className="rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-0 cursor-pointer"
                        title={
                          selectedRuleIndices.size === rules.length
                            ? 'Deselect all'
                            : 'Select all'
                        }
                      />
                    </th>
                    <th className="py-2.5 px-3 w-16 text-center">Priority</th>
                    <th className="py-2.5 px-3 min-w-[150px]">Merchant Contains</th>
                    <th className="py-2.5 px-3 min-w-[150px]">Notes Contains</th>
                    <th className="py-2.5 px-3 w-28 text-right">Max (£)</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Category Assigned</th>
                    <th className="py-2.5 px-3 w-28 text-center">Reorder</th>
                    <th className="py-2.5 px-3 w-16 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 font-sans text-xs">
                        No auto-rules created yet. Use the form above to add your first rule.
                      </td>
                    </tr>
                  ) : (
                    rules.map((rule, idx) => {
                      const isSelected = selectedRuleIndices.has(idx);
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isSelected ? 'bg-cyan-950/25' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={(e) => handleToggleSelectRule(idx, e)}
                              onChange={() => {}}
                              className="rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-0 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-400 font-semibold">
                            #{idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-200">
                            {rule.name_contains || <span className="text-slate-500 italic">Any</span>}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-300">
                            {rule.notes_contains || <span className="text-slate-500 italic">Any</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {rule.max_amount > 0 ? `£${rule.max_amount.toFixed(2)}` : '∞'}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className="px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/50 text-cyan-300 text-xs">
                              {rule.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleMoveRule(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
                                title="Move Rule Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveRule(idx, 'down')}
                                disabled={idx === rules.length - 1}
                                className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
                                title="Move Rule Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleDeleteRule(idx)}
                              className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                              title="Delete Rule"
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

          {/* Live Rule Match Tester */}
          <div className="bg-[#1b262c] border border-cyan-700/40 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Live Rule Match Tester</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Test how your active rule hierarchy evaluates any sample transaction in real time.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400">Test Merchant Name</label>
                <input
                  type="text"
                  placeholder="e.g. Tesco Express"
                  value={testMerchant}
                  onChange={(e) => setTestMerchant(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400">Test Notes</label>
                <input
                  type="text"
                  placeholder="e.g. weekly meal prep"
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400">Test Amount (£)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="35.50"
                  value={testAmount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setTestAmount(isNaN(val) ? '' : val);
                  }}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleTestRule}
                disabled={testing || (!testMerchant.trim() && !testNotes.trim())}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium disabled:opacity-40 transition-colors"
              >
                {testing ? 'Testing...' : 'Test Match'}
              </button>

              {testResult?.tested && (
                <div className="text-xs">
                  {testResult.matched ? (
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-950/50 border border-emerald-700/60 rounded-md text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        Matched Rule #{((testResult.ruleIndex ?? 0) + 1)} → Category:{' '}
                        <strong>{testResult.rule?.category}</strong>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 border border-slate-700 rounded-md text-slate-400">
                      <span>No rule matched. Would default to General/Existing.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Committed Spend Criteria */}
      {activeTab === 'committed' && (
        <div className="space-y-6">
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Fixed Committed Categories</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Check the categories that represent essential, fixed baseline living costs (Rent, Mortgages, Council Tax, Utilities, Subscriptions). These are isolated from discretionary variable spending across all dashboard metrics.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2">
              {masterCategories.map((cat) => {
                const isCommitted = committedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => handleToggleCommittedCategory(cat)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs text-left transition-colors ${
                      isCommitted
                        ? 'bg-cyan-950/40 border-cyan-700/60 text-cyan-200 font-semibold'
                        : 'bg-[#263238] border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-medium truncate">{cat}</span>
                    {isCommitted && <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exceptional / One-Off Categories */}
          <div className="bg-[#1b262c] border border-amber-800/40 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Exceptional / One-Off Spend Categories</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tag categories that represent rare, large project investments (e.g. <em>DIY Kitchen Renovation</em>, <em>Wedding</em>, <em>Car Purchase</em>). When excluded on the Dashboard, these large lump sums won't distort your normal day-to-day monthly run rates, and will instead appear in their own dedicated callout banner.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2">
              {masterCategories.map((cat) => {
                const isExceptional = exceptionalCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => handleToggleExceptionalCategory(cat)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs text-left transition-colors ${
                      isExceptional
                        ? 'bg-amber-950/50 border-amber-700/70 text-amber-200 font-semibold shadow-sm'
                        : 'bg-[#263238] border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-medium truncate">{cat}</span>
                    {isExceptional && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Categories, Sheets & System Health */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          {/* Custom Categories & Banks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Custom Categories */}
            <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Custom Categories</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add bespoke category labels tailored to your spending habits.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Pet Care, Gardening"
                  value={customCategoryInput}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomCategory();
                  }}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleAddCustomCategory}
                  disabled={!customCategoryInput.trim()}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto">
                {customCategories.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">No custom categories added yet.</span>
                ) : (
                  customCategories.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-300"
                    >
                      <span>{c}</span>
                      <button
                        onClick={() => handleDeleteCustomCategory(c)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Custom Banks */}
            <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Custom Banks & Accounts</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Define additional bank institutions or card issuers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Chase, First Direct"
                  value={customBankInput}
                  onChange={(e) => setCustomBankInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomBank();
                  }}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleAddCustomBank}
                  disabled={!customBankInput.trim()}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto">
                {customBanks.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">No custom banks added yet.</span>
                ) : (
                  customBanks.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-300"
                    >
                      <span>{b}</span>
                      <button
                        onClick={() => handleDeleteCustomBank(b)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Google Sheets Integration Card */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Monzo Google Sheets Sync Configuration</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Specify your personal or joint Monzo auto-export Google Sheet and tab name.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-medium text-slate-400">Google Sheet URL</label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={monzoSheetUrl}
                  onChange={(e) => setMonzoSheetUrl(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400">Worksheet Tab Name</label>
                <input
                  type="text"
                  placeholder="e.g. Monzo Transactions"
                  value={monzoSheetWorksheet}
                  onChange={(e) => setMonzoSheetWorksheet(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-[#263238] border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveGoogleSheetsConfig}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-medium transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Sheet Config</span>
              </button>
            </div>
          </div>

          {/* System Startup Health Audit Card */}
          <div className="bg-[#1b262c] border border-slate-700/50 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>System Startup Health Audit</span>
              </h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  health.healthy
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                    : 'bg-red-950/60 text-red-300 border border-red-700/60'
                }`}
              >
                {health.healthy ? 'All Systems Healthy' : 'Action Required'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono text-slate-300">
              <div className="p-2.5 bg-[#263238] rounded border border-slate-700/60">
                <div className="text-[10px] uppercase text-slate-400 font-sans">Data Directory</div>
                <div className="truncate mt-0.5" title={health.data_dir}>
                  {health.data_dir}
                </div>
              </div>

              <div className="p-2.5 bg-[#263238] rounded border border-slate-700/60">
                <div className="text-[10px] uppercase text-slate-400 font-sans">Transactions CSV</div>
                <div className="truncate mt-0.5" title={health.db_file}>
                  {health.db_file}
                </div>
              </div>

              <div className="p-2.5 bg-[#263238] rounded border border-slate-700/60">
                <div className="text-[10px] uppercase text-slate-400 font-sans">Settings File</div>
                <div className="truncate mt-0.5" title={health.settings_file}>
                  {health.settings_file}
                </div>
              </div>

              <div className="p-2.5 bg-[#263238] rounded border border-slate-700/60">
                <div className="text-[10px] uppercase text-slate-400 font-sans">Assets File</div>
                <div className="truncate mt-0.5" title={health.assets_file}>
                  {health.assets_file}
                </div>
              </div>
            </div>

            {health.notes && health.notes.length > 0 && (
              <div className="text-xs text-slate-400 pt-1 space-y-1">
                {health.notes.map((note, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
