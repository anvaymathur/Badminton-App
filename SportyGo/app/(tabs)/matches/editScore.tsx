import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Button,
  XStack,
  YStack,
  Card,
  H4,
  Paragraph,
  ScrollView,
  Input,
  Sheet,
  Spinner,
} from "tamagui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getMatchHistoryById,
  updateMatchHistory,
  getUserProfilesByIds,
} from "@/firebase/services_firestore2";
import { useConnectedUsers } from "@/hooks/useConnectedUsers";
import { useAuth0 } from "react-native-auth0";
import type { newMatchHistory, UserDoc } from "@/firebase/types_index";
import { SafeAreaWrapper } from "@/components/SafeAreaWrapper";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Alert, Platform } from "react-native";

// Represents a selectable player option in the dropdowns.
type PlayerOption = {
  id: string;
  name: string;
};

// Represents the state of the match edit form.
type MatchEditForm = {
  team1Player1: string;
  team1Player2: string; // Empty string if singles
  team2Player1: string;
  team2Player2: string; // Empty string if singles
  team1Score: string;
  team2Score: string;
  matchType: "singles" | "doubles";
  date: Date;
};

type PlayerField = "team1Player1" | "team1Player2" | "team2Player1" | "team2Player2";

const PLAYER_FIELDS: PlayerField[] = [
  "team1Player1",
  "team1Player2",
  "team2Player1",
  "team2Player2",
];

