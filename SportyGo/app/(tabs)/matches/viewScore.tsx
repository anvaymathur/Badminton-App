// Match history list screen.
// Renders the user's past matches with avatars, accessible cards, filter/sort controls,
// and manages picker dialogs, empty states, and the W-L-T summary via supporting hooks.
import React, { useContext, useMemo, useCallback, useState, useRef, useEffect } from "react";
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
import { UserContext } from '../../components/userContext';
import { SafeAreaWrapper } from '../../components/SafeAreaWrapper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMatchHistory } from "@/app/hooks/useMatchHistory";
import { usePlayerProfiles } from "@/app/hooks/usePlayerProfiles";
import { useMatchFilters } from "@/app/hooks/useMatchFilters";

// Mapping of match outcomes to the accent colour and label used throughout the UI.
const MATCH_OUTCOME_STYLES = {
  win: { accent: "#047857", label: "Win" }, // emerald-700
  tie: { accent: "#B45309", label: "Tie" }, // amber-700
  lose: { accent: "#DC2626", label: "Loss" }, // red-600
} as const;

const AnimatedImage = Animated.createAnimatedComponent(Image);

const getAvatarInitials = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const compact = trimmed.replace(/\s+/g, "");
  return compact.slice(0, 2).toUpperCase();
};

// Normalises Firestore timestamps / ISO strings into Date objects the rest of the module can use.
const parseMatchDate = (date: Date | string | any): Date | null => {
  let dateObj: Date | null = null;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === "string") {
    dateObj = new Date(date);
  } else if (date?.toDate) {
    dateObj = date.toDate();
  } else if (date) {
    dateObj = new Date(date);
  }

  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return null;
  }

  return dateObj;
};

// Formats a match date for display, including time if it was captured alongside the score.
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

// Determines which side the signed-in user played on for the given match (if any).
const getCurrentUserTeam = (match: newMatchHistory, userID: string | null) => {
  if (!userID) return null;
  if (match.team1[0] === userID || match.team1[1] === userID) return "team1";
  if (match.team2[0] === userID || match.team2[1] === userID) return "team2";
  return null;
};

// Returns the winning team identifier (or "tie") based purely on the recorded scores.
const getTeamResult = (match: newMatchHistory) => {
  if (!match?.team1 || !match?.team2) return "tie";
  if (typeof match.team1[2] !== "number" || typeof match.team2[2] !== "number")
    return "tie";
  if (match.team1[2] > match.team2[2]) return "team1";
  if (match.team2[2] > match.team1[2]) return "team2";
  return "tie";
};

// Produces the perspective-aware outcome (win/lose/tie) for the current user.
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

