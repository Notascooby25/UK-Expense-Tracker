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
  lumpSum = 0
): MortgageSummary {
  const baseline = simulateSchedule(
    principal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    0,
    0
  );

  const overpay = simulateSchedule(
    principal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    monthlyOverpayment,
    lumpSum
  );

  const baselineMonths = baseline.length;
  const overpayMonths = overpay.length;
  const monthsSaved = Math.max(0, baselineMonths - overpayMonths);

  const baselineInterest = baseline.length > 0 ? baseline[baseline.length - 1].total_interest_paid : 0;
  const overpayInterest = overpay.length > 0 ? overpay[overpay.length - 1].total_interest_paid : 0;
  const interestSaved = Math.max(0, Math.round((baselineInterest - overpayInterest) * 100) / 100);

  const trajectory: MortgageTrajectoryPoint[] = [
    {
      year: 0,
      month: 0,
      baseline_balance: Math.round(principal),
      overpay_balance: Math.round(principal),
    },
  ];

  const maxDuration = Math.max(baselineMonths, overpayMonths);
  const baselineLookup = new Map<number, number>();
  baseline.forEach((p) => baselineLookup.set(p.month, p.remaining_balance));

  const overpayLookup = new Map<number, number>();
  overpay.forEach((p) => overpayLookup.set(p.month, p.remaining_balance));

  for (let m = 12; m <= maxDuration + 12; m += 12) {
    const actualM = Math.min(m, maxDuration);
    const bBal = baselineLookup.has(actualM)
      ? baselineLookup.get(actualM)!
      : actualM >= baselineMonths
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
      overpay_balance: Math.round(oBal),
    });

    if (actualM >= maxDuration) break;
  }

  return {
    principal,
    annual_rate_pct: annualRatePct,
    monthly_payment: monthlyPayment,
    baseline_months: baselineMonths,
    overpay_months: overpayMonths,
    months_saved: monthsSaved,
    years_saved: Math.round((monthsSaved / 12) * 10) / 10,
    baseline_interest: baselineInterest,
    overpay_interest: overpayInterest,
    interest_saved: interestSaved,
    trajectory,
  };
}
