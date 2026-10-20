"""Mortgage calculation, amortization schedules, and overpayment simulation utilities."""

from typing import Any


def calculate_monthly_payment(principal: float, annual_rate_pct: float, term_months: int) -> float:
    """Calculate the standard monthly payment for a capital & interest repayment mortgage.

    Formula: M = P * (r * (1 + r)^n) / ((1 + r)^n - 1)
    where r is monthly interest rate (annual_rate_pct / 12 / 100), n is term_months.
    """
    if principal <= 0.0 or term_months <= 0:
        return 0.0

    if annual_rate_pct <= 0.0:
        return round(principal / term_months, 2)

    monthly_rate = (annual_rate_pct / 100.0) / 12.0
    factor = (1.0 + monthly_rate) ** term_months
    denominator = factor - 1.0

    if denominator == 0.0:
        return round(principal / term_months, 2)

    payment = principal * (monthly_rate * factor) / denominator
    return round(payment, 2)


def generate_amortization_schedule(
    principal: float,
    annual_rate_pct: float,
    monthly_payment: float,
    max_months: int,
    monthly_overpayment: float = 0.0,
    lump_sum: float = 0.0,
) -> list[dict[str, Any]]:
    """Simulate a month-by-month repayment schedule with optional overpayments."""
    if principal <= 0.0 or max_months <= 0:
        return []

    monthly_rate = (annual_rate_pct / 100.0) / 12.0 if annual_rate_pct > 0.0 else 0.0
    current_balance = float(principal)
    schedule: list[dict[str, Any]] = []
    total_interest_paid = 0.0
    total_principal_paid = 0.0

    # Ensure baseline monthly payment is at least interest payment to prevent infinite loop
    min_payment = current_balance * monthly_rate
    effective_standard_payment = max(monthly_payment, min_payment)

    for month in range(1, max_months + 1):
        if current_balance <= 0.0:
            break

        # Apply one-off lump sum at start of month 1 if requested
        if month == 1 and lump_sum > 0.0:
            actual_lump = min(current_balance, lump_sum)
            current_balance -= actual_lump
            total_principal_paid += actual_lump
            if current_balance <= 0.0:
                schedule.append(
                    {
                        "month": 1,
                        "interest_paid": 0.0,
                        "principal_paid": round(actual_lump, 2),
                        "extra_paid": round(actual_lump, 2),
                        "remaining_balance": 0.0,
                        "total_interest_paid": 0.0,
                    }
                )
                break

        # Calculate interest for the month on current balance
        month_interest = current_balance * monthly_rate
        total_interest_paid += month_interest

        # Determine total payment for this month (standard + overpayment)
        total_month_payment = effective_standard_payment + monthly_overpayment
        principal_reduction = total_month_payment - month_interest

        if principal_reduction >= current_balance:
            # Final payoff month
            actual_principal = current_balance
            total_principal_paid += actual_principal
            current_balance = 0.0
            schedule.append(
                {
                    "month": month,
                    "interest_paid": round(month_interest, 2),
                    "principal_paid": round(actual_principal, 2),
                    "extra_paid": round(monthly_overpayment, 2),
                    "remaining_balance": 0.0,
                    "total_interest_paid": round(total_interest_paid, 2),
                }
            )
            break
        else:
            current_balance -= principal_reduction
            total_principal_paid += principal_reduction
            schedule.append(
                {
                    "month": month,
                    "interest_paid": round(month_interest, 2),
                    "principal_paid": round(principal_reduction, 2),
                    "extra_paid": round(monthly_overpayment, 2),
                    "remaining_balance": round(current_balance, 2),
                    "total_interest_paid": round(total_interest_paid, 2),
                }
            )

    return schedule


