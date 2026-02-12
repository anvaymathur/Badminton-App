import React, { useContext, useEffect, useState } from 'react';
import { YStack, XStack, Text, Card, Button, Paragraph, H2, Separator, Spinner, Input } from 'tamagui';
import { SafeAreaWrapper } from "@/components/SafeAreaWrapper";
import { useAuth0 } from 'react-native-auth0';
import { updateUserProfile, getUserGroups } from '../../firebase/services_firestore2';
import { UserDoc } from '../../firebase/types_index';
import { PhotoAvatar } from "@/components/PhotoAvatar";
import { UserContext } from "@/components/userContext";
import { Ionicons } from '@expo/vector-icons';
import { Alert, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase/index';
import DateTimePicker from '@react-native-community/datetimepicker';

// Helper: format various date representations (Date, Firestore Timestamp, ISO string) to YYYY-MM-DD
function formatDate(input: any): string {
  if (!input) return '-';
  try {
    const date = parseToDate(input);
    if (!date) return '-';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch {
    return '-';
  }
}

// Parse Date, Firestore Timestamp, or ISO string to a Date object
function parseToDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof raw === 'object' && typeof raw.toDate === 'function') {
    const converted = raw.toDate();
    return isNaN(converted.getTime()) ? null : converted;
  }
  return null;
}

const calculateAgeFromDate = (date: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const hasNotHadBirthdayThisYear = (
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
  );
  if (hasNotHadBirthdayThisYear) age -= 1;
  return age;
};


