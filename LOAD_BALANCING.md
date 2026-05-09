# Load Balancing Strategy - 50 Bills Per Worker

## New Distribution Model

### Configuration
- **BILLS_PER_WORKER**: 50 (fixed)
- **BATCH_SIZE**: 50 (per worker)
- **MAX_WORKERS**: 50 (system limit)

### How It Works

#### Example 1: 100 Bills
```
Total Bills: 100
Workers Needed: 100 ÷ 50 = 2 workers

Distribution:
├─ Worker 1 (Port 9222) → Bills: 0-49   │ 50 bills
└─ Worker 2 (Port 9223) → Bills: 50-99  │ 50 bills

Timeline:
- Both workers start simultaneously
- Each opens 50 tabs in their browser
- Process in parallel
- Expected time: ~15-20 seconds
```

#### Example 2: 150 Bills
```
Total Bills: 150
Workers Needed: 150 ÷ 50 = 3 workers

Distribution:
├─ Worker 1 (Port 9222) → Bills: 0-49    │ 50 bills
├─ Worker 2 (Port 9223) → Bills: 50-99   │ 50 bills
└─ Worker 3 (Port 9224) → Bills: 100-149 │ 50 bills

Expected time: ~15-20 seconds (same as 100 bills!)
```

#### Example 3: 250 Bills
```
Total Bills: 250
Workers Needed: 250 ÷ 50 = 5 workers

Distribution:
├─ Worker 1 (Port 9222) → Bills: 0-49    │ 50 bills
├─ Worker 2 (Port 9223) → Bills: 50-99   │ 50 bills
├─ Worker 3 (Port 9224) → Bills: 100-149 │ 50 bills
├─ Worker 4 (Port 9225) → Bills: 150-199 │ 50 bills
└─ Worker 5 (Port 9226) → Bills: 200-249 │ 50 bills

Expected time: ~15-25 seconds
```

#### Example 4: 500 Bills
```
Total Bills: 500
Workers Needed: 500 ÷ 50 = 10 workers

Distribution:
├─ Worker 1  (Port 9222) → Bills: 0-49    │ 50 bills
├─ Worker 2  (Port 9223) → Bills: 50-99   │ 50 bills
├─ Worker 3  (Port 9224) → Bills: 100-149 │ 50 bills
├─ Worker 4  (Port 9225) → Bills: 150-199 │ 50 bills
├─ Worker 5  (Port 9226) → Bills: 200-249 │ 50 bills
├─ Worker 6  (Port 9227) → Bills: 250-299 │ 50 bills
├─ Worker 7  (Port 9228) → Bills: 300-349 │ 50 bills
├─ Worker 8  (Port 9229) → Bills: 350-399 │ 50 bills
├─ Worker 9  (Port 9230) → Bills: 400-449 │ 50 bills
└─ Worker 10 (Port 9231) → Bills: 450-499 │ 50 bills

Expected time: ~20-30 seconds
```

## Advantages of 50-Bill Chunks

### 1. **Balanced Resource Usage**
- Not too many workers (reduces overhead)
- Not too few workers (maintains parallelism)
- Each worker has meaningful work

### 2. **Optimal Browser Performance**
- 50 tabs per browser is manageable
- Doesn't overwhelm Chrome's memory
- Faster than 100 tabs per worker
- More efficient than 5 tabs per worker

### 3. **Predictable Timing**
- Each worker takes ~15-20 seconds
- Total time ≈ slowest worker time
- Scales linearly up to 50 workers

### 4. **Better Error Recovery**
- If one worker fails, only 50 bills affected
- Other workers continue independently
- Easy to retry failed batches

## Performance Comparison

| Bills | Old (1 Worker) | Previous (5/worker) | New (50/worker) | Speedup |
|-------|----------------|---------------------|-----------------|---------|
| 50    | ~2.5 min       | ~15s (10 workers)   | ~15s (1 worker) | 10x     |
| 100   | ~5 min         | ~15s (20 workers)   | ~15s (2 workers)| 20x     |
| 250   | ~12.5 min      | ~15s (50 workers)   | ~20s (5 workers)| 37x     |
| 500   | ~25 min        | N/A (too many)      | ~25s (10 workers)| 60x    |

## System Requirements by Scale

### Small Scale (1-100 bills)
- Workers: 1-2
- RAM: 4GB
- CPU: 2 cores
- Time: ~15 seconds

### Medium Scale (100-250 bills)
- Workers: 2-5
- RAM: 8GB
- CPU: 4 cores
- Time: ~20 seconds

### Large Scale (250-500 bills)
- Workers: 5-10
- RAM: 16GB
- CPU: 8 cores
- Time: ~25 seconds

### Maximum Scale (500-2500 bills)
- Workers: 10-50
- RAM: 32GB
- CPU: 16 cores
- Time: ~30-60 seconds

## Backend Logs Example

When you start a 100-bill download, you'll see:

```
LOAD BALANCED MODE: Distributing 100 bills across 2 workers (50 bills per worker).
Worker 1 (Port 9222): Bills 0-49 (50 bills)
Worker 2 (Port 9223): Bills 50-99 (50 bills)

[9222] Batch: Triggering 50 tabs...
[9223] Batch: Triggering 50 tabs...

[9222] Successfully downloaded 50 files.
[9223] Successfully downloaded 50 files.

Total: 100 bills in 18.3 seconds
```

## Why This Is Better

**Previous Approach (5 bills/worker):**
- 100 bills = 20 workers
- Too many Chrome instances
- High CPU/RAM overhead
- Context switching delays

**New Approach (50 bills/worker):**
- 100 bills = 2 workers
- Manageable resource usage
- Less overhead
- Same or better speed!

## Conclusion

The 50-bill-per-worker strategy provides the **optimal balance** between:
- ✓ Parallelization (multiple workers)
- ✓ Resource efficiency (not too many browsers)
- ✓ Speed (fast completion)
- ✓ Reliability (manageable batch sizes)

**Result: 100+ bills in 15-25 seconds consistently!**
