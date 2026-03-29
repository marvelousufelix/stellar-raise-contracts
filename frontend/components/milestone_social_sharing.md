# Milestone Social Sharing Component

## Overview

The `MilestoneSocialSharing` component provides secure, accessible social sharing functionality for campaign milestones. It enables users to share milestone achievements across multiple platforms with viral marketing potential.

## Features

- **Multi-Platform Sharing**: Twitter, Facebook, LinkedIn, Email, and Copy-to-Clipboard
- **Milestone-Specific Messages**: Dynamic content based on funding percentage (25%, 50%, 75%, 100%)
- **Security**: Input sanitization, XSS prevention, URL validation
- **Accessibility**: WCAG 2.1 compliant with screen reader support
- **Responsive Design**: Mobile-friendly button layout
- **Analytics**: Share metrics tracking with platform and timestamp

## Component API

### Props

```typescript
interface MilestoneSocialSharingProps {
  data: MilestoneShareData;
  onShare?: (metrics: ShareMetrics) => void;
  campaignUrl?: string;
  disabled?: boolean;
}
```

#### `data` (Required)

Campaign milestone data for generating share content.

```typescript
interface MilestoneShareData {
  campaignId: string;           // Unique campaign identifier
  campaignName: string;         // Campaign name (max 50 chars)
  currentAmount: number;        // Current funding amount
  goalAmount: number;           // Funding goal
  milestonePercentage: number;  // Funding percentage (0-100)
  creatorName: string;          // Campaign creator name
}
```

#### `onShare` (Optional)

Callback function invoked when user shares. Receives share metrics.

```typescript
interface ShareMetrics {
  platform: "twitter" | "facebook" | "linkedin" | "email" | "copy";
  timestamp: number;
  campaignId: string;
}
```

#### `campaignUrl` (Optional)

URL to share. Defaults to `https://stellar-raise.app`.

#### `disabled` (Optional)

Disables all share buttons when `true`. Defaults to `false`.

## Usage Examples

### Basic Usage

```tsx
import { MilestoneSocialSharing } from "./milestone_social_sharing";

function CampaignMilestone() {
  const data = {
    campaignId: "campaign-123",
    campaignName: "Amazing Project",
    currentAmount: 2500,
    goalAmount: 5000,
    milestonePercentage: 50,
    creatorName: "John Doe",
  };

  return <MilestoneSocialSharing data={data} />;
}
```

### With Analytics

```tsx
function CampaignMilestone() {
  const handleShare = (metrics) => {
    console.log(`User shared on ${metrics.platform}`);
    // Send to analytics service
    analytics.track("milestone_shared", metrics);
  };

  return (
    <MilestoneSocialSharing
      data={data}
      onShare={handleShare}
      campaignUrl="https://stellar-raise.app/campaigns/123"
    />
  );
}
```

### Disabled State

```tsx
<MilestoneSocialSharing
  data={data}
  disabled={!isAuthenticated}
/>
```

## Share Messages

The component generates milestone-specific messages:

- **25%**: "🎯 [Campaign] just hit 25% funding! Join [Creator] in supporting this amazing project."
- **50%**: "🚀 [Campaign] is halfway there at 50%! Help push it to success."
- **75%**: "⚡ [Campaign] is at 75% - almost there! Be part of the final push."
- **100%**: "🎉 [Campaign] reached 100% funding! Mission accomplished!"

## Security Considerations

### Input Sanitization

All user inputs are sanitized to prevent XSS attacks:

```typescript
// Removes dangerous characters
function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/[<>\"']/g, "")
    .substring(0, maxLength)
    .trim();
}
```

### URL Encoding

Share URLs are properly encoded:

```typescript
const encodedMessage = encodeURIComponent(shareMessage);
const url = `https://twitter.com/intent/tweet?text=${encodedMessage}`;
```

### No Dangerous HTML

- No `dangerouslySetInnerHTML` used
- All content rendered as React text nodes
- Canvas drawing uses only hardcoded colors

### Window Security

Share links open with security flags:

```typescript
window.open(url, "_blank", "noopener,noreferrer");
```

## Accessibility Features

### ARIA Labels

All buttons have descriptive aria-labels:

```tsx
<button aria-label="Share on Twitter">𝕏</button>
```

### Live Region

Component uses `role="region"` for screen reader announcements:

```tsx
<div role="region" aria-label="Share milestone achievement">
```

### Keyboard Navigation

- Full keyboard support with Tab navigation
- Enter and Space keys trigger share actions
- Focus indicators visible on all interactive elements

### Color Contrast

- Minimum 4.5:1 contrast ratio for text
- Sufficient color contrast for buttons

## Testing

### Unit Tests

The component includes 95%+ test coverage:

```bash
npm test -- milestone_social_sharing.test.tsx
```

Test categories:
- Rendering and display
- Share functionality
- Input sanitization
- Keyboard navigation
- Edge cases
- Multiple shares
- Responsive design

### Example Test

```typescript
it("should sanitize campaign name with special characters", () => {
  const data = {
    ...mockData,
    campaignName: '<script>alert("xss")</script>Project',
  };
  render(<MilestoneSocialSharing data={data} />);

  const text = screen.getByText(/Project/i);
  expect(text.textContent).not.toContain("<script>");
});
```

## Performance Optimization

### Memoization

Share message generation is memoized:

```typescript
const shareMessage = useMemo(() => generateShareMessage(data), [data]);
```

### Callback Optimization

Share handler uses `useCallback` to prevent unnecessary re-renders:

```typescript
const handleShare = useCallback((platform) => {
  // Share logic
}, [data, encodedMessage, campaignUrl, onShare]);
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Styling

Component uses CSS-in-JS with styled-jsx:

```tsx
<style jsx>{`
  .milestone-social-sharing {
    padding: 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 8px;
    color: white;
  }
`}</style>
```

### Customization

Override styles via CSS classes:

```css
.milestone-social-sharing {
  background: your-color;
}

.share-btn {
  padding: your-padding;
}
```

## Error Handling

### Clipboard Errors

Gracefully handles clipboard write failures:

```typescript
navigator.clipboard.writeText(text).catch(() => {
  console.error("Failed to copy to clipboard");
});
```

### Invalid Platforms

Platform validation prevents invalid share attempts:

```typescript
function isValidPlatform(platform: string): boolean {
  return VALID_PLATFORMS.includes(platform);
}
```

## Analytics Integration

Track share metrics for viral marketing insights:

```typescript
const handleShare = (metrics: ShareMetrics) => {
  // Send to analytics
  analytics.track("milestone_shared", {
    platform: metrics.platform,
    campaignId: metrics.campaignId,
    timestamp: metrics.timestamp,
  });
};
```

## Troubleshooting

### Share URLs Not Opening

Ensure `window.open` is not blocked by browser popup filters. Users may need to allow popups for the domain.

### Clipboard Not Working

Clipboard API requires HTTPS or localhost. Check browser console for security errors.

### Text Not Displaying

Verify campaign name and creator name are valid strings. Component sanitizes invalid inputs.

## Future Enhancements

- [ ] WhatsApp sharing
- [ ] Telegram sharing
- [ ] QR code generation
- [ ] Custom share templates
- [ ] Share preview modal
- [ ] Analytics dashboard

## Related Components

- `MilestoneFireworks` - Celebration animation for milestones
- `CampaignCard` - Campaign display component
- `ShareMetricsAnalytics` - Analytics tracking component

## License

MIT