// Helper to sanitize player IDs, ensuring they are non-empty strings.
const sanitizePlayerId = (value: any): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Helper to robustly parse various date formats into a Date object.
// Handles Date objects, strings, and Firestore Timestamp objects (with toDate method).
const parseToDate = (raw: Date | string | any): Date | null => {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (raw && typeof raw === "object" && typeof raw.toDate === "function") {
    const converted = raw.toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (raw !== undefined && raw !== null) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

// Helper to format a date for display.
// Shows time if non-midnight, otherwise just the date.
const formatDate = (date: Date | string | any) => {
  const dateObj = parseToDate(date);
  if (!dateObj) return "Invalid Date";
  const hasTime =
    dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0 || dateObj.getSeconds() !== 0;
  return hasTime
    ? dateObj.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    : dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
};

/**
 * EditScore Component
 * 
 * Allows users to edit an existing match record.
 * Fetches match data by ID, populates a form, and allows updating players, scores, and date.
 * Handles validation and optimistic UI updates.
 */
export default function EditScore() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { user } = useAuth0();

  // --- State ---
  const [loading, setLoading] = useState(true); // Loading state for initial match fetch
  const [match, setMatch] = useState<newMatchHistory | null>(null); // Original match data
  const [form, setForm] = useState<MatchEditForm | null>(null); // Current form state

  // Player selection options
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [playerOptionsLoading, setPlayerOptionsLoading] = useState(true);
  const [playerOptionsError, setPlayerOptionsError] = useState<string | null>(null);

  // UI feedback
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Date picker state
  const [draftDate, setDraftDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [activePlayerField, setActivePlayerField] = useState<PlayerField | null>(null);

  // Ref to track initial form state for "unsaved changes" detection
  const initialFormRef = useRef<MatchEditForm | null>(null);

  // Fetch match details on mount or when matchId changes.
  useEffect(() => {
    const fetchMatch = async () => {
      if (!matchId) {
        setLoading(false);
        setMatch(null);
        setForm(null);
        return;
      }

      setLoading(true);
      try {
        const data = await getMatchHistoryById(matchId);
        if (!data) {
          setMatch(null);
          setForm(null);
          setEditError("We couldn't find that match.");
          return;
        }

        setMatch(data);

        // Normalize data for the form
        const normalizedDate = parseToDate(data.date) ?? new Date();
        const toFormValue = (value: any) => sanitizePlayerId(value) ?? "";
        // Infer match type based on presence of second players
        const inferredType =
          toFormValue(data.team1[1]) || toFormValue(data.team2[1]) ? "doubles" : "singles";

        const normalizeScore = (score: number): string =>
          Number.isFinite(score)
            ? Math.min(Math.max(Math.trunc(score), 0), 99).toString()
            : "0";

        const initialFormState: MatchEditForm = {
          team1Player1: toFormValue(data.team1[0]),
          team1Player2: inferredType === "doubles" ? toFormValue(data.team1[1]) : "",
          team2Player1: toFormValue(data.team2[0]),
          team2Player2: inferredType === "doubles" ? toFormValue(data.team2[1]) : "",
          team1Score: normalizeScore(data.team1[2]),
          team2Score: normalizeScore(data.team2[2]),
          matchType: inferredType,
          date: normalizedDate,
        };
        initialFormRef.current = initialFormState;
        setForm(initialFormState);
        setDraftDate(normalizedDate);
        setEditError(null);
      } catch {
        setMatch(null);
        setForm(null);
        setEditError("We couldn't load the match. Please go back and try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [matchId]);

  // Fetch connected users to populate player options
  const { connectedUsers, loading: connectedUsersLoading, refresh: refreshConnectedUsers } = useConnectedUsers(user?.sub);

  useEffect(() => {
    if (connectedUsersLoading) {
      setPlayerOptionsLoading(true);
      return;
    }

    try {
      const options = connectedUsers
        .map((player) => ({
          id: player.id,
          name: player.Name?.trim() || player.id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setPlayerOptions(options);
      setPlayerOptionsLoading(false);
    } catch {
      setPlayerOptionsError("Couldn't load the player directory. Pull to retry.");
      setPlayerOptionsLoading(false);
    }
  }, [connectedUsers, connectedUsersLoading]);

  useEffect(() => {
    if ((showDatePicker || showTimePicker) && form) {
      setDraftDate(form.date);
    }
  }, [showDatePicker, showTimePicker, form]);

  // Extra players found in the match but not in connected users
  const [extraPlayers, setExtraPlayers] = useState<PlayerOption[]>([]);
  const [resolvingNames, setResolvingNames] = useState(true);

  // Fetch profiles for any players in the form that aren't in the connected users list
  useEffect(() => {
    if (!form || playerOptionsLoading) return;

    const fetchMissingProfiles = async () => {
      const formIds = [
        form.team1Player1,
        form.team1Player2,
        form.team2Player1,
        form.team2Player2,
      ].filter((id) => id && id.trim());

      const knownIds = new Set(playerOptions.map((p) => p.id));
      const extraIds = new Set(extraPlayers.map((p) => p.id));

      // Find IDs that are in the form but not in our known lists
      const missingIds = formIds.filter((id) => !knownIds.has(id) && !extraIds.has(id));

      if (missingIds.length > 0) {
        try {
          const profilesMap = await getUserProfilesByIds(missingIds);
          const newExtras = Object.values(profilesMap)
            .filter((p): p is UserDoc => !!p)
            .map((p) => ({ id: p.id, name: p.Name }));

          if (newExtras.length > 0) {
            setExtraPlayers((prev) => {
              // Merge new extras with existing ones, avoiding duplicates
              const existingIds = new Set(prev.map(p => p.id));
              const uniqueNew = newExtras.filter(p => !existingIds.has(p.id));
              return [...prev, ...uniqueNew];
            });
          }
        } catch (error) {
          console.error("Failed to fetch missing player profiles", error);
        }
      }
      setResolvingNames(false);
    };

    fetchMissingProfiles();
  }, [form, playerOptionsLoading]);

  // Memoized list of player options.
  // Merges fetched connected players with any extra fetched players and fallbacks.
  const mergedPlayerOptions = useMemo(() => {
    const optionMap = new Map<string, string>();

    // 1. Add connected users
    playerOptions.forEach((option) => {
      optionMap.set(option.id, option.name);
    });

    // 2. Add extra fetched players (from match history)
    extraPlayers.forEach((option) => {
      optionMap.set(option.id, option.name);
    });

    // 3. Fallback for IDs still not found (e.g. while loading or if fetch failed)
    if (form) {
      const ids = [
        form.team1Player1,
        form.team1Player2,
        form.team2Player1,
        form.team2Player2,
      ];
      ids.forEach((id) => {
        const trimmed = id?.trim();
        if (trimmed && !optionMap.has(trimmed)) {
          optionMap.set(trimmed, trimmed);
        }
      });
    }

    return Array.from(optionMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [playerOptions, extraPlayers, form]);

  const playerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    mergedPlayerOptions.forEach((option) => {
      map[option.id] = option.name;
    });
    return map;
  }, [mergedPlayerOptions]);

  const hasChanges = useMemo(() => {
    if (!form || !initialFormRef.current) return false;
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  }, [form]);

  const getPlayerLabel = useCallback(
    (id: string) => playerNameMap[id] ?? id,
    [playerNameMap]
  );

  // Filter options for a specific field to prevent selecting the same player multiple times.
  const optionsForField = useCallback(
    (field: PlayerField) => {
      if (!form) return mergedPlayerOptions;
      const otherIds = PLAYER_FIELDS.filter((key) => key !== field)
        .map((key) => form[key]?.trim())
        .filter((value): value is string => !!value);
      const otherSet = new Set(otherIds);
      return mergedPlayerOptions.filter(
        (option) => option.id === form[field] || !otherSet.has(option.id)
      );
    },
    [form, mergedPlayerOptions]
  );

  const handlePlayerChange = useCallback((field: PlayerField, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next: MatchEditForm = { ...prev, [field]: value };
      if (value) {
        PLAYER_FIELDS.forEach((key) => {
          if (key !== field && next[key] === value) {
            next[key] = "";
          }
        });
      }
      return next;
    });
    setEditError(null);
  }, []);

  const handleMatchTypeChange = useCallback((type: "singles" | "doubles") => {
    setForm((prev) => {
      if (!prev || prev.matchType === type) return prev;
      const next: MatchEditForm = {
        ...prev,
        matchType: type,
      };
      if (type === "singles") {
        next.team1Player2 = "";
        next.team2Player2 = "";
      }
      return next;
    });
    setEditError(null);
  }, []);

  const handleScoreChange = useCallback(
    (field: "team1Score" | "team2Score", value: string | any) => {
      const text = typeof value === "string" ? value : value?.nativeEvent?.text ?? "";
      let sanitized = text.replace(/[^0-9]/g, "");
      if (sanitized.length > 2) {
        sanitized = sanitized.slice(0, 2);
      }
      setForm((prev) => {
        if (!prev) return prev;
        return { ...prev, [field]: sanitized } as MatchEditForm;
      });
      setEditError(null);
    },
    []
  );

  const handleDraftDateChange = useCallback((_event: any, selected?: Date) => {
    if (selected) {
      setDraftDate((prev) => {
        const next = new Date(prev);
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        return next;
      });
    }
  }, []);

  const handleDraftTimeChange = useCallback((_event: any, selected?: Date) => {
    if (selected) {
      setDraftDate((prev) => {
        const next = new Date(prev);
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        return next;
      });
    }
  }, []);

  const confirmDraftDate = useCallback(() => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, date: new Date(draftDate) };
    });
    setShowDatePicker(false);
  }, [draftDate]);

  const confirmDraftTime = useCallback(() => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, date: new Date(draftDate) };
    });
    setShowTimePicker(false);
  }, [draftDate]);

  const handleAndroidDateChange = useCallback((event: any, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === "set" && selected) {
      setForm((prev) => {
        if (!prev) return prev;
        const next = new Date(prev.date);
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        return { ...prev, date: next };
      });
    }
  }, []);

  const handleAndroidTimeChange = useCallback((event: any, selected?: Date) => {
    setShowTimePicker(false);
    if (event.type === "set" && selected) {
      setForm((prev) => {
        if (!prev) return prev;
        const next = new Date(prev.date);
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        return { ...prev, date: next };
      });
    }
  }, []);

  // Saves the edited match data to Firestore.
  const handleSave = useCallback(async () => {
    if (!form || !matchId) return;

    const docId = match?.id?.trim() || matchId;
    if (!docId) {
      setEditError("We couldn't determine which match to update.");
      return;
    }

    // Validate player selections
    const primaryTeam1 = sanitizePlayerId(form.team1Player1);
    const primaryTeam2 = sanitizePlayerId(form.team2Player1);
    if (!primaryTeam1 || !primaryTeam2) {
      setEditError("Select at least one player for each team.");
      return;
    }

    const secondaryTeam1 = sanitizePlayerId(form.team1Player2);
    const secondaryTeam2 = sanitizePlayerId(form.team2Player2);

    if (form.matchType === "doubles" && (!secondaryTeam1 || !secondaryTeam2)) {
      setEditError("Doubles matches need two players per side.");
      return;
    }

    // Check for duplicate players
    const playerIds = [
      primaryTeam1,
      primaryTeam2,
      ...(form.matchType === "doubles" ? [secondaryTeam1 ?? "", secondaryTeam2 ?? ""] : []),
    ].filter((id) => id && id.trim());

    if (new Set(playerIds).size !== playerIds.length) {
      setEditError("Each player can only appear once in the match.");
      return;
    }

    // Validate scores
    const team1ScoreNumber = parseInt(form.team1Score || "0", 10);
    const team2ScoreNumber = parseInt(form.team2Score || "0", 10);
    const safeTeam1Score = Number.isNaN(team1ScoreNumber)
      ? 0
      : Math.min(team1ScoreNumber, 99);
    const safeTeam2Score = Number.isNaN(team2ScoreNumber)
      ? 0
      : Math.min(team2ScoreNumber, 99);

    if (safeTeam1Score === 0 && safeTeam2Score === 0) {
      setEditError("Scores must be greater than zero for at least one team.");
      return;
    }

    const normalizedDate = parseToDate(form.date);
    if (!normalizedDate) {
      setEditError("Select a valid match date before saving.");
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const updatedTeam1: newMatchHistory["team1"] = [
        primaryTeam1,
        form.matchType === "doubles" ? secondaryTeam1 ?? "" : "",
        safeTeam1Score,
      ];
      const updatedTeam2: newMatchHistory["team2"] = [
        primaryTeam2,
        form.matchType === "doubles" ? secondaryTeam2 ?? "" : "",
        safeTeam2Score,
      ];

      await updateMatchHistory(docId, {
        team1: updatedTeam1,
        team2: updatedTeam2,
        date: normalizedDate,
      });

      setSaving(false);
      // Navigate back to the individual score view
      router.replace({
        pathname: "/(tabs)/matches/viewIndividualScore",
        params: { matchId: docId },
      });
    } catch {
      setSaving(false);
      setEditError("We couldn't save your changes. Please try again.");
    }
  }, [form, matchId, match, router]);

  const handleGoBack = useCallback(() => {
    if (!hasChanges) {
      router.back();
      return;
    }

    Alert.alert(
      "Discard changes?",
      "You have unsaved edits. Leave without saving?",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => router.back(),
        },
      ]
    );
  }, [hasChanges, router]);

  if (loading || !form || resolvingNames) {
    return (
      <SafeAreaWrapper>
        <YStack
          flex={1}
          bg="$background"
          items="center"
          justify="center"
          gap="$3"
          p="$4"
        >
          <Spinner size="large" color="$color9" />
          <Text color="$color10" fontSize="$3">
            {editError ? "Preparing editor…" : "Loading match…"}
          </Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper>
      <View flex={1} bg="$background">
        <XStack
          pr="$4"
          pl="$4"
          pt="$3"
          pb="$3"
          bg="$color2"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
          items="center"
          gap="$3"
        >
          <Button variant="outlined" size="$3" onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={20} />
          </Button>
          <H4 flex={1}>Edit Match</H4>
          <Button size="$3" onPress={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </XStack>

        <ScrollView flex={1} p="$4" showsVerticalScrollIndicator={false}>
          <YStack gap="$4" pb="$10">
            {editError ? (
              <Card
                borderColor="#DC2626"
                borderWidth={1}
                backgroundColor="$color2"
                p="$3"
              >
                <Text color="#B91C1C" fontSize="$2">
                  {editError}
                </Text>
              </Card>
            ) : null}

            {playerOptionsError ? (
              <Card
                borderColor="#F97316"
                borderWidth={1}
                backgroundColor="$color2"
                p="$3"
              >
                <YStack gap="$3">
                  <Text color="#EA580C" fontSize="$2">
                    {playerOptionsError}
                  </Text>
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => {
                      setPlayerOptionsError(null);
                      setPlayerOptionsLoading(true);
                      refreshConnectedUsers();
                    }}
                  >
                    Retry
                  </Button>
                </YStack>
              </Card>
            ) : null}

            {playerOptionsLoading ? (
              <Card
                borderColor="$borderColor"
                borderWidth={1}
                backgroundColor="$color2"
                p="$3"
              >
                <XStack gap="$3" items="center">
                  <Spinner color="$color9" size="small" />
                  <Text color="$color10">Loading players…</Text>
                </XStack>
              </Card>
            ) : null}

            <YStack gap="$3">
              <Text fontSize="$3" fontWeight="600" color="$color">
                Match Type
              </Text>
              <XStack gap="$3">
                <Button
                  flex={1}
                  bg={form.matchType === "singles" ? "$color9" : "$color3"}
                  color={form.matchType === "singles" ? "$color1" : "$color9"}
                  onPress={() => handleMatchTypeChange("singles")}
                >
                  Singles
                </Button>
                <Button
                  flex={1}
                  bg={form.matchType === "doubles" ? "$color9" : "$color3"}
                  color={form.matchType === "doubles" ? "$color1" : "$color9"}
                  onPress={() => handleMatchTypeChange("doubles")}
                >
                  Doubles
                </Button>
              </XStack>
            </YStack>

            <Card p="$4" backgroundColor="$color2" borderWidth={1} borderColor="$borderColor">
              <YStack gap="$4">
                <YStack gap="$3">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Team 1
                  </Text>
                  <Button
                    onPress={() => form.team1Player1 !== user?.sub && setActivePlayerField("team1Player1")}
                    disabled={form.team1Player1 === user?.sub}
                    opacity={form.team1Player1 === user?.sub ? 0.8 : 1}
                    bg="$color4"
                    borderColor="$borderColor"
                    borderWidth={1}
                    justify="flex-start"
                    pl="$3"
                    iconAfter={form.team1Player1 === user?.sub ? <Ionicons name="lock-closed" size={16} color="$color10" /> : undefined}
                  >
                    <Text color={form.team1Player1 ? "$color" : "$color10"}>
                      {form.team1Player1 ? getPlayerLabel(form.team1Player1) : "Select Player 1"}
                    </Text>
                  </Button>

                  {form.matchType === "doubles" ? (
                    <Button
                      onPress={() => form.team1Player2 !== user?.sub && setActivePlayerField("team1Player2")}
                      disabled={form.team1Player2 === user?.sub}
                      opacity={form.team1Player2 === user?.sub ? 0.8 : 1}
                      bg="$color4"
                      borderColor="$borderColor"
                      borderWidth={1}
                      justify="flex-start"
                      pl="$3"
                      iconAfter={form.team1Player2 === user?.sub ? <Ionicons name="lock-closed" size={16} color="$color10" /> : undefined}
                    >
                      <Text color={form.team1Player2 ? "$color" : "$color10"}>
                        {form.team1Player2 ? getPlayerLabel(form.team1Player2) : "Select Player 2"}
                      </Text>
                    </Button>
                  ) : null}
                </YStack>

                <YStack gap="$3">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Team 2
                  </Text>
                  <Button
                    onPress={() => form.team2Player1 !== user?.sub && setActivePlayerField("team2Player1")}
                    disabled={form.team2Player1 === user?.sub}
                    opacity={form.team2Player1 === user?.sub ? 0.8 : 1}
                    bg="$color4"
                    borderColor="$borderColor"
                    borderWidth={1}
                    justify="flex-start"
                    pl="$3"
                    iconAfter={form.team2Player1 === user?.sub ? <Ionicons name="lock-closed" size={16} color="$color10" /> : undefined}
                  >
                    <Text color={form.team2Player1 ? "$color" : "$color10"}>
                      {form.team2Player1 ? getPlayerLabel(form.team2Player1) : "Select Player 1"}
                    </Text>
                  </Button>

                  {form.matchType === "doubles" ? (
                    <Button
                      onPress={() => form.team2Player2 !== user?.sub && setActivePlayerField("team2Player2")}
                      disabled={form.team2Player2 === user?.sub}
                      opacity={form.team2Player2 === user?.sub ? 0.8 : 1}
                      bg="$color4"
                      borderColor="$borderColor"
                      borderWidth={1}
                      justify="flex-start"
                      pl="$3"
                      iconAfter={form.team2Player2 === user?.sub ? <Ionicons name="lock-closed" size={16} color="$color10" /> : undefined}
                    >
                      <Text color={form.team2Player2 ? "$color" : "$color10"}>
                        {form.team2Player2 ? getPlayerLabel(form.team2Player2) : "Select Player 2"}
                      </Text>
                    </Button>
                  ) : null}
                </YStack>

                <YStack gap="$3">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Final Score
                  </Text>
                  <XStack gap="$3">
                    <YStack flex={1} gap="$2">
                      <Text color="$color10" fontSize="$2">
                        Team 1 Points
                      </Text>
                      <Input
                        value={form.team1Score}
                        onChangeText={(value) => handleScoreChange("team1Score", value)}
                        inputMode="numeric"
                        keyboardType="number-pad"
                        bg="$color4"
                        borderColor="$borderColor"
                        borderWidth={1}
                      />
                    </YStack>
                    <YStack flex={1} gap="$2">
                      <Text color="$color10" fontSize="$2">
                        Team 2 Points
                      </Text>
                      <Input
                        value={form.team2Score}
                        onChangeText={(value) => handleScoreChange("team2Score", value)}
                        inputMode="numeric"
                        keyboardType="number-pad"
                        bg="$color4"
                        borderColor="$borderColor"
                        borderWidth={1}
                      />
                    </YStack>
                  </XStack>
                </YStack>
              </YStack>
            </Card>

            <Card p="$4" backgroundColor="$color2" borderWidth={1} borderColor="$borderColor">
              <YStack gap="$3">
                <Text fontSize="$3" fontWeight="600" color="$color">
                  Match Date &amp; Time
                </Text>
                <Text color="$color10" fontSize="$2">
                  Currently
                </Text>
                <Text color="$color" fontSize="$5" fontWeight="700">
                  {formatDate(form.date)}
                </Text>
                <Paragraph color="$color10">
                  Adjust the recorded date or include a finish time if available.
                </Paragraph>
                <XStack gap="$3">
                  <Button flex={1} variant="outlined" onPress={() => setShowDatePicker(true)}>
                    Change Date
                  </Button>
                  <Button flex={1} variant="outlined" onPress={() => setShowTimePicker(true)}>
                    Change Time
                  </Button>
                </XStack>
              </YStack>
            </Card>
          </YStack>
        </ScrollView>
      </View>

      {Platform.OS === "android" && showDatePicker && (
        <DateTimePicker
          value={form?.date ?? new Date()}
          mode="date"
          display="default"
          onChange={handleAndroidDateChange}
        />
      )}

      {Platform.OS === "android" && showTimePicker && (
        <DateTimePicker
          value={form?.date ?? new Date()}
          mode="time"
          display="default"
          onChange={handleAndroidTimeChange}
        />
      )}

      {Platform.OS === "ios" && (
        <>
          <Sheet
            modal
            open={showDatePicker}
            onOpenChange={(open: boolean) => {
              setShowDatePicker(open);
              if (!open && form) {
                setDraftDate(form.date);
              }
            }}
            snapPoints={[50]}
            dismissOnSnapToBottom
          >
            <Sheet.Overlay opacity={0.25} />
            <Sheet.Handle />
            <Sheet.Frame p="$4" bg="$background">
              <YStack gap="$4">
                <H4>Select Match Date</H4>
                <Paragraph color="$color10">
                  Choose the day this match was played.
                </Paragraph>
                <DateTimePicker
                  value={draftDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDraftDateChange}
                />
                <XStack gap="$3">
                  <Button flex={1} variant="outlined" onPress={() => setShowDatePicker(false)}>
                    Cancel
                  </Button>
                  <Button flex={1} onPress={confirmDraftDate}>
                    Save
                  </Button>
                </XStack>
              </YStack>
            </Sheet.Frame>
          </Sheet>

          <Sheet
            modal
            open={showTimePicker}
            onOpenChange={(open: boolean) => {
              setShowTimePicker(open);
              if (!open && form) {
                setDraftDate(form.date);
              }
            }}
            snapPoints={[50]}
            dismissOnSnapToBottom
          >
            <Sheet.Overlay opacity={0.25} />
            <Sheet.Handle />
            <Sheet.Frame p="$4" bg="$background">
              <YStack gap="$4">
                <H4>Select Match Time</H4>
                <Paragraph color="$color10">
                  Pick the time the match finished. Leave as-is if it wasn’t captured.
                </Paragraph>
                <DateTimePicker
                  value={draftDate}
                  mode="time"
                  display="spinner"
                  onChange={handleDraftTimeChange}
                />
                <XStack gap="$3">
                  <Button flex={1} variant="outlined" onPress={() => setShowTimePicker(false)}>
                    Cancel
                  </Button>
                  <Button flex={1} onPress={confirmDraftTime}>
                    Save
                  </Button>
                </XStack>
              </YStack>
            </Sheet.Frame>
          </Sheet>
        </>
      )}
      <Sheet
        modal
        open={!!activePlayerField}
        onOpenChange={(open: boolean) => {
          if (!open) setActivePlayerField(null);
        }}
        snapPoints={[60, 85]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay opacity={0.5} />
        <Sheet.Handle />
        <Sheet.Frame bg="$background" p="$4">
          <YStack gap="$4" flex={1}>
            <H4>Select Player</H4>
            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$2" pb="$8">
                {activePlayerField &&
                  optionsForField(activePlayerField).map((option) => (
                    <Card
                      key={option.id}
                      bordered
                      p="$3"
                      onPress={() => {
                        handlePlayerChange(activePlayerField, option.id);
                        setActivePlayerField(null);
                      }}
                      pressStyle={{ bg: "$color3" }}
                    >
                      <Text fontSize="$3" color="$color">
                        {option.name}
                      </Text>
                    </Card>
                  ))}
              </YStack>
            </ScrollView>
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </SafeAreaWrapper>
  );
}

