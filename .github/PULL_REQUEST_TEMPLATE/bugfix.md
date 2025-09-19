---
name: Bug Fix
about: Template for pull requests that address reported bugs or regressions.
---

# Summary
<!-- Provide a short description of the bug and the fix. -->

# Root Cause
<!-- Explain the underlying issue (what failed and why). -->

# Repro Steps (Before)
<!--
1. Step 1
2. Step 2
3. Observed behavior: …
-->

# Fix Details (After)
<!--
- What changed in code/config
- Why this resolves the issue
- Any trade-offs
-->

# Affected Scope
<!-- List components, services, or user journeys impacted. Note backward compatibility concerns. -->

# How to Test / Verify
<!--
1. Steps to reproduce now show expected behavior
2. Include tests or logs that demonstrate the fix
-->

# Risk & Rollback Plan
<!--
- Residual risks
- Rollback steps
- Feature flag / canary recommended?
-->

# Checklist
- [ ] Regression/Unit tests added
- [ ] Added/updated docs (if behavior changed)
- [ ] Linked issue(s) closed (e.g., Fixes #123)
- [ ] Labels set (bug, severity, area)
- [ ] Backport required? If yes, list target branches

# Post-Deployment Checks (optional)
<!-- Note metrics/alerts to watch or user reports to monitor after deploy. -->
