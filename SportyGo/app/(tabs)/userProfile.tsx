import React, { useEffect, useState } from 'react';
import { YStack, XStack, Text, Card, Button, Paragraph, H2, Separator, ScrollView, Spinner } from 'tamagui';
import { SafeAreaWrapper } from "@/components/SafeAreaWrapper";
import { useAuth0 } from 'react-native-auth0';
import { getUserProfile } from '../../firebase/services_firestore2';
import { UserDoc } from '../../firebase/types_index';
import { PhotoAvatar } from "@/components/PhotoAvatar";
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase/index';

// Helper: format various date representations (Date, Firestore Timestamp, ISO string) to YYYY-MM-DD
function formatDate(input: any): string {
  if (!input) return '-';
  try {
    let date: Date | undefined;
    if (input instanceof Date) {
      date = input;
    } else if (typeof input === 'string') {
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) date = parsed;
    } else if (typeof input === 'object' && typeof input.toDate === 'function') {
      // Firestore Timestamp
      date = input.toDate();
    }
    if (!date) return '-';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch {
    return '-';
  }
}


export default function UserProfileScreen() {
  const { user, isLoading: isAuthLoading, getCredentials} = useAuth0();

  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLinkAccount = async () => {
    // TODO: Make this work
    try {
      const credentials = await getCredentials();
      const accessToken = credentials?.accessToken;
      const callbackUrl = 'badmintonapp://dev-6oulj204w6qwe4dk.us.auth0.com/android/com.aravmathur.badmintonapp/callback';

      if (accessToken) {

        const linkingUrl = `https://dev-6oulj204w6qwe4dk.us.webtask.run/4cb95bf92ced903b9b84ebedbf5ebffd/admin?access_token=${encodeURIComponent(accessToken)}&redirect_uri=${encodeURIComponent(callbackUrl)}`;
    
        Linking.openURL(linkingUrl);
      }
    } catch (e) {
      console.error('Failed to open linking page:', e);
    }
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
      <YStack flex={1} p="$4" space="$5">
        <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <H2 color="$color9">Profile</H2>
          <Button
            size="$3"
            bg="$color2"
            color="$color11"
            borderColor="$borderColor"
            borderWidth={1}
            icon={<Ionicons name="pencil-outline" size={24} color="black" />}
            onPress={() => {}}
          >
            Edit
          </Button>
        </XStack>
        <ScrollView pt="$10">
            <YStack space="$4" style={{ alignItems: 'center', paddingBottom: 32 }}>
              <PhotoAvatar
                size="$12"
                photoUrl={profile?.PhotoUrl}
                name={profile?.Name}
                editable={false}
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
                  <YStack>
                    <Text color="$color10" fontSize="$3">Name</Text>
                    <Text color="$color" fontSize="$5">{profile?.Name || '-' } </Text>
                  </YStack>
                  <Separator />
                  <YStack>
                    <Text color="$color10" fontSize="$3">Email</Text>
                    <Text color="$color" fontSize="$5">{profile?.Email || '-' } </Text>
                  </YStack>
                  <Separator />
                  <YStack>
                    <Text color="$color10" fontSize="$3">Phone</Text>
                    <Text color="$color" fontSize="$5">{profile?.Phone || '-' } </Text>
                  </YStack>
                  <Separator />
                  <YStack>
                    <Text color="$color10" fontSize="$3">Date of Birth</Text>
                    <Text color="$color" fontSize="$5">{formatDate((profile as any)?.DateOfBirth)}</Text>
                  </YStack>
                  <Separator />
                  <YStack>
                    <Text color="$color10" fontSize="$3">Groups</Text>
                    <Text color="$color" fontSize="$5">{Array.isArray(profile?.Groups) ? profile?.Groups.length : 0}</Text>
                  </YStack>
                  {errorMessage && (
                    <Paragraph color="$color">{errorMessage}</Paragraph>
                  )}
                </YStack>
              </Card>
            </YStack>
          </ScrollView>
        </YStack>
    </SafeAreaWrapper>
  );
}
