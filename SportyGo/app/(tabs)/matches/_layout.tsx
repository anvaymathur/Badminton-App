import { Stack } from "expo-router";
import React from "react";

/**
 * AuthLayout Component
 * 
 * This component defines the layout for the 'matches' route segment using Expo Router's Stack navigator.
 * It configures the navigation stack for viewing, adding, editing, and viewing individual scores.
 */
export default function AuthLayout() {
  return (
    // Stack navigator with header hidden by default for all screens
    <Stack screenOptions={{ headerShown: false }}>
      {/* Screen for viewing the list of scores/matches */}
      <Stack.Screen name="viewScore" />

      {/* Screen for adding a new score/match */}
      <Stack.Screen name="addScore" />

      {/* Screen for viewing details of a specific score/match */}
      <Stack.Screen name="viewIndividualScore" />

      {/* Screen for editing an existing score/match */}
      <Stack.Screen name="editScore" />
    </Stack>
  );
}
