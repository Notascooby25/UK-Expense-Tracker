import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  TrendingDown,
  Calendar,
  Plus,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Edit3,
  Sliders,
  DollarSign,
  Clock,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api } from '../api';
import {
  AccountScope,
  MortgageDataResponse,
  MortgageProfile,
  MortgageOverpayment,
} from '../types';
import { computeClientMortgageSummary, computeMonthlyRepayment } from '../utils/mortgageMath';

interface MortgagePageProps {
  scope: AccountScope;
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

const formatCurrencyPrecise = (val: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

interface MortgageFormFields {
  original_balance: string;
  current_balance: string;
  interest_rate: string;
  monthly_payment: string;
  remaining_term_months: number;
  deal_expiry_date: string;
  mortgage_type: string;
}

export const MortgagePage: React.FC<MortgagePageProps> = ({ scope }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MortgageDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Profile Edit Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState<MortgageFormFields>({
    original_balance: '240000',
    current_balance: '214500',
    interest_rate: '4.25',
    monthly_payment: '1180',
    remaining_term_months: 268,
    deal_expiry_date: '',
    mortgage_type: 'Fixed Rate',
  });

  const setFormFromProfile = (p: MortgageProfile) => {
    setProfileForm({
      original_balance: p.original_balance.toString(),
      current_balance: p.current_balance.toString(),
      interest_rate: p.interest_rate.toString(),
      monthly_payment: p.monthly_payment.toString(),
      remaining_term_months: p.remaining_term_months,
      deal_expiry_date: p.deal_expiry_date || '',
      mortgage_type: p.mortgage_type || 'Fixed Rate',
    });
  };

  // Overpayment Log Modal State
  const [showOverpaymentModal, setShowOverpaymentModal] = useState(false);
  const [overpayDate, setOverpayDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [overpayAmount, setOverpayAmount] = useState<string>('150.00');
  const [overpayType, setOverpayType] = useState<string>('Monthly');
  const [overpayNotes, setOverpayNotes] = useState<string>('');

  // Interactive Simulator State
  const [simMonthlyOverpay, setSimMonthlyOverpay] = useState<number>(100);
  const [simLumpSum, setSimLumpSum] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getMortgage(scope);
      setData(res);
      if (res.profile) {
        setFormFromProfile(res.profile);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load mortgage data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: MortgageProfile = {
        original_balance: parseFloat(profileForm.original_balance) || 0,
        current_balance: parseFloat(profileForm.current_balance) || 0,
        interest_rate: parseFloat(profileForm.interest_rate) || 0,
        monthly_payment: parseFloat(profileForm.monthly_payment) || 0,
        remaining_term_months: profileForm.remaining_term_months,
        deal_expiry_date: profileForm.deal_expiry_date,
        mortgage_type: profileForm.mortgage_type,
      };
      const res = await api.saveMortgageProfile(scope, payload);
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: res.profile,
              annual_allowance: res.profile ? Math.round(res.profile.current_balance * 10) / 100 : 0,
            }
          : null
      );
      setShowProfileModal(false);
      showToast('Mortgage details saved successfully');
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setError(message);
    }
  };

