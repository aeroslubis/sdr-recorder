# UI Cleanup & Remove Mobile-Specific Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the login screen (remove auto-filled credentials and replace arrow icon with login icon), simplify the admin button on TopBar to be an icon-only button without text, and remove all mobile-specific view styles and navigation tabs to restore a clean, unified standard layout.

**Architecture:** Update React components in `frontend/src/components/` (`LoginView.tsx`, `TopBar.tsx`, `DashboardLayout.tsx`) and their respective test suites in `frontend/src/__tests__/`. In `LoginView`, default state for username and password becomes empty strings, remove default fill helper, and update button to display a clean `LogIn` icon without `->` symbols. In `TopBar`, the admin trigger button renders a `User` icon without text. In `DashboardLayout`, remove `mobileTab` state, mobile top tab bar, mobile bottom navigation bar, and responsive column-hiding classes (`hidden lg:...`) so the 3 columns and live spectrum visualizer are always rendered uniformly.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons, Vitest, Testing Library.

**Spec:** User request:
1. Pada login screen hapus user dan password fill otomatis dan ganti icon login jangan ada simbol `->`.
2. Berikan icon saja pada tombol admin tanpa text.
3. Hapus semua style spesifik untuk versi tampilan mobile.

## Global Constraints

- Supabase Dark Theme design tokens (Obsidian `#121212`, Ash `#242424`, Charcoal `#2e2e2e`, Phosphor Green `#3ecf8e`).
- Preserve English UI copy across all interface elements.
- All unit tests in `frontend/` must pass (`npm test -- --run`).
- Production build must succeed with zero TypeScript or bundle errors (`npm run build`).

## Review Focus

1. Verify username and password inputs in `LoginView` start empty (`''`), not prefilled.
2. Verify submit button in `LoginView` has no `->` text or `ArrowRight` icon, using a clean `LogIn` icon instead.
3. Verify admin menu button in `TopBar` renders only an icon without `<span>{username}</span>` text.
4. Verify `DashboardLayout` renders all 3 columns (Radio Tuning Panel, Center Canvas Scrubber & Live Spectrum Visualizer, Call Log Panel) simultaneously without mobile tab switching or hidden spectrum.
5. Verify mobile navigation bars (top tab bar and bottom bar) are completely removed.

---

### Task 1: Clean Up Login Screen (`LoginView.tsx` & `LoginView.test.tsx`)

**Files:**
- Modify: `frontend/src/components/LoginView.tsx`
- Modify: `frontend/src/__tests__/LoginView.test.tsx`

**Interfaces:**
- Consumes: `LoginViewProps { onLogin?: (u, p) => void; error?: string | null; isLoading?: boolean }`
- Produces: `LoginView` with empty default credentials, no auto-fill handlers, and clean `LogIn` icon.

- [ ] **Step 1: Write/update tests in `frontend/src/__tests__/LoginView.test.tsx`**
  Assert that:
  - Username and password inputs initialize to empty string `''`.
  - The submit button displays "Sign In" with no `->` symbol.
  - Form submission succeeds when user inputs credentials and clicks submit.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm test -- src/__tests__/LoginView.test.tsx --run` in `frontend/`
  Expected: FAIL because username/password currently default to `'admin'`/`'12345'` and button text contains `'Sign In ->'`.

- [ ] **Step 3: Implement changes in `frontend/src/components/LoginView.tsx`**
  - Change `useState('admin')` to `useState('')` and `useState('12345')` to `useState('')`.
  - Remove `handleFillDefaults` and the clickable default credentials auto-fill paragraph.
  - Replace `ArrowRight` with `LogIn` from `lucide-react`.
  - Replace button text `'Sign In ->'` with `'Sign In'`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- src/__tests__/LoginView.test.tsx --run` in `frontend/`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/LoginView.tsx frontend/src/__tests__/LoginView.test.tsx
  git commit -m "fix(login): remove prefilled credentials and replace arrow icon with login icon"
  ```

---

### Task 2: Icon-Only Admin Button on TopBar (`TopBar.tsx` & `TopBar.test.tsx`)

**Files:**
- Modify: `frontend/src/components/TopBar.tsx`
- Modify: `frontend/src/__tests__/TopBar.test.tsx`

**Interfaces:**
- Consumes: `TopBarProps { username?: string; onOpenSettings?: (tab) => void; onLogout?: () => void; ... }`
- Produces: `TopBar` with an icon-only admin menu trigger button.

- [ ] **Step 1: Write/update tests in `frontend/src/__tests__/TopBar.test.tsx`**
  Assert that:
  - Admin button has `aria-label="Admin Menu"` (or matching `/admin/i`) and contains no visible text.
  - Clicking the icon button opens the dropdown menu containing "Settings" and "Sign Out".

- [ ] **Step 2: Run test to verify failure or alignment**
  Run: `npm test -- src/__tests__/TopBar.test.tsx --run` in `frontend/`

- [ ] **Step 3: Implement icon-only admin button in `frontend/src/components/TopBar.tsx`**
  - Import `User` icon from `lucide-react`.
  - In the admin button trigger, remove `<span>{username}</span>` and `ChevronDown`.
  - Render `<User className="w-4 h-4 text-silver-mist group-hover:text-snow" />` with `aria-label="Admin Menu"` and `title={username}`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- src/__tests__/TopBar.test.tsx --run` in `frontend/`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/TopBar.tsx frontend/src/__tests__/TopBar.test.tsx
  git commit -m "refactor(topbar): make admin button icon-only without text"
  ```

---

### Task 3: Remove All Mobile-Specific View Styles and Navigation Tabs (`DashboardLayout.tsx` & `DashboardLayout.test.tsx`)

**Files:**
- Modify: `frontend/src/components/DashboardLayout.tsx`
- Modify: `frontend/src/__tests__/DashboardLayout.test.tsx`

**Interfaces:**
- Consumes: `DashboardLayoutProps { className?: string }`
- Produces: Clean unified standard 3-column NVR layout with live spectrum visualizer always active and no mobile tab bars.

- [ ] **Step 1: Update tests in `frontend/src/__tests__/DashboardLayout.test.tsx`**
  - Remove mobile navigation bar and mobile tab switching tests.
  - Add test asserting that `RadioTuningPanel`, `TimelineScrubber`, `LiveSpectrumVisualizer`, and `CallLogPanel` are all simultaneously rendered on screen.
  - Assert that mobile tab bars (`Mobile Navigation` role) are not present.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm test -- src/__tests__/DashboardLayout.test.tsx --run` in `frontend/`
  Expected: FAIL because mobile navigation bar is currently present and spectrum was hidden on mobile.

