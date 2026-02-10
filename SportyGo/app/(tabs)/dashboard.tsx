/**
 * @fileoverview Dashboard Screen — Main landing page for authenticated users.
 *
 * Displays a personalized summary with three sections:
 *   1. Win Rate   — percentage of matches won (one decimal place)
 *   2. Latest Matches — the 5 most recent matches with W/L, score, and date
 *   3. Upcoming Events — next 2 future events where the user RSVP'd "going"
 *
 * Data sources:
 *   - Match history is fetched via `getUserMatchHistory` on mount and on tab focus.
 *   - Upcoming events use a realtime Firestore listener (`listenUserGroupEvents`
 *     or `listenAllEvents`) combined with per-event `getUserVote` checks.
 *
 * Navigation targets:
 *   - Tap user name      → /userProfile
 *   - Tap matches card   → /matches/viewScore
 *   - Tap events card    → /events/EventsList
 *   - Logout button      → clears session → /login
 *
 * @route /(tabs)/dashboard
 */

import React, { useContext, useEffect, useMemo, useState } from "react";
import { ScrollView, YStack, XStack, Text, Card, H3, Paragraph, Separator, Spinner, Button } from "tamagui";
import { useAuth0 } from "react-native-auth0";
import { getUserMatchHistory, getUserVote, getUserGroups, listenUserGroupEvents, listenAllEvents } from "@/firebase/services_firestore2";
import { newMatchHistory, EventDoc } from "@/firebase/types_index";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { UserContext } from "@/components/userContext";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaWrapper } from "@/components/SafeAreaWrapper";

