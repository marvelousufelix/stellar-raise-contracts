# Success Stories Showcase

## Overview

Issue: #949

This change introduces a frontend success-story showcase to improve campaign inspiration and social proof in the UI.

Files:

- frontend/components/success_stories.tsx
- frontend/components/success_stories.test.tsx

## UX Goals

- Highlight successful campaigns with clear outcome metrics.
- Surface inspirational stories for new creators.
- Keep interactions accessible and mobile-friendly.
- Keep implementation easy to review and safe by default.

## Security Notes

- All user-facing text is sanitized.
- No dangerous HTML injection is used.
- Numbers are clamped before display.
- External campaign links are validated for http/https only.

## Test Coverage

- helper sanitization and formatting functions
- empty-state rendering
- sorted display order by progress
- selection callback behavior
- unsafe URL rejection

Run with:

npm test -- success_stories.test.tsx

## Reviewer Notes

The component is additive and standalone. It can be dropped into existing pages without changing global state or routing behavior.
