import pandas as pd
import json

df = pd.read_csv("expense_database.csv")
df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y')
df = df[(df['Date'].dt.year == 2026) & (df['Date'].dt.month.isin([3,4,5,6,7,8]))]

committed_cats = ["Bill - Puma", "Bills", "BE Phone/Net", "Personal Bills", "Groceries", "Personal care", "Savings"]
true_income_categories = ["Salary", "Income"]
internal_categories = ["Savings", "Investments - ISA", "Investment - ISA", "Transfers", "Investment - Crypto"]

def assign_spend_type(row):
    if row['Category'] in internal_categories: return 'Internal Transfer'
    if row['Transaction_Type'] == 'Income':
        if row['Category'] not in true_income_categories:
            if row['Category'] in committed_cats: return 'Committed Refund'
            return 'Variable Refund'
        return 'True Income'
    if row['Category'] in committed_cats: return 'Committed Expense'
    return 'Variable Expense'

df['Spend_Type'] = df.apply(assign_spend_type, axis=1)

var_exp = df[df['Spend_Type'] == 'Variable Expense'].groupby('Category')['Amount'].sum()
var_ref = df[df['Spend_Type'] == 'Variable Refund'].groupby('Category')['Amount'].sum()
var_df = (var_exp.add(-var_ref, fill_value=0) / 6).reset_index().rename(columns={'Amount': 'Avg P/M (£)'})
var_df = var_df[var_df['Avg P/M (£)'] > 0].sort_values(by='Avg P/M (£)', ascending=False)
print(var_df)
