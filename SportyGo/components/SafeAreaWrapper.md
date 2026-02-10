# SafeAreaWrapper Component

## Overview
The `SafeAreaWrapper` component provides consistent safe area handling across the app using `react-native-safe-area-context`. It automatically handles safe areas for iOS and Android devices.

The default background color (`#FAF7F2`) matches the Tamagui `earthy-sport-light` theme background for seamless integration.

## Usage

### Basic Usage
```tsx
import { SafeAreaWrapper } from './components/SafeAreaWrapper';

export default function MyScreen() {
  return (
    <SafeAreaWrapper>
      {/* Your screen content */}
    </SafeAreaWrapper>
  );
}
```

### With Custom Background Color
```tsx
<SafeAreaWrapper backgroundColor="#FAF7F2">
  {/* Your screen content */}
</SafeAreaWrapper>
```

### With Custom Edges
```tsx
<SafeAreaWrapper edges={['top', 'left', 'right']}>
  {/* Your screen content - bottom edge not protected */}
</SafeAreaWrapper>
```

### With Custom Styles
```tsx
<SafeAreaWrapper 
  backgroundColor="#F5FCFF"
  style={{ paddingHorizontal: 16 }}
>
  {/* Your screen content */}
</SafeAreaWrapper>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `React.ReactNode` | - | The content to render inside the safe area |
| `style` | `ViewStyle` | - | Additional styles to apply |
| `edges` | `('top' \| 'bottom' \| 'left' \| 'right')[]` | `['top', 'left', 'right']` | Which edges to apply safe area padding to |
| `backgroundColor` | `string` | `'#FAF7F2'` | Background color for the safe area (matches Tamagui theme) |

## Best Practices

1. **Use for all screens**: Wrap every screen component with `SafeAreaWrapper`
2. **Consistent background**: Use the same background color as your screen's background
3. **Edge configuration**: 
   - Use `['top', 'left', 'right']` for most screens (excludes bottom for tab bars)
   - Use `['top', 'left', 'right', 'bottom']` for full-screen modals
   - Use `['left', 'right']` for screens with custom headers

## Migration from react-native SafeAreaView

If you have existing screens using `SafeAreaView` from `react-native`, replace:

```tsx
import { SafeAreaView } from 'react-native';

<SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F2' }}>
  {/* content */}
</SafeAreaView>
```

With:

```tsx
import { SafeAreaWrapper } from './components/SafeAreaWrapper';

<SafeAreaWrapper backgroundColor="#FAF7F2">
  {/* content */}
</SafeAreaWrapper>
``` 