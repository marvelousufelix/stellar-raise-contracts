# Milestone Achievements Component

## Overview

The `MilestoneAchievements` component displays gamification elements and achievement badges for campaign milestones. It tracks unlocked achievements, displays them in multiple layouts, and provides callbacks for achievement events.

## Features

- **Multiple Display Layouts**: Grid, list, and compact views
- **Achievement Tracking**: Automatic detection and unlock of milestones
- **Customizable Achievements**: Support for custom achievement definitions
- **Progress Tracking**: Visual progress indicator for achievement completion
- **Accessibility**: Full ARIA support with semantic markup
- **Callbacks**: Event notifications when achievements are unlocked
- **Security**: Sanitized data, validated ranges, no dangerouslySetInnerHTML

## Props

```typescript
interface MilestoneAchievementsProps {
  /** Current funding percentage (0-100) */
  currentPercent: number;
  
  /** Display layout: 'grid' | 'list' | 'compact' */
  layout?: "grid" | "list" | "compact";
  
  /** Show achievement descriptions */
  showDescriptions?: boolean;
  
  /** Show unlock timestamps */
  showTimestamps?: boolean;
  
  /** Callback when achievement unlocked */
  onAchievementUnlocked?: (achievement: Achievement) => void;
  
  /** Custom achievements */
  customAchievements?: Achievement[];
}
```

## Achievement Interface

```typescript
interface Achievement {
  id: string;
  percent: number;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}
```

## Usage

### Grid Layout

```tsx
import MilestoneAchievements from './milestone_achievements';

function CampaignPage() {
  const [fundingPercent, setFundingPercent] = useState(50);

  const handleAchievementUnlocked = (achievement) => {
    console.log(`Unlocked: ${achievement.title}`);
    // Show notification, update analytics, etc.
  };

  return (
    <MilestoneAchievements
      currentPercent={fundingPercent}
      layout="grid"
      showDescriptions={true}
      showTimestamps={true}
      onAchievementUnlocked={handleAchievementUnlocked}
    />
  );
}
```

### List Layout

```tsx
<MilestoneAchievements
  currentPercent={fundingPercent}
  layout="list"
  showDescriptions={true}
/>
```

### Compact Layout

```tsx
<MilestoneAchievements
  currentPercent={fundingPercent}
  layout="compact"
/>
```

### Custom Achievements

```tsx
const customAchievements = [
  {
    id: "early-bird",
    percent: 5,
    title: "Early Bird",
    description: "Backed within first 24 hours",
    icon: "🐦",
    unlocked: false,
  },
  {
    id: "power-backer",
    percent: 50,
    title: "Power Backer",
    description: "Reached 50% funding milestone",
    icon: "⚡",
    unlocked: false,
  },
];

<MilestoneAchievements
  currentPercent={fundingPercent}
  customAchievements={customAchievements}
  onAchievementUnlocked={handleAchievementUnlocked}
/>
```

## Default Achievements

The component includes five default achievements:

1. **Campaign Started** (0%) - Campaign has been created and is live
2. **Quarter Way There** (25%) - Reached 25% of funding goal
3. **Halfway Home** (50%) - Reached 50% of funding goal
4. **Almost There** (75%) - Reached 75% of funding goal
5. **Goal Achieved** (100%) - Successfully reached 100% of funding goal

## Display Layouts

### Grid Layout
Card-based grid display with icons, titles, descriptions, and unlock badges. Best for desktop views with detailed information.

### List Layout
Vertical list with achievement items, showing titles, descriptions, and status. Good for mobile and detailed views.

### Compact Layout
Minimal icon-only display showing achievement badges in a row. Ideal for sidebars and compact spaces.

## Achievement Unlock Detection

Achievements are automatically unlocked when the funding percentage reaches or exceeds the achievement's threshold:

- Achievement at 25% unlocks when currentPercent >= 25
- Achievement at 50% unlocks when currentPercent >= 50
- And so on...

## Callbacks

The `onAchievementUnlocked` callback is triggered when an achievement transitions from locked to unlocked:

```tsx
const handleAchievementUnlocked = (achievement: Achievement) => {
  console.log(`Achievement unlocked: ${achievement.title}`);
  console.log(`Unlocked at: ${new Date(achievement.unlockedAt)}`);
  
  // Trigger animations, notifications, analytics, etc.
};
```

## Accessibility

- **Region Role**: Uses `role="region"` with descriptive aria-label
- **Article Role**: Each achievement has `role="article"` in grid layout
- **Achievement Labels**: Each achievement has aria-label describing status
- **Live Region**: Achievement count updates announced via aria-live
- **Decorative Elements**: Badges and icons marked as aria-hidden
- **Semantic Structure**: Proper heading hierarchy and list semantics

## Security Considerations

1. **Data Sanitization**: Achievement titles and descriptions truncated and validated
2. **Value Clamping**: Percentages clamped to 0-100 range
3. **Icon Validation**: Icons limited to 2 characters
4. **No HTML Injection**: All content rendered as text nodes
5. **Callback Safety**: Callbacks only triggered for newly unlocked achievements

## Performance

- **Memoized Calculations**: Achievement status and progress cached
- **Efficient Updates**: Only recalculates when dependencies change
- **Ref-based Tracking**: Uses useRef to track previously unlocked achievements
- **No Unnecessary Renders**: Optimized component structure

## Testing

The component includes comprehensive tests covering:

- Achievement detection and unlock tracking
- All display layouts (grid, list, compact)
- Display options (descriptions, timestamps)
- Achievement callbacks and event handling
- Custom achievement support
- Accessibility attributes and roles
- Progress calculation
- Edge cases (empty achievements, large percentages, etc.)

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
- `MilestoneFireworks`: Canvas-based fireworks
- `MilestoneStatistics`: Analytics and statistics

## Styling

The component uses CSS classes for styling:

- `.milestone-achievements-grid`: Grid layout container
- `.achievement-card`: Individual achievement card
- `.achievement-card.unlocked`: Unlocked achievement state
- `.achievement-card.locked`: Locked achievement state
- `.achievement-icon`: Achievement icon element
- `.achievement-title`: Achievement title
- `.achievement-description`: Achievement description
- `.achievement-badge`: Unlock badge (checkmark)
- `.milestone-achievements-list`: List layout container
- `.achievement-item`: Individual list item
- `.milestone-achievements-compact`: Compact layout container
- `.achievement-compact`: Compact achievement badge
- `.achievements-progress`: Progress bar container
- `.progress-fill`: Progress bar fill element
