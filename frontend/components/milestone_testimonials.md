# MilestoneTestimonials Component

## Overview

The `MilestoneTestimonials` component displays campaign milestone celebration testimonials with social proof, contributor quotes, and achievement stories. It provides an accessible carousel interface for showcasing community support and building trust.

## Features

- **Carousel Interface**: Navigate through testimonials with previous/next buttons
- **Indicator Dots**: Quick navigation to specific testimonials
- **Star Ratings**: Display contributor satisfaction ratings (0-5 stars)
- **Keyboard Navigation**: Arrow keys for carousel navigation
- **Accessibility**: Full ARIA support and semantic HTML
- **XSS Protection**: Sanitizes all user-supplied strings
- **Responsive Design**: Works on all screen sizes

## Props

```typescript
interface MilestoneTestimonialsProps {
  /** Campaign name to display */
  campaignName: string;
  
  /** Array of testimonials to display */
  testimonials: Testimonial[];
  
  /** Optional callback when a testimonial is selected */
  onTestimonialSelect?: (testimonial: Testimonial) => void;
}

interface Testimonial {
  /** Unique identifier */
  id: string;
  
  /** Contributor's name */
  contributor: string;
  
  /** Testimonial content/quote */
  content: string;
  
  /** Associated milestone (e.g., "50% Funded") */
  milestone: string;
  
  /** Date of testimonial */
  date: Date;
  
  /** Optional rating (0-5 stars) */
  rating?: number;
}
```

## Usage

```tsx
import MilestoneTestimonials from './milestone_testimonials';

const testimonials = [
  {
    id: 't1',
    contributor: 'Alice Johnson',
    content: 'This campaign exceeded my expectations!',
    milestone: '50% Funded',
    date: new Date('2026-03-20'),
    rating: 5,
  },
  {
    id: 't2',
    contributor: 'Bob Smith',
    content: 'Great community support throughout the journey.',
    milestone: '75% Funded',
    date: new Date('2026-03-25'),
    rating: 4,
  },
];

<MilestoneTestimonials
  campaignName="My Campaign"
  testimonials={testimonials}
  onTestimonialSelect={(testimonial) => console.log('Selected:', testimonial)}
/>
```

## Security

### Input Sanitization

- **Testimonial Content**: Sanitized to remove HTML tags and limited to 500 characters
- **Contributor Names**: Sanitized to prevent XSS and limited to 50 characters
- **Milestone Text**: Sanitized to remove dangerous content
- **Ratings**: Validated and clamped to [0, 5] range

### No Dangerous APIs

- No `dangerouslySetInnerHTML` usage
- All content rendered as React text nodes
- No user-controlled CSS or styling injection

## Accessibility

### ARIA Attributes

- Region has `aria-label` for semantic structure
- Counter has `aria-live="polite"` for announcements
- Indicators have `aria-current="page"` for active state
- Rating has `aria-label` describing star count
- Stars have `aria-hidden="true"` (decorative)

### Keyboard Support

- Arrow Left/Right keys navigate carousel
- Tab key navigates buttons
- Enter/Space keys activate buttons
- Full keyboard accessibility

### Screen Reader Support

- Semantic HTML structure
- Descriptive ARIA labels
- Live region announcements for carousel changes
- Proper button labels for all controls

## Helper Functions

### `sanitizeTestimonialText(text: string): string`

Removes HTML tags and truncates to 500 characters.

```typescript
sanitizeTestimonialText("<script>alert('xss')</script>") // "scriptalert('xss')/script"
```

### `sanitizeContributorName(name: string): string`

Removes HTML tags and truncates to 50 characters.

```typescript
sanitizeContributorName("John <script>") // "John script"
```

### `validateRating(rating?: number): number`

Validates and clamps rating to [0, 5] range.

```typescript
validateRating(10) // 5
validateRating(-1) // 0
validateRating(undefined) // 0
```

### `formatTestimonialDate(date: Date): string`

Formats date for display.

```typescript
formatTestimonialDate(new Date("2026-03-29")) // "3/29/2026"
```

## Styling

The component uses BEM naming convention for CSS classes:

- `.milestone-testimonials` - Root container
- `.milestone-testimonials__title` - Campaign title
- `.milestone-testimonials__carousel` - Carousel container
- `.milestone-testimonials__card` - Testimonial card
- `.milestone-testimonials__header` - Testimonial header
- `.milestone-testimonials__contributor` - Contributor name
- `.milestone-testimonials__meta` - Metadata (milestone, date)
- `.milestone-testimonials__milestone` - Milestone label
- `.milestone-testimonials__date` - Date display
- `.milestone-testimonials__rating` - Rating container
- `.milestone-testimonials__star` - Individual star
- `.milestone-testimonials__star--filled` - Filled star modifier
- `.milestone-testimonials__content` - Testimonial content
- `.milestone-testimonials__select-btn` - View Full Story button
- `.milestone-testimonials__controls` - Navigation controls
- `.milestone-testimonials__nav-btn` - Navigation button
- `.milestone-testimonials__nav-btn--prev` - Previous button modifier
- `.milestone-testimonials__nav-btn--next` - Next button modifier
- `.milestone-testimonials__indicators` - Indicator dots container
- `.milestone-testimonials__indicator` - Individual indicator dot
- `.milestone-testimonials__indicator--active` - Active indicator modifier
- `.milestone-testimonials__counter` - Testimonial counter
- `.milestone-testimonials__empty` - Empty state message

## Testing

The component includes comprehensive tests covering:

- **Helper Functions**: Sanitization, validation, date formatting
- **Rendering**: Component rendering, testimonial display, ratings
- **Carousel Navigation**: Next/previous buttons, indicator buttons, wrapping
- **Keyboard Navigation**: Arrow key support
- **Accessibility**: ARIA attributes, semantic HTML, screen reader support
- **Interactions**: Click handlers, callbacks
- **Edge Cases**: Empty arrays, missing ratings, long content

Test coverage: **≥ 95%**

## Performance

- Efficient state management with `useState`
- Memoized testimonial enrichment
- Minimal DOM updates on navigation
- No unnecessary re-renders

## Browser Support

- Modern browsers with ES6+ support
- Requires React 16.8+ (hooks)
- Accessible on all major screen readers

## Related Components

- `MilestoneHighlights` - Milestone progress display
- `MilestoneFireworks` - Animated celebration overlay
- `CelebrationInsights` - Campaign celebration analytics

## Best Practices

1. **Provide Diverse Testimonials**: Include testimonials from different milestone stages
2. **Include Ratings**: Star ratings increase credibility and engagement
3. **Keep Content Concise**: Aim for 50-150 character testimonials
4. **Use Real Names**: Authentic contributor names build trust
5. **Update Regularly**: Add new testimonials as campaign progresses
6. **Monitor Quality**: Review testimonials for relevance and authenticity
