# FinVault Frontend Architecture

This document specifies the core architectural patterns used in the FinVault SPA to ensure state consistency, session integrity, and network resilience.

## 1. Reactive State Management (Service-as-a-Store)

We use **Angular Signals** to implement a "Service-as-a-Store" pattern. This eliminates the need for complex state management libraries while providing fine-grained reactivity.

### Rules:
- **Single Source of Truth**: All domain data (e.g., `cards`) must live in a service as a `private signal`.
- **Read-Only Exposure**: Services expose data via `asReadonly()` to prevent components from directly mutating state.
- **Mutation Immutability**: Collections (Arrays, Sets, Maps) must always be updated with a new reference to trigger reactivity.
  - *Correct*: `this._mySignal.update(s => new Set([...s, newItem]))`
  - *Incorrect*: `this._mySignal().add(newItem)`

### Mutation Guard & Versioning:
To prevent race conditions between optimistic updates and server responses:
- **Locking**: Mutations set an `isProcessing` lock per item or per service.
- **Version Tracking**: Every mutation increments a `mutationVersion`. Rollbacks are only performed if the version still matches the captured version at the start of the mutation.

---

## 2. Session Integrity (ResetBus)

To prevent data leakage between user sessions, we use a **ResetBus** pattern.

- **`ResetBusService`**: A neutral singleton containing a `Subject<void>` named `reset$`.
- **`AuthService`**: Triggers `reset$.next()` on logout or token expiry.
- **Feature Services**: Subscribe to `reset$` in their constructor to purge all internal signals and cache metadata.
- **Network Level**: All API calls use `.pipe(takeUntil(this.resetBus.reset$))` to immediately cancel in-flight requests upon logout.

---

## 3. Network Resilience (Silent Refresh)

The **`AuthInterceptor`** implements a robust silent token restoration flow.

### Flow:
1. **401 Interception**: When a request fails with 401 Unauthorized.
2. **Concurrent Guard**: If a refresh is already in flight, subsequent 401s are queued in an array.
3. **Silent Refresh**: A single call to `/api/identity/auth/refresh` is made.
4. **Retry**:
   - **Success**: All queued requests (including the original) are retried with the new token.
   - **Failure**: The user is hard-redirected to `/login`, and all state is purged via ResetBus.

---

## 4. UI Feedback (FIFO Toast Queue)

Global notifications are managed by the **`GlobalUiService`**.

- **FIFO Queue**: Supports up to 5 concurrent toasts.
- **Auto-Dismiss**: Each toast clears automatically after 3 seconds.
- **Unified Renderer**: A single `ToastComponent` (usually placed in the layout or dashboard) renders the `currentToast()` signal.

---

## 5. Security & Caching

- **Identity Priority**: Identity is fetched from the stored `userId`. Claims (`sub` → `nameid`) are used only as fallbacks.
- **Cache Isolation**: Caches are tagged with `userId`. If a user switches accounts rapidly, the cache is invalidated if the IDs don't match.
- **Token Scrubbing**: `access_token` is removed from local storage immediately on 401 failure or manual logout.
