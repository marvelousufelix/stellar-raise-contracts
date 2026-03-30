# Progress Visualization Component

## Overview

The `ProgressVisualization` component displays campaign funding progress with multiple visualization styles, milestone markers, and comprehensive accessibility support. It provides real-time progress tracking with customizable display options.

## Features

- **Multiple Display Styles**: Linear, circular, and segmented progress bars
- **Milestone Markers**: Visual indicators for funding milestones
- **Flexible Display**: Show/hide percentage and amount information
- **Currency Support**: Customizable currency symbols and formatting
- **Accessibility**: Full ARIA support with proper semantic markup
- **Responsive Design**: Adapts to different screen sizes
- **Performance**: Memoized calculations for efficient rendering
- **Security**: Sanitized values, clamped ranges, no dangerouslySetInnerHTML

## Props

```typescript
interface ProgressVisualizationProps {
  /** Current funding amount */
  currentAmount: number;
  
  /** Target funding goal */
  goalAmount: number;
  
  /** Milestone thresholds as percentages */
  milestones?: number[];
  
  /** Display style: 'linear' | 'circular' | 'segmented' */
  displayStyle?: "linear" | "circular" | "segmented";
  
  /** Show percentage text */
  showPercentage?: boolean;
  
  /** Show amount text */
  showAmount?: boolean;
  
  /** Currency symbol */
  currencySymbol?: string;
  
  /** Custom label for accessibility */
  label?: string;
  
  /** Callback when progress changes */
  onProgressChange?: (percent: number) => void;
}
```

## Usage

### Linear Progress Bar

```tsx
import ProgressVisualization from './progress_visualization';

function CampaignPage() {
  const [current, setCurrent] = useState(5000);
  const goal = 10000;

  return (
    <ProgressVisualization
      currentAmount={current}
      goalAmount={goal}
      displayStyle="linear"
      milestones={[25, 50, 75, 100]}
      showPercentage={true}
      showAmount={true}
      currencySymbol="$"
      onProgressChange={(percent) => console.log(`Progress: ${percent}%`)}
    />
  );
}
```

### Circular Progress

```tsx
<ProgressVisualization
  currentAmount={5000}
  goalAmount={10000}
  displayStyle="circular"
  showAmount={true}
  currencySymbol="€"
/>
```

### Segmented Progress

```tsx
<ProgressVisualization
  currentAmount={5000}
  goalAmount={10000}
  displayStyle="segmented"
  showPercentage={true}
/>
```

## Display Styles

### Linear
Traditional horizontal progress bar with milestone markers below. Best for desktop and tablet views.

### Circular
Circular progress indicator with percentage in center. Ideal for dashboard and mobile views.

### Segmented
10-segment progress bar showing discrete funding levels. Good for quick visual assessment.

## Milestone Markers

Milestones are displayed as markers on the progress bar at specified percentage thresholds:

- **Reached**: Filled marker indicating milestone achieved
- **Unreached**: Empty marker indicating milestone not yet reached
- **Accessibility**: Each marker has aria-label describing its status

## Color Coding

Progress colors change based on funding level:

- **0-49%**: Red (#FF6B6B) - Low progress
- **50-74%**: Orange (#FFA07A) - Medium progress
- **75-99%**: Teal (#4ECDC4) - High progress
- **100%**: Green (#2ECC71) - Goal achieved

## Accessibility

- **ARIA Progressbar**: Uses `role="progressbar"` with proper attributes
- **Value Attributes**: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- **Descriptive Labels**: `aria-label` and `aria-describedby` for context
- **Semantic HTML**: Proper structure for screen readers
- **Color Contrast**: Meets WCAG AA standards

## Security Considerations

1. **Value Validation**: All amounts clamped to safe ranges
2. **Milestone Sanitization**: Floored and validated to 0-100 range
3. **No HTML Injection**: All content rendered as text nodes
4. **Currency Formatting**: Safe number formatting without user input
5. **Duplicate Removal**: Milestones deduplicated automatically

## Performance

- **Memoized Calculations**: Progress and milestones cached with useMemo
- **Efficient Updates**: Only recalculates when dependencies change
- **Smooth Transitions**: CSS transitions for visual updates
- **No Unnecessary Renders**: Optimized component structure

## Testing

The component includes comprehensive tests covering:

- Progress calculation and clamping
- All display styles (linear, circular, segmented)
- Milestone detection and marking
- Display options (percentage, amount, currency)
- Accessibility attributes and roles
- Color coding based on progress
- Callback functionality
- Edge cases (large amounts, empty milestones, etc.)

**Test Coverage**: ≥ 95%

## Browser Support

- Modern browsers with ES6 support
- SVG support for circular progress
- CSS Grid/Flexbox for layout
- CSS transitions for smooth animations

## Dependencies

- React 16.8+ (hooks)
- @testing-library/react (for testing)

## Related Components

- `MilestoneAnimations`: Celebration animations on milestone reach
- `MilestoneFireworks`: Canvas-based fireworks animation
- `MilestoneAchievements`: Achievement badges and tracking
- `MilestoneStatistics`: Analytics and statistics display

## Styling

The component uses CSS classes for styling:

- `.progress-visualization-linear`: Linear progress container
- `.progress-bar-container`: Progress bar wrapper
- `.progress-bar-fill`: Filled portion of progress bar
- `.progress-info`: Information display area
- `.progress-milestones`: Milestone markers container
- `.milestone-marker`: Individual milestone marker
- `.milestone-marker.reached`: Reached milestone state
- `.progress-visualization-circular`: Circular progress container
- `.progress-circle`: SVG circle element
- `.progress-visualization-segmented`: Segmented progress container
- `.progress-segments`: Segments container
- `.progress-segment`: Individual segment
- `.progress-segment.filled`: Filled segment state