def calculate_mortgage_summary(
    principal: float,
    annual_rate_pct: float,
    monthly_payment: float,
    term_months: int,
    monthly_overpayment: float = 0.0,
    lump_sum: float = 0.0,
    past_overpayments: float = 0.0,
) -> dict[str, Any]:
    """Generate comparative summary between baseline, current actual, and accelerated overpayment scenarios."""
    unadjusted_principal = round(principal + max(0.0, past_overpayments), 2)

    # 1. Original Baseline schedule without past overpayments
    baseline_schedule = generate_amortization_schedule(
        principal=unadjusted_principal,
        annual_rate_pct=annual_rate_pct,
        monthly_payment=monthly_payment,
        max_months=term_months,
        monthly_overpayment=0.0,
        lump_sum=0.0,
    )

    # 2. Current Actual schedule with past overpayments already applied
    current_schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=annual_rate_pct,
        monthly_payment=monthly_payment,
        max_months=term_months,
        monthly_overpayment=0.0,
        lump_sum=0.0,
    )

    # 3. Accelerated schedule with future simulated overpayments
    overpay_schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=annual_rate_pct,
        monthly_payment=monthly_payment,
        max_months=term_months,
        monthly_overpayment=monthly_overpayment,
        lump_sum=lump_sum,
    )

    baseline_months = len(baseline_schedule)
    current_months = len(current_schedule)
    overpay_months = len(overpay_schedule)

    baseline_interest = baseline_schedule[-1]["total_interest_paid"] if baseline_schedule else 0.0
    current_interest = current_schedule[-1]["total_interest_paid"] if current_schedule else 0.0
    overpay_interest = overpay_schedule[-1]["total_interest_paid"] if overpay_schedule else 0.0

    past_interest_saved = (
        max(0.0, round(baseline_interest - current_interest, 2)) if past_overpayments > 0.0 else 0.0
    )
    past_months_saved = max(0, baseline_months - current_months) if past_overpayments > 0.0 else 0

    simulated_interest_saved = max(0.0, round(current_interest - overpay_interest, 2))
    simulated_months_saved = max(0, current_months - overpay_months)

    total_interest_saved = round(past_interest_saved + simulated_interest_saved, 2)
    total_months_saved = past_months_saved + simulated_months_saved

    # Build annual trajectory series for charting
    trajectory: list[dict[str, Any]] = []
    max_duration = max(baseline_months, current_months, overpay_months)

    # Initial year 0 point
    trajectory.append(
        {
            "year": 0,
            "month": 0,
            "baseline_balance": round(unadjusted_principal, 2),
            "current_balance": round(principal, 2),
            "overpay_balance": round(principal, 2),
        }
    )

    baseline_lookup = {item["month"]: item["remaining_balance"] for item in baseline_schedule}
    current_lookup = {item["month"]: item["remaining_balance"] for item in current_schedule}
    overpay_lookup = {item["month"]: item["remaining_balance"] for item in overpay_schedule}

    # Sample yearly milestones (every 12 months)
    for m in range(12, max_duration + 12, 12):
        actual_m = min(m, max_duration)
        b_bal = baseline_lookup.get(
            actual_m, 0.0 if actual_m >= baseline_months else unadjusted_principal
        )
        c_bal = current_lookup.get(actual_m, 0.0 if actual_m >= current_months else principal)
        o_bal = overpay_lookup.get(actual_m, 0.0 if actual_m >= overpay_months else principal)
        trajectory.append(
            {
                "year": round(actual_m / 12.0, 1),
                "month": actual_m,
                "baseline_balance": round(b_bal, 2),
                "current_balance": round(c_bal, 2),
                "overpay_balance": round(o_bal, 2),
            }
        )
        if actual_m >= max_duration:
            break

    return {
        "principal": principal,
        "unadjusted_principal": unadjusted_principal,
        "past_overpayments": round(past_overpayments, 2),
        "annual_rate_pct": annual_rate_pct,
        "monthly_payment": monthly_payment,
        "baseline_months": baseline_months,
        "current_months": current_months,
        "overpay_months": overpay_months,
        "past_months_saved": past_months_saved,
        "past_years_saved": round(past_months_saved / 12.0, 1),
        "past_interest_saved": past_interest_saved,
        "simulated_months_saved": simulated_months_saved,
        "simulated_years_saved": round(simulated_months_saved / 12.0, 1),
        "simulated_interest_saved": simulated_interest_saved,
        "months_saved": total_months_saved,
        "years_saved": round(total_months_saved / 12.0, 1),
        "baseline_interest": baseline_interest,
        "current_interest": current_interest,
        "overpay_interest": overpay_interest,
        "interest_saved": total_interest_saved,
        "trajectory": trajectory,
    }


def calculate_annual_allowance(current_balance: float, allowance_pct: float = 10.0) -> float:
    """Calculate the standard annual penalty-free overpayment allowance."""
    if current_balance <= 0.0 or allowance_pct <= 0.0:
        return 0.0
    return round(current_balance * (allowance_pct / 100.0), 2)
