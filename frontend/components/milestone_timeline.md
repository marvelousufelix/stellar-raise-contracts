# Milestone Timeline Component

## Overview

The `MilestoneTimeline` component displays campaign progress with celebration milestones, providing visual feedback as funding goals are reached.

## Features

- **Progress Tracking**: Real-time progress bar showing percentage of goal reached
- **Milestone Markers**: Visual indicators for key funding milestones (25%, 50%, 75%, 100%)
- **Celebration Feedback**: Emoji celebration icons when milestones are reached
- **Customizable Milestones**: Support for custom milestone percentages
- **Accessibility**: ARIA labels and semantic HTML for screen readers
- **Responsive Design**: Works on all screen sizes
- **Currency Formatting**: Automatic locale-aware number formatting

## Props

```typescript
interface MilestoneTimelineProps {
  currentAmount: number;        // Current funds raised
  goalAmount: number;           // Target funding goal
  milestones?: number[];        // Array of milestone percentages (default: [25, 50, 75, 100])
  onMilestoneReached?: (milestone: Milestone) => void;  // Callback when milestone reached
}
```

## Usage

### Basic Usage

```tsx
<MilestoneTimeline
  currentAmount={500}
  goalAmount={1000}
/>
```

### With Custom Milestones

```tsx
<MilestoneTimeline
  currentAmount={500}
  goalAmount={1000}
  milestones={[10, 25, 50, 75, 90, 100]}
/>
```

### With Callback

```tsx
<MilestoneTimeline
  currentAmount={500}
  goalAmount={1000}
  onMilestoneReached={(milestone) => {
    console.log(`Milestone ${milestone.percentage}% reached!`);
    // Trigger celebration animation
  }}
/>
```

## Milestone Object

```typescript
interface Milestone {
  id: string;              // Unique identifier
  percentage: number;      // Milestone percentage
  label: string;          // Display label
  description?: string;   // Milestone description
  reached: boolean;       // Whether milestone is reached
  reachedAt?: Date;      // When milestone was reached
}
```

## Styling

The component uses CSS classes for styling:

- `.milestone-timeline` - Main container
- `.progress-bar-container` - Progress bar wrapper
- `.progress-fill` - Filled portion of progress bar
- `.milestones-container` - Milestones list
- `.milestone` - Individual milestone
- `.milestone.reached` - Reached milestone state
- `.milestone.pending` - Pending milestone state
- `.celebration-icon` - Celebration emoji

## Accessibility

- Progress bar has `role="progressbar"` with ARIA attributes
- Semantic HTML structure
- Keyboard navigable
- Screen reader friendly

## Test Coverage

The component includes 15+ test cases covering:

- Component rendering
- Progress calculation
- Milestone display and state
- Callback functionality
- Edge cases (zero goal, over-goal amounts)
- Accessibility features
- Currency formatting
- Dynamic updates

## Performance

- Uses `useMemo` for milestone calculations
- Efficient re-renders with proper dependency arrays
- Minimal DOM updates

## Security Assumptions

- Input values are validated before rendering
- No user input is directly rendered without sanitization
- Callbacks are optional and safely handled