export default function ViewScore() {
  // Router + auth context give us navigation helpers and the current user id.
  const router = useRouter();
  const { user } = useAuth0();
  const { globalUser } = useContext(UserContext)
  const userName: string = globalUser?.name ?? "";
  const userID: string = user?.sub ?? "";

  // Centralised data hooks: match history, player metadata, and filter state.
  const {
    matchHistory,
    loading,
    refreshing,
    errorMessage,
    retry,
    handleRefresh,
  } = useMatchHistory(userID ?? null);

  const { playerNames, visiblePlayers, onViewableItemsChanged } =
    usePlayerProfiles();

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

  // Convenience helpers to resolve display data for player chips within the list.
  const getPlayerName = useCallback(
    (playerId: string) => visiblePlayers[playerId]?.name ?? playerNames[playerId] ?? playerId,
    [visiblePlayers, playerNames]
  );

  const getPlayerPhoto = useCallback(
    (playerId: string) => visiblePlayers[playerId]?.photoUrl ?? null,
    [visiblePlayers]
  );

  // Renders single or double avatars for the teams, gracefully falling back to initials.
  const renderPlayerAvatars = useCallback(
    (player1: string, player2?: string) => {
      const playerIds = [player1, player2].filter(
        (id): id is string => !!id && id.trim() !== ""
      );

      if (playerIds.length === 0) return null;

      return (
        <XStack space="$2">
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

  // Synchronise Tamagui dialog events with the date/time picker coming from React Native.
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

  const renderItem = useCallback(
    ({ item }: { item: newMatchHistory }) => {
      const outcome = getMatchOutcome(item, userID ?? null);
      const { accent, label } = MATCH_OUTCOME_STYLES[outcome];
      const winningTeam = getTeamResult(item);
      const userTeam = getCurrentUserTeam(item, userID ?? null);
      const isUserWinner = userTeam !== null && outcome === "win";
      const isTie = outcome === "tie";

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
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Match on ${formatMatchDate(item.date)}. Tap for details.`}
          onPress={() =>
            (router as any).push({
              pathname: "/matches/viewIndividualScore",
              params: { matchId: item.id },
            })
          }
        >
          <YStack space="$2">
            {/* Meta row: calendar info on the left and "view details" affordance on the right */}
            <XStack justify="space-between" verticalAlign="center">
              <YStack>
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {formatMatchDate(item.date)}
                </Text>
                <XStack space="$1" verticalAlign="center">
                  <Ionicons name="ellipse" size={10} color={accent} />
                  <Text fontSize="$2" fontWeight="600" color={accent}>
                    {label}
                  </Text>
                </XStack>
              </YStack>
              <XStack verticalAlign="center" space="$1.5">
                <Text fontSize="$2" color="$color10">
                  View Details
                </Text>
                <Ionicons name="chevron-forward" size={18} color="$color10" />
              </XStack>
            </XStack>

            <Separator />

            {/* Body: stacked layout showing Team 1 / VS / Team 2 with avatars and scores */}
            <YStack space="$2">
              {/* Team 1 row */}
              <XStack justify="space-between" verticalAlign="center" space="$3">
                <YStack flex={1} space="$1.5">
                  <Text fontSize="$4" fontWeight="700" color="$color">
                    {getPlayerName(item.team1[0])}
                    {item.team1[1] ? ` & ${getPlayerName(item.team1[1])}` : ""}
                  </Text>
                  <XStack space="$2" verticalAlign="center">
                    {renderPlayerAvatars(item.team1[0], item.team1[1])}
                    <Text fontSize="$3" color="$color10">
                      Team 1
                    </Text>
                  </XStack>
                </YStack>
                <XStack
                  space="$2"
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
              <XStack justify="space-between" verticalAlign="center" space="$3">
                <YStack flex={1} space="$1.5">
                  <Text fontSize="$4" fontWeight="700" color="$color">
                    {getPlayerName(item.team2[0])}
                    {item.team2[1] ? ` & ${getPlayerName(item.team2[1])}` : ""}
                  </Text>
                  <XStack space="$2" verticalAlign="center">
                    {renderPlayerAvatars(item.team2[0], item.team2[1])}
                    <Text fontSize="$3" color="$color10">
                      Team 2
                    </Text>
                  </XStack>
                </YStack>
                <XStack
                  space="$2"
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

  const keyExtractor = useCallback((item: newMatchHistory, index: number) => {
    return (
      (item as any).id ||
      `${item.team1?.[0] ?? "t1a"}-${item.team2?.[0] ?? "t2a"}-${(item as any)?.date?.toString?.() ?? index
      }`
    );
  }, []);

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

  const sortedFilteredHistory = useMemo(() => {
    const filtered = baseFilteredHistory.filter((match) => {
      // Outcome filter: honour the selected win/loss/tie toggle (from the user's perspective).
      if (resultFilter !== "all" && getMatchOutcome(match, userID ?? null) !== resultFilter) {
        return false;
      }
      return true;
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

  // Aggregate record used for the W-L-T summary strip at the top of the screen.
  // We use baseFilteredHistory (date/time filters only) so the counts don't change
  // when the user toggles W/L/T.
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

  const hasMatches = matchHistory.length > 0;
  const isFilteredViewEmpty = hasMatches && sortedFilteredHistory.length === 0;

  // Show a full-screen spinner while we bootstrap data or when the user is not fully authenticated yet.
  if (loading || !userID) {
    return (
      <YStack flex={1} bg="$background" justify="center" verticalAlign="center" space="$4">
        <Spinner size="large" color="$color9" />
        <Text color="$color10">Fetching match history…</Text>
      </YStack>
    );
  }

  // Dedicated error state giving the user an actionable retry button.
  if (errorMessage) {
    return (
      <SafeAreaWrapper>
        <View flex={1} bg="$background" p="$5" justify="center">
          <Card
            padding="$4"
            borderWidth={1}
            borderColor="$borderColor"
            alignItems="center"
            space="$3"
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

  return (
    <SafeAreaWrapper>
      <View flex={1} bg="$background">
        {/* Header bar with screen title and quick access to add a new score */}
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

        {/* W-L-T summary strip reflects the currently filtered dataset */}
        <YStack px="$4" py="$3" borderBottomWidth={1} borderBottomColor="$borderColor" bg="$background">
          <Text fontSize="$2" color="$color10">
            Record
          </Text>
          <XStack space="$3" mt="$2">
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

        {hasMatches && (
          <YStack px="$4" py="$3" space="$3">
            {/* Sort + Filters row shown when there is at least one match recorded */}
            <YStack space="$2">
              <Text fontSize="$2" color="$color10">
                Sort by
              </Text>
              <XStack space="$2">
                <Button
                  size="$2"
                  bg={sortOrder === "recent" ? "$color9" : "$color3"}
                  color={sortOrder === "recent" ? "$color1" : "$color"}
                  borderColor="$borderColor"
                  onPress={() => setSortOrder("recent")}
                  accessibilityLabel="Sort by most recent matches"
                >
                  Most Recent
                </Button>
                <Button
                  size="$2"
                  bg={sortOrder === "oldest" ? "$color9" : "$color3"}
                  color={sortOrder === "oldest" ? "$color1" : "$color"}
                  borderColor="$borderColor"
                  onPress={() => setSortOrder("oldest")}
                  accessibilityLabel="Sort by oldest matches"
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
                  accessibilityLabel="Open match filters"
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

        {/* Main list of matches – renders cards plus pull-to-refresh behaviour */}
        <FlatList
          data={sortedFilteredHistory}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 25 }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={() =>
            hasMatches ? (
              // Empty state when filters hide all results
              <Card
                padding="$6"
                backgroundColor="$color2"
                borderWidth={1}
                borderColor="$borderColor"
                alignItems="center"
                space="$3"
                accessible
                accessibilityLabel="No matches found for the selected filters."
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
                accessible
                accessibilityRole="button"
                accessibilityLabel="No matches yet. Tap to add your first match."
                onPress={() => router.push('/matches/addScore')}
              >
                <YStack space="$3" verticalAlign="center">
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

      {/* Bottom sheet housing the advanced filter controls */}
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
            <YStack space="$4">
              {/* Sheet header with quick clear/apply actions */}
              <XStack justify="space-between" verticalAlign="center">
                <Text fontSize="$5" fontWeight="700">
                  Filters
                </Text>
                <XStack space="$2">
                  <Button
                    variant="outlined"
                    size="$2"
                    onPress={clearPendingFilters}
                    accessibilityLabel="Clear filter selections"
                  >
                    Clear
                  </Button>
                  <Button
                    size="$2"
                    bg="$color9"
                    color="$color1"
                    onPress={applyFilterChanges}
                    accessibilityLabel="Apply filters"
                  >
                    Apply
                  </Button>
                </XStack>
              </XStack>

              {/* Result type toggle chips */}
              <YStack space="$2">
                <Text fontSize="$3" fontWeight="600">
                  Match result
                </Text>
                <XStack space="$2" flexWrap="wrap">
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
              <YStack space="$2">
                <Text fontSize="$3" fontWeight="600">
                  Date range
                </Text>
                <XStack space="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("startDate")}
                    accessibilityLabel="Set start date filter"
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
                <XStack space="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("endDate")}
                    accessibilityLabel="Set end date filter"
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
              <YStack space="$2">
                <Text fontSize="$3" fontWeight="600">
                  Time of day
                </Text>
                <Paragraph color="$color10">
                  Limit matches to a specific time window (based on recorded start time).
                </Paragraph>
                <XStack space="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("startTime")}
                    accessibilityLabel="Set start time filter"
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
                <XStack space="$2" flexWrap="wrap">
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => openPicker("endTime")}
                    accessibilityLabel="Set end time filter"
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

      {/* Modal dialog that floats above the sheet to show the native date/time picker */}
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
              <YStack space="$4" style={{ alignItems: "center" }}>
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
                <XStack space="$3">
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
