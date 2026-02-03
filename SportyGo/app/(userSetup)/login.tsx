import React, { useContext, useEffect } from "react";
import { useAuth0 } from 'react-native-auth0';
import { router } from 'expo-router';
import { View, YStack, Card, Button, Text, Paragraph, H2, H3, Image, Spinner } from 'tamagui';
import { UserContext } from "../components/userContext";
import {getUserProfile, checkForClaimableTemps} from "../../firebase/services_firestore2";
import { SafeAreaWrapper } from "../components/SafeAreaWrapper";


export default function LoginScreen() {
  const { authorize, user, error, isLoading, clearSession } = useAuth0();
  const {globalUser, saveUser} = useContext(UserContext);
  useEffect(() => {
    if (!isLoading && user) {
      (async () => {
        const userProfile = await getUserProfile(user.sub ?? "");
        if (userProfile) {
          saveUser({ name: userProfile.Name, email: userProfile.Email });
          // Detect claimable temp users before routing to dashboard
          const claimable = await checkForClaimableTemps(userProfile.Email, userProfile.Phone);
          if (claimable.length > 0) {
            router.replace({ pathname: '/claimTempUsers' as any, params: { ids: JSON.stringify(claimable.map(t => t.id)) } });
          } else {
            router.replace('/dashboard');
          }
        } else {
          router.replace('/setupProfile');
        }
      })();
    }
  }, [user, isLoading]);
  
  const onLogin = async () => {
    try {
      await authorize();

    } catch (e) {
      console.error(e);
    }
  };

  const onSignup = async () => {
    try {
      await authorize({
        additionalParameters: {
          screen_hint: 'signup'
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const onLogout = async () => {
    try {
      await clearSession();
      // router.replace('/userSetup/login' );
    } catch (e) {

    }
  };

  if (isLoading) {
      return (
        <SafeAreaWrapper backgroundColor="$background">
          <YStack flex={1} p="$4" space="$2" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <Spinner color="$color9" />
            <Text color="$color10">Loading...</Text>
          </YStack>
        </SafeAreaWrapper>
      )
  }
    
  return (
    <SafeAreaWrapper backgroundColor="$background">
      <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Card elevate bordered p="$5" borderWidth={1} borderColor="$borderColor" width="100%" style={{ maxWidth: 420, alignItems: 'center' }}>
          <YStack width="100%" space="$3" style={{ alignItems: 'center' }}>
            {/* <Image
              source={require('../../assets/images/icon.png')}
              width={96}
              height={96}
              style={{ marginBottom: 8 }}
            /> */}
            <H3 color="$color" style={{ textAlign: 'center' }}>Welcome to SportyGo</H3>
            <Paragraph color="$color10" style={{ textAlign: 'center' }}>
              Track matches, manage groups, and compete with ease.
            </Paragraph>

            <YStack width="100%" space="$3">
              <Button size="$5" bg="$color9" color="$color1" onPress={onLogin}>
                Log In
              </Button>

              <Button size="$5" bg="$color1" color="$color9" borderWidth={1} borderColor="$color9" onPress={onSignup}>
                Sign Up
              </Button>
            </YStack>
          </YStack>
        </Card>
      </YStack>
    </SafeAreaWrapper>
  );
}

