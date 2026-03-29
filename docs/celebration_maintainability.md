# CelebrationMaintainability

Highly maintainable milestone celebration system for the Stellar Raise crowdfunding dApp.
Provides robust error handling, configuration validation, and comprehensive monitoring
for reliable milestone celebrations in production environments.

---

## Overview

This module provides a celebration component designed with maintainability as the primary focus.
It includes built-in error boundaries, configuration validation, performance monitoring,
and extensive logging capabilities to ensure reliable operation and easy debugging.

```
CelebrationMaintainability          ← Main component with error boundary
  ├── Configuration validation     ← Runtime config checking
  ├── Error recovery               ← Graceful error handling
  ├── Performance monitoring       ← Render metrics and logging
  ├── Debug features               ← Development aids
  └── Accessibility features       ← Full WCAG compliance
```

---

## Components

### CelebrationMaintainability

The main component that orchestrates milestone celebrations with comprehensive maintainability features.

```tsx
import CelebrationMaintainability from "../components/celebration_maintainability";

<CelebrationMaintainability
  milestones={milestones}
  currentPercent={fundingPercent}
  campaignName="Solar Farm Initiative"
  autoDismissMs={5000}
  onDismiss={() => markCelebrated(milestoneId)}
  onMilestoneReach={(m) => console.log("reached", m.label)}
  debug={process.env.NODE_ENV === "development"}
  onError={(error) => reportError(error)}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `milestones` | `MaintainableMilestone[]` | — | Array of milestone definitions (required) |
| `currentPercent` | `number` | — | Current funding percentage 0–100 (required, clamped internally) |
| `campaignName` | `string` | `undefined` | Optional campaign name shown in the celebration header |
| `autoDismissMs` | `number` | `5000` | Auto-dismiss delay in ms. `0` disables auto-dismiss |
| `onDismiss` | `() => void` | `undefined` | Callback fired when celebration is dismissed |
| `onMilestoneReach` | `(milestone: MaintainableMilestone) => void` | `undefined` | Callback fired when milestone is reached |
| `showProgressBar` | `boolean` | `true` | Whether to render the progress bar |
| `className` | `string` | `undefined` | Additional CSS class applied to the root element |
| `id` | `string` | `undefined` | HTML `id` attribute for the root element |
| `debug` | `boolean` | `false` | Enable debug logging and metrics display |
| `onError` | `(error: Error) => void` | `undefined` | Custom error handler callback |

#### Milestone Interface

```tsx
interface MaintainableMilestone {
  id: string;              // Unique identifier
  label: string;           // Human-readable label
  targetPercent: number;   // Target percentage (0-100)
  status: MilestoneStatus; // Current status
  reachedAt?: number;      // Optional timestamp
  config?: Record<string, unknown>; // Optional custom configuration
}
```

---

## Maintainability Features

### Configuration Validation

The component validates all input props at runtime and displays helpful error messages
when invalid configurations are detected.

```tsx
// Valid configuration
const validConfig = {
  milestones: [
    { id: "m1", label: "25% Funded", targetPercent: 25, status: "pending" }
  ],
  currentPercent: 50
};

// Invalid configuration (will show error UI)
const invalidConfig = {
  milestones: "not an array", // Error: milestones must be an array
  currentPercent: "not a number" // Error: currentPercent must be a number
};
```

### Error Boundary

Wrapped in a React error boundary that catches rendering errors and displays
a user-friendly error message instead of crashing the application.

```tsx
// Automatic error recovery
<CelebrationMaintainability
  onError={(error) => {
    // Log to monitoring service
    analytics.trackError(error);
  }}
  debug={true} // Shows detailed error info in development
  {...props}
/>
```

### Performance Monitoring

Tracks render counts, error counts, and timing metrics to help identify
performance issues and component health.

```tsx
// Debug mode shows metrics panel
<CelebrationMaintainability
  debug={true}
  // Shows: renders, errors, config validity, last render time
/>
```

### Debug Features

When `debug={true}`, the component provides:
- Console logging for key events
- Visual debug panel with metrics
- Detailed error information
- Configuration validation feedback

---

## Security Considerations

### Input Sanitization

All user-supplied strings are sanitized to prevent XSS attacks:
- Control characters are stripped
- HTML tags are not rendered
- Length limits prevent layout abuse

### Safe CSS Generation

- Progress values are clamped to prevent invalid CSS
- No dynamic style injection from user input
- All styles are compile-time constants

### Error Handling

- Errors are caught and handled gracefully
- No sensitive information exposed in error messages
- Custom error handlers can be provided for logging

---

## Accessibility

### ARIA Support

- Celebration panel uses `role="status"` and `aria-live="polite"`
- Dismiss button has proper `aria-label`
- Progress elements have full ARIA attributes
- Screen reader friendly status announcements

### Keyboard Navigation

- Dismiss button is keyboard accessible
- All interactive elements meet minimum touch targets
- Focus management for modal-like behavior

### Visual Accessibility

- High contrast color schemes
- Clear visual hierarchy
- Readable font sizes and spacing

---

## Testing

The component includes comprehensive unit tests covering:
- All pure helper functions (100% coverage)
- Component rendering and interactions
- Error handling and recovery
- Accessibility features
- Security validations
- Performance characteristics

```bash
# Run tests with coverage
npm test -- --testPathPattern=celebration_maintainability --coverage

