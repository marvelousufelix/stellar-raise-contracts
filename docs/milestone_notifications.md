# milestone_notifications

## Overview

`milestone_notifications.tsx` is a React component module that improves user engagement by exposing the next meaningful campaign milestones.

## Features

- `clampProgress` for robust progress clamping and NaN handling.
- `sanitizeLabel` to strip dangerous angle brackets and reduce long-string risk.
- `getUpcomingMilestones` to focus UI on the next 3 milestones that are not yet reached.
- A JS-friendly notification panel with accessible progress bar semantics.

## Security assumptions

1. Input strings are sanitized using a minimal XSS vector mitigation rule set.
2. Numeric values are always normalized with `clampProgress`.
3. Click callbacks are passed from parent components, enabling auth/guard logic outside of this module.
4. Component is UI-only; does not mutate state directly and can be safely used in static snapshot tests.
