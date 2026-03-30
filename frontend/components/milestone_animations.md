# Milestone Animations Component

## Overview

The `MilestoneAnimations` component renders celebration animations when campaign funding milestones are reached. It supports multiple animation types (confetti, pulse, bounce) with customizable duration and intensity.

## Features

- **Multiple Animation Types**: Confetti, pulse, and bounce animations
- **Customizable Intensity**: Control particle speed and spread (1-10 scale)
- **Auto-Dismiss**: Optional automatic dismissal after specified delay
- **Accessibility**: Full ARIA support and prefers-reduced-motion compliance
- **Performance**: Efficient particle updates with cleanup on unmount
- **Security**: No dangerouslySetInnerHTML, sanitized values, clamped ranges

## Props

```typescript
interface MilestoneAnimationsProps {
  /** Current funding percentage (0-100) */
  currentPercent: number;
  
  /** Milestone thresholds to trigger animations */
  milestones: number[];
  
  /** Animation type: 'confetti' | 'pulse' | 'bounce' */
  animationType?: "confetti" | "pulse" | "bounce";
  
  /** Duration of animation in milliseconds */
  duration?: number;
  
  /** Intensity of animation (1-10) */
  intensity?: number;
  
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  
  /** Auto-dismiss delay in milliseconds */
  autoDismissMs?: number;
}
```

## Usage

```tsx
import MilestoneAnimations from './milestone_animations';

function CampaignPage() {
  const [fundingPercent, setFundingPercent] = useState(0);

  return (
    <>
      <MilestoneAnimations
        currentPercent={fundingPercent}
        milestones={[25, 50, 75, 100]}
        animationType="confetti"
        duration={2000}
        intensity={7}
        autoDismissMs={3000}
        onAnimationComplete={() => console.log('Animation done!')}
      />
      {/* Campaign content */}
    </>
  );
}
```

## Animation Types

### Confetti
Particles burst outward with gravity, creating a celebratory confetti effect.

### Pulse
Particles expand and fade from center, creating a pulsing wave effect.

### Bounce
Particles bounce with physics simulation, creating a bouncy celebration.

## Accessibility

- **ARIA Live Region**: Uses `role="status"` and `aria-live="polite"` for screen reader announcements
- **Reduced Motion**: Respects `prefers-reduced-motion` media query
- **SVG Hidden**: Canvas/SVG elements are `aria-hidden="true"` as they're decorative
- **Semantic HTML**: Proper semantic structure for assistive technologies

## Security Considerations

1. **No Dangerously Set HTML**: All content rendered as React text nodes
2. **Value Clamping**: Percentages clamped to 0-100, intensity to 1-10
3. **Sanitized Milestones**: Milestone values are floored and validated
4. **Hardcoded Colors**: Animation colors are hardcoded, not user-controlled
5. **Timer Cleanup**: All timers and animation frames cancelled on unmount
6. **Callback Guards**: Callbacks guarded against post-unmount calls

## Performance

- **Efficient Particle Updates**: Only active particles are updated each frame
- **Automatic Cleanup**: Particles removed when life expires
- **RequestAnimationFrame**: Uses native browser animation timing
- **Memory Management**: All references cleared on unmount

## Testing

The component includes comprehensive tests covering:

- Milestone detection and triggering
- Animation lifecycle and completion
- Auto-dismiss functionality
- Multiple animation types
- Intensity control and clamping
- Accessibility attributes
- Cleanup and memory management
- Edge cases (empty milestones, negative percentages, rapid updates)

**Test Coverage**: ≥ 95%

## Browser Support

- Modern browsers with ES6 support
- Canvas/SVG support required
- RequestAnimationFrame support required
- CSS Grid/Flexbox for layout

## Dependencies

- React 16.8+ (hooks)
- @testing-library/react (for testing)

## Related Components

- `MilestoneFireworks`: Canvas-based fireworks animation
- `ProgressVisualization`: Campaign progress display
- `MilestoneAchievements`: Achievement badges and tracking
- `MilestoneStatistics`: Analytics and statistics display
