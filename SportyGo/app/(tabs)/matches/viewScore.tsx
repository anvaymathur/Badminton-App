/**
 * viewScore.tsx — Match History Screen
 *
 * Main screen for viewing a user's past match results. Located at the
 * `/(tabs)/matches/viewScore` route inside the bottom-tab navigator.
 *
 * ## Features
 * - Scrollable list of match cards with pull-to-refresh
 * - W-L-T summary strip (tappable to toggle result filter)
 * - Sort by newest / oldest
 * - Advanced filters (result type, date range, time-of-day range) via bottom sheet
 * - Player avatars with initials fallback and fade-in animation
 * - Accessibility: aria-labels, focusable cards, screen-reader friendly
 *
 * ## Data Pipeline
 *   Firestore → useMatchHistory (AsyncStorage cache, 10-min TTL)
 *       → matchHistory[]
 *       → baseFilteredHistory      (date/time range filters)
 *       → sortedFilteredHistory    (result filter + sort order)
 *       → FlatList                 (renders match cards)
 *       → onViewableItemsChanged   → usePlayerProfiles (batch fetch names/photos)
 *
 * ## Navigation
 * - Tap "+" button        → /matches/addScore
 * - Tap a match card      → /matches/viewIndividualScore?matchId=<id>
 * - Tap "Add First Match" → /matches/addScore
 *
 * ## Data Type (newMatchHistory)
 *   { team1: [player1Id, player2Id, score], team2: [player1Id, player2Id, score], date, id }
 *   Each team is a 3-element tuple. Matches can be 1v1 or 2v2 (second player ID may be empty).
 *
 * ## UI States
 * | State             | Condition                         | Renders                                |
 * |-------------------|-----------------------------------|----------------------------------------|
 * | Loading           | loading === true or !userID       | Full-screen spinner                    |
 * | Error             | errorMessage !== null             | Error card with retry button           |
 * | Empty (new user)  | matchHistory.length === 0         | "No matches yet" + "Add First Match"  |
 * | Empty (filtered)  | Matches exist but all filtered out| "No matches match filters" + reset btn|
 * | Normal            | Has visible matches               | Full list UI                           |
 *
 * ## Custom Hooks
 * - useMatchHistory   — Firestore fetch + AsyncStorage cache + loading/error/refresh state
 * - usePlayerProfiles — Viewport-aware batch profile fetching + avatar prefetch + name cache
 * - useMatchFilters   — Sort order, result/date/time filters, pending vs applied state, picker plumbing
 */
import React, { useContext, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Button,
  XStack,
  YStack,
  Card,
  H4,
  H5,
  Paragraph,
  Separator,
  Spinner,
  Sheet,
  ScrollView,
  Dialog,
  Avatar
} from "tamagui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import { Animated, FlatList, Image } from "react-native";
import { newMatchHistory } from "@/firebase/types_index";
import { UserContext } from '@/components/userContext';
import { SafeAreaWrapper } from '@/components/SafeAreaWrapper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMatchHistory } from "@/hooks/useMatchHistory";
import { usePlayerProfiles } from "@/hooks/usePlayerProfiles";
import { useMatchFilters } from "@/hooks/useMatchFilters";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/firebase/index";

/**
 * Maps each match outcome to its accent color and display label.
 * Used for the colored left-border on match cards, outcome chips,
 * and the W-L-T summary strip at the top of the screen.
 */
const MATCH_OUTCOME_STYLES = {
  win: { accent: "#047857", label: "Win" }, // emerald-700
  tie: { accent: "#B45309", label: "Tie" }, // amber-700
  lose: { accent: "#DC2626", label: "Loss" }, // red-600
} as const;

/** Wraps React Native's Image in Animated so we can fade in profile photos. */
const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * Generates initials for avatar fallbacks.
 * Takes the first 2 characters of the name (whitespace removed), uppercased.
 * Returns "??" for empty/whitespace-only strings.
 *
 * @example getAvatarInitials("John Doe")  → "JO"
 * @example getAvatarInitials("")           → "??"
 */
const getAvatarInitials = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const compact = trimmed.replace(/\s+/g, "");
  return compact.slice(0, 2).toUpperCase();
};

/**
 * Normalises Firestore timestamps / ISO strings into Date objects.
 *
 * Supported input formats:
 * - Native `Date` instances (passed through)
 * - ISO date strings (parsed via `new Date(string)`)
 * - Firestore `Timestamp` objects (calls `.toDate()`)
 * - Rehydrated Firestore timestamps from JSON cache (`{ seconds: number }`)
 * - Any other truthy value (attempted via `new Date(value)`)
 *
 * @returns A valid Date, or `null` if parsing fails / result is NaN.
 */
const parseMatchDate = (date: Date | string | any): Date | null => {
  let dateObj: Date | null = null;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === "string") {
    dateObj = new Date(date);
  } else if (date?.toDate) {
    dateObj = date.toDate();
  } else if (date && typeof date === "object" && "seconds" in date) {
    // Handle rehydrated Firestore Timestamp objects (from JSON cache)
    dateObj = new Date(date.seconds * 1000);
  } else if (date) {
    dateObj = new Date(date);
  }

  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return null;
  }

  return dateObj;
};

