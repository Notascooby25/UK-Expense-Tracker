import {
  AccountScope,
  AppSettings,
  BootstrapPayload,
  CategoryDrilldownPayload,
  DashboardPayload,
  FilterPreset,
  IntelligencePayload,
  TransactionRow,
  WealthPayload,
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
      months: params.months.join(','),
      include_categories: params.include_categories.join(','),
      exclude_categories: params.exclude_categories.join(','),
    });
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
      months: params.months.join(','),
      include_categories: params.include_categories.join(','),
      exclude_categories: params.exclude_categories.join(','),
    });
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
      categories: (params.categories || []).join(','),
      transaction_type: params.transaction_type || 'Both',
      financial_year: params.financial_year || 'All',
      date_from: params.date_from || '',
      date_to: params.date_to || '',
      limit: String(params.limit ?? 100),
      offset: String(params.offset ?? 0),
    });
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
    }
  ) {
    const q = new URLSearchParams({
      scope,
      search: params.search || '',
      notes: params.notes || '',
      bank: params.bank || 'All',
      category: params.category || 'All',
      categories: (params.categories || []).join(','),
      transaction_type: params.transaction_type || 'Both',
      financial_year: params.financial_year || 'All',
      date_from: params.date_from || '',
      date_to: params.date_to || '',
    });
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
    return requestJson<{
      saved: boolean;
      new_count: number;
      updated_count: number;
      new_rows: TransactionRow[];
      updated_rows: TransactionRow[];
    }>(`/api/sync/gsheets?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: JSON.stringify({ sheet_url, worksheet_name }),
    });
  },

  importCsvFile(scope: AccountScope, file: File, source_format: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('source_format', source_format);
    return requestJson<{
      saved: boolean;
      new_count: number;
      updated_count: number;
      new_rows: TransactionRow[];
    }>(`/api/sync/import-file?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: form,
    });
  },

  importPastedText(scope: AccountScope, pasted_text: string, source_format: string) {
    return requestJson<{
      saved: boolean;
      new_count: number;
      updated_count: number;
      new_rows: TransactionRow[];
    }>(`/api/sync/import-paste?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      body: JSON.stringify({ pasted_text, source_format }),
    });
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

  saveWealthBalances(scope: AccountScope, month: string, balances: Record<string, number>) {
    return requestJson<{ saved: boolean; wealth: WealthPayload }>(
      `/api/wealth/balances?scope=${encodeURIComponent(scope)}`,
      {
        method: 'POST',
        body: JSON.stringify({ month, balances }),
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
};
