import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { Avatar, Button, Text, YStack } from 'tamagui';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { imageToBase64 } from '@/firebase/services_firestore2';

/**
 * Extracts the payload portion from an "INITIALS:XX" style reference.
 *
 * @param value - A potential initials sentinel string (e.g. "INITIALS:JD").
 * @returns The initials without the prefix or null when the reference is not a sentinel.
 */
const extractInitialsFromReference = (value?: string | null): string | null => {
  if (!value || !value.startsWith('INITIALS:')) return null;
  const initials = value.replace('INITIALS:', '').trim();
  return initials.length > 0 ? initials : null;
};

/**
 * Performs basic cleanup on a photo reference coming from props or local state.
 * Empty strings collapse to null, while other values are trimmed.
 */
const normalizePhotoReference = (value?: string | null): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Determines whether a given reference points to an actual image source
 * (URI, Base64 data URI, local file reference, etc.) as opposed to initials.
 */
const isImageReference = (value?: string | null): boolean => {
  if (!value) return false;
  return !value.startsWith('INITIALS:');
};

/**
 * Generates a two-character initials string from a display name.
 * Falls back to "?" when the name is missing.
 */
const deriveInitialsFromName = (name?: string): string => {
  if (!name) return '?';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
};

interface PhotoAvatarProps {
  b?: any;
  r?: any;
  size?: any;
  photoUrl?: string;
  name?: string;
  onPhotoChange?: (photoUrl: string) => void;
  editable?: boolean;
  borderColor?: any;
  borderWidth?: number;
  backgroundColor?: any;
  textColor?: any;
  fontSize?: any;
}

/**
 * PhotoAvatar
 *
 * A reusable avatar picker that mirrors the UX implemented on the Create Group screen.
 * - Shows a dashed border until an image is present.
 * - Displays initials (or a "+" placeholder) when no image is available.
 * - Lets users pick from their library (with editing) and converts the image into Base64.
 * - Provides a delete button that reverts the avatar to the fallback state.
 */
export const PhotoAvatar: React.FC<PhotoAvatarProps> = ({
  size = '$8',
  photoUrl,
  name = '',
  onPhotoChange,
  editable = false,
  borderColor = '$color9',
  borderWidth = 2,
  backgroundColor = '$color9',
  textColor = '$color1',
  fontSize = '$4',
  b="$4",
  r="$4"
}) => {
  const [localPhotoRef, setLocalPhotoRef] = useState<string | null>(() =>
    normalizePhotoReference(photoUrl),
  );
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Keep the local photo reference in sync with the latest prop value.
   * This allows external updates (e.g. fetching a saved profile) to refresh the avatar.
   */
  useEffect(() => {
    setLocalPhotoRef(normalizePhotoReference(photoUrl));
  }, [photoUrl]);

  /**
   * Unified resolver that determines which photo reference we should render.
   * Preference order:
   * 1. Locally chosen image (localPhotoRef)
   * 2. Prop-driven image (photoUrl)
   */
  const resolvedPhotoRef = useMemo(() => {
    const normalizedLocal = normalizePhotoReference(localPhotoRef);
    if (normalizedLocal) return normalizedLocal;
    return normalizePhotoReference(photoUrl);
  }, [localPhotoRef, photoUrl]);

  /**
   * Determine whether we currently have a real image to display.
   * This drives the dashed/solid border as well as the presence of the delete button.
   */
  const hasRealImage = useMemo(() => isImageReference(resolvedPhotoRef), [resolvedPhotoRef]);

  /**
   * Determine the initials we should show when rendering a fallback.
   * We honor sentinel values first (e.g. "INITIALS:JD") so that back-end supplied
   * initials take precedence, then fall back to deriving them from the current name.
   */
  const fallbackInitials = useMemo(() => {
    const explicit = extractInitialsFromReference(resolvedPhotoRef);
    if (explicit) return explicit;
    return deriveInitialsFromName(name);
  }, [resolvedPhotoRef, name]);

  /**
   * Opens the platform media picker, lets the user crop the image, and persists
   * the result both locally and upstream via onPhotoChange.
   */
  const handlePickImage = async () => {
    if (!editable) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to select a photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const { uri } = result.assets[0];
      setLocalPhotoRef(uri);

      if (!onPhotoChange) return;

      setIsUploading(true);
      try {
        const base64Photo = await imageToBase64(uri);
        onPhotoChange(base64Photo);
      } catch (error) {
        console.error('Error converting image:', error);
        Alert.alert('Error', 'Failed to process image. Please try again.');
      } finally {
        setIsUploading(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  /**
   * Clears the current image selection, reverting the avatar to its fallback state.
   * The parent is notified so that it can persist the change.
   */
  const handleRemoveImage = () => {
    setLocalPhotoRef(null);
    onPhotoChange?.('');
  };

  /**
   * Renders either an Avatar.Image (when we have a photo) or an Avatar.Fallback showing initials.
   */
  const renderAvatarContent = () => {
    const shouldShowPlus = !hasRealImage && (!name || fallbackInitials === '?');
    return (
      <>
        <Avatar.Fallback backgroundColor={backgroundColor} justifyContent="center" alignItems="center">
          <Text
            color={textColor}
            fontSize={shouldShowPlus ? '$8' : fontSize}
            fontWeight="bold"
            style={{ textAlign: 'center' }}
          >
            {shouldShowPlus ? '+' : fallbackInitials}
          </Text>
        </Avatar.Fallback>
        {hasRealImage && resolvedPhotoRef && (
          <Avatar.Image src={resolvedPhotoRef} />
        )}
      </>
    );
  };

  /**
   * Helper for rendering the supporting text beneath the avatar.
   */
  const renderStatusLabel = () => {
    if (!editable) return null;
    if (isUploading) return 'Processing...';
    if (hasRealImage) return 'Photo selected';
    if (name.trim()) return `Will show: ${fallbackInitials}`;
    return 'Add Photo';
  };

  return (
    <YStack style={{ alignItems: 'center' }} space="$3">
      <View style={{ position: 'relative' }}>
        <Button
          onPress={handlePickImage}
          bg="transparent"
          borderWidth={0}
          p={0}
          disabled={!editable || isUploading}
        >
          <Avatar
            key={hasRealImage ? 'img' : 'fallback'}
            circular
            size={size}
            borderWidth={borderWidth}
            borderColor={borderColor}
            borderStyle={editable && !hasRealImage ? 'dashed' : 'solid'}
            background="transparent"
            b={b}
            r={r}
          >
            {renderAvatarContent()}
          </Avatar>
        </Button>

        {editable && hasRealImage && (
          <Button
            onPress={handleRemoveImage}
            size="$2"
            bg="$color9"
            borderWidth={0}
            circular
            disabled={isUploading}
            icon={<Ionicons name="trash" size={14} color="white" />}
            style={{ position: 'absolute', bottom: -8, right: 8 }}
          />
        )}
      </View>
    </YStack>
  );
};