- [ ] **Step 3: Remove mobile-specific styles and components in `frontend/src/components/DashboardLayout.tsx`**
  - Remove `MobileTab` type and `const [mobileTab, setMobileTab]` state.
  - Restore container class to:
    `className={`h-screen max-h-screen overflow-hidden bg-obsidian text-snow flex flex-col font-circular ${className}`}`
  - Remove `{/* 1b. Mobile Top Navigation Tab Bar (< lg only) */}`.
  - In Left Column (Radio panel), remove `mobileTab === 'radio' ? 'block' : 'hidden lg:block'` and use standard:
    `className="w-72 xl:w-80 shrink-0 border-r border-charcoal bg-obsidian/40 overflow-y-auto h-full min-h-0"`
  - In Live Spectrum Visualizer wrapper, remove `hidden lg:block` and use:
    `className="shrink-0"`
  - In Center Column (Timeline & Controls), remove `mobileTab === 'timeline' ? 'flex' : 'hidden lg:flex'` and use:
    `className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden p-3 md:p-4 gap-3 bg-obsidian h-full"`
  - In Right Column (Call Log), remove `mobileTab === 'history' ? 'flex' : 'hidden lg:flex'` and use:
    `className="w-80 xl:w-[340px] h-full max-h-full min-h-0 flex-shrink-0 flex flex-col overflow-hidden"`
  - Remove `{/* 3. Mobile Bottom Navigation Bar (< lg only) */}` completely.
  - Clean up unused icon imports (`PlayCircle`, `Clock`).

- [ ] **Step 4: Run tests to verify all pass**
  Run: `npm test -- src/__tests__/DashboardLayout.test.tsx --run` in `frontend/`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/DashboardLayout.tsx frontend/src/__tests__/DashboardLayout.test.tsx
  git commit -m "refactor(layout): remove all mobile-specific view styles and navigation tabs"
  ```

---

### Task 4: Full System Verification, Production Build & Deployment

**Files:**
- Test all suites: `frontend/src/__tests__/`
- Backend tests: `backend/tests/`

- [ ] **Step 1: Run full frontend test suite**
  Run: `npm test -- --run` in `frontend/`
  Expected: 9 test files passed, 0 failures.

- [ ] **Step 2: Run frontend production build**
  Run: `npm run build` in `frontend/`
  Expected: `tsc && vite build` completes with 0 errors.

- [ ] **Step 3: Run backend test suite**
  Run: `.venv/bin/pytest backend/tests/ -q`
  Expected: 45 passed.

- [ ] **Step 4: Push to GitHub and Deploy to `immich-server`**
  - Push commit to GitHub `origin master`.
  - Sync code to `immich-server:/home/aeros/containers/sdr-recorder`.
  - Run `docker compose build && docker compose up -d` on `immich-server`.
  - Verify container status is `Up (healthy)`.
