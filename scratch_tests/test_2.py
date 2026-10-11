import pandas as pd
import json

df = pd.read_csv("expense_database.csv")
df['Date'] = pd.to_datetime(df['Date'], format='%d/%m/%Y')
df = df[(df['Date'].dt.year == 2026) & (df['Date'].dt.month.isin([3,4,5,6,7,8]))]

print(f"Rows matching Concert: {len(df[df['Category'].str.contains('Concert', na=False)])}")
for _, row in df[df['Category'].str.contains('Concert', na=False)].iterrows():
    print(row['Date'], row['Category'], row['Amount'], row['Transaction_Type'])
