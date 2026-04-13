## Contributing

### Workflow

- Prefer small PRs: one feature/fix per PR
- Keep user-facing copy plain-language and consistent with VERIFIED vs NEEDS_REVIEW behavior

### Local dev

See `SETUP.md`.

### Quality bar

- No raw backend errors shown to users
- Respect receipt status gating:
  - VERIFIED impacts analytics
  - NEEDS_REVIEW visible in Library, excluded from analytics

### Before pushing

- `backend`: `npx tsc --noEmit`
- `frontend`: `npx tsc --noEmit`
- Smoke flows:
  - Scan → Library → approve → Home/Insights counts update
  - Shared → household total appears when household exists
  - Assistant quick chips behave when no verified receipts

