# PhotoAvatar Component

## Overview
A reusable component that handles both photo uploads and automatic initials generation. Perfect for user profiles, group avatars, and any place where you need an editable avatar with fallback initials.

## Features
- ✅ **Photo Upload**: Select images from camera roll
- ✅ **Automatic Initials**: Generates initials when no photo is provided
- ✅ **Base64 Storage**: Converts images to Base64 for Firestore storage
- ✅ **Editable/Read-only**: Can be configured for editing or display only
- ✅ **Customizable**: Size, colors, borders, and styling options

## Usage

### Basic Usage
```tsx
import { PhotoAvatar } from '../components/PhotoAvatar';

// Editable avatar with photo upload
<PhotoAvatar
  name="John Doe"
  onPhotoChange={(photoUrl) => setPhotoUrl(photoUrl)}
  editable={true}
/>

// Read-only avatar
<PhotoAvatar
  photoUrl="data:image/jpeg;base64,..."
  name="John Doe"
  editable={false}
/>
```

### Setup Profile Example
```tsx
<PhotoAvatar
  size="$12"
  photoUrl={photoUrl}
  name={name}
  onPhotoChange={setPhotoUrl}
  editable={true}
  borderColor="$color9"
  borderWidth={2}
  backgroundColor="$color9"
  textColor="$color1"
  fontSize="$6"
/>
```

### Group Avatar Example
```tsx
<PhotoAvatar
  size="$8"
  photoUrl={group.PhotoUrl}
  name={group.Name}
  onPhotoChange={(photoUrl) => updateGroupPhoto(photoUrl)}
  editable={true}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `any` | `"$8"` | Avatar size (Tamagui size token) |
| `photoUrl` | `string` | - | Current photo URL or Base64 data |
| `name` | `string` | `""` | Name for generating initials |
| `onPhotoChange` | `(photoUrl: string) => void` | - | Callback when photo changes |
| `editable` | `boolean` | `false` | Whether user can change photo |
| `borderColor` | `any` | `"$color9"` | Border color |
| `borderWidth` | `number` | `2` | Border width |
| `backgroundColor` | `any` | `"$color9"` | Background color for initials |
| `textColor` | `any` | `"$color1"` | Text color for initials |
| `fontSize` | `any` | `"$4"` | Font size for initials |

## Photo Storage Format

The component handles two photo formats:

1. **Base64 Images**: `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...`
2. **Initials**: `INITIALS:JD` (for "John Doe")

## Initials Generation

- **Single word**: "John" → "JO" (first 2 letters)
- **Multiple words**: "John Doe" → "JD" (first letter of each word)
- **Empty name**: "" → "?"

## Integration with Firestore

The component works seamlessly with your existing Firestore setup:

```tsx
// Store in UserDoc or GroupDoc
const userProfile = {
  id: user.sub,
  Name: name,
  Email: email,
  PhotoUrl: photoUrl || undefined // Base64 or undefined
};
```

## Styling

The component uses your Tamagui theme colors by default:
- `backgroundColor="$color9"` (your theme's primary color)
- `textColor="$color1"` (your theme's background color)
- `borderColor="$color9"` (your theme's primary color)

## Best Practices

1. **Always provide a name** for fallback initials
2. **Handle photo changes** with `onPhotoChange` callback
3. **Set appropriate size** for your use case
4. **Use consistent styling** across your app
5. **Test both photo and initials scenarios** 