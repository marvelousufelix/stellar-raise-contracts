# Milestone Statistics Component

## Overview

The `MilestoneStatistics` component displays comprehensive analytics and statistics for campaign milestones. It tracks funding velocity, contributor metrics, milestone progress, and provides real-time campaign insights in multiple display formats.

## Features

- **Multiple Display Layouts**: Grid, table, and summary views
- **Funding Analytics**: Progress tracking, velocity calculation, and projections
- **Contributor Metrics**: Count, average contribution, and trends
- **Milestone Tracking**: Progress toward funding milestones
- **Trend Indicators**: Visual indicators for positive/negative trends
- **Accessibility**: Full ARIA support with semantic markup
- **Callbacks**: Event notifications for statistics updates
- **Security**: Sanitized data, validated ranges, no dangerouslySetInnerHTML

## Props

```typescript
interface MilestoneStatisticsProps {
  /** Current funding amount */
  currentAmount: number;
  
  /** Target funding goal */
  goalAmount: number;
  
  /** Number of contributors */
  contributorCount: number;
  
  /** Average contribution amount */
  averageContribution?: number;
  
  /** Funding velocity (amount per day) */
  fundingVelocity?: number;
  
  /** Days remaining until deadline */
  daysRemaining?: number;
  
  /** Display layout: 'grid' | 'table' | 'summary' */
  layout?: "grid" | "table" | "summary";
  
  /** Show trend indicators */
  showTrends?: boolean;
  
  /** Currency symbol */
  currencySymbol?: string;
  
  /** Callback for statistic updates */
  onStatisticsUpdate?: (stats: MilestoneStatistic[]) => void;
}
```

## Usage

### Grid Layout

```tsx
import MilestoneStatistics from './milestone_statistics';

function CampaignDashboard() {
  const [campaignData, setCampaignData] = useState({
    currentAmount: 5000,
    goalAmount: 10000,
    contributorCount: 42,
    averageContribution: 119,
    fundingVelocity: 500,
    daysRemaining: 15,
  });

  const handleStatisticsUpdate = (stats) => {
    console.log('Statistics updated:', stats);
  };

  return (
    <MilestoneStatistics
      currentAmount={campaignData.currentAmount}
      goalAmount={campaignData.goalAmount}
      contributorCount={campaignData.contributorCount}
      averageContribution={campaignData.averageContribution}
      fundingVelocity={campaignData.fundingVelocity}
      daysRemaining={campaignData.daysRemaining}
      layout="grid"
      showTrends={true}
      currencySymbol="$"
      onStatisticsUpdate={handleStatisticsUpdate}
    />
  );
}
```

### Table Layout

```tsx
<MilestoneStatistics
  currentAmount={5000}
  goalAmount={10000}
  contributorCount={42}
  averageContribution={119}
  fundingVelocity={500}
  daysRemaining={15}
  layout="table"
  showTrends={true}
/>
```

### Summary Layout

```tsx
<MilestoneStatistics
  currentAmount={5000}
  goalAmount={10000}
  contributorCount={42}
  averageContribution={119}
  fundingVelocity={500}
  daysRemaining={15}
  layout="summary"
/>
```

## Display Layouts

### Grid Layout
Card-based grid display with individual statistics, descriptions, and trend indicators. Best for dashboards and detailed views.

### Table Layout
Tabular display with metrics, values, trends, and details in columns. Ideal for data-heavy views and comparisons.

### Summary Layout
Compact 4-item summary showing key metrics. Perfect for sidebars and mobile views.

## Statistics Provided

The component calculates and displays:

1. **Funding Progress**: Current percentage toward goal with amount details
2. **Contributors**: Total contributor count with average contribution
3. **Funding Velocity**: Daily funding rate with projection
4. **Time Remaining**: Days left until deadline
5. **Milestones Reached**: Number of funding milestones achieved

## Trend Indicators

Trends are calculated based on funding velocity and time remaining:

