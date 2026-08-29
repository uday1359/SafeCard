---
name: code-review
description: Review code for quality, security, maintainability, and adherence to project standards.
---

# Code Review

## Rules
- Look for edge cases and unhandled exceptions.
- Check for naming clarity and code readability.
- Ensure the code follows existing project style guidelines.
- Identify potential performance bottlenecks.
- Suggest refactoring if the code is overly complex.

## Exception Handling
Review every failure path as carefully as the happy path. A thrown error that
nobody handles, or one handled in a way that hides it, is a defect even when the
code compiles and the tests pass.

Check that:

- **Every fallible call is accounted for.** I/O, network, storage, parsing,
  crypto and permission checks all fail. Ask what happens on each rejection, not
  just on success.
- **Nothing is swallowed.** An empty `catch`, a bare `except: pass`, or a
  `.catch(() => {})` turns a failure into silent wrong behaviour. If an error is
  deliberately ignored, the comment must say why.
- **Catches are narrow.** Catching the broadest type hides bugs that are not the
  one being handled. Re-throw what this layer cannot handle.
- **The caught error is not lost.** Preserve the cause when wrapping, and log or
  surface enough to diagnose the failure later.
- **Cleanup runs on the error path.** `finally` / `defer` / `with` for buffers,
  locks, transactions, file handles and timers. This is where wipes, closes and
  rollbacks get forgotten.
- **Failure leaves consistent state.** A partial write, a half-applied update or
  a cache that keeps a rejected result must not strand the system. Check that a
  retry can still succeed.
- **Async errors are actually caught.** A rejected promise with no handler, a
  fire-and-forget call, an error thrown inside a callback, timer or event
  listener, and a cancellation path that discards work already in flight.
- **User-facing messages are correct and safe.** The message must match what
  actually failed, must not leak internal detail or secrets, and must tell the
  user what to do next. Keep developer detail separate from the displayed text.
- **Errors are distinguishable where it matters, and identical where it must
  not leak.** Security paths sometimes require one shared message; everywhere
  else, distinct causes deserve distinct handling.
- **Resource exhaustion and hostile input are rejected before allocation**,
  not caught after the fact.

### Patterns to flag, with the fix

Reviews land better when they name the pattern and show the correction. These
are the recurring ones; the language is illustrative, the shape is not.

**Swallowed error — the failure becomes silent wrong behaviour.**

```ts
// FLAG
try { await save(draft); } catch { /* nothing */ }

// FIX — handle it, or re-throw; if truly ignorable, say why in the comment.
try {
  await save(draft);
} catch (err) {
  setSaveState('error');             // the user learns the write did not happen
  console.error('save failed', err); // the cause survives for diagnosis
}
```

**Lost cause — the wrapper discards what actually went wrong.**

```ts
// FLAG
catch (err) { throw new AppError('Could not load'); }

// FIX
catch (err) { throw new AppError('Could not load', { cause: err }); }
```

**Cleanup only on the happy path — buffers, locks, handles and timers leak.**

```ts
// FLAG
const secret = toBytes(input);
const key = await derive(secret);   // throws => secret is never wiped
wipe(secret);

// FIX
const secret = toBytes(input);
try {
  return await derive(secret);
} finally {
  wipe(secret);
}
```

**Cached failure — one transient error poisons every later call.**

```ts
// FLAG
dbPromise ??= openDB(name, version);   // a rejected promise is not nullish

// FIX
dbPromise ??= openDB(name, version).catch((err) => {
  dbPromise = null;                    // let the next caller retry
  throw err;
});
```

**Unobserved async failure — no handler, so it crashes or vanishes.**

```ts
// FLAG
setTimeout(() => { void save(draft); }, delay);   // rejection goes nowhere
element.addEventListener('click', async () => { await submit(); });

// FIX
setTimeout(() => { save(draft).catch(reportSaveFailure); }, delay);
element.addEventListener('click', () => { submit().catch(reportSubmitFailure); });
```

**Cancellation that discards committed work — teardown drops a pending write.**

```ts
// FLAG
useEffect(() => {
  const t = setTimeout(() => void save(draft), 800);
  return () => clearTimeout(t);        // teardown loses the last edits
}, [draft, key]);

// FIX — flush before the resource the write depends on goes away.
useEffect(() => {
  const t = setTimeout(() => void save(draft), 800);
  return () => { clearTimeout(t); void flushPendingSave(); };
}, [draft, key]);
```

**Message that misstates the failure or leaks internals.**

```ts
// FLAG
catch (err) { show(String(err)); }              // stack traces, paths, secrets
catch (err) { show('Check your password.'); }   // it was a read error, not auth

// FIX — developer detail and displayed text stay separate fields.
catch (err) {
  if (err instanceof VaultError) show(err.userMessage);
  else show('Something went wrong. Please try again.');
  console.error(err);
}
```

**Broad catch that hides unrelated bugs.**

```python
# FLAG — a TypeError introduced by a refactor now reads as "file missing"
try:
    data = load(path)
except Exception:
    data = DEFAULT

# FIX — catch only what this layer can actually handle
try:
    data = load(path)
except FileNotFoundError:
    data = DEFAULT
```

Classify each finding by severity (CRITICAL / HIGH / MEDIUM / LOW), and for
anything above LOW give a concrete failure scenario: the input or state that
triggers it and the resulting misbehaviour.

## Workflow
1. Understand the goal of the pull request or code change.
2. Read the changes systematically.
3. Trace the failure paths, not only the happy path.
4. Check against architectural guidelines and best practices.
5. Provide constructive and specific feedback.

## Token Efficiency
- Only analyze the diff or the specific files that have been modified.
