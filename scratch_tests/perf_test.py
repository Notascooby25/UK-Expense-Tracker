import pandas as pd
import time
import numpy as np
from streamlit.runtime.caching.hashing import util

df = pd.DataFrame({
    'Date': pd.date_range(start='1/1/2020', periods=10000),
    'Spend_Type': np.random.choice(['True Income', 'Committed Expense', 'Variable Expense'], 10000),
    'Amount': np.random.rand(10000) * 1000
})
df['Month_Year'] = df['Date'].dt.to_period('M')

# Groupby time
t0 = time.time()
ms = df.groupby(['Month_Year', 'Spend_Type'])['Amount'].sum().unstack(fill_value=0).reset_index()
t1 = time.time()
print(f"Groupby time: {(t1-t0)*1000:.2f} ms")

# Hash time
t0 = time.time()
util.calc_md5(df)
t1 = time.time()
print(f"Hash time: {(t1-t0)*1000:.2f} ms")