/**
 * Formats a match date for display.
 *
 * If the time component is midnight (00:00:00), assumes only the date was
 * recorded and returns date-only format (e.g. "Jan 5, 2026").
 * Otherwise includes time (e.g. "Jan 5, 2026, 03:30 PM").
 *
 * @returns Formatted string, or "Invalid Date" if parsing fails.
 */
const formatMatchDate = (date: Date | string | any) => {
  const dateObj = parseMatchDate(date);
  if (!dateObj) return "Invalid Date";

  const hasTime =
    dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0 || dateObj.getSeconds() !== 0;

  if (hasTime) {
    return dateObj.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Determines which side the signed-in user played on for a given match.
 *
 * Checks both player slots in team1 and team2 against the provided userID.
 *
 * @returns "team1", "team2", or null if the user didn't participate.
 */
const getCurrentUserTeam = (match: newMatchHistory, userID: string | null) => {
  if (!userID) return null;
  if (match.team1[0] === userID || match.team1[1] === userID) return "team1";
  if (match.team2[0] === userID || match.team2[1] === userID) return "team2";
  return null;
};

/**
 * Returns the winning team based purely on recorded scores.
 *
 * Compares team1[2] (score) vs team2[2] (score).
 * Falls back to "tie" if either team or score data is missing.
 *
 * @returns "team1", "team2", or "tie".
 */
const getTeamResult = (match: newMatchHistory) => {
  if (!match?.team1 || !match?.team2) return "tie";
  if (typeof match.team1[2] !== "number" || typeof match.team2[2] !== "number")
    return "tie";
  if (match.team1[2] > match.team2[2]) return "team1";
  if (match.team2[2] > match.team1[2]) return "team2";
  return "tie";
};

/**
 * Produces a perspective-aware outcome for the current user.
 *
 * Combines `getCurrentUserTeam` and `getTeamResult` to determine:
 * - If the user participated: "win" / "lose" / "tie" relative to their team.
 * - If the user didn't participate (spectator view): returns the result from
 *   Team 1's perspective (team1 won → "win", team2 won → "lose").
 *
 * @returns A key of MATCH_OUTCOME_STYLES ("win" | "lose" | "tie").
 */
const getMatchOutcome = (
  match: newMatchHistory,
  userID: string | null
): keyof typeof MATCH_OUTCOME_STYLES => {
  const userTeam = getCurrentUserTeam(match, userID);
  const winningTeam = getTeamResult(match);

  if (winningTeam === "tie") return "tie";
  if (!userTeam) return winningTeam === "team1" ? "win" : "lose";
  return userTeam === winningTeam ? "win" : "lose";
};

/**
 * PlayerAvatar Component
 *
 * Renders a circular avatar for a single player.
 *
 * Behaviour:
 * 1. Immediately shows the player's initials (via `getAvatarInitials`) as a fallback.
 * 2. If `photoUrl` is provided, loads the image in the background.
 * 3. Once the image fires `onLoad`, fades it in over 220ms using `Animated.timing`.
 * 4. If `photoUrl` changes (e.g. profile update), resets the opacity and re-animates.
 *
 * @param name     - The player's display name (used for initials fallback).
 * @param photoUrl - URL of the player's profile photo, or null if unavailable.
 */
const PlayerAvatar = ({ name, photoUrl }: { name: string; photoUrl: string | null }) => {
  const initials = useMemo(() => getAvatarInitials(name), [name]);
  const opacity = useRef(new Animated.Value(photoUrl ? 0 : 1)).current;

  useEffect(() => {
    opacity.setValue(photoUrl ? 0 : 1);
  }, [photoUrl, opacity]);

  const handleImageLoad = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Avatar
      circular
      size="$3"
      borderColor="$borderColor"
      borderWidth={1}
      overflow="hidden"
    >
      <Avatar.Fallback
        alignItems="center"
        justifyContent="center"
        backgroundColor="$color9"
      >
        <Text fontSize="$2" fontWeight="600" color="$color1">
          {initials}
        </Text>
      </Avatar.Fallback>
      {photoUrl ? (
        <AnimatedImage
          source={{ uri: photoUrl }}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            opacity,
          }}
          resizeMode="cover"
          onLoad={handleImageLoad}
        />
      ) : null}
    </Avatar>
  );
};

/**
 * ViewScore Component (default export)
 *
 * The main screen for viewing match history. Renders the full page including:
 * - Header bar with title and "add score" button
 * - W-L-T record summary strip (tappable cards to toggle result filter)
 * - Sort (newest/oldest) and filter controls
 * - FlatList of match cards with pull-to-refresh
 * - Bottom sheet for advanced filters (result, date range, time-of-day)
 * - Modal dialog for native date/time picker
 *
 * Screen layout (top → bottom):
 *   1. Header bar: "My Matches" + add button
 *   2. W-L-T summary strip
 *   3. Sort & filter row (+ active filter summary text)
 *   4. FlatList of match cards (or empty state)
 *   5. Filter bottom sheet (modal, opened by "Filters" button)
 *   6. Date/time picker dialog (modal, opens over the sheet)
 */
