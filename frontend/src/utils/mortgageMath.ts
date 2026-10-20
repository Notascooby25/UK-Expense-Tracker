import { MortgageSummary, MortgageTrajectoryPoint } from '../types';

export function computeMonthlyRepayment(
  principal: number,
  annualRatePct: number,
  termMonths: number
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRatePct <= 0) return Math.round((principal / termMonths) * 100) / 100;

  const monthlyRate = annualRatePct / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  const denominator = factor - 1;
  if (denominator === 0) return Math.round((principal / termMonths) * 100) / 100;

  return Math.round((principal * (monthlyRate * factor)) / denominator * 100) / 100;
}

interface MonthPoint {
  month: number;
  remaining_balance: number;
  total_interest_paid: number;
}

function simulateSchedule(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number,
  maxMonths: number,
  monthlyOverpayment = 0,
  lumpSum = 0
): MonthPoint[] {
  if (principal <= 0 || maxMonths <= 0) return [];

  const monthlyRate = annualRatePct > 0 ? annualRatePct / 100 / 12 : 0;
  let currentBalance = principal;
  let totalInterest = 0;
  const schedule: MonthPoint[] = [];

  const effectiveMonthlyPayment = Math.max(monthlyPayment, currentBalance * monthlyRate);

  for (let m = 1; m <= maxMonths; m++) {
    if (currentBalance <= 0) break;

    if (m === 1 && lumpSum > 0) {
      const actualLump = Math.min(currentBalance, lumpSum);
      currentBalance -= actualLump;
      if (currentBalance <= 0) {
        schedule.push({ month: 1, remaining_balance: 0, total_interest_paid: 0 });
        break;
      }
    }

    const monthInterest = currentBalance * monthlyRate;
    totalInterest += monthInterest;

    const totalPayment = effectiveMonthlyPayment + monthlyOverpayment;
    const principalReduction = totalPayment - monthInterest;

    if (principalReduction >= currentBalance) {
      currentBalance = 0;
      schedule.push({
        month: m,
        remaining_balance: 0,
        total_interest_paid: Math.round(totalInterest * 100) / 100,
      });
      break;
    } else {
      currentBalance -= principalReduction;
      schedule.push({
        month: m,
        remaining_balance: Math.round(currentBalance * 100) / 100,
        total_interest_paid: Math.round(totalInterest * 100) / 100,
      });
    }
  }

  return schedule;
}

export function computeClientMortgageSummary(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number,
  termMonths: number,
  monthlyOverpayment = 0,
  lumpSum = 0,
  pastOverpayments = 0
): MortgageSummary {
  const unadjustedPrincipal =
    Math.round((principal + Math.max(0, pastOverpayments)) * 100) / 100;

  // 1. Original Baseline schedule without past overpayments
  const baseline = simulateSchedule(
    unadjustedPrincipal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    0,
    0
  );

  // 2. Current Actual schedule with past overpayments already deducted
  const current = simulateSchedule(
    principal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    0,
    0
  );

  // 3. Accelerated schedule with future simulated overpayments
  const overpay = simulateSchedule(
    principal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    monthlyOverpayment,
    lumpSum
  );

  const baselineMonths = baseline.length;
  const currentMonths = current.length;
  const overpayMonths = overpay.length;

  const baselineInterest =
    baseline.length > 0 ? baseline[baseline.length - 1].total_interest_paid : 0;
  const currentInterest =
    current.length > 0 ? current[current.length - 1].total_interest_paid : 0;
  const overpayInterest =
    overpay.length > 0 ? overpay[overpay.length - 1].total_interest_paid : 0;

  const pastInterestSaved =
    pastOverpayments > 0
      ? Math.max(0, Math.round((baselineInterest - currentInterest) * 100) / 100)
      : 0;
  const pastMonthsSaved =
    pastOverpayments > 0 ? Math.max(0, baselineMonths - currentMonths) : 0;

  const simulatedInterestSaved = Math.max(
    0,
    Math.round((currentInterest - overpayInterest) * 100) / 100
  );
  const simulatedMonthsSaved = Math.max(0, currentMonths - overpayMonths);

  const totalInterestSaved =
    Math.round((pastInterestSaved + simulatedInterestSaved) * 100) / 100;
  const totalMonthsSaved = pastMonthsSaved + simulatedMonthsSaved;

  const trajectory: MortgageTrajectoryPoint[] = [
    {
      year: 0,
      month: 0,
      baseline_balance: Math.round(unadjustedPrincipal),
      current_balance: Math.round(principal),
      overpay_balance: Math.round(principal),
    },
  ];

  const maxDuration = Math.max(baselineMonths, currentMonths, overpayMonths);
  const baselineLookup = new Map<number, number>();
  baseline.forEach((p) => baselineLookup.set(p.month, p.remaining_balance));

  const currentLookup = new Map<number, number>();
  current.forEach((p) => currentLookup.set(p.month, p.remaining_balance));

  const overpayLookup = new Map<number, number>();
  overpay.forEach((p) => overpayLookup.set(p.month, p.remaining_balance));

  for (let m = 12; m <= maxDuration + 12; m += 12) {
    const actualM = Math.min(m, maxDuration);
    const bBal = baselineLookup.has(actualM)
      ? baselineLookup.get(actualM)!
      : actualM >= baselineMonths
      ? 0
      : unadjustedPrincipal;
    const cBal = currentLookup.has(actualM)
      ? currentLookup.get(actualM)!
      : actualM >= currentMonths
      ? 0
      : principal;
    const oBal = overpayLookup.has(actualM)
      ? overpayLookup.get(actualM)!
      : actualM >= overpayMonths
      ? 0
      : principal;

    trajectory.push({
      year: Math.round((actualM / 12) * 10) / 10,
      month: actualM,
      baseline_balance: Math.round(bBal),
      current_balance: Math.round(cBal),
      overpay_balance: Math.round(oBal),
    });

    if (actualM >= maxDuration) break;
  }

  return {
    principal,
    unadjusted_principal: unadjustedPrincipal,
    annual_rate_pct: annualRatePct,
    monthly_payment: monthlyPayment,
    baseline_months: baselineMonths,
    current_months: currentMonths,
    overpay_months: overpayMonths,
    past_overpayments: pastOverpayments,
    past_interest_saved: pastInterestSaved,
    past_months_saved: pastMonthsSaved,
    simulated_interest_saved: simulatedInterestSaved,
    simulated_months_saved: simulatedMonthsSaved,
    months_saved: totalMonthsSaved,
    years_saved: Math.round((totalMonthsSaved / 12) * 10) / 10,
    baseline_interest: baselineInterest,
    current_interest: currentInterest,
    overpay_interest: overpayInterest,
    interest_saved: totalInterestSaved,
    trajectory,
  };
}