export default function Dashboard() {
  // --- Auth & User Context ---
  const { user, clearSession } = useAuth0();        // Auth0 profile + logout
  const { globalUser, clearUser } = useContext(UserContext); // App-level user state
  const userId = user?.sub ?? "";                    // Auth0 subject ID (unique user identifier)
  const userName = globalUser?.name ?? "Player";     // Display name, falls back to "Player"

  // --- State: Match History ---
  const [matchHistory, setMatchHistory] = useState<newMatchHistory[]>([]);    // All matches the user participated in
  const [isLoadingMatches, setIsLoadingMatches] = useState<boolean>(true);

  // --- State: Upcoming Events ---
  const [myUpcomingEvents, setMyUpcomingEvents] = useState<EventDoc[]>([]);   // Next 2 future events user voted "going"
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true);

  /**
   * Effect: Fetch match history on mount / userId change.
   * Uses an `isActive` cleanup flag to prevent state updates after unmount.
   */
  useEffect(() => {
    let isActive = true;
    const fetchMatches = async () => {
      if (!userId) {
        setMatchHistory([]);
        setIsLoadingMatches(false);
        return;
      }
      setIsLoadingMatches(true);
      try {
        const data = await getUserMatchHistory(userId);
        if (isActive) setMatchHistory(data);
      } finally {
        if (isActive) setIsLoadingMatches(false);
      }
    };
    fetchMatches();
    return () => {
      isActive = false;
    };
  }, [userId]);

  /**
   * Effect: Re-fetch match history every time the tab gains focus.
   * Ensures data is fresh when the user navigates back to the dashboard.
   * Note: This also fires on initial mount, so the first load triggers two fetches
   * (one from the useEffect above, one from here).
   */
  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      const fetchMatches = async () => {
        if (!userId) {
          setMatchHistory([]);
          setIsLoadingMatches(false);
          return;
        }
        setIsLoadingMatches(true);
        try {
          const data = await getUserMatchHistory(userId);
          if (isActive) setMatchHistory(data);
        } finally {
          if (isActive) setIsLoadingMatches(false);
        }
      };
      fetchMatches();
      return () => {
        isActive = false;
      };
    }, [userId])
  );

  /**
   * Effect: Realtime listener for upcoming events the user voted "going" on.
   *
   * Flow:
   *   1. Fetch the user's groups via `getUserGroups`.
   *   2. Subscribe to events:
   *      - If user has groups → `listenUserGroupEvents` (scoped to their groups)
   *      - Otherwise          → `listenAllEvents` (fallback for users with no groups)
   *   3. On each Firestore snapshot, check `getUserVote` for every event.
   *   4. Filter to future events where vote === "going".
   *   5. Sort ascending by date, take the first 2.
   *
   * Cleanup: unsubscribes from the Firestore listener and sets `cancelled = true`.
   */
  useEffect(() => {
    let cancelled = false as boolean;
    let unsubscribe: undefined | (() => void);

    const setup = async () => {
      if (!userId) {
        setMyUpcomingEvents([]);
        setIsLoadingEvents(false);
        return;
      }

      setIsLoadingEvents(true);

      /** Callback invoked on every Firestore snapshot with the latest events list. */
      const handleEvents = async (events: EventDoc[]) => {
        try {
          // Check the user's RSVP status for each event in parallel
          const results = await Promise.all(
            events.map(async (evt) => {
              const vote = await getUserVote(evt.id, userId);
              return { evt, vote } as { evt: EventDoc; vote: any };
            })
          );

          const now = new Date().getTime();
          const goingUpcoming = results
            // Keep only future events the user voted "going" on
            .filter(({ evt, vote }) => {
              // Handle both native Date and Firestore Timestamp objects
              const eventDate = (evt.EventDate instanceof Date)
                ? evt.EventDate
                : new Date((evt as any).EventDate?.seconds ? (evt as any).EventDate.seconds * 1000 : (evt as any).EventDate);
              return vote === "going" && eventDate.getTime() > now;
            })
            .map(({ evt }) => evt)
            // Sort ascending by date so the soonest event comes first
            .sort((a, b) => {
              const aDate = a.EventDate instanceof Date ? a.EventDate : new Date((a as any).EventDate?.seconds ? (a as any).EventDate.seconds * 1000 : (a as any).EventDate);
              const bDate = b.EventDate instanceof Date ? b.EventDate : new Date((b as any).EventDate?.seconds ? (b as any).EventDate.seconds * 1000 : (b as any).EventDate);
              return aDate.getTime() - bDate.getTime();
            })
            // Only show the next 2 upcoming events on the dashboard
            .slice(0, 2);

          if (!cancelled) setMyUpcomingEvents(goingUpcoming);
        } finally {
          if (!cancelled) setIsLoadingEvents(false);
        }
      };

      try {
        // Determine which listener to use based on group membership
        const groups = await getUserGroups(userId).catch(() => []);
        const groupIds = (groups ?? []).map((g: any) => g.id);

        if (groupIds.length > 0) {
          unsubscribe = listenUserGroupEvents(groupIds, userId, handleEvents);
        } else {
          unsubscribe = listenAllEvents(userId, handleEvents);
        }
      } catch {
        if (!cancelled) {
          setMyUpcomingEvents([]);
          setIsLoadingEvents(false);
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  /**
   * Derived: Win rate as a percentage with one decimal place.
   * Iterates all matches, determines which team the user is on,
   * and counts strict wins (ties are NOT counted as wins here).
   */
  const winRate = useMemo(() => {
    if (!matchHistory || matchHistory.length === 0 || !userId) return 0;
    let wins = 0;
    let total = 0;
    for (const match of matchHistory) {
      const [team1Player1, team1Player2, team1Score] = match.team1;
      const [team2Player1, team2Player2, team2Score] = match.team2;
      // Determine which team the current user belongs to
      const inTeam1 = userId === team1Player1 || (!!team1Player2 && userId === team1Player2);
      const inTeam2 = userId === team2Player1 || (!!team2Player2 && userId === team2Player2);
      if (!inTeam1 && !inTeam2) continue; // Skip matches the user wasn't in
      total += 1;
      const didWin = (inTeam1 && team1Score > team2Score) || (inTeam2 && team2Score > team1Score);
      if (didWin) wins += 1;
    }
    return total === 0 ? 0 : Math.round((wins / total) * 1000) / 10; // one decimal
  }, [matchHistory, userId]);

  /** Derived: The 5 most recent matches for the "Latest Matches" card. */
  const latestFiveMatches = useMemo(() => {
    return (matchHistory ?? []).slice(0, 5);
  }, [matchHistory]);

  /**
   * Formats a single match into display data for the Latest Matches list.
   * @param match - A match history record with team1/team2 tuples.
   * @returns `{ result: "W"|"L", score: "X-Y", dateStr }`.
   *
   * Note: Uses >= for win check, so ties display as "W" for the user's team.
   * This differs from the winRate memo which uses strict > (ties are not wins).
   */
  const formatMatchRow = (match: newMatchHistory) => {
    const [t1p1, t1p2, t1Score] = match.team1;
    const [t2p1, t2p2, t2Score] = match.team2;
    const userInTeam1 = userId === t1p1 || (!!t1p2 && userId === t1p2);
    const result = (userInTeam1 ? t1Score >= t2Score : t2Score >= t1Score) ? "W" : "L";

    // Handle both Firestore Timestamp (.toDate()) and raw Date/number values
    const dateObj = (match as any).date && typeof (match as any).date === "object" && "toDate" in (match as any).date
      ? (match as any).date.toDate()
      : new Date((match as any).date ?? Date.now());

    const dateStr = dateObj.toLocaleDateString();
    return { result, score: `${t1Score}-${t2Score}`, dateStr };
  };

  /**
   * Formats an event date for display. Handles native Date objects and
   * Firestore Timestamp objects (which have a `.seconds` property).
   * @param d - Date, Firestore Timestamp, or raw value.
   * @returns A string like "Mon Feb 09 2026 07:30 PM".
   */
  const formatEventDate = (d: any) => {
    const dateObj = d instanceof Date ? d : new Date(d?.seconds ? d.seconds * 1000 : d);
    return `${dateObj.toDateString()} ${dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  /** Clears the app-level user context, ends the Auth0 session, and redirects to /login. */
  const onLogout = async () => {
    try {
      await clearUser()
      await clearSession();
      router.replace('/login' );
    } catch (e) {
      console.log(e);
    }
  };

  // ─────────────────────────────── UI ───────────────────────────────
  return (
    <SafeAreaWrapper>
      <ScrollView flex={1} p="$4" bg="$background">
        <YStack gap="$4">
          {/* Header: User name (tappable → /userProfile) + logout button */}
          <YStack p="$2">
            <XStack justify="space-between" verticalAlign="center">
              <Text verticalAlign="middle" fontSize={24} fontWeight="800" color="$color" onPress={() => router.push('/userProfile')}>{userName}</Text>
              <Button onPress={onLogout}><Ionicons name="log-out-outline" size={20} color="$color1" /></Button>
            </XStack>
            <Paragraph verticalAlign="middle" m="$1" color="$color10">Dashboard</Paragraph>
          </YStack>
          {/* Win Rate Card — shows win % and total match count */}
          <Card p="$4" borderRadius="$4" bg="$color2">
            <YStack gap="$2">
              <H3 verticalAlign="middle" color="$color9">Win Rate</H3>
              {isLoadingMatches ? (
                <XStack justify="flex-start" p="$2">
                  <Spinner size="small" color="$color9" />
                  <Text m="$2" verticalAlign="middle" color="$color10">Loading...</Text>
                </XStack>
              ) : (
                <XStack justify="space-between" p="$2">
                  <Text verticalAlign="middle" fontSize={40} fontWeight="900" color="$color9">{winRate}%</Text>
                  <Paragraph verticalAlign="middle" color="$color10">based on {matchHistory.length} matches</Paragraph>
                </XStack>
              )}
            </YStack>
          </Card>

          {/* Latest 5 Matches Card — tappable, navigates to /matches/viewScore */}
          <Card p="$4" borderRadius="$4" onPress={() => router.push('/matches/viewScore')} bg="$color2">
            <YStack gap="$2">
              <H3 verticalAlign="middle" color="$color9">Latest Matches</H3>
              <Separator />
              {isLoadingMatches && (
                <XStack justify="flex-start" p="$2">
                  <Spinner size="small" color="$color9" />
                  <Text m="$2" verticalAlign="middle" color="$color10">Loading...</Text>

                </XStack>
              )}
              {!isLoadingMatches && latestFiveMatches.length === 0 && (
                <Paragraph verticalAlign="middle" p="$2" color="$color10">No matches yet.</Paragraph>
              )}
              {!isLoadingMatches && latestFiveMatches.map((m, idx) => {
                const row = formatMatchRow(m);
                const resultColor = row.result === "W" ? "$success" : "$secondary";
                return (
                  <XStack key={idx} justify="space-between" p="$2">
                    <Text verticalAlign="middle" fontWeight="700" color={resultColor as any}>{row.result}</Text>
                    <Text verticalAlign="middle" color="$color">{row.score}</Text>
                    <Text verticalAlign="middle" color="$color10">{row.dateStr}</Text>
                  </XStack>
                );
              })}
            </YStack>
          </Card>

          {/* Upcoming Events — shows next 2 events user RSVP'd "going", tappable → /events/EventsList */}
          <Card p="$4" borderRadius="$4" onPress={() => router.push('/events/EventsList')} bg="$color2">
            <YStack gap="$2">
              <H3 verticalAlign="middle" color="$color9">Upcoming Events (Going)</H3>
              <Separator />
              {isLoadingEvents && (
                <XStack justify="flex-start" p="$2">
                  <Spinner size="small" color="$color9" />
                  <Text m="$2" verticalAlign="middle" color="$color10">Loading...</Text>
                </XStack>
              )}
              {!isLoadingEvents && myUpcomingEvents.length === 0 && (
                <Paragraph verticalAlign="middle" p="$2" color="$color10">
                  No upcoming events you marked as going.
                </Paragraph>
              )}
              {!isLoadingEvents && myUpcomingEvents.map((evt) => (
                <YStack key={evt.id} p="$2">
                  <XStack justify="space-between">
                    <Text verticalAlign="middle" fontWeight="700" color="$color">{evt.Title}</Text>
                    <Text verticalAlign="middle" color="$color10">{formatEventDate(evt.EventDate)}</Text>
                  </XStack>
                  <Paragraph verticalAlign="middle" color="$color10">{evt.Location}</Paragraph>
                </YStack>
              ))}
            </YStack>
          </Card>
        </YStack>
      </ScrollView>
    </SafeAreaWrapper>
  );
}