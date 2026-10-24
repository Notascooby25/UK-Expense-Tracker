import {
  AccountScope,
  AppSettings,
  BootstrapPayload,
  CategoryDrilldownPayload,
  ChangelogEntry,
  DashboardPayload,
  FilterPreset,
  IntelligencePayload,
  SyncResponse,
  TransactionRow,
  WealthPayload,
  MortgageDataResponse,
  MortgageProfile,
  MortgageOverpayment,
  MortgageCalculationParams,
  MortgageSummary,
} from './types';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) detail = String(errBody.detail);
    } catch {
      // ignore JSON parse error
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getAuthStatus() {
    return requestJson<{
      authenticated: boolean;
      username: string | null;
      notice: string | null;
      require_auth_secrets: boolean;
      version: string;
      changelog?: ChangelogEntry[];
    }>('/api/auth/status');
  },

  login(username: string, password: string, remember_me: boolean) {
    return requestJson<{ authenticated: boolean; username: string; notice: string | null }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password, remember_me }),
      }
    );
  },

  logout() {
    return requestJson<{ authenticated: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  getBootstrap(scope: AccountScope) {
    return requestJson<BootstrapPayload>(`/api/bootstrap?scope=${encodeURIComponent(scope)}`);
  },

  getDashboard(
    scope: AccountScope,
    params: {
      time_mode: string;
      selected_period: string;
      bank: string;
      hide_internal: boolean;
      net_spend_mode: boolean;
      ignore_legacy: boolean;
      exclude_exceptional?: boolean;
      months: string[];
      include_categories: string[];
      exclude_categories: string[];
    }
  ) {
    const q = new URLSearchParams({
      scope,
      time_mode: params.time_mode,
      selected_period: params.selected_period,
      bank: params.bank,
      hide_internal: String(params.hide_internal),
      net_spend_mode: String(params.net_spend_mode),
      ignore_legacy: String(params.ignore_legacy),
      exclude_exceptional: String(params.exclude_exceptional ?? true),
    });
    (params.months || []).forEach((m) => q.append('months', m));
    (params.include_categories || []).forEach((c) => q.append('include_categories', c));
    (params.exclude_categories || []).forEach((c) => q.append('exclude_categories', c));
    return requestJson<DashboardPayload>(`/api/dashboard?${q.toString()}`);
  },

  getCategoryDrilldown(
    scope: AccountScope,
    category: string,
    params: {
      time_mode: string;
      selected_period: string;
      bank: string;
      hide_internal: boolean;
      net_spend_mode: boolean;
      ignore_legacy: boolean;
      exclude_exceptional?: boolean;
      months: string[];
      include_categories: string[];
      exclude_categories: string[];
    }
  ) {
    const q = new URLSearchParams({
      scope,
      category,
      time_mode: params.time_mode,
      selected_period: params.selected_period,
      bank: params.bank,
      hide_internal: String(params.hide_internal),
      net_spend_mode: String(params.net_spend_mode),
      ignore_legacy: String(params.ignore_legacy),
      exclude_exceptional: String(params.exclude_exceptional ?? true),
    });
    (params.months || []).forEach((m) => q.append('months', m));
    (params.include_categories || []).forEach((c) => q.append('include_categories', c));
    (params.exclude_categories || []).forEach((c) => q.append('exclude_categories', c));
    return requestJson<CategoryDrilldownPayload>(`/api/dashboard/drilldown?${q.toString()}`);
  },

  getTransactions(
    scope: AccountScope,
    params: {
      search?: string;
      notes?: string;
      bank?: string;
      category?: string;
      categories?: string[];
      transaction_type?: string;
      financial_year?: string;
      date_from?: string;
      date_to?: string;
      months?: string[];
      limit?: number;
      offset?: number;
    }
  ) {
    const q = new URLSearchParams({
      scope,
      search: params.search || '',
      notes: params.notes || '',
      bank: params.bank || 'All',
      category: params.category || 'All',
      transaction_type: params.transaction_type || 'Both',
      financial_year: params.financial_year || 'All',
      date_from: params.date_from || '',
      date_to: params.date_to || '',
      limit: String(params.limit ?? 100),
      offset: String(params.offset ?? 0),
    });
    (params.categories || []).forEach((c) => q.append('categories', c));
    (params.months || []).forEach((m) => q.append('months', m));
    return requestJson<{
      total: number;
      offset: number;
      limit: number;
      rows: TransactionRow[];
    }>(`/api/transactions?${q.toString()}`);
  },

  getExportUrl(
    scope: AccountScope,
    params: {
      search?: string;
      notes?: string;
      bank?: string;
      category?: string;
      categories?: string[];
      transaction_type?: string;
      financial_year?: string;
      date_from?: string;
      date_to?: string;
      months?: string[];
    }
  ) {
    const q = new URLSearchParams({
      scope,
      search: params.search || '',
      notes: params.notes || '',
      bank: params.bank || 'All',
      category: params.category || 'All',
      transaction_type: params.transaction_type || 'Both',
      financial_year: params.financial_year || 'All',
      date_from: params.date_from || '',
      date_to: params.date_to || '',
    });
    (params.categories || []).forEach((c) => q.append('categories', c));
    (params.months || []).forEach((m) => q.append('months', m));
    return `/api/transactions/export?${q.toString()}`;
  },

  createTransaction(
    scope: AccountScope,
    payload: {
      Date: string;
      Name: string;
      Amount: number;
      Transaction_Type: string;
      Bank: string;
      Category: string;
      Notes: string;
      Is_Subscription: boolean;
    }
  ) {
    return requestJson<{ saved: boolean; row: TransactionRow; total: number }>(
      `/api/transactions?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  patchTransaction(
    scope: AccountScope,
    rowId: number,
    patch: Partial<{
      Date: string;
      Name: string;
      Amount: number;
      Transaction_Type: string;
      Bank: string;
      Category: string;
      Notes: string;
      Is_Subscription: boolean;
    }>
  ) {
    return requestJson<{ saved: boolean; row: TransactionRow }>(
      `/api/transactions/${rowId}?scope=${encodeURIComponent(scope)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
  },

  bulkUpdateTransactions(
    scope: AccountScope,
    payload: {
      action: 'update' | 'delete';
      row_ids: number[];
      category?: string;
      transaction_type?: string;
      is_subscription?: boolean;
    }
  ) {
    return requestJson<{ saved: boolean; affected: number; total: number }>(
      `/api/transactions/bulk?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  syncGoogleSheets(scope: AccountScope, sheet_url: string, worksheet_name: string) {
    return requestJson<SyncResponse>(`/api/sync/gsheets?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: JSON.stringify({ sheet_url, worksheet_name }),
    });
  },

  importCsvFile(scope: AccountScope, file: File, source_format: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('source_format', source_format);
    return requestJson<SyncResponse>(`/api/sync/import-file?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: form,
    });
  },

  importPastedText(scope: AccountScope, pasted_text: string, source_format: string) {
    return requestJson<SyncResponse>(`/api/sync/import-paste?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: JSON.stringify({ pasted_text, source_format }),
    });
  },

  resolveSyncConflicts(
    scope: AccountScope,
    payload:
      | {
          resolutions: Array<{ row_id: number; category: string; name?: string; memorize?: boolean }>;
          memorize_all?: boolean;
        }
      | Array<{ row_id: number; category: string; name?: string; memorize?: boolean }>
  ) {
    const body = Array.isArray(payload) ? { resolutions: payload } : payload;
    return requestJson<{ saved: boolean; applied_count: number }>(
      `/api/sync/resolve-conflicts?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  },

  getIntelligence(scope: AccountScope) {
    return requestJson<IntelligencePayload>(
      `/api/intelligence?scope=${encodeURIComponent(scope)}`
    );
  },

  executeIntelligenceAction(
    scope: AccountScope,
    payload: {
      action: string;
      category?: string;
      merchant?: string;
      merchants?: string[];
      from_category?: string;
      to_category?: string;
    }
  ) {
    return requestJson<{ saved: boolean; intelligence: IntelligencePayload }>(
      `/api/intelligence/action?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getWealth(scope: AccountScope, ignore_legacy = true, timeframe = 'All Time') {
    const q = new URLSearchParams({
      scope,
      ignore_legacy: String(ignore_legacy),
      timeframe,
    });
    return requestJson<WealthPayload>(`/api/wealth?${q.toString()}`);
  },

  saveWealthBalances(
    scope: AccountScope,
    dateOrPayload:
      | string
      | {
          date: string;
          asset_balances?: Record<string, number>;
          debt_balances?: Record<string, number>;
          loans_metadata?: Record<string, { original_amount: number }>;
          balances?: Record<string, number>;
        },
    balances?: Record<string, number>
  ) {
    let bodyObj: Record<string, unknown>;
    if (typeof dateOrPayload === 'string') {
      bodyObj = { date: dateOrPayload, month: dateOrPayload, balances: balances || {} };
    } else {
      bodyObj = {
        month: dateOrPayload.date,
        ...dateOrPayload,
      };
    }
    return requestJson<{ saved: boolean; wealth: WealthPayload }>(
      `/api/wealth/balances?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(bodyObj),
      }
    );
  },

  deleteWealthSnapshot(scope: AccountScope, dateOrMonth: string, target = 'all') {
    return requestJson<{ saved: boolean; wealth: WealthPayload }>(
      `/api/wealth/balances/${encodeURIComponent(dateOrMonth)}?scope=${encodeURIComponent(scope)}&target=${encodeURIComponent(target)}`,
      {
        method: 'DELETE',
      }
    );
  },

  deleteWealthMonth(scope: AccountScope, month: string, target = 'all') {
    return this.deleteWealthSnapshot(scope, month, target);
  },

  manageWealthAccount(
    scope: AccountScope,
    payload: {
      action: 'delete' | 'rename';
      account: string;
      new_name?: string;
      account_type?: 'asset' | 'debt';
    }
  ) {
    return requestJson<{ saved: boolean; wealth: WealthPayload }>(
      `/api/wealth/accounts?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updateSettings(scope: AccountScope, patch: Partial<AppSettings>) {
    return requestJson<{
      saved: boolean;
      settings: AppSettings;
      master_categories: string[];
    }>(`/api/settings?scope=${encodeURIComponent(scope)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  applyRulesToAll(scope: AccountScope) {
    return requestJson<{ saved: boolean; total: number }>(
      `/api/settings/apply-rules?scope=${encodeURIComponent(scope)}`,
      { method: 'POST' }
    );
  },

  testRuleMatch(scope: AccountScope, name: string, notes: string, amount: number) {
    return requestJson<{
      matched: boolean;
      rule_index: number | null;
      rule: {
        name_contains: string;
        notes_contains: string;
        max_amount: number;
        category: string;
      } | null;
    }>(`/api/settings/test-rule?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: JSON.stringify({ name, notes, amount }),
    });
  },

  updateFilterPresets(scope: AccountScope, presets: Record<string, FilterPreset>) {
    return requestJson<{ saved: boolean; saved_filters: Record<string, FilterPreset> }>(
      `/api/filters?scope=${encodeURIComponent(scope)}`,
      {
        method: 'PUT',
        body: JSON.stringify(presets),
      }
    );
  },

  getMortgage(scope: AccountScope) {
    return requestJson<MortgageDataResponse>(`/api/mortgage?scope=${encodeURIComponent(scope)}`);
  },

  saveMortgageProfile(scope: AccountScope, profile: MortgageProfile) {
    return requestJson<{ profile: MortgageProfile; overpayments: MortgageOverpayment[] }>(
      `/api/mortgage/profile?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(profile),
      }
    );
  },

  addMortgageOverpayment(
    scope: AccountScope,
    overpayment: Omit<MortgageOverpayment, 'id'>
  ) {
    return requestJson<{ profile: MortgageProfile | null; overpayments: MortgageOverpayment[] }>(
      `/api/mortgage/overpayments?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify(overpayment),
      }
    );
  },

  updateMortgageOverpayment(
    scope: AccountScope,
    overpaymentId: string,
    overpayment: Partial<MortgageOverpayment>
  ) {
    return requestJson<{ profile: MortgageProfile | null; overpayments: MortgageOverpayment[] }>(
      `/api/mortgage/overpayments/${encodeURIComponent(overpaymentId)}?scope=${encodeURIComponent(scope)}`,
      {
        method: 'PUT',
        body: JSON.stringify(overpayment),
      }
    );
  },

  deleteMortgageOverpayment(scope: AccountScope, overpaymentId: string) {
    return requestJson<{ status: string; deleted_id: string }>(
      `/api/mortgage/overpayments/${encodeURIComponent(overpaymentId)}?scope=${encodeURIComponent(scope)}`,
      { method: 'DELETE' }
    );
  },

  calculateMortgage(params: MortgageCalculationParams) {
    return requestJson<MortgageSummary>('/api/mortgage/calculate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};
