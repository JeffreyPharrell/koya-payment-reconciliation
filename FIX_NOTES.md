# What was wrong and how it was fixed

Running the original `reconcile.py` crashed immediately with
`ValueError: could not convert string to float: '55,707.77'`. Profiling `payments.jsonl`
showed four separate problems, all addressed in `reconcile.py` and `reconcile.js`:

| # | Problem in the data | Evidence | Fix |
|---|---|---|---|
| 1 | Every attempt was counted, not just the latest per `txn_id` | 30,000 distinct payments, 7,772 of them attempted more than once | Keep one event per `txn_id`: the one with the newest `ts` |
| 2 | Attempts are **not** in time order in the file | 4,534 payments have events out of chronological order | Compare timestamps instead of trusting file order |
| 3 | Amounts stored as text with thousands separators | 2,326 amounts like `"55,707.77"` crashed `float()` | Strip commas before converting |
| 4 | Corrupt rows | 25 truncated lines (invalid JSON) and 15 events with no `txn_id` | Skip unreadable lines and events without a `txn_id` |

Also: money is summed in whole kobo (integers) to avoid floating-point drift, and the final
rounding is "halves round up" so the Python and JavaScript versions always print the same code.
(Exact duplicate lines need no special handling: they share a `txn_id`, so they collapse into one payment.)

## Result

    Skipped 25 unreadable lines and 15 events without a txn_id.
    Check passed: 22733 successful payments.
    Your code: KOYA-1964687346

`expected.txt` is 22733, so the count matches. The same result comes from `reconcile.py`,
`reconcile.js`, and a separate cross-check that sorted all events by time and let the latest win.
