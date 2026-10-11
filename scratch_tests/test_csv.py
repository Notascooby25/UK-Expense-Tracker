import csv
from datetime import datetime

with open('expense_database.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# filter for 2026 and Months (March, April, May, June, July, August)
filtered_rows = []
unique_months = set()
for r in rows:
    try:
        dt = datetime.strptime(r['Date'], '%d/%m/%Y')
        if dt.year == 2026 and dt.month in [3,4,5,6,7,8]:
            filtered_rows.append(r)
            unique_months.add(dt.strftime('%Y-%m'))
    except Exception as e:
        pass

# app logic
committed_cats = ["Bill - Puma", "Bills", "BE Phone/Net", "Personal Bills", "Groceries", "Personal care", "Savings"]
true_income_categories = ["Salary", "Income"]
internal_categories = ["Savings", "Investments - ISA", "Investment - ISA", "Transfers", "Investment - Crypto"]

var_exp = {}
var_ref = {}

for r in filtered_rows:
    cat = r['Category'].strip()
    tt = r['Transaction_Type']
    amt = float(r['Amount'])

    if cat in internal_categories:
        spend_type = 'Internal Transfer'
    elif tt == 'Income':
        if cat not in true_income_categories:
            if cat in committed_cats:
                spend_type = 'Committed Refund'
            else:
                spend_type = 'Variable Refund'
        else:
            spend_type = 'True Income'
    else:
        if cat in committed_cats:
            spend_type = 'Committed Expense'
        else:
            spend_type = 'Variable Expense'

    if spend_type == 'Variable Expense':
        var_exp[cat] = var_exp.get(cat, 0) + amt
    elif spend_type == 'Variable Refund':
        var_ref[cat] = var_ref.get(cat, 0) + amt

months_in_period = max(1, len(unique_months))
print("Months in period:", months_in_period)

results = {}
all_cats = set(var_exp.keys()).union(set(var_ref.keys()))
for cat in all_cats:
    exp = var_exp.get(cat, 0)
    ref = var_ref.get(cat, 0)
    net = exp - ref
    avg = net / months_in_period
    if avg > 0:
        results[cat] = avg

for cat, avg in sorted(results.items(), key=lambda x: x[1], reverse=True):
    print(f"{cat}: {avg:.2f}")
