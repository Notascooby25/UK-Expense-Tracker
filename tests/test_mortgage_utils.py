"""Tests for mortgage calculation and amortization utilities."""

import pytest
from backend.mortgage_utils import (
    calculate_annual_allowance,
    calculate_monthly_payment,
    calculate_mortgage_summary,
    generate_amortization_schedule,
)


def test_calculate_monthly_payment_standard():
    """Verify standard repayment mortgage payment calculation."""
    # £200,000 at 4.0% annual over 25 years (300 months)
    payment = calculate_monthly_payment(principal=200000.0, annual_rate_pct=4.0, term_months=300)
    # Expected standard monthly payment is ~£1,055.67
    assert round(payment, 2) == 1055.67


def test_calculate_monthly_payment_zero_interest():
    """Verify monthly payment handles 0% interest without division by zero."""
    payment = calculate_monthly_payment(principal=120000.0, annual_rate_pct=0.0, term_months=120)
    assert round(payment, 2) == 1000.00


def test_calculate_monthly_payment_invalid_inputs():
    """Verify zero or negative principal or term returns 0.0."""
    assert calculate_monthly_payment(0.0, 4.0, 300) == 0.0
    assert calculate_monthly_payment(200000.0, 4.0, 0) == 0.0
    assert calculate_monthly_payment(-500.0, 4.0, 300) == 0.0


def test_generate_amortization_schedule_baseline():
    """Verify amortization schedule reduces principal to zero over term."""
    principal = 100000.0
    rate = 5.0
    term = 120  # 10 years
    payment = calculate_monthly_payment(principal, rate, term)

    schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        max_months=term,
        monthly_overpayment=0.0,
        lump_sum=0.0,
    )

    assert len(schedule) == term
    assert schedule[0]["month"] == 1
    assert schedule[-1]["month"] == term
    assert schedule[-1]["remaining_balance"] == 0.0
    assert schedule[-1]["total_interest_paid"] > 0.0


def test_generate_amortization_schedule_with_overpayment():
    """Verify monthly overpayments reduce total term and save interest."""
    principal = 200000.0
    rate = 4.25
    term = 300
    payment = calculate_monthly_payment(principal, rate, term)

    baseline_schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        max_months=term,
        monthly_overpayment=0.0,
    )

    overpay_schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        max_months=term,
        monthly_overpayment=200.0,
    )

    # Overpayment schedule finishes earlier
    assert len(overpay_schedule) < len(baseline_schedule)
    # Total interest paid is lower
    assert (
        overpay_schedule[-1]["total_interest_paid"] < baseline_schedule[-1]["total_interest_paid"]
    )


def test_generate_amortization_schedule_with_lump_sum():
    """Verify lump sum immediately knocks down principal in month 1."""
    principal = 150000.0
    rate = 4.0
    term = 240
    payment = calculate_monthly_payment(principal, rate, term)

    schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        max_months=term,
        monthly_overpayment=0.0,
        lump_sum=10000.0,
    )

    # First month remaining balance should reflect immediate lump sum deduction
    assert schedule[0]["remaining_balance"] < (principal - 10000.0)


def test_overpayment_exceeding_balance():
    """Verify large overpayment does not result in negative loan balance."""
    principal = 5000.0
    rate = 3.0
    term = 60
    payment = 100.0

    schedule = generate_amortization_schedule(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        max_months=term,
        monthly_overpayment=0.0,
        lump_sum=10000.0,  # Exceeds total loan
    )

    # Should finish in 1 month at exactly 0.0 balance
    assert len(schedule) == 1
    assert schedule[0]["remaining_balance"] == 0.0


def test_calculate_mortgage_summary():
    """Verify summary returns months saved, interest saved, and comparative timelines."""
    principal = 214500.0
    rate = 4.25
    payment = 1180.0
    term = 268

    summary = calculate_mortgage_summary(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        term_months=term,
        monthly_overpayment=150.0,
        lump_sum=0.0,
    )

    assert "baseline_months" in summary
    assert "overpay_months" in summary
    assert "months_saved" in summary
    assert "interest_saved" in summary
    assert "trajectory" in summary
    assert summary["months_saved"] > 0
    assert summary["interest_saved"] > 0.0
    # Annual progression points for charting
    assert len(summary["trajectory"]) > 0


def test_calculate_annual_allowance():
    """Verify standard UK 10% penalty-free annual overpayment allowance."""
    assert calculate_annual_allowance(214500.0, allowance_pct=10.0) == 21450.0
    assert calculate_annual_allowance(100000.0) == 10000.0
    assert calculate_annual_allowance(0.0) == 0.0


def test_calculate_mortgage_summary_with_past_overpayments():
    """Verify past overpayments are factored into savings and 3 trajectory series."""
    # Suppose current remaining balance is £190,000, but £10,000 was already overpaid
    principal = 190000.0
    past_overpayments = 10000.0
    rate = 4.0
    payment = 1055.67
    term = 300

    summary = calculate_mortgage_summary(
        principal=principal,
        annual_rate_pct=rate,
        monthly_payment=payment,
        term_months=term,
        monthly_overpayment=100.0,
        lump_sum=0.0,
        past_overpayments=past_overpayments,
    )

    assert summary["principal"] == 190000.0
    assert summary["unadjusted_principal"] == 200000.0
    assert summary["past_overpayments"] == 10000.0
    # Past overpayment of £10k should yield positive past interest and months saved
    assert summary["past_interest_saved"] > 0.0
    assert summary["past_months_saved"] > 0
    # Future overpayment of £100/mo should yield additional simulated savings
    assert summary["simulated_interest_saved"] > 0.0
    assert summary["simulated_months_saved"] > 0
    # Total combined savings
    assert summary["interest_saved"] == round(
        summary["past_interest_saved"] + summary["simulated_interest_saved"], 2
    )
    assert (
        summary["months_saved"] == summary["past_months_saved"] + summary["simulated_months_saved"]
    )

    # Trajectory points should contain all 3 balance curves
    trajectory = summary["trajectory"]
    assert len(trajectory) > 0
    first_pt = trajectory[0]
    assert first_pt["baseline_balance"] == 200000.0
    assert first_pt["current_balance"] == 190000.0
    assert first_pt["overpay_balance"] == 190000.0
