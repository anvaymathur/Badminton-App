import { Stack, Tabs} from "expo-router";
import { Auth0Provider } from "react-native-auth0";
import config from '../tamagui.config'
import React from "react";
import { TamaguiProvider, Theme } from "tamagui";
import { UserProvider } from "./components/userContext";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortalProvider } from '@tamagui/portal';
import constants from "./constants";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Auth0Provider
        domain={constants.Auth0Domain}
        clientId={constants.Auth0ClientId}>
          <UserProvider>
            <TamaguiProvider config={config}>
              <PortalProvider shouldAddRootHost>
                <Theme name="earthy-sport-light">
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index"  />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="claimTempUsers" />
                  </Stack>
                </Theme>
              </PortalProvider>
            </TamaguiProvider>
          </UserProvider>
      </Auth0Provider>
    </SafeAreaProvider>
  );
}