# Expected: ≥95% statement/branch/function/line coverage
```

---

## Usage Examples

### Basic Usage

```tsx
import CelebrationMaintainability from "./components/celebration_maintainability";

function CampaignProgress({ campaign }) {
  return (
    <CelebrationMaintainability
      milestones={campaign.milestones}
      currentPercent={campaign.fundingPercent}
      campaignName={campaign.name}
    />
  );
}
```

### With Error Handling

```tsx
function RobustCampaignProgress({ campaign }) {
  const handleError = useCallback((error) => {
    // Send to error monitoring service
    Sentry.captureException(error);
  }, []);

  return (
    <CelebrationMaintainability
      milestones={campaign.milestones}
      currentPercent={campaign.fundingPercent}
      campaignName={campaign.name}
      onError={handleError}
      debug={process.env.NODE_ENV === 'development'}
    />
  );
}
```

### With Custom Callbacks

```tsx
function InteractiveCampaignProgress({ campaign, onCelebrate }) {
  const handleMilestoneReach = useCallback((milestone) => {
    // Update backend
    api.markMilestoneReached(milestone.id);
    // Trigger celebration effects
    onCelebrate(milestone);
  }, [onCelebrate]);

  const handleDismiss = useCallback(() => {
    // Analytics tracking
    analytics.track('celebration_dismissed');
  }, []);

  return (
    <CelebrationMaintainability
      milestones={campaign.milestones}
      currentPercent={campaign.fundingPercent}
      campaignName={campaign.name}
      onMilestoneReach={handleMilestoneReach}
      onDismiss={handleDismiss}
    />
  );
}
```

---

## Migration Guide

### From CelebrationModularity

If migrating from `CelebrationModularity`, the API is fully compatible:

```tsx
// Old
import CelebrationModularity from "./celebration_modularity";

// New
import CelebrationMaintainability from "./celebration_maintainability";

// Same props, enhanced maintainability
<CelebrationMaintainability {...existingProps} />
```

### Adding Maintainability Features

```tsx
// Before
<CelebrationModularity
  milestones={milestones}
  currentPercent={percent}
/>

// After - with maintainability
<CelebrationMaintainability
  milestones={milestones}
  currentPercent={percent}
  debug={isDevelopment}
  onError={handleError}
  onMilestoneReach={trackMilestone}
  onDismiss={trackDismiss}
/>
```

---

## Troubleshooting

### Configuration Errors

If you see "Configuration Error":
1. Check that `milestones` is an array
2. Verify each milestone has required properties
3. Ensure `currentPercent` is a number
4. Check milestone `status` values are valid

### Performance Issues

If experiencing performance problems:
1. Enable `debug={true}` to see render metrics
2. Check for unnecessary re-renders
3. Verify milestone objects are stable references
4. Consider memoizing milestone arrays

### Accessibility Issues

For accessibility concerns:
1. Test with screen readers
2. Verify color contrast ratios
3. Check keyboard navigation
4. Validate ARIA implementation

---

## API Reference

### Exported Types

- `MaintainableMilestone` - Milestone configuration interface
- `CelebrationMaintainabilityProps` - Component props interface
- `MilestoneStatus` - Union type for milestone states

### Exported Constants

- `DEFAULT_AUTO_DISMISS_MS = 5000`
- `MAX_CAMPAIGN_NAME_LENGTH = 60`
- `MAX_MILESTONE_LABEL_LENGTH = 80`
- `MILESTONE_ICONS` - Status icon mapping
- `MILESTONE_STATUS_LABELS` - Status label mapping

### Exported Functions

- `clampPercent(value: number): number`
- `sanitizeString(input: unknown, fallback: string, maxLength?: number): string`
- `isValidStatus(value: unknown): value is MilestoneStatus`
- `resolveStatus(value: unknown): MilestoneStatus`
- `findActiveCelebration(milestones: MaintainableMilestone[]): MaintainableMilestone | null`
- `validateConfig(props: CelebrationMaintainabilityProps): { valid: boolean; errors: string[] }`
- `formatPercent(value: number): string`