import pandas as pd

df = pd.DataFrame({'A': [1,2,3,4], 'B': ['a','b','c','d']}, index=[10, 20, 30, 40])
df_edit = df[df['A'] > 2].copy() # indices 30, 40

# user deletes row with index 30, edits row with index 40
edited_df = df_edit.drop(30)
edited_df.loc[40, 'B'] = 'z'

# commit logic
df.update(edited_df) # Updates index 40
deleted_indices = set(df_edit.index) - set(edited_df.index)
if deleted_indices:
    df = df.drop(list(deleted_indices))

print(df)