  // Handle Add Overpayment
  const handleAddOverpayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(overpayAmount);
    if (isNaN(amt) || amt <= 0) return;
    try {
      await api.addMortgageOverpayment(scope, {
        date: overpayDate,
        amount: amt,
        type: overpayType,
        notes: overpayNotes,
      });
      setShowOverpaymentModal(false);
      setOverpayNotes('');
      showToast(`Logged overpayment of ${formatCurrencyPrecise(amt)}`);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to log overpayment';
      setError(message);
    }
  };

  // Handle Delete Overpayment
  const handleDeleteOverpayment = async (id: string, amount: number) => {
    if (!window.confirm(`Delete overpayment of ${formatCurrencyPrecise(amount)}? This will restore the mortgage balance.`)) {
      return;
    }
    try {
      await api.deleteMortgageOverpayment(scope, id);
      showToast('Overpayment record removed');
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete record';
      setError(message);
    }
  };

  // Real-time client-side simulation based on profile & simulator inputs
  const simulation = useMemo(() => {
    if (!data?.profile || data.profile.current_balance <= 0) return null;
    return computeClientMortgageSummary(
      data.profile.current_balance,
      data.profile.interest_rate,
      data.profile.monthly_payment,
      data.profile.remaining_term_months,
      Number(simMonthlyOverpay) || 0,
      Number(simLumpSum) || 0
    );
  }, [data?.profile, simMonthlyOverpay, simLumpSum]);

  // Deal Expiry Countdown Helper
  const dealExpiryInfo = useMemo(() => {
    if (!data?.profile?.deal_expiry_date) return null;
    const expiry = new Date(data.profile.deal_expiry_date);
    if (isNaN(expiry.getTime())) return null;

    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = Math.round(diffDays / 30.4);

    const formattedDate = expiry.toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
    });

    if (diffDays <= 0) {
      return {
        isExpired: true,
        text: `Fixed rate expired on ${formattedDate} (Remortgage due!)`,
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
      };
    } else {
      return {
        isExpired: false,
        text: `Fixed until ${formattedDate} (~${diffMonths} mos remaining)`,
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      };
    }
  }, [data?.profile?.deal_expiry_date]);

  // Current calendar year total overpayments
  const currentYearOverpaid = useMemo(() => {
    if (!data?.overpayments) return 0;
    const currentYear = new Date().getFullYear();
    return data.overpayments
      .filter((op) => op.date && op.date.startsWith(String(currentYear)))
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [data?.overpayments]);

  const allowanceLimit = data?.annual_allowance || (data?.profile ? Math.round(data.profile.current_balance * 0.1) : 0);
  const allowancePctUsed = allowanceLimit > 0 ? Math.min(100, Math.round((currentYearOverpaid / allowanceLimit) * 100)) : 0;

  // Milestone payoff date with overpayment
  const payoffTargetDate = useMemo(() => {
    if (!simulation) return '';
    const date = new Date();
    date.setMonth(date.getMonth() + simulation.overpay_months);
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [simulation]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-[#0071e3]" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading mortgage data...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#121a21] text-white px-4 py-2.5 rounded-lg shadow-lg text-sm border border-gray-700 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#121a21] dark:text-white">
                Mortgage Tracker
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Track your loan balance, monitor deal expiries, and simulate overpayments ({scope} Scope)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data?.profile && (
            <button
              onClick={() => {
                setFormFromProfile(data.profile!);
                setShowProfileModal(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border border-[#d6dfe5] dark:border-[#32424a] bg-white dark:bg-[#1b262c] text-[#121a21] dark:text-white hover:bg-gray-50 dark:hover:bg-[#263238] transition-colors"
            >
              <Edit3 className="w-4 h-4 text-gray-500" />
              Edit Mortgage Details
            </button>
          )}

          <button
            onClick={() => setShowOverpaymentModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#10b981] hover:bg-[#059669] text-white shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Overpayment
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      {!data?.profile ? (
        /* Empty State */
        <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
            <Home className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[#121a21] dark:text-white">
            No Mortgage Profile Set Up for {scope}
          </h2>
          <p className="max-w-md mx-auto text-sm text-gray-500 dark:text-gray-400">
            Enter your current balance, interest rate, and term once so the tracker can automatically project schedules and calculate your overpayment savings.
          </p>
          <button
            onClick={() => setShowProfileModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[#0071e3] hover:bg-[#0077ed] text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Set Up Mortgage Profile
          </button>
        </div>
      ) : (
        <>
          {/* 1. Core Profile Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Current Balance */}
            <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                Current Balance
              </span>
              <div className="text-2xl font-bold text-[#121a21] dark:text-white">
                {formatCurrency(data.profile.current_balance)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Original loan: {formatCurrency(data.profile.original_balance)}
              </div>
            </div>

            {/* Interest Rate */}
            <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                Interest Rate
              </span>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {data.profile.interest_rate.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {data.profile.mortgage_type}
              </div>
            </div>

            {/* Standard Monthly Payment */}
            <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                Monthly Payment
              </span>
              <div className="text-2xl font-bold text-[#121a21] dark:text-white">
                {formatCurrencyPrecise(data.profile.monthly_payment)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Capital & Interest
              </div>
            </div>

            {/* Remaining Term */}
            <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-5 shadow-sm space-y-1">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                Remaining Term
              </span>
              <div className="text-2xl font-bold text-[#121a21] dark:text-white">
                {Math.floor(data.profile.remaining_term_months / 12)} yrs {data.profile.remaining_term_months % 12} mos
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {data.profile.remaining_term_months} total payments left
              </div>
            </div>
          </div>

          {/* Deal Expiry Pill Banner */}
          {dealExpiryInfo && (
            <div className={`flex items-center justify-between p-3.5 px-4 rounded-xl border text-sm font-medium ${dealExpiryInfo.badgeClass}`}>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span>{dealExpiryInfo.text}</span>
              </div>
              <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
                Fixed Rate Expiry
              </span>
            </div>
          )}

          {/* 2. Overpayment Simulator Card */}
          <div className="bg-white dark:bg-[#1b262c] border border-blue-200 dark:border-blue-900/50 rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-lg">
                <Zap className="w-5 h-5" />
                <h2>Overpayment Simulator & Impact Calculator</h2>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-900">
                Live Dynamic Calculation
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Controls Column */}
              <div className="lg:col-span-6 space-y-5">
                {/* Regular Monthly Overpayment */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Regular Monthly Overpayment
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">+£</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={simMonthlyOverpay}
                        onChange={(e) => setSimMonthlyOverpay(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-24 px-2 py-0.5 text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded text-right tabular-nums"
                      />
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">/mo</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="5"
                    value={Math.min(1000, simMonthlyOverpay)}
                    onChange={(e) => setSimMonthlyOverpay(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>£0</span>
                    <span>£250</span>
                    <span>£500</span>
                    <span>£750</span>
                    <span>£1,000</span>
                  </div>
                </div>

                {/* One-off Lump Sum */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center justify-between">
                    <span>One-off Lump Sum Overpayment</span>
                    <span className="text-xs text-gray-400 font-normal">Optional</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-400 text-sm">£</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={simLumpSum}
                      onChange={(e) => setSimLumpSum(e.target.value)}
                      placeholder="e.g. 2000.00"
                      className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Simulation Result KPI Cards */}
              <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4 text-center space-y-1">
                  <div className="text-xs uppercase font-semibold text-emerald-800 dark:text-emerald-300">
                    Time Shaved Off
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {simulation
                      ? `${Math.floor(simulation.months_saved / 12)} yrs ${simulation.months_saved % 12} mos`
                      : '0 yrs 0 mos'}
                  </div>
                  <div className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Free by {payoffTargetDate || '—'}
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4 text-center space-y-1">
                  <div className="text-xs uppercase font-semibold text-emerald-800 dark:text-emerald-300">
                    Total Interest Saved
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(simulation?.interest_saved || 0)}
                  </div>
                  <div className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    Kept in your pocket
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Payoff Trajectory Comparison Graph */}
          {simulation && simulation.trajectory.length > 0 && (
            <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base text-[#121a21] dark:text-white">
                    Mortgage Payoff Trajectory
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Comparing standard repayment timeline against your accelerated overpayment plan
                  </p>
                </div>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={simulation.trajectory}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="year"
                      tickFormatter={(yr) => `Yr ${yr}`}
                      stroke="#888888"
                      fontSize={12}
                    />
                    <YAxis
                      tickFormatter={(val) => `£${(val / 1000).toFixed(0)}k`}
                      stroke="#888888"
                      fontSize={12}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        formatCurrency(Number(value) || 0),
                        name === 'baseline_balance' ? 'Standard Path' : 'With Overpayments',
                      ]}
                      labelFormatter={(label) => `Timeline: Year ${label}`}
                      contentStyle={{
                        backgroundColor: '#1b262c',
                        borderColor: '#32424a',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      formatter={(val) => (val === 'baseline_balance' ? 'Standard Plan (£0 extra)' : 'Accelerated Plan')}
                    />
                    <Line
                      type="monotone"
                      dataKey="baseline_balance"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="overpay_balance"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 4. 10% Annual Allowance Progress & Overpayments Log */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 10% Allowance Card */}
            <div className="lg:col-span-4 bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-5 shadow-sm space-y-3">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
                UK 10% Penalty-Free Allowance
              </span>
              <div className="text-xl font-bold text-[#121a21] dark:text-white">
                {formatCurrency(allowanceLimit)} / year
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Most UK mortgage lenders allow up to 10% of the outstanding balance to be overpaid each year without penalty charges.
              </p>

              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-gray-600 dark:text-gray-400">Overpaid in {new Date().getFullYear()}:</span>
                  <span className="text-[#121a21] dark:text-white font-bold">{formatCurrencyPrecise(currentYearOverpaid)}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#10b981] h-full transition-all duration-300"
                    style={{ width: `${allowancePctUsed}%` }}
                  />
                </div>
                <div className="text-[11px] text-right text-gray-400">
                  {allowancePctUsed}% of annual allowance used
                </div>
              </div>
            </div>

            {/* Overpayments Table */}
            <div className="lg:col-span-8 bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-[#121a21] dark:text-white">
                    Logged Overpayments History
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Independent log of extra payments made towards this mortgage
                  </p>
                </div>
                <button
                  onClick={() => setShowOverpaymentModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#10b981] hover:bg-[#059669] text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Log Payment
                </button>
              </div>

              {data.overpayments.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  No overpayments logged yet. Click &quot;Log Payment&quot; when you make an extra payment.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-xs uppercase font-semibold text-gray-400">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Notes</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {data.overpayments.map((op) => (
                        <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="py-2.5 px-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                            {op.date}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                op.type === 'Lump Sum'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              }`}
                            >
                              {op.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrencyPrecise(op.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                            {op.notes || '—'}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-right">
                            <button
                              onClick={() => handleDeleteOverpayment(op.id, op.amount)}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Delete overpayment record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Edit Mortgage Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-[#121a21] dark:text-white">
                Edit Mortgage Profile ({scope})
              </h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Original Loan Amount (£)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={profileForm.original_balance}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, original_balance: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Current Balance (£)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={profileForm.current_balance}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, current_balance: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Interest Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.01"
                    required
                    value={profileForm.interest_rate}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, interest_rate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Monthly Payment (£)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={profileForm.monthly_payment}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, monthly_payment: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Remaining Term
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        placeholder="Years"
                        value={Math.floor(profileForm.remaining_term_months / 12) || ''}
                        onChange={(e) => {
                          const yrs = Math.max(0, parseInt(e.target.value, 10) || 0);
                          const remMonths = profileForm.remaining_term_months % 12;
                          setProfileForm({
                            ...profileForm,
                            remaining_term_months: Math.max(1, yrs * 12 + remMonths),
                          });
                        }}
                        className="w-full pl-3 pr-8 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                      />
                      <span className="absolute right-2 top-2 text-xs text-gray-400">yrs</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="11"
                        placeholder="Months"
                        value={profileForm.remaining_term_months % 12 || ''}
                        onChange={(e) => {
                          const mos = Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0));
                          const yrs = Math.floor(profileForm.remaining_term_months / 12);
                          setProfileForm({
                            ...profileForm,
                            remaining_term_months: Math.max(1, yrs * 12 + mos),
                          });
                        }}
                        className="w-full pl-3 pr-8 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                      />
                      <span className="absolute right-2 top-2 text-xs text-gray-400">mos</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Total: {profileForm.remaining_term_months} months
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Fixed Deal Expiry Date
                  </label>
                  <input
                    type="date"
                    value={profileForm.deal_expiry_date}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, deal_expiry_date: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Mortgage Type
                </label>
                <select
                  value={profileForm.mortgage_type}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, mortgage_type: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                >
                  <option value="Fixed Rate">Fixed Rate (Recommended)</option>
                  <option value="Variable Rate">Variable Rate</option>
                  <option value="Tracker">Tracker</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-[#0071e3] hover:bg-[#0077ed] text-white shadow-sm transition-colors"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Overpayment Modal */}
      {showOverpaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#1b262c] border border-[#d6dfe5] dark:border-[#32424a] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-[#121a21] dark:text-white">
                Log Mortgage Overpayment
              </h3>
              <button
                onClick={() => setShowOverpaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddOverpayment} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Payment Date
                </label>
                <input
                  type="date"
                  required
                  value={overpayDate}
                  onChange={(e) => setOverpayDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Amount (£)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={overpayAmount}
                    onChange={(e) => setOverpayAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Payment Type
                  </label>
                  <select
                    value={overpayType}
                    onChange={(e) => setOverpayType(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                  >
                    <option value="Monthly">Monthly Regular</option>
                    <option value="Lump Sum">Lump Sum</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Regular standing order, Work bonus"
                  value={overpayNotes}
                  onChange={(e) => setOverpayNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#263238] border border-[#d6dfe5] dark:border-[#32424a] text-[#121a21] dark:text-white"
                />
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                Logging this overpayment will directly decrement your saved mortgage balance and update your annual 10% allowance tracking.
              </p>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowOverpaymentModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-[#10b981] hover:bg-[#059669] text-white shadow-sm transition-colors"
                >
                  Confirm Overpayment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
