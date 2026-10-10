import pandas as pd
import numpy as np

def detect_recurring_spends(df):
    """
    Analyzes a transaction dataframe to find recurring expenses that 
    aren't yet marked as committed.
    """
    # 1. Filter to Expenses only
    expenses = df[df['Transaction_Type'] == 'Expense'].copy()
    
    # Ensure Date is datetime
    expenses['Date'] = pd.to_datetime(expenses['Date'], dayfirst=True)
    expenses['Month_Year'] = expenses['Date'].dt.to_period('M')
    
    total_months = expenses['Month_Year'].nunique()
    if total_months < 2:
         return [] # Need at least 2 months to detect recurrence
         
    # We want to group by 'Name' (Merchant) and see how often they occur
    merchant_stats = expenses.groupby('Name').agg(
        frequency=('Month_Year', 'nunique'),
        avg_amount=('Amount', 'mean'),
        std_amount=('Amount', 'std'),
        category=('Category', 'first')
    ).reset_index()
    
    # Fill NaN std (happens if only 1 transaction) with 0
    merchant_stats['std_amount'] = merchant_stats['std_amount'].fillna(0)
    
    # Criteria for "Recurring/Committed":
    # - Appears in at least 70% of the active months (or at least 3 months if total_months is high)
    # - The amount doesn't vary wildly (std deviation is low compared to mean, e.g., coefficient of variation < 0.2)
    # OR
    # - We can also just flag things that appear very frequently.
    
    recurring_candidates = []
    
    for _, row in merchant_stats.iterrows():
        freq_ratio = row['frequency'] / total_months
        cv = row['std_amount'] / row['avg_amount'] if row['avg_amount'] > 0 else 0
        
        # Heuristic: Occurs in > 60% of months, OR occurs at least 3 times with low variance
        is_frequent = freq_ratio > 0.6 or (row['frequency'] >= 3 and total_months >= 3)
        is_stable_amount = cv < 0.15 # 15% variance allowed
        
        if is_frequent and is_stable_amount:
            recurring_candidates.append({
                'Merchant': row['Name'],
                'Category': row['category'],
                'Frequency_Months': row['frequency'],
                'Avg_Amount': row['avg_amount'],
                'Variance_CV': cv
            })
            
    return sorted(recurring_candidates, key=lambda x: x['Frequency_Months'], reverse=True)

if __name__ == "__main__":
    df = pd.read_csv('../expense_database.csv')
    candidates = detect_recurring_spends(df)
    print(f"Total months in data: {df['Date'].astype(str).str[:7].nunique()}")
    print("Found recurring candidates:")
    for c in candidates:
        print(f"- {c['Merchant']} (Cat: {c['Category']}) | {c['Frequency_Months']} months | Avg: £{c['Avg_Amount']:.2f}")