export default function ViewScore() {
  // ── Auth & Navigation ──────────────────────────────────────────────
  // useRouter: Expo Router navigation (push to addScore / viewIndividualScore)
  // useAuth0:  Auth0 user object — user.sub is the unique user ID
  // UserContext: app-level user profile context (provides display name)
  const router = useRouter();
  const { user } = useAuth0();
  const { globalUser } = useContext(UserContext)
  const userName: string = globalUser?.name ?? "";
  const userID: string = user?.sub ?? "";

  // ── Data Hooks ──────────────────────────────────────────────────────
  // useMatchHistory:   Fetches match records from Firestore. Hydrates from
  //                    AsyncStorage cache for fast first paint. Provides
  //                    loading/refreshing/error states and retry/refresh actions.
  // usePlayerProfiles: Tracks which player IDs are in the FlatList viewport,
  //                    batch-fetches names + photos from Firestore, caches names.
  // useMatchFilters:   All filter/sort state — sort order, result filter (W/L/T),
  //                    date/time ranges, pending vs applied state, picker plumbing.
  const {
    matchHistory,
    loading,
    refreshing,
    errorMessage,
    retry,
    handleRefresh,
  } = useMatchHistory(userID ?? null);

  // Collect all unique player IDs from match history for eager fetching.
  const allPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    matchHistory.forEach((match) => {
      [match.team1[0], match.team1[1], match.team2[0], match.team2[1]].forEach((id) => {
        if (typeof id === "string" && id.trim()) ids.add(id);
      });
    });
    return Array.from(ids);
  }, [matchHistory]);

  const { playerNames, visiblePlayers, onViewableItemsChanged, profilesLoading, refreshProfiles } =
    usePlayerProfiles(allPlayerIds);

  const {
    sortOrder,
    setSortOrder,
    resultFilter,
    setResultFilter,

    filterStartDate,
    filterEndDate,
    filterStartTime,
    filterEndTime,
    filterSheetOpen,
    openFilterSheet,
    closeFilterSheet,
    isFilterActive,
    filterSummary,
    pendingResultFilter,
    pendingStartDate,
    pendingEndDate,
    pendingStartTime,
    pendingEndTime,
    setPendingResultFilter,
    setPendingStartDate,
    setPendingEndDate,
    setPendingStartTime,
    setPendingEndTime,
    clearPendingFilters,
    applyFilterChanges,
    resetFilters,
    formatDateOnly,
    formatTimeOnly,
    activePicker,
    openPicker,
    handlePickerDialogClose,
    handlePickerConfirm,
    handlePickerCancel,
    pickerValue,
    pickerMode,
    pickerMaximumDate,
    pickerMinimumDate,
    setPendingValue,
  } = useMatchFilters();

  // ── Profile Change Listener ─────────────────────────────────────────
  // Listen for changes to any player profile that appears in match history.
  // When a profile changes (name, photo, etc.), clear the cached profile
  // data so the UI re-fetches and shows the updated information.
  const profileListenerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (allPlayerIds.length === 0) return;

    // Only subscribe to IDs we haven't already subscribed to
    const newIds = allPlayerIds.filter((id) => !profileListenerIdsRef.current.has(id));
    if (newIds.length === 0) return;

    // Track first snapshot per listener to skip the initial fire
    const isFirstSnapshot = new Map<string, boolean>();
    newIds.forEach((id) => {
      profileListenerIdsRef.current.add(id);
      isFirstSnapshot.set(id, true);
    });

    const unsubscribes = newIds.map((id) =>
      onSnapshot(doc(db, "users", id), () => {
        if (isFirstSnapshot.get(id)) {
          isFirstSnapshot.set(id, false);
          return; // Skip the initial snapshot
        }
        refreshProfiles();
      })
    );

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [allPlayerIds, refreshProfiles]);

  // Combined refresh: pull-to-refresh also re-fetches player profiles.
  const handleFullRefresh = useCallback(async () => {
    await Promise.all([handleRefresh(), refreshProfiles()]);
  }, [handleRefresh, refreshProfiles]);

  // ── Player Display Helpers ──────────────────────────────────────────
  // Resolve display name: prefer fetched profile → cached name → raw player ID.
  const getPlayerName = useCallback(
    (playerId: string) => visiblePlayers[playerId]?.name ?? playerNames[playerId] ?? playerId,
    [visiblePlayers, playerNames]
  );

  // Resolve profile photo URL (null if not yet fetched or unavailable).
  const getPlayerPhoto = useCallback(
    (playerId: string) => visiblePlayers[playerId]?.photoUrl ?? null,
    [visiblePlayers]
  );

  /**
   * Renders 1 or 2 PlayerAvatar components for a team row.
   * Filters out empty/blank player IDs (handles 1v1 matches where player2 is "").
   */
  const renderPlayerAvatars = useCallback(
    (player1: string, player2?: string) => {
      const playerIds = [player1, player2].filter(
        (id): id is string => !!id && id.trim() !== ""
      );

      if (playerIds.length === 0) return null;

      return (
        <XStack gap="$2">
          {playerIds.map((id) => (
            <PlayerAvatar
              key={id}
              name={getPlayerName(id)}
              photoUrl={getPlayerPhoto(id)}
            />
          ))}
        </XStack>
      );
    },
    [getPlayerName, getPlayerPhoto]
  );

  /**
   * Synchronises Tamagui Dialog events with the native DateTimePicker.
   *
   * Called on every picker change event. Handles:
   * - Dismissal: reverts to previous value and closes the dialog.
   * - Date selection: normalises to midnight (strips time component).
   * - Time selection: normalises to epoch date (1970-01-01) so only
   *   hours/minutes are compared when filtering.
   */
  const handlePickerChange = useCallback(
    (event: any, selectedDate?: Date) => {
      if (!activePicker) return;
      if (event?.type === "dismissed" || !selectedDate) {
        handlePickerCancel();
        handlePickerDialogClose(false);
        return;
      }

      if (pickerMode === "date") {
        const normalized = new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          0,
          0,
          0,
          0
        );
        setPendingValue(activePicker, normalized);
      } else {
        // For time, we normalize to a fixed date (epoch) to compare times only.
        const normalized = new Date(
          1970,
          0,
          1,
          selectedDate.getHours(),
          selectedDate.getMinutes(),
          0,
          0
        );
        setPendingValue(activePicker, normalized);
      }
    },
    [
      activePicker,
      pickerMode,
      handlePickerCancel,
      handlePickerDialogClose,
      setPendingValue,
    ]
  );

  /**
   * Renders a single match card for the FlatList.
   *
   * Each card contains:
   * - Top row: match date + outcome badge (colored dot + "Win"/"Loss"/"Tie")
   *            and a "View Details >" affordance
   * - Separator
   * - Team 1 row: player names, avatars, score, trophy icon if winner
   * - "VS" badge
   * - Team 2 row: same layout as Team 1
   * - Outcome chip (only shown if the signed-in user participated)
   *
   * Tapping the card navigates to /matches/viewIndividualScore?matchId=<id>.
   * The left border is colored by outcome (green/amber/red).
   */
  const renderItem = useCallback(
    ({ item }: { item: newMatchHistory }) => {
      // Derive outcome, colors, and which team won for this specific card.
      const outcome = getMatchOutcome(item, userID ?? null);
      const { accent, label } = MATCH_OUTCOME_STYLES[outcome];
      const winningTeam = getTeamResult(item);
      const userTeam = getCurrentUserTeam(item, userID ?? null);
      const isUserWinner = userTeam !== null && outcome === "win";
      const isTie = outcome === "tie";

      // Build contextual status text for the outcome chip.
      const statusText = (() => {
        if (isTie) return "🤝 Match ended in a tie";
        if (userTeam && isUserWinner) return "🏆 You won!";
        if (outcome === "win") {
          return `🏆 Team ${winningTeam === "team1" ? "1" : "2"} won`;
        }
        if (userTeam) return "😔 You lost";
        return `😔 Team ${winningTeam === "team1" ? "1" : "2"} lost`;
      })();

      return (
        <Card
          padding="$3"
          backgroundColor="$color2"
          borderWidth={1}
          borderColor="$borderColor"
          borderLeftWidth={4}
          borderLeftColor={accent}
          elevation={2}
          mb="$3"
          cursor="pointer"
          hoverStyle={{ elevation: 4, scale: 0.99 }}
          pressStyle={{ elevation: 1, scale: 0.97 }}
          tabIndex={0}
          role="button"
          aria-label={`Match on ${formatMatchDate(item.date)}. Tap for details.`}
          onPress={() =>
            (router as any).push({
              pathname: "/matches/viewIndividualScore",
              params: { matchId: item.id },
            })
          }
        >
          <YStack gap="$2">
            {/* Meta row: calendar info on the left and "view details" affordance on the right */}
            <XStack justify="space-between" verticalAlign="center">
              <YStack>
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {formatMatchDate(item.date)}
                </Text>
                <XStack gap="$1" verticalAlign="center">
                  <Ionicons name="ellipse" size={10} color={accent} />
                  <Text fontSize="$2" fontWeight="600" color={accent}>
                    {label}
                  </Text>
                </XStack>
              </YStack>
              <XStack verticalAlign="center" gap="$1.5">
                <Text fontSize="$2" color="$color10">
                  View Details
                </Text>
                <Ionicons name="chevron-forward" size={18} color="$color10" />
              </XStack>
            </XStack>

            <Separator />

            {/* Body: stacked layout showing Team 1 / VS / Team 2 with avatars and scores */}
            <YStack gap="$2">
              {/* Team 1 row */}
              <XStack justify="space-between" verticalAlign="center" gap="$3">
                <YStack flex={1} gap="$1.5">
                  <Text fontSize="$4" fontWeight="700" color="$color">
                    {getPlayerName(item.team1[0])}
                    {item.team1[1] ? ` & ${getPlayerName(item.team1[1])}` : ""}
                  </Text>
                  <XStack gap="$2" verticalAlign="center">
                    {renderPlayerAvatars(item.team1[0], item.team1[1])}
                    <Text fontSize="$3" color="$color10">
                      Team 1
                    </Text>
                  </XStack>
                </YStack>
                <XStack
                  gap="$2"
                  verticalAlign="center"
                  justify="flex-end"
                  style={{ minWidth: 56 }}
                >
                  {winningTeam === "team1" && (
                    <Ionicons name="trophy" size={20} color="#FFD700" />
                  )}
                  <Text fontSize="$7" fontWeight="800" color="$color">
                    {item.team1[2]}
                  </Text>
                </XStack>
              </XStack>

              {/* VS badge separating the two sides */}
              <XStack justify="center" verticalAlign="center">
                <Card
                  padding="$1"
                  bg="$color9"
                  borderRadius="$2"
                  minWidth={36}
                  alignItems="center"
                >
                  <Text fontWeight="700" color="$color1" fontSize="$3">
                    VS
                  </Text>
                </Card>
              </XStack>

              {/* Team 2 row */}
              <XStack justify="space-between" verticalAlign="center" gap="$3">
                <YStack flex={1} gap="$1.5">
                  <Text fontSize="$4" fontWeight="700" color="$color">
                    {getPlayerName(item.team2[0])}
                    {item.team2[1] ? ` & ${getPlayerName(item.team2[1])}` : ""}
                  </Text>
                  <XStack gap="$2" verticalAlign="center">
                    {renderPlayerAvatars(item.team2[0], item.team2[1])}
                    <Text fontSize="$3" color="$color10">
                      Team 2
                    </Text>
                  </XStack>
                </YStack>
                <XStack
                  gap="$2"
                  verticalAlign="center"
                  justify="flex-end"
                  style={{ minWidth: 56 }}
                >
                  {winningTeam === "team2" && (
                    <Ionicons name="trophy" size={20} color="#FFD700" />
                  )}
                  <Text fontSize="$7" fontWeight="800" color="$color">
                    {item.team2[2]}
                  </Text>
                </XStack>
              </XStack>
            </YStack>

            {/* Outcome chip highlighting whether the signed-in user won, lost, or tied */}
            {userTeam && (
              <Card
                padding="$1"
                backgroundColor={accent}
                borderRadius="$2"
                alignItems="center"
              >
                <Text fontSize="$3" fontWeight="700" color="$color1">
                  {statusText}
                </Text>
              </Card>
            )}
          </YStack>
        </Card>
      );
    },
    [getPlayerName, renderPlayerAvatars, router, userID]
  );

  /** Stable key for FlatList: prefers match ID, falls back to a composite of team IDs + date. */
  const keyExtractor = useCallback((item: newMatchHistory, index: number) => {
    return (
      (item as any).id ||
      `${item.team1?.[0] ?? "t1a"}-${item.team2?.[0] ?? "t2a"}-${(item as any)?.date?.toString?.() ?? index
      }`
    );
  }, []);

  /**
   * Stage 1 of the filter pipeline: date/time range filtering.
   *
   * Applies the active start/end date and start/end time-of-day filters
   * against the full matchHistory array. This produces the base dataset
   * used for both the W-L-T summary counts and the result-filtered list.
   *
   * Date boundaries are inclusive (start = 00:00:00, end = 23:59:59.999).
   * Time-of-day is compared as minutes-since-midnight. If the user selects
   * an inverted range (end < start), the values are swapped automatically.
   */
  const baseFilteredHistory = useMemo(() => {
    // Convert selected dates into inclusive start/end bounds for easier comparisons.
    const startDateBoundary = filterStartDate
      ? new Date(
        filterStartDate.getFullYear(),
        filterStartDate.getMonth(),
        filterStartDate.getDate(),
        0,
        0,
        0,
        0
      )
      : null;
    const endDateBoundary = filterEndDate
      ? new Date(
        filterEndDate.getFullYear(),
        filterEndDate.getMonth(),
        filterEndDate.getDate(),
        23,
        59,
        59,
        999
      )
      : null;

    const startMinutesRaw =
      filterStartTime !== null
        ? filterStartTime.getHours() * 60 + filterStartTime.getMinutes()
        : null;
    const endMinutesRaw =
      filterEndTime !== null
        ? filterEndTime.getHours() * 60 + filterEndTime.getMinutes()
        : null;

    let startMinutes = startMinutesRaw;
    let endMinutes = endMinutesRaw;
    if (
      startMinutesRaw !== null &&
      endMinutesRaw !== null &&
      endMinutesRaw < startMinutesRaw
    ) {
      // If the user selects an inverted time range, swap the values so the filter still works.
      startMinutes = endMinutesRaw;
      endMinutes = startMinutesRaw;
    }

    return matchHistory.filter((match) => {
      const matchDateObj = parseMatchDate(match.date);
      if (!matchDateObj) return false;

      if (startDateBoundary && matchDateObj < startDateBoundary) return false;
      if (endDateBoundary && matchDateObj > endDateBoundary) return false;

      if (startMinutes !== null || endMinutes !== null) {
        const matchMinutes =
          matchDateObj.getHours() * 60 + matchDateObj.getMinutes();
        if (startMinutes !== null && matchMinutes < startMinutes) return false;
        if (endMinutes !== null && matchMinutes > endMinutes) return false;
      }

      return true;
    });
  }, [
    matchHistory,
    filterStartDate,
    filterEndDate,
    filterStartTime,
    filterEndTime,
  ]);

  /**
   * Stage 2 of the filter pipeline: result filter + sort.
   *
   * Takes baseFilteredHistory and:
   * 1. Filters by the selected result type (win/lose/tie/all).
   * 2. Sorts by date (newest-first or oldest-first based on sortOrder).
   *
   * This is the final dataset rendered by the FlatList.
   */
  const sortedFilteredHistory = useMemo(() => {
    const filtered = baseFilteredHistory.filter((match) => {
      // Outcome filter: honor the selected win/loss/tie toggle (from the user's perspective).
      return !(resultFilter !== "all" && getMatchOutcome(match, userID ?? null) !== resultFilter);

    });

    return filtered.sort((a, b) => {
      const dateA = parseMatchDate(a.date)?.getTime() ?? 0;
      const dateB = parseMatchDate(b.date)?.getTime() ?? 0;
      if (sortOrder === "recent") {
        return dateB - dateA;
      }
      return dateA - dateB;
    });
  }, [baseFilteredHistory, resultFilter, sortOrder, userID]);

  /**
   * W-L-T record summary for the summary strip at the top of the screen.
   *
   * Important: uses `baseFilteredHistory` (date/time only), NOT the result-filtered
   * list. This ensures the W-L-T counts remain stable when the user toggles
   * the result filter — otherwise tapping "Wins" would show "W: 5, L: 0, T: 0"
   * which is misleading.
   */
  const recordSummary = useMemo(() => {
    return baseFilteredHistory.reduce(
      (acc, match) => {
        const outcome = getMatchOutcome(match, userID ?? null);
        if (outcome === "win") acc.win += 1;
        else if (outcome === "lose") acc.loss += 1;
        else acc.tie += 1;
        return acc;
      },
      { win: 0, loss: 0, tie: 0 }
    );
  }, [baseFilteredHistory, userID]);

  // Derived booleans for controlling which empty state to show.
  const hasMatches = matchHistory.length > 0;
  const isFilteredViewEmpty = hasMatches && sortedFilteredHistory.length === 0;

  // ── Render: Loading State ──────────────────────────────────────────
  // Full-screen spinner shown during initial data fetch or when user auth is pending.
  if (loading || !userID || profilesLoading) {
    return (
      <YStack flex={1} bg="$background" justify="center" verticalAlign="center" gap="$4">
        <Spinner size="large" color="$color9" />
        <Text color="$color10">Fetching match history…</Text>
      </YStack>
    );
  }

  // ── Render: Error State ─────────────────────────────────────────────
  // Shown when Firestore fetch failed. Displays the error message and a retry button.
  if (errorMessage) {
    return (
      <SafeAreaWrapper>
        <View flex={1} bg="$background" p="$5" justify="center">
          <Card
            padding="$4"
            borderWidth={1}
            borderColor="$borderColor"
            alignItems="center"
            gap="$3"
          >
            <Ionicons name="alert-circle" size={32} color="#DC2626" />
            <Text
              fontSize="$4"
              fontWeight="700"
              color="$color"
              style={{ textAlign: "center" }}
            >
              Something went wrong
            </Text>
            <Paragraph color="$color10" style={{ textAlign: "center" }}>
              {errorMessage}
            </Paragraph>
            <Button bg="$color9" color="$color1" onPress={retry}>
              Retry
            </Button>
          </Card>
        </View>
      </SafeAreaWrapper>
    );
  }

  // ── Render: Main Screen ─────────────────────────────────────────────
  return (
    <SafeAreaWrapper>
      <View flex={1} bg="$background">
        {/* ── 1. Header Bar ─────────────────────────────────────────
             Screen title "My Matches" + "+" button to navigate to addScore */}
        <XStack
          pr="$4"
          pl="$4"
          pt="$3"
          pb="$3"
          bg="$color2"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
          verticalAlign="center"
        >

          <H4 verticalAlign="center" flex={1}>My Matches</H4>
          <Button
            variant="outlined"
            size="$3"
            onPress={() => router.push('/matches/addScore')}
            icon={<Ionicons name="add" size={20} />}
          />
        </XStack>

        {/* ── 2. W-L-T Summary Strip ───────────────────────────────
             Three tappable cards showing win/loss/tie counts.
             Tapping one toggles the result filter (tap again to deselect).
             Counts are colored by outcome and reflect baseFilteredHistory. */}
        <YStack px="$4" py="$3" borderBottomWidth={1} borderBottomColor="$borderColor" bg="$background">
          <Text fontSize="$2" color="$color10">
            Record
          </Text>
          <XStack gap="$3" mt="$2">
            {[
              { key: "win", label: "W", color: MATCH_OUTCOME_STYLES.win.accent, value: recordSummary.win },
              { key: "lose", label: "L", color: MATCH_OUTCOME_STYLES.lose.accent, value: recordSummary.loss },
              { key: "tie", label: "T", color: MATCH_OUTCOME_STYLES.tie.accent, value: recordSummary.tie },
            ].map((item) => {
              const isSelected = resultFilter === item.key;
              return (
                <Card
                  key={item.key}
                  padding="$2"
                  borderWidth={isSelected ? 2 : 1}
                  borderColor={isSelected ? item.color : "$borderColor"}
                  backgroundColor="$color2"
                  minWidth={72}
                  alignItems="center"
                  pressStyle={{ scale: 0.95, opacity: 0.8 }}
                  onPress={() => setResultFilter(isSelected ? "all" : (item.key as "win" | "lose" | "tie"))}
                  animation="quick"
                >
                  <Text fontSize="$5" fontWeight="700" color={item.color}>
                    {item.label} {item.value}
                  </Text>
                </Card>
              );
            })}
          </XStack>
        </YStack>

        {/* ── 3. Sort & Filter Row ──────────────────────────────────
             Only shown when at least one match exists. Contains:
             - "Most Recent" / "Oldest" sort toggle buttons
             - "Filters" button to open the advanced filter bottom sheet
             - Active filter summary text (when any filter is applied) */}
        {hasMatches && (
          <YStack px="$4" py="$3" gap="$3">
            <YStack gap="$2">
              <Text fontSize="$2" color="$color10">
                Sort by
              </Text>
              <XStack gap="$2">
                <Button
                  size="$2"
                  bg={sortOrder === "recent" ? "$color9" : "$color3"}
                  color={sortOrder === "recent" ? "$color1" : "$color"}
                  borderColor="$borderColor"
                  onPress={() => setSortOrder("recent")}
                  aria-label="Sort by most recent matches"
                >
                  Most Recent
                </Button>
                <Button
                  size="$2"
                  bg={sortOrder === "oldest" ? "$color9" : "$color3"}
                  color={sortOrder === "oldest" ? "$color1" : "$color"}
                  borderColor="$borderColor"
                  onPress={() => setSortOrder("oldest")}
                  aria-label="Sort by oldest matches"
                >
                  Oldest
                </Button>
                <Button
                  size="$2"
                  bg={isFilterActive ? "$color9" : "$color3"}
                  color={isFilterActive ? "$color1" : "$color"}
                  borderColor="$borderColor"
                  icon={<Ionicons name="options-outline" size={16} color={isFilterActive ? "#fff" : undefined} />}
                  onPress={openFilterSheet}
                  aria-label="Open match filters"
                >
                  Filters
                </Button>
              </XStack>
            </YStack>
            {isFilterActive && filterSummary && (
              <Text fontSize="$2" color="$color10">
                {filterSummary}
              </Text>
            )}
          </YStack>
        )}

        {/* ── 4. Match FlatList ────────────────────────────────────
             Renders sortedFilteredHistory as match cards. Pull-to-refresh
             triggers handleRefresh. onViewableItemsChanged feeds player IDs
             to usePlayerProfiles for viewport-aware avatar prefetching.
             ListEmptyComponent shows context-appropriate empty state. */}
        <FlatList
          data={sortedFilteredHistory}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 25 }}
          refreshing={refreshing}
          onRefresh={handleFullRefresh}
          ListEmptyComponent={() =>
            hasMatches ? (
              // Empty state when filters hide all results
              <Card
                padding="$6"
                backgroundColor="$color2"
                borderWidth={1}
                borderColor="$borderColor"
                alignItems="center"
                gap="$3"
                tabIndex={0}
                aria-label="No matches found for the selected filters."
              >
                <Ionicons name="filter-circle-outline" size={48} color="#666" />
                <H5 color="$color">No matches match your filters</H5>
                <Paragraph color="$color10" style={{ textAlign: "center" }}>
                  Try adjusting your filters or reset to view all matches.
                </Paragraph>
                <Button
                  bg="$color9"
                  color="$color1"
                  onPress={() => {
                    resetFilters();
                  }}
                >
                  Reset Filters
                </Button>
              </Card>
            ) : (
              // Empty state for brand-new users before any matches have been recorded
              <Card
                padding="$6"
                backgroundColor="$color2"
                borderWidth={1}
                borderColor="$borderColor"
                tabIndex={0}
                role="button"
                aria-label="No matches yet. Tap to add your first match."
                onPress={() => router.push('/matches/addScore')}
              >
                <YStack gap="$3" verticalAlign="center">
                  <Ionicons name="trophy-outline" size={48} color="#666" />
                  <H5 color="$color">No matches yet</H5>
                  <Paragraph color="$color10" style={{ textAlign: "center" }}>
                    Your match results will appear here after you complete a game. You can tap any result card to view full details and stats.
                  </Paragraph>
                  <Button
                    bg="$color9"
                    color="$color1"
                    onPress={() => router.push('/matches/addScore')}
                    mt="$2"
                  >
                    Add First Match
                  </Button>
                </YStack>
              </Card>
            )
          }
        />
      </View>

      {/* ── 5. Filter Bottom Sheet ─────────────────────────────
           Modal sheet opened by the "Filters" button. Uses PENDING state
           so selections don't apply until "Apply" is pressed. Contains:
           - Result type chips (All / Wins / Losses / Ties)
           - Date range pickers (From / To with clear buttons)
           - Time-of-day pickers (From / To with clear buttons)
           - Clear (resets pending) / Apply (commits pending → active) */}
      <Sheet
        modal
        open={filterSheetOpen}
        onOpenChange={(open: boolean) => {
          if (open) {
            openFilterSheet();
          } else {
            closeFilterSheet();
          }
        }}
        snapPointsMode="fit"
        dismissOnSnapToBottom
      >
        <Sheet.Overlay opacity={0.5} />
        <Sheet.Handle />
        <Sheet.Frame p="$4" bg="$background">
          <ScrollView>
            <YStack gap="$4">
              {/* Sheet header with quick clear/apply actions */}
              <XStack justify="space-between" verticalAlign="center">
                <Text fontSize="$5" fontWeight="700">
                  Filters
                </Text>
                <XStack gap="$2">
                  <Button
                    variant="outlined"
                    size="$2"
                    onPress={clearPendingFilters}
                    aria-label="Clear filter selections"
                  >
                    Clear
                  </Button>
                  <Button
                    size="$2"
                    bg="$color9"
                    color="$color1"
                    onPress={applyFilterChanges}
                    aria-label="Apply filters"
                  >
                    Apply
                  </Button>
                </XStack>
              </XStack>

              {/* Result type toggle chips */}
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600">
                  Match result
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {[
                    { label: "All results", value: "all" },
                    { label: "Wins", value: "win" },
                    { label: "Losses", value: "lose" },
                    { label: "Ties", value: "tie" },
                  ].map(({ label, value }) => (
                    <Button
                      key={value}
                      size="$2"
                      bg={pendingResultFilter === value ? "$color9" : "$color3"}
                      color={pendingResultFilter === value ? "$color1" : "$color"}
                      borderColor="$borderColor"
                      onPress={() =>
                        setPendingResultFilter(value as typeof pendingResultFilter)
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </XStack>
              </YStack>

              {/* Date range pickers – launch dialogs to choose inclusive start/end dates */}
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600">
                  Date range
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("startDate")}
                    aria-label="Set start date filter"
                  >
                    From: {formatDateOnly(pendingStartDate)}
                  </Button>
                  {pendingStartDate && (
                    <Button
                      size="$2"
                      variant="outlined"
                      onPress={() => setPendingStartDate(null)}
                    >
                      Clear start
                    </Button>
                  )}
                </XStack>
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("endDate")}
                    aria-label="Set end date filter"
                  >
                    To: {formatDateOnly(pendingEndDate)}
                  </Button>
                  {pendingEndDate && (
                    <Button
                      size="$2"
                      variant="outlined"
                      onPress={() => setPendingEndDate(null)}
                    >
                      Clear end
                    </Button>
                  )}
                </XStack>
              </YStack>

              {/* Time of day pickers – narrow results to a specific window */}
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="600">
                  Time of day
                </Text>
                <Paragraph color="$color10">
                  Limit matches to a specific time window (based on recorded start time).
                </Paragraph>
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("startTime")}
                    aria-label="Set start time filter"
                  >
                    From: {formatTimeOnly(pendingStartTime)}
                  </Button>
                  {pendingStartTime && (
                    <Button
                      size="$2"
                      variant="outlined"
                      onPress={() => setPendingStartTime(null)}
                    >
                      Clear start
                    </Button>
                  )}
                </XStack>
                <XStack gap="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("endTime")}
                    aria-label="Set end time filter"
                  >
                    To: {formatTimeOnly(pendingEndTime)}
                  </Button>
                  {pendingEndTime && (
                    <Button
                      size="$2"
                      variant="outlined"
                      onPress={() => setPendingEndTime(null)}
                    >
                      Clear end
                    </Button>
                  )}
                </XStack>
              </YStack>
            </YStack>
          </ScrollView>
        </Sheet.Frame>
      </Sheet>

      {/* ── 6. Date/Time Picker Dialog ─────────────────────────
           Tamagui Dialog that opens OVER the filter sheet when the user
           taps a date/time selector. Embeds the native DateTimePicker
           component in "spinner" mode. On Cancel, reverts to the previous
           value. On Done, confirms the selection and re-opens the filter
           sheet automatically (via pendingSheetReopenRef in useMatchFilters). */}
      <Dialog
        modal
        open={activePicker !== null}
        onOpenChange={handlePickerDialogClose}
      >
        <Dialog.Portal>
          <Dialog.Overlay opacity={0.4} bg="black" />
          <Dialog.Content
            bordered
            elevate
            bg="$background"
            borderColor="$borderColor"
            borderWidth={1}
            p="$4"
          >
            {activePicker && (
              <YStack gap="$4" style={{ alignItems: "center" }}>
                <Dialog.Title>
                  {activePicker === "startDate"
                    ? "Select start date"
                    : activePicker === "endDate"
                      ? "Select end date"
                      : activePicker === "startTime"
                        ? "Select start time"
                        : "Select end time"}
                </Dialog.Title>
                <DateTimePicker
                  value={pickerValue}
                  mode={pickerMode}
                  display="spinner"
                  maximumDate={pickerMaximumDate}
                  minimumDate={pickerMinimumDate}
                  onChange={handlePickerChange}
                />
                <XStack gap="$3">
                  <Dialog.Close asChild>
                    <Button
                      variant="outlined"
                      onPress={handlePickerCancel}
                    >
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Dialog.Close asChild>
                    <Button
                      bg="$color9"
                      color="$color1"
                      onPress={handlePickerConfirm}
                    >
                      Done
                    </Button>
                  </Dialog.Close>
                </XStack>
              </YStack>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </SafeAreaWrapper>
  );
}
