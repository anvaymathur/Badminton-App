import { Tabs } from "expo-router";
import React from "react";
import { router } from "expo-router";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  const pathname = usePathname();
  const topLevelPaths = [
    '/dashboard',
    '/groups/displayGroups',
    '/events/EventsList',
    '/matches/viewScore',
    '/userProfile',
  ];
  const shouldHideTabBar = !topLevelPaths.includes(pathname);
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: shouldHideTabBar ? { display: 'none' } : undefined }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ focused }) => (
            <Ionicons name="home" size={24} color={focused ? 'black' : 'gray'} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (pathname === '/dashboard') {
              e.preventDefault();
            }
          },
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          tabBarLabel: 'Groups',
          tabBarIcon: ({ focused }) => (
            <Ionicons name="people" size={24} color={focused ? 'black' : 'gray'} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (pathname === '/groups/displayGroups') {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            router.replace('/groups/displayGroups');
          },
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          tabBarLabel: 'Events',
          tabBarIcon: ({ focused }) => (
            <Ionicons name="calendar" size={24} color={focused ? 'black' : 'gray'} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (pathname === '/events/EventsList') {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            router.replace('/events/EventsList');
          },
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          tabBarLabel: 'Matches',
          tabBarIcon: ({ focused }) => (
            <Ionicons name="trophy" size={24} color={focused ? 'black' : 'gray'} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (pathname === '/matches/viewScore') {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            router.replace('/matches/viewScore');
          },
        }}
      />
      <Tabs.Screen
        name="userProfile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <Ionicons name="person" size={24} color={focused ? 'black' : 'gray'} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (pathname === '/userProfile') {
              e.preventDefault();
            }
          },
        }}
      />
    </Tabs>
  );
}
