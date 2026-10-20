export type AccountScope = 'Personal' | 'Joint';
export type NavPage = 'dashboard' | 'transactions' | 'intelligence' | 'wealth' | 'settings' | 'mortgage';

export interface AutoRule {
  name_contains: string;
  notes_contains: string;
  max_amount: number;
  category: string;
}

export interface AppSettings {
  ignore_suggestions: string[];
  ignore_recurring: string[];
  custom_categories: string[];
  custom_banks: string[];
  committed_categories: string[];
  exceptional_categories?: string[];
  committed_presets: Record<string, string[]>;
  auto_rules: AutoRule[];
  monzo_sheet_url: string;
  monzo_sheet_worksheet: string;
}

export interface FilterPreset {
  type?: string;
  fy?: string;
  cats?: string[];
  merchant?: string;
  notes?: string;
  bank?: string;
  date_from?: string;
  date_to?: string;
}

export interface TransactionsFilterHandoff {
  category?: string;
  bank?: string;
  financial_year?: string;
  date_from?: string;
  date_to?: string;
  months?: string[];
}

export interface StartupHealth {
  healthy: boolean;
  errors: string[];
  notes: string[];
  data_dir: string;
  db_file: string;
  settings_file: string;
  filters_file: string;
  assets_file: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export interface BootstrapPayload {
  scope: AccountScope;
  scopes: AccountScope[];
  version: string;
  changelog?: ChangelogEntry[];
  total_transactions: number;
  master_categories: string[];
  master_banks: string[];
  financial_years: string[];
  settings: AppSettings;
  saved_filters: Record<string, FilterPreset>;
  health: StartupHealth;
}

export interface TransactionRow {
  row_id: number;
  Date: string;
  Date_Display: string;
  Name: string;
  Amount: number;
  Transaction_Type: 'Expense' | 'Income' | string;
  Bank: string;
  Category: string;
  Notes: string;
  Financial_Year: string;
  Is_Subscription: boolean;
}

export interface DashboardPayload {
  filter_options: {
    financial_years: string[];
    calendar_years: string[];
    banks: string[];
    rolling_periods: string[];
  };
  exceptional_summary?: Array<{
    category: string;
    total: number;
    count: number;
  }>;
  metrics: {
    total_income: number;
    committed_expenses: number;
    variable_expenses: number;
    net_expenses: number;
    net_flow: number;
    months_in_period: number;
    avg_income: number;
    avg_baseline: number;
    spare_cash: number;
    avg_monthly_spend: number;
  };
  recent_delta: {
    month: string;
    committed_actual: number;
    committed_avg: number;
    committed_diff: number;
    variable_actual: number;
    variable_avg: number;
    variable_diff: number;
  } | null;
  cashflow_breakdown: {
    income_total: number;
    income: Array<{
      category: string;
      avg_monthly: number;
      merchants: Array<{ name: string; avg_monthly: number }>;
    }>;
    committed_total: number;
    committed: Array<{ category: string; avg_monthly: number }>;
    variable_total: number;
    variable: Array<{ category: string; avg_monthly: number }>;
    savings: Array<{
      category: string;
      avg_monthly: number;
      merchants: Array<{ name: string; avg_monthly: number }>;
    }>;
  };
  charts: {
    monthly_cashflow: Array<{
      month: string;
      income: number;
      committed: number;
      variable: number;
      total_expense: number;
    }>;
    cumulative_wealth: Array<{ date: string; cumulative: number }>;
    top_categories: Array<{ category: string; amount: number }>;
    top_merchants: Array<{ merchant: string; amount: number }>;
    bank_category_breakdown: Array<{ bank: string; category: string; amount: number }>;
  };
}

export interface CategoryDrilldownPayload {
  category: string;
  total_expenditure: number;
  total_refunds: number;
  net_cost: number;
  monthly_average: number;
  merchants: Array<{
    Name: string;
    Transaction_Type: string;
    Total_Amount: number;
    Transactions: number;
    Last_Date: string;
    Is_Subscription: boolean;
  }>;
  transactions: TransactionRow[];
}

export interface IntelligencePayload {
  recurring_candidates: Array<{
    Merchant: string;
    Category: string;
    Freq_Months: number;
    Avg_Monthly: number;
  }>;
  ignored_recurring: string[];
  subscription_candidates: Array<{
    merchant: string;
    count: number;
    total_amount: number;
    category: string;
  }>;
  standardisation_suggestions: Array<{
    Merchant: string;
    From: string;
    Suggested: string;
  }>;
}

export interface LoanSummary {
  name: string;
  original_amount: number;
  current_balance: number;
  repaid_amount: number;
  pct_repaid: number;
}

export interface WealthPayload {
  known_assets: string[];
  known_debts?: string[];
  assets_by_month: Record<string, Record<string, number>>;
  debts_by_month?: Record<string, Record<string, number>>;
  latest_month: string;
  latest_date?: string;
  latest_balances: Record<string, number>;
  latest_debts?: Record<string, number>;
  latest_assets_total?: number;
  latest_debts_total?: number;
  latest_net_worth: number;
  net_worth_delta: number;
  loans_summary?: LoanSummary[];
  net_worth_series: Array<{
    month: string;
    date?: string;
    total: number;
    assets?: number;
    debts?: number;
  }>;
  asset_timeline: Array<Record<string, string | number>>;
  internal_timeline: Array<Record<string, string | number>>;
  internal_transactions: Array<{
    Date: string;
    Name: string;
    Amount: number;
    Transaction_Type: string;
    Bank: string;
    Category: string;
    Notes: string;
  }>;
}

export interface SyncConflict {
  _row_id: number;
  Date: string;
  Date_Display: string;
  Name: string;
  Amount: number;
  current_category: string;
  incoming_category: string;
}

export interface ConflictResolutionItem {
  row_id: number;
  category: string;
  name?: string;
  memorize?: boolean;
}

export interface ResolveConflictsRequest {
  resolutions: ConflictResolutionItem[];
  memorize_all?: boolean;
}

export interface SyncResponse {
  saved: boolean;
  new_count: number;
  updated_count: number;
  new_rows: TransactionRow[];
  updated_rows?: TransactionRow[];
  conflicts?: SyncConflict[];
}

export interface MortgageProfile {
  original_balance: number;
  current_balance: number;
  interest_rate: number;
  monthly_payment: number;
  remaining_term_months: number;
  deal_expiry_date: string;
  mortgage_type: string;
  updated_at?: string;
}

export interface MortgageOverpayment {
  id: string;
  date: string;
  amount: number;
  type: string;
  notes: string;
}

export interface MortgageTrajectoryPoint {
  year: number;
  month: number;
  baseline_balance: number;
  current_balance?: number;
  overpay_balance: number;
}

export interface MortgageSummary {
  principal: number;
  unadjusted_principal?: number;
  annual_rate_pct: number;
  monthly_payment: number;
  baseline_months: number;
  current_months?: number;
  overpay_months: number;
  past_overpayments?: number;
  past_interest_saved?: number;
  past_months_saved?: number;
  simulated_interest_saved?: number;
  simulated_months_saved?: number;
  months_saved: number;
  years_saved: number;
  baseline_interest: number;
  current_interest?: number;
  overpay_interest: number;
  interest_saved: number;
  trajectory: MortgageTrajectoryPoint[];
}

export interface MortgageDataResponse {
  profile: MortgageProfile | null;
  overpayments: MortgageOverpayment[];
  summary: MortgageSummary | null;
  annual_allowance: number;
}

export interface MortgageCalculationParams {
  principal: number;
  annual_rate_pct: number;
  monthly_payment: number;
  term_months: number;
  monthly_overpayment?: number;
  lump_sum?: number;
  past_overpayments?: number;
}
