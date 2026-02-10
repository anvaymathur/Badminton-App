import { useContext, useEffect, useState } from 'react';
import { useAuth0 } from 'react-native-auth0';
import { router } from 'expo-router';
import React from 'react';
import { YStack, Text, Spinner } from 'tamagui';
import { UserContext } from '@/components/userContext'
import { getUserProfile, checkForClaimableTemps } from '../firebase/services_firestore2'
import { SafeAreaWrapper } from '@/components/SafeAreaWrapper'

export default function Index() {
  const { user, isLoading } = useAuth0();
  const [initializing, setInitializing] = useState(true);
  const {globalUser, saveUser} = useContext(UserContext)
   
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user && user.sub) {
        const userProfile = await getUserProfile(user.sub)
        if (userProfile) {
          saveUser({name: userProfile.Name, email: userProfile.Email})
          // Detect claimable temp users before routing to dashboard
          const claimable = await checkForClaimableTemps(userProfile.Email, userProfile.Phone);
          if (claimable.length > 0) {
            router.replace({ pathname: '/claimTempUsers' as any, params: { ids: JSON.stringify(claimable.map(t => t.id)) } });
          } else {
            router.replace('/dashboard');
          }
        } else {
          router.replace('/login');
        }
      } else {
        router.replace('/login');
      }
    }
    if (!isLoading && initializing) {
      setInitializing(false);
      fetchUserProfile()
    }
  }, [user, isLoading, initializing]);
  return (
    <SafeAreaWrapper backgroundColor="$background">
      <YStack flex={1} p="$4" gap="$2" justifyContent="center" alignItems="center">
        <Spinner size="large" color="$color9" />
        <Text color="$color10">Loading…</Text>
      </YStack>
    </SafeAreaWrapper>
  );
}