export default function UserProfileScreen() {
  const { user, isLoading: isAuthLoading } = useAuth0();
  const { saveUser } = useContext(UserContext);

  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groupCount, setGroupCount] = useState<number>(0);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);

  const startEditing = () => {
    setEditName(profile?.Name || '');
    setEditPhone(profile?.Phone || '');
    setEditPhotoUrl(profile?.PhotoUrl || '');
    const dobDate = parseToDate((profile as any)?.DateOfBirth);
    setEditDob(dobDate ? formatDate(dobDate) : '');
    setShowDobPicker(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setShowDobPicker(false);
    setIsEditing(false);
  };

  const onChangeDob = (_event: any, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') setShowDobPicker(false);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setEditDob(`${year}-${month}-${day}`);
    }
  };

  const handleSave = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert('Missing Information', 'Name cannot be empty.', [{ text: 'OK' }]);
      return;
    }

    const digitsOnly = editPhone.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      Alert.alert('Invalid Phone', 'Phone number must be exactly 10 digits.', [{ text: 'OK' }]);
      return;
    }

    if (editDob) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(editDob)) {
        Alert.alert('Invalid Date', 'Date of birth format is invalid.', [{ text: 'OK' }]);
        return;
      }
      const dobDate = new Date(editDob + 'T00:00:00');
      if (isNaN(dobDate.getTime())) {
        Alert.alert('Invalid Date', 'Date of birth is not a valid date.', [{ text: 'OK' }]);
        return;
      }
      if (dobDate > new Date()) {
        Alert.alert('Invalid Date', 'Date of birth cannot be in the future.', [{ text: 'OK' }]);
        return;
      }
      const age = calculateAgeFromDate(dobDate);
      if (age < 13) {
        Alert.alert('Age Restriction', 'Users must be 13 years or older.', [{ text: 'OK' }]);
        return;
      }
    }

    if (!user?.sub) return;

    setIsSaving(true);
    try {
      const updates: Partial<UserDoc> = {
        Name: trimmedName,
        Phone: digitsOnly,
        PhotoUrl: editPhotoUrl,
      };
      if (editDob && /^\d{4}-\d{2}-\d{2}$/.test(editDob)) {
        updates.DateOfBirth = new Date(editDob + 'T00:00:00');
      }
      await updateUserProfile(user.sub, updates);
      await saveUser({ name: trimmedName, email: profile?.Email ?? '' });
      setIsEditing(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile. Please try again.', [{ text: 'OK' }]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDismissOverlays = () => {
    Keyboard.dismiss();
    setShowDobPicker(false);
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user?.sub) {
      setErrorMessage('Not signed in.');
      setIsLoading(false);
      return;
    }
    const userRef = doc(db, 'users', user.sub);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserDoc) : null);
      setIsLoading(false);
    }, (err) => {
      setErrorMessage('Failed to load profile.');
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user?.sub, isAuthLoading]);

  useEffect(() => {
    if (!user?.sub) return;
    getUserGroups(user.sub).then((groups) => setGroupCount(groups.length)).catch(() => {});
  }, [user?.sub]);

  if (isLoading || isAuthLoading) {
    return (
      <SafeAreaWrapper backgroundColor="$background">
        <YStack flex={1} p="$4" space="$2" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Spinner color="$color9" />
          <Text color="$color10">Loading profile...</Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper backgroundColor="$background">
      <TouchableWithoutFeedback onPress={handleDismissOverlays} accessible={false}>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          enableOnAndroid={true}
          extraScrollHeight={Platform.OS === 'ios' ? 40 : 80}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
      <YStack flex={1} pt="$4" space="$5">
        <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <H2 color="$color9">Profile</H2>
          {isEditing ? (
            <XStack space="$2">
              <Button
                size="$3"
                bg="$color2"
                color="$color11"
                borderColor="$borderColor"
                borderWidth={1}
                onPress={cancelEditing}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="$3"
                bg="$color9"
                color="$color1"
                onPress={handleSave}
                disabled={isSaving}
                icon={isSaving ? <Spinner size="small" color="$color1" /> : undefined}
              >
                Save
              </Button>
            </XStack>
          ) : (
            <Button
              size="$3"
              bg="$color2"
              color="$color11"
              borderColor="$borderColor"
              borderWidth={1}
              icon={<Ionicons name="pencil-outline" size={24} color="black" />}
              onPress={startEditing}
            >
              Edit
            </Button>
          )}
        </XStack>
        <YStack pt="$10">
            <YStack space="$4" style={{ alignItems: 'center' }}>
              <PhotoAvatar
                size="$12"
                photoUrl={isEditing ? editPhotoUrl : profile?.PhotoUrl}
                name={isEditing ? editName : profile?.Name}
                editable={isEditing}
                onPhotoChange={isEditing ? setEditPhotoUrl : undefined}
                borderColor="$color9"
                borderWidth={1}
                backgroundColor="$color9"
                textColor="$color1"
                fontSize="$6"
                b="$2"
                r="$4"
              />

              <Card elevate bordered p="$4" borderWidth={1} borderColor="$borderColor" width="100%" style={{ maxWidth: 560 }} mt="$8">
                <YStack space="$3">
                  {/* Name - editable */}
                  <YStack>
                    <Text color="$color10" fontSize="$3">Name</Text>
                    {isEditing ? (
                      <Input
                        value={editName}
                        onChangeText={setEditName}
                        onFocus={() => setShowDobPicker(false)}
                        placeholder="Name"
                        borderColor="$color6"
                        borderWidth={1}
                        focusStyle={{ borderWidth: 2, borderColor: '$color6' }}
                        background="$color2"
                        placeholderTextColor="$color10"
                        color="$color"
                        p="$2"
                        pl="$3"
                        mt="$1"
                        style={{ borderRadius: 8, fontSize: 16 }}
                      />
                    ) : (
                      <Text color="$color" fontSize="$5">{profile?.Name || '-'}</Text>
                    )}
                  </YStack>
                  <Separator />

                  {/* Email - always read-only */}
                  <YStack>
                    <Text color="$color10" fontSize="$3">Email</Text>
                    <Text color="$color" fontSize="$5">{profile?.Email || '-'}</Text>
                  </YStack>
                  <Separator />

                  {/* Phone - editable */}
                  <YStack>
                    <Text color="$color10" fontSize="$3">Phone</Text>
                    {isEditing ? (
                      <Input
                        keyboardType="numeric"
                        inputMode="numeric"
                        maxLength={10}
                        value={editPhone}
                        onChangeText={(text: any) => setEditPhone(text.replace(/\D/g, ''))}
                        onFocus={() => setShowDobPicker(false)}
                        placeholder="Phone (10 digits)"
                        borderColor="$color6"
                        borderWidth={1}
                        focusStyle={{ borderWidth: 2, borderColor: '$color6' }}
                        background="$color2"
                        placeholderTextColor="$color10"
                        color="$color"
                        p="$2"
                        pl="$3"
                        mt="$1"
                        style={{ borderRadius: 8, fontSize: 16 }}
                      />
                    ) : (
                      <Text color="$color" fontSize="$5">{profile?.Phone || '-'}</Text>
                    )}
                  </YStack>
                  <Separator />

                  {/* Date of Birth - editable */}
                  <YStack>
                    <Text color="$color10" fontSize="$3">Date of Birth</Text>
                    {isEditing ? (
                      <YStack>
                        <Button
                          onPress={() => {
                            Keyboard.dismiss();
                            setShowDobPicker((prev) => !prev);
                          }}
                          unstyled
                          borderColor="$color6"
                          borderWidth={1}
                          bg="$color2"
                          p="$3"
                          mt="$1"
                          style={{ borderRadius: 8 }}
                        >
                          <Text color="$color" fontSize="$4">
                            {editDob || 'Select date of birth'}
                          </Text>
                        </Button>
                        {showDobPicker && (
                          <DateTimePicker
                            value={/^\d{4}-\d{2}-\d{2}$/.test(editDob) ? new Date(editDob + 'T00:00:00') : new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
                            textColor="black"
                            maximumDate={new Date()}
                            onChange={onChangeDob}
                          />
                        )}
                      </YStack>
                    ) : (
                      <Text color="$color" fontSize="$5">{formatDate((profile as any)?.DateOfBirth)}</Text>
                    )}
                  </YStack>
                  <Separator />

                  {/* Groups - always read-only */}
                  <YStack>
                    <Text color="$color10" fontSize="$3">Groups</Text>
                    <Text color="$color" fontSize="$5">{groupCount}</Text>
                  </YStack>
                  {errorMessage && (
                    <Paragraph color="$color">{errorMessage}</Paragraph>
                  )}
                </YStack>
              </Card>
            </YStack>
          </YStack>
        </YStack>
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaWrapper>
  );
}
