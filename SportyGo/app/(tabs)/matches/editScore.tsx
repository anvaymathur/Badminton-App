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
  Select,
  Sheet,
  Spinner,
} from "tamagui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getAllUserProfiles,
  getMatchHistoryById,
  updateMatchHistory,
} from "../../../firebase/services_firestore2";
import type { newMatchHistory } from "@/firebase/types_index";
import { SafeAreaWrapper } from "../../components/SafeAreaWrapper";
import { Adapt } from "@tamagui/adapt";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Alert, Platform } from "react-native";

type PlayerOption = {
  id: string;
  name: string;
};

type MatchEditForm = {
  team1Player1: string;
  team1Player2: string;
  team2Player1: string;
  team2Player2: string;
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

const sanitizePlayerId = (value: any): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

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

export default function EditScore() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<newMatchHistory | null>(null);
  const [form, setForm] = useState<MatchEditForm | null>(null);
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
  const [playerOptionsLoading, setPlayerOptionsLoading] = useState(true);
  const [playerOptionsError, setPlayerOptionsError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftDate, setDraftDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const initialFormRef = useRef<MatchEditForm | null>(null);

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

        const normalizedDate = parseToDate(data.date) ?? new Date();
        const toFormValue = (value: any) => sanitizePlayerId(value) ?? "";
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

  useEffect(() => {
    const fetchPlayers = async () => {
      setPlayerOptionsLoading(true);
      setPlayerOptionsError(null);
      try {
        const players = await getAllUserProfiles();
        const options = players
          .map((player) => ({
            id: player.id,
            name: player.Name?.trim() || player.id,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        setPlayerOptions(options);
      } catch {
        setPlayerOptionsError("Couldn't load the player directory. Pull to retry.");
      } finally {
        setPlayerOptionsLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  useEffect(() => {
    if ((showDatePicker || showTimePicker) && form) {
      setDraftDate(form.date);
    }
  }, [showDatePicker, showTimePicker, form]);

  const mergedPlayerOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    playerOptions.forEach((option) => {
      optionMap.set(option.id, option.name);
    });

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
  }, [playerOptions, form]);

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
    (field: "team1Score" | "team2Score", value: string) => {
      let sanitized = value.replace(/[^0-9]/g, "");
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

  const handleSave = useCallback(async () => {
    if (!form || !matchId) return;

    const docId = match?.id?.trim() || matchId;
    if (!docId) {
      setEditError("We couldn't determine which match to update.");
      return;
    }

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

    const playerIds = [
      primaryTeam1,
      primaryTeam2,
      ...(form.matchType === "doubles" ? [secondaryTeam1 ?? "", secondaryTeam2 ?? ""] : []),
    ].filter((id) => id && id.trim());

    if (new Set(playerIds).size !== playerIds.length) {
      setEditError("Each player can only appear once in the match.");
      return;
    }

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

  if (loading || !form) {
    return (
      <SafeAreaWrapper>
        <YStack
          flex={1}
          bg="$background"
          items="center"
          justify="center"
          space="$3"
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
          space="$3"
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
          <YStack space="$4" pb="$10">
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
                <YStack space="$3">
                  <Text color="#EA580C" fontSize="$2">
                    {playerOptionsError}
                  </Text>
                  <Button
                    size="$2"
                    variant="outlined"
                    onPress={() => {
                      setPlayerOptionsError(null);
                      setPlayerOptionsLoading(true);
                      getAllUserProfiles()
                        .then((players) => {
                          const options = players
                            .map((player) => ({
                              id: player.id,
                              name: player.Name?.trim() || player.id,
                            }))
                            .sort((a, b) =>
                              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
                            );
                          setPlayerOptions(options);
                        })
                        .catch(() => {
                          setPlayerOptionsError("Couldn't load the player directory. Try again.");
                        })
                        .finally(() => setPlayerOptionsLoading(false));
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
                <XStack space="$3" items="center">
                  <Spinner color="$color9" size="small" />
                  <Text color="$color10">Loading players…</Text>
                </XStack>
              </Card>
            ) : null}

            <YStack space="$3">
              <Text fontSize="$3" fontWeight="600" color="$color">
                Match Type
              </Text>
              <XStack space="$3">
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
              <YStack space="$4">
                <YStack space="$3">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Team 1
                  </Text>
                  <Select
                    value={form.team1Player1}
                    onValueChange={(value) => handlePlayerChange("team1Player1", value)}
                  >
                    <Select.Trigger backgroundColor="$color4" borderColor="$borderColor" width="100%">
                      <Select.Value placeholder="Select Player 1">
                        {form.team1Player1 ? getPlayerLabel(form.team1Player1) : undefined}
                      </Select.Value>
                    </Select.Trigger>

                    <Adapt when="sm" platform="touch">
                      <Sheet modal dismissOnSnapToBottom position={0}>
                        <Sheet.Frame height={400}>
                          <Adapt.Contents />
                        </Sheet.Frame>
                        <Sheet.Overlay />
                      </Sheet>
                    </Adapt>

                    <Select.Content zIndex={200000}>
                      <Select.ScrollUpButton />
                      <Select.Viewport minH={140} maxH={320}>
                        <Select.Group>
                          <Select.Label>Players</Select.Label>
                          {optionsForField("team1Player1").map((option, index) => (
                            <Select.Item
                              key={`${option.id}-team1a-${index}`}
                              value={option.id}
                              index={index}
                            >
                              <Select.ItemText>{option.name}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Group>
                      </Select.Viewport>
                      <Select.ScrollDownButton />
                    </Select.Content>
                  </Select>

                  {form.matchType === "doubles" ? (
                    <Select
                      value={form.team1Player2}
                      onValueChange={(value) => handlePlayerChange("team1Player2", value)}
                    >
                      <Select.Trigger
                        backgroundColor="$color4"
                        borderColor="$borderColor"
                        width="100%"
                      >
                        <Select.Value placeholder="Select Player 2">
                          {form.team1Player2 ? getPlayerLabel(form.team1Player2) : undefined}
                        </Select.Value>
                      </Select.Trigger>

                      <Adapt when="sm" platform="touch">
                        <Sheet modal dismissOnSnapToBottom position={0}>
                          <Sheet.Frame height={400}>
                            <Adapt.Contents />
                          </Sheet.Frame>
                          <Sheet.Overlay />
                        </Sheet>
                      </Adapt>

                      <Select.Content zIndex={200000}>
                        <Select.ScrollUpButton />
                        <Select.Viewport minH={140} maxH={320}>
                          <Select.Group>
                            <Select.Label>Players</Select.Label>
                            {optionsForField("team1Player2").map((option, index) => (
                              <Select.Item
                                key={`${option.id}-team1b-${index}`}
                                value={option.id}
                                index={index}
                              >
                                <Select.ItemText>{option.name}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Group>
                        </Select.Viewport>
                        <Select.ScrollDownButton />
                      </Select.Content>
                    </Select>
                  ) : null}
                </YStack>

                <YStack space="$3">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Team 2
                  </Text>
                  <Select
                    value={form.team2Player1}
                    onValueChange={(value) => handlePlayerChange("team2Player1", value)}
                  >
                    <Select.Trigger backgroundColor="$color4" borderColor="$borderColor" width="100%">
                      <Select.Value placeholder="Select Player 1">
                        {form.team2Player1 ? getPlayerLabel(form.team2Player1) : undefined}
                      </Select.Value>
                    </Select.Trigger>

                    <Adapt when="sm" platform="touch">
                      <Sheet modal dismissOnSnapToBottom position={0}>
                        <Sheet.Frame height={400}>
                          <Adapt.Contents />
                        </Sheet.Frame>
                        <Sheet.Overlay />
                      </Sheet>
                    </Adapt>

                    <Select.Content zIndex={200000}>
                      <Select.ScrollUpButton />
                      <Select.Viewport minH={140} maxH={320}>
                        <Select.Group>
                          <Select.Label>Players</Select.Label>
                          {optionsForField("team2Player1").map((option, index) => (
                            <Select.Item
                              key={`${option.id}-team2a-${index}`}
                              value={option.id}
                              index={index}
                            >
                              <Select.ItemText>{option.name}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Group>
                      </Select.Viewport>
                      <Select.ScrollDownButton />
                    </Select.Content>
                  </Select>

                  {form.matchType === "doubles" ? (
                    <Select
                      value={form.team2Player2}
                      onValueChange={(value) => handlePlayerChange("team2Player2", value)}
                    >
                      <Select.Trigger
                        backgroundColor="$color4"
                        borderColor="$borderColor"
                        width="100%"
                      >
                        <Select.Value placeholder="Select Player 2">
                          {form.team2Player2 ? getPlayerLabel(form.team2Player2) : undefined}
                        </Select.Value>
                      </Select.Trigger>

                      <Adapt when="sm" platform="touch">
                        <Sheet modal dismissOnSnapToBottom position={0}>
                          <Sheet.Frame height={400}>
                            <Adapt.Contents />
                          </Sheet.Frame>
                          <Sheet.Overlay />
                        </Sheet>
                      </Adapt>

                      <Select.Content zIndex={200000}>
                        <Select.ScrollUpButton />
                        <Select.Viewport minH={140} maxH={320}>
                          <Select.Group>
                            <Select.Label>Players</Select.Label>
                            {optionsForField("team2Player2").map((option, index) => (
                              <Select.Item
                                key={`${option.id}-team2b-${index}`}
                                value={option.id}
                                index={index}
                              >
                                <Select.ItemText>{option.name}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Group>
                        </Select.Viewport>
                        <Select.ScrollDownButton />
                      </Select.Content>
                    </Select>
                  ) : null}
                </YStack>

                <YStack space="$3">
                  <Text fontSize="$3" fontWeight="600" color="$color">
                    Final Score
                  </Text>
                  <XStack space="$3">
                    <YStack flex={1} space="$2">
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
                    <YStack flex={1} space="$2">
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
              <YStack space="$3">
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
                <XStack space="$3">
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
          <YStack space="$4">
            <H4>Select Match Date</H4>
            <Paragraph color="$color10">
              Choose the day this match was played.
            </Paragraph>
            <DateTimePicker
              value={draftDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDraftDateChange}
            />
            <XStack space="$3">
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
          <YStack space="$4">
            <H4>Select Match Time</H4>
            <Paragraph color="$color10">
              Pick the time the match finished. Leave as-is if it wasn’t captured.
            </Paragraph>
            <DateTimePicker
              value={draftDate}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDraftTimeChange}
            />
            <XStack space="$3">
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
    </SafeAreaWrapper>
  );
}