- **Up (↑)**: Positive trend - on track or exceeding projections
- **Down (↓)**: Negative trend - below projected funding
- **Neutral (→)**: Stable trend - on pace

Trends can be hidden with `showTrends={false}`.

## Currency Formatting

The component supports any currency symbol:

```tsx
// US Dollar
<MilestoneStatistics currencySymbol="$" ... />

// Euro
<MilestoneStatistics currencySymbol="€" ... />

// British Pound
<MilestoneStatistics currencySymbol="£" ... />

// Japanese Yen
<MilestoneStatistics currencySymbol="¥" ... />
```

Large amounts are automatically formatted with thousands separators.

## Callbacks

The `onStatisticsUpdate` callback is triggered whenever statistics are recalculated:

```tsx
const handleStatisticsUpdate = (statistics: MilestoneStatistic[]) => {
  statistics.forEach(stat => {
    console.log(`${stat.label}: ${stat.value}${stat.unit || ''}`);
    if (stat.description) {
      console.log(`  Details: ${stat.description}`);
    }
  });
};
```

## Accessibility

- **Region Role**: Uses `role="region"` with descriptive aria-label
- **Semantic Tables**: Proper `<thead>`, `<tbody>`, and `<th>` elements
- **Trend Icons**: Marked as `aria-hidden` as they're decorative
- **Card Labels**: Each statistic card has aria-label
- **Semantic HTML**: Proper heading hierarchy and structure

## Security Considerations

1. **Value Validation**: All amounts clamped to safe ranges
2. **No HTML Injection**: All content rendered as text nodes
3. **Currency Formatting**: Safe number formatting without user input
4. **Data Sanitization**: All input values validated and clamped
5. **Callback Safety**: Callbacks only triggered on actual changes

## Performance

- **Memoized Calculations**: Statistics cached with useMemo
- **Efficient Updates**: Only recalculates when dependencies change
- **No Unnecessary Renders**: Optimized component structure
- **Lazy Callbacks**: Callbacks only invoked when statistics change

## Testing

The component includes comprehensive tests covering:

- Statistics calculation and accuracy
- All display layouts (grid, table, summary)
- Trend detection and indicators
- Currency formatting with various symbols
- Callback functionality
- Accessibility attributes and roles
- Time formatting (days, hours, etc.)
- Edge cases (zero values, large amounts, negative values)
- Statistics updates and memoization

**Test Coverage**: ≥ 95%

## Browser Support

- Modern browsers with ES6 support
- CSS Grid/Flexbox for layout
- No external dependencies beyond React

## Dependencies

- React 16.8+ (hooks)
- @testing-library/react (for testing)

## Related Components

- `ProgressVisualization`: Campaign progress display
- `MilestoneAnimations`: Celebration animations
- `MilestoneAchievements`: Achievement badges and tracking
- `MilestoneFireworks`: Canvas-based fireworks

## Styling

The component uses CSS classes for styling:

- `.milestone-statistics-grid`: Grid layout container
- `.statistics-grid`: Grid container for cards
- `.statistic-card`: Individual statistic card
- `.statistic-header`: Card header with label and trend
- `.statistic-value`: Value display area
- `.statistic-description`: Description text
- `.statistic-trend`: Trend indicator icon
- `.milestone-statistics-table`: Table layout container
- `.statistics-table`: Table element
- `.metric-label`: Metric name column
- `.metric-value`: Value column
- `.metric-trend`: Trend column
- `.metric-description`: Description column
- `.milestone-statistics-summary`: Summary layout container
- `.summary-grid`: Summary items grid
- `.summary-item`: Individual summary item
- `.summary-label`: Item label
- `.summary-value`: Item value
- `.summary-detail`: Item detail text

## Color Coding

Trend indicators use semantic colors:

- **Green (#2ECC71)**: Positive trend (up)
- **Red (#E74C3C)**: Negative trend (down)
- **Gray (#95A5A6)**: Neutral trend (stable)
