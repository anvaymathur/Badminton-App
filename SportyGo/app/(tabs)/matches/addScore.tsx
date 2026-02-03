// Multi-step wizard for logging a new match result.
// Handles player selection, score entry, match metadata, validation, and persists data to Firestore.
import React, { useContext, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Button,
  XStack,
  YStack,
  Card,
  Input,
  Select,
  Sheet,
  H4,
  H5,
  Paragraph,
  Circle,
  Separator,
  Dialog,
  Adapt
} from "tamagui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import { createMatchHistory } from '@/firebase/services_firestore2';
import { useConnectedUsers } from '../../hooks/useConnectedUsers';
import { newMatchHistory, UserDoc } from '@/firebase/types_index';
import { Alert, Platform } from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { UserContext } from '../../components/userContext';
import { SafeAreaWrapper } from '../../components/SafeAreaWrapper';


/**
 * PlayerPicker Component
 * 
 * A custom dropdown component for selecting players.
 * It uses a Sheet component to present a list of selectable items (players) in a modal-like view.
 * 
 * @param value - The currently selected value (player name).
 * @param onValueChange - Callback function triggered when a new value is selected.
 * @param items - Array of strings representing the list of players to choose from.
 * @param placeholder - Text to display when no value is selected.
 * @param label - Label for the picker sheet header.
 */
function PlayerPicker({ value, onValueChange, items, placeholder, label }: { value: string, onValueChange: (val: string) => void, items: string[], placeholder: string, label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onPress={() => setOpen(true)}
        bg="$color4"
        borderColor="$borderColor"
        borderWidth={1}
        justify="space-between"
        color={value ? "$color12" : "$color11"}
        iconAfter={<Ionicons name="chevron-down" size={16} />}
      >
        {value || placeholder}
      </Button>
      <Sheet
        modal
        open={open}
        onOpenChange={setOpen}
        snapPoints={[50, 90]}
        dismissOnSnapToBottom
        zIndex={200000}
      >
        <Sheet.Frame p="$4" space="$4">
          <Sheet.Handle />
          <H5>{label}</H5>
          <Sheet.ScrollView>
            <YStack space="$2">
              {items.map((item, idx) => (
                <Button
                  key={`${item}-${idx}`}
                  onPress={() => {
                    onValueChange(item);
                    setOpen(false);
                  }}
                  bg={value === item ? "$color5" : "$color3"}
                  color="$color12"
                  justify="flex-start"
                >
                  {item}
                </Button>
              ))}
            </YStack>
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

/**
 * AddScore Component
 * 
 * The main component for the "Add Match Score" wizard.
 * It guides the user through a multi-step process to record match results:
 * 1. Select Players: Choose participants for the match (Singles or Doubles).
 * 2. Game Score: Enter the final score for the match.
 * 3. Match Setup: Specify the date, time, and optional tournament name.
 * 
 * Data is validated at each step and finally persisted to Firestore.
 */
export default function AddScore() {
  const router = useRouter();
  // --- State Management ---

  // Score inputs for the user's team (Team 1) and their opponents (Team 2).
  const [yourScore, setYourScore] = useState("0");
  const [opponentScore, setOpponentScore] = useState("0");

  // Match configuration and metadata.
  const [matchType, setMatchType] = useState("singles"); // 'singles' or 'doubles'
  const [date, setDate] = useState<Date>(new Date()); // Final confirmed date/time
  const [showDatePicker, setShowDatePicker] = useState(false); // Controls visibility of date picker modal
  const [showTimePicker, setShowTimePicker] = useState(false); // Controls visibility of time picker modal
  const [tournament, setTournament] = useState(""); // Optional tournament name

  // Player information.
  const [userName, setUserName] = useState(""); // Current user's name (Team 1 Player 1)
  const [userID, setUserID] = useState(""); // Current user's ID
  const [yourPlayer2, setYourPlayer2] = useState(""); // Team 1 Player 2 (for doubles)
  const [opponentPlayer1, setOpponentPlayer1] = useState(""); // Team 2 Player 1
  const [opponentPlayer2, setOpponentPlayer2] = useState(""); // Team 2 Player 2 (for doubles)

  // Wizard navigation state.
  const [currentStep, setCurrentStep] = useState(0); // 0: Players, 1: Score, 2: Setup

  // Temporary date state for the picker before confirmation.
  const [draftDate, setDraftDate] = useState<Date>(new Date(date));

  const { user } = useAuth0()
  const { globalUser } = useContext(UserContext)

  // Player directory pulled from Firestore so the wizard can present selection menus.
  const [players, setPlayers] = useState<string[]>([]);
  const [playerNameToId, setPlayerNameToId] = useState<{ [name: string]: string }>({});
  const totalSteps = 3;
  const stepTitles = ["Select Players", "Game Score", "Match Setup"];
  const stepDescriptions = [
    "Choose everyone who played in the match.",
    "Record the final score using the selected players.",
    "Confirm when and where the match happened."
  ];
  const goToPreviousStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));
  // Guard each step to ensure the user fills required fields before progressing.
  /**
   * Validates the current step's data before allowing progression.
   * 
   * @param stepIndex - The index of the step to validate.
   * @returns true if valid, false otherwise (with an alert explaining the error).
   */
  const validateStep = (stepIndex: number) => {
    if (stepIndex === 0) {
      // Step 1: enforce valid player selections with no duplicates and required opponents.
      const selectedPlayers = [userName, opponentPlayer1, yourPlayer2, opponentPlayer2]
        .map((p) => (p ? p.trim() : ""))
        .filter((p) => p !== "");
      const hasDuplicatePlayers = new Set(selectedPlayers).size !== selectedPlayers.length;

      if (!opponentPlayer1 || opponentPlayer1.trim() === "") {
        Alert.alert("Missing players", "Select at least one opponent to continue.");
        return false;
      }

      if (matchType === "doubles") {
        if (!yourPlayer2 || yourPlayer2.trim() === "" || !opponentPlayer2 || opponentPlayer2.trim() === "") {
          Alert.alert(
            "Missing teammates",
            "Doubles matches need both teammates selected before continuing."
          );
          return false;
        }
      }

      if (hasDuplicatePlayers) {
        Alert.alert("Duplicate selection", "A player cannot be selected more than once.");
        return false;
      }

      return true;
    }

    if (stepIndex === 1) {
      // Step 2: ensure scores are present and non-zero before saving.
      const yourScoreValue = parseInt(yourScore, 10);
      const opponentScoreValue = parseInt(opponentScore, 10);

      if (isNaN(yourScoreValue) && isNaN(opponentScoreValue)) {
        Alert.alert("Missing score", "Please enter a score for at least one team before continuing.");
        return false;
      }

      if (yourScoreValue === 0 && opponentScoreValue === 0) {
        Alert.alert("Incomplete score", "Scores must be greater than zero for at least one team.");
        return false;
      }

      return true;
    }

    if (stepIndex === 2) {
      // Step 3: confirm a match date has been chosen.
      if (!date) {
        Alert.alert("Missing date", "Please select a match date before continuing.");
        return false;
      }
      return true;
    }

    return true;
  };

  // Filter option lists so a chosen player cannot be selected again elsewhere
  const availableYourPlayer2 = players.filter((name) => name !== userName && name !== opponentPlayer1 && name !== opponentPlayer2);
  const availableOpponentPlayer1 = players.filter((name) => name !== userName && name !== yourPlayer2 && name !== opponentPlayer2);
  const availableOpponentPlayer2 = players.filter((name) => name !== userName && name !== yourPlayer2 && name !== opponentPlayer1);
  const getFirstName = (fullName: string) =>
    fullName && fullName.trim() !== "" ? fullName.trim().split(" ")[0] : "";
  const buildTeamLabel = (team: string[], fallback: string) => {
    const names = team.filter((name) => name && name.trim() !== "").map(getFirstName);
    if (names.length === 0) return fallback;
    if (names.length === 1) return names[0];
    return names.join(" & ");
  };
  const yourTeamLabel = buildTeamLabel(
    matchType === "doubles" ? [userName, yourPlayer2] : [userName],
    matchType === "singles" ? "You" : "Your Team"
  );
  const opponentTeamLabel = buildTeamLabel(
    matchType === "doubles" ? [opponentPlayer1, opponentPlayer2] : [opponentPlayer1],
    matchType === "singles" ? "Opponent" : "Opponent Team"
  );

  // Track focus to allow empty string while editing
  const [isYourScoreFocused, setIsYourScoreFocused] = useState(false);
  const [isOpponentScoreFocused, setIsOpponentScoreFocused] = useState(false);

  // --- Effects ---

  // Effect to initialize the user's name and ID from Auth0 or global context.
  // It attempts to find the best available name (nickname, given name, etc.) and sanitizes it.
  useEffect(() => {
    // Prefill the logged-in user's name/id so the wizard can auto-select them.
    if (user?.sub) {
      setUserID(user.sub);
    }

    const sanitizeName = (raw?: string | null) => {
      if (!raw) return "";
      const trimmed = raw.trim();
      if (!trimmed || trimmed.includes("|")) return "";
      return trimmed;
    };

    const resolvedName =
      sanitizeName(globalUser?.name) ||
      sanitizeName(user?.givenName as string | undefined) ||
      sanitizeName(user?.nickname) ||
      sanitizeName(typeof user?.name === "string" ? user.name : "") ||
      "";

    setUserName((prev) => {
      if (prev === resolvedName) return prev;
      return resolvedName;
    });
  }, [globalUser, user]);

  // Fetch connected users (friends/group members) to populate the player selection list.
  const { connectedUsers } = useConnectedUsers(user?.sub);

  // Effect to process connected users into a flat list of names and a name-to-ID map.
  useEffect(() => {
    if (connectedUsers.length === 0) return;

    const processPlayers = () => {
      let nameFromProfiles = "";
      const uniqueNames = [
        ...new Set(
          connectedUsers
            .map((player) => player.Name?.trim() ?? "")
            .filter((name): name is string => name.length > 0)
        ),
      ];

      // Create name-to-id mapping for later use in saving the match.
      const nameToIdMap: { [name: string]: string } = {};
      connectedUsers.forEach(player => {
        const trimmedName = player.Name?.trim();
        if (trimmedName && trimmedName.length > 0) {
          nameToIdMap[trimmedName] = player.id;
          // If we find the current user in the connected list, prefer that name.
          if (!nameFromProfiles && user?.sub && player.id === user.sub) {
            nameFromProfiles = trimmedName;
          }
        }
      });

      setPlayers(uniqueNames);
      setPlayerNameToId(nameToIdMap);

      // Update userName if a better match is found in the profiles.
      if (nameFromProfiles) {
        setUserName((prev) => {
          const sanitizedPrev = prev?.trim() ?? "";
          if (sanitizedPrev && !sanitizedPrev.includes("|")) {
            return sanitizedPrev;
          }

          return nameFromProfiles;
        });
      }
    };

    processPlayers();
  }, [connectedUsers, user?.sub]);

  useEffect(() => {
    if (showDatePicker || showTimePicker) {
      setDraftDate(date);
    }
  }, [showDatePicker, showTimePicker, date]);

  // Utility controls for the score adjustment buttons beneath the inputs.
  // --- Score Helpers ---

  // Resets both scores to 0.
  const resetGame = () => {
    setYourScore("0");
    setOpponentScore("0");
  };

  // Increments the score for the specified team, capped at 99.
  const incrementScore = (team: "your" | "opponent") => {

    if (team === "your") {
      if (parseInt(yourScore) < 99) {
        setYourScore(prev => ((isNaN(parseInt(prev)) ? 0 : parseInt(prev)) + 1).toString());
      }
    } else {
      if (parseInt(opponentScore) < 99) {
        setOpponentScore(prev => ((isNaN(parseInt(prev)) ? 0 : parseInt(prev)) + 1).toString());
      }
    }

  };

  // Decrements the score for the specified team, floored at 0.
  const decrementScore = (team: "your" | "opponent") => {
    if (team === "your") {
      setYourScore(prev => Math.max(0, (isNaN(parseInt(prev)) ? 0 : parseInt(prev)) - 1).toString());
    } else {
      setOpponentScore(prev => Math.max(0, (isNaN(parseInt(prev)) ? 0 : parseInt(prev)) - 1).toString());
    }
  };

  // Draft date/time updates mirror the native picker selections before the user hits Done.
  // --- Date/Time Helpers ---

  // Handler for date picker change (Android/iOS specific behavior handled by library).
  const onDraftDateChange = (_event: any, selectedDate?: Date) => {
    // Note: Implementation for immediate state update can be added here if needed.
    // Currently, we rely on the 'Done' button to confirm.
    if (selectedDate) {
      setDraftDate(selectedDate);
    }
  };

  // Handler for time picker change. Updates the time portion of the draft date.
  const onDraftTimeChange = (_event: any, selectedTime?: Date) => {
    if (selectedTime) {
      const updatedDate = new Date(draftDate);
      updatedDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      setDraftDate(updatedDate);
    }
  };

  // Confirms the selected date from the picker.
  const confirmDateSelection = () => {
    setDate(draftDate);
    setShowDatePicker(false);
  };

  // Confirms the selected time from the picker.
  const confirmTimeSelection = () => {
    setDate(draftDate);
    setShowTimePicker(false);
  };

  // Final save handler – validates the entire wizard and persists the match to Firestore.
  /**
   * Final save handler.
   * Validates the entire wizard state and persists the match data to Firestore.
   * Redirects to the viewScore page upon success.
   */
  const handleSaveMatch = async () => {

    // Prevent saving with duplicate player selections
    const selectedPlayers = [userName, yourPlayer2, opponentPlayer1, opponentPlayer2]
      .map((p) => (p ? p.trim() : ""))
      .filter((p) => p !== "");
    const hasDuplicatePlayers = new Set(selectedPlayers).size !== selectedPlayers.length;
    if (hasDuplicatePlayers) {
      Alert.alert(
        "Duplicate selection",
        "A player cannot be selected more than once.",
        [{ text: "OK" }]
      );
      return;
    }

    const sanitizedOpponent1 = opponentPlayer1?.trim() ?? "";
    const sanitizedOpponent2 = opponentPlayer2?.trim() ?? "";
    const sanitizedYourPlayer2 = yourPlayer2?.trim() ?? "";
    const parsedYourScore = parseInt(yourScore, 10);
    const parsedOpponentScore = parseInt(opponentScore, 10);
    const hasValidScore =
      (!Number.isNaN(parsedYourScore) && parsedYourScore > 0) ||
      (!Number.isNaN(parsedOpponentScore) && parsedOpponentScore > 0);

    // Ensure all required fields are present
    if (
      sanitizedOpponent1 &&
      date !== null &&
      hasValidScore &&
      ((matchType === "doubles" && sanitizedOpponent2 && sanitizedYourPlayer2) || matchType === "singles")
    ) {

      // Get player IDs, fallback to names if ID not found
      const team1Player1Id = playerNameToId[userName] || userID;
      const team1Player2Id = matchType === 'doubles' ? (playerNameToId[yourPlayer2]) : '';
      const team2Player1Id = playerNameToId[opponentPlayer1];
      const team2Player2Id = matchType === 'doubles' ? (playerNameToId[opponentPlayer2]) : '';

      // Construct match data object
      const matchData: newMatchHistory = {
        team1: [team1Player1Id, team1Player2Id, parseInt(yourScore)],
        team2: [team2Player1Id, team2Player2Id, parseInt(opponentScore)],
        date: date,
        id: ""
      };

      // Save to Firestore
      await createMatchHistory(matchData);
      router.replace('/matches/viewScore')
    } else {
      Alert.alert(
        "Missing Information",
        "Please fill all the required information.",
        [{ text: "OK" }]
      )
    }
  };

  const handlePrimaryAction = () => {
    if (currentStep === totalSteps - 1) {
      handleSaveMatch();
      return;
    }

    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  };

  return (
    <SafeAreaWrapper>
      <View flex={1} bg="$background">
        {/* Header */}
        <XStack
          pr="$4"
          pl="$4"
          pt="$3"
          pb="$3"
          bg="$background"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <Button
            variant="outlined"
            size="$3"
            onPress={() => router.back()}
            mr="$3"
          >
            <Ionicons name="arrow-back" size={24} color="$color1" />
          </Button>
          <H4 flex={1} verticalAlign="center">Add Match Scores</H4>
        </XStack>

        <ScrollView flex={1} p="$4" showsVerticalScrollIndicator={false}>
          <YStack pb="$12" space="$4">
            <Card padding="$4" backgroundColor="$background" borderWidth={1} borderColor="$borderColor">
              <YStack space="$1">
                <Paragraph fontSize="$2" color="$color10">
                  Step {currentStep + 1} of {totalSteps}
                </Paragraph>
                <H5 color="$color9">{stepTitles[currentStep]}</H5>
                <Paragraph color="$color10">
                  {stepDescriptions[currentStep]}
                </Paragraph>
              </YStack>
            </Card>

            {currentStep === 1 && (
              <Card
                padding="$5"
                backgroundColor="$background"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
              >
                <YStack space="$5" verticalAlign="stretch">
                  <YStack verticalAlign="center" space="$2">
                    <H5 color="$color9">Game Score</H5>
                    <Paragraph color="$color10" style={{ textAlign: "center" }}>
                      Enter the final numbers for each team.
                    </Paragraph>
                  </YStack>

                  <Card
                    padding="$4"
                    backgroundColor="$color3"
                    borderRadius="$4"
                    borderColor="$borderColor"
                  >
                    <YStack space="$4">
                      <XStack
                        verticalAlign="center"
                        justify="center"
                        space="$4"
                        flexWrap="wrap"
                      >
                        <Card
                          padding="$2"
                          backgroundColor="$background"
                          borderRadius="$4"
                          minWidth={88}
                          alignItems="center"
                        >
                          <Input
                            verticalAlign="middle"
                            p="$2"
                            bg="transparent"
                            borderColor="transparent"
                            inputMode="numeric"
                            keyboardType="numeric"
                            maxLength={2}
                            value={yourScore.toString()}
                            style={{ fontSize: 20, fontWeight: '700' }}
                            onFocus={() => {
                              setIsYourScoreFocused(true);
                              if (yourScore === "0") setYourScore("");
                            }}
                            onBlur={() => {
                              setIsYourScoreFocused(false);
                              if (yourScore === "") setYourScore("0");
                            }}
                            onChangeText={(text: any) => {
                              const onlyDigits = text.replace(/[^0-9]/g, "");
                              if (onlyDigits === "") {
                                if (isYourScoreFocused) {
                                  setYourScore("");
                                } else {
                                  setYourScore("0");
                                }
                                return;
                              }
                              const parsed = parseInt(onlyDigits, 10);
                              setYourScore(isNaN(parsed) ? "0" : parsed.toString());
                            }}
                          />
                        </Card>

                        <Card
                          padding="$2"
                          backgroundColor="$background"
                          borderRadius="$3"
                          borderColor="$borderColor"
                          minWidth={64}
                          height={64}
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Text fontWeight="700" fontSize="$4" color="$color9">
                            VS
                          </Text>
                        </Card>

                        <Card
                          padding="$2"
                          backgroundColor="$background"
                          borderRadius="$4"
                          minWidth={88}
                          alignItems="center"
                        >
                          <Input
                            verticalAlign="middle"
                            p="$2"
                            bg="transparent"
                            borderColor="transparent"
                            inputMode="numeric"
                            keyboardType="numeric"
                            maxLength={2}
                            value={opponentScore.toString()}
                            style={{ fontSize: 20, fontWeight: '700' }}
                            onFocus={() => {
                              setIsOpponentScoreFocused(true);
                              if (opponentScore === "0") setOpponentScore("");
                            }}
                            onBlur={() => {
                              setIsOpponentScoreFocused(false);
                              if (opponentScore === "") setOpponentScore("0");
                            }}
                            onChangeText={(text: any) => {
                              const onlyDigits = text.replace(/[^0-9]/g, "");
                              if (onlyDigits === "") {
                                if (isOpponentScoreFocused) {
                                  setOpponentScore("");
                                } else {
                                  setOpponentScore("0");
                                }
                                return;
                              }
                              const parsed = parseInt(onlyDigits, 10);
                              setOpponentScore(isNaN(parsed) ? "0" : parsed.toString());
                            }}
                          />
                        </Card>
                      </XStack>

                      <XStack
                        verticalAlign="center"
                        justify="space-between"
                        space="$6"
                        flexWrap="wrap"
                      >
                        <XStack verticalAlign="center" space="$3">
                          <Circle
                            size="$4"
                            bg="$color9"
                            onPress={() => decrementScore("your")}
                          >
                            <Ionicons name="remove" size={18} color="white" />
                          </Circle>
                          <Circle
                            size="$4"
                            bg="$color9"
                            onPress={() => incrementScore("your")}
                          >
                            <Ionicons name="add" size={18} color="white" />
                          </Circle>
                        </XStack>

                        <XStack verticalAlign="center" space="$3">
                          <Circle
                            size="$4"
                            bg="$color9"
                            onPress={() => decrementScore("opponent")}
                          >
                            <Ionicons name="remove" size={18} color="white" />
                          </Circle>
                          <Circle
                            size="$4"
                            bg="$color9"
                            onPress={() => incrementScore("opponent")}
                          >
                            <Ionicons name="add" size={18} color="white" />
                          </Circle>
                        </XStack>
                      </XStack>

                      <XStack justify="space-between" flexWrap="wrap">
                        <Text fontSize="$3" fontWeight="600">
                          {yourTeamLabel}
                        </Text>
                        <Text fontSize="$3" fontWeight="600">
                          {opponentTeamLabel}
                        </Text>
                      </XStack>
                    </YStack>
                  </Card>

                  <Paragraph color="$color10" style={{ textAlign: "center" }}>
                    Use the plus and minus icons or tap the score to type it in.
                  </Paragraph>
                </YStack>
              </Card>
            )}

            {currentStep === 2 && (
              <Card padding="$5" backgroundColor="$background" borderWidth={1} borderColor="$borderColor">
                <YStack space="$4">
                  <H5 color="$color9">Match Setup</H5>

                  {/* Date & time selectors open modal pickers when tapped */}
                  <YStack space="$2">
                    <Text fontSize="$3" fontWeight="500">
                      Date
                    </Text>
                    <Button
                      bg="$color3"
                      borderColor="$borderColor"
                      onPress={() => {
                        setShowTimePicker(false);
                        setDraftDate(date);
                        setShowDatePicker(true);
                      }}
                    >
                      <Text>{date.toDateString()}</Text>
                    </Button>

                    <Text fontSize="$3" fontWeight="500">
                      Time
                    </Text>
                    <Button
                      bg="$color3"
                      borderColor="$borderColor"
                      onPress={() => {
                        setShowDatePicker(false);
                        setDraftDate(date);
                        setShowTimePicker(true);
                      }}
                    >
                      <Text>
                        {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </Button>
                  </YStack>

                  {/* Optional tournament metadata */}
                  <YStack space="$2">
                    <Text fontSize="$3" fontWeight="500">
                      Tournament/Event (Optional)
                    </Text>
                    <Input
                      value={tournament}
                      onChangeText={(text: any) => setTournament(text)}
                      placeholder="Enter tournament name"
                    />
                  </YStack>
                </YStack>
              </Card>
            )}

            {currentStep === 0 && (
              <Card padding="$5" backgroundColor="$background" borderWidth={1} borderColor="$borderColor">
                <YStack space="$4">
                  <H5 color="$color9">Select Players</H5>

                  {/* Toggle between singles and doubles presets */}
                  <YStack space="$2">
                    <Text fontSize="$3" fontWeight="500">
                      Match Type
                    </Text>
                    <XStack space="$2">
                      <Button
                        flex={1}
                        bg={matchType === "singles" ? "$color9" : "$color3"}
                        onPress={() => {
                          setMatchType("singles");
                          setYourPlayer2("");
                          setOpponentPlayer2("");
                        }}
                        color={matchType === "singles" ? "$color1" : "$color9"}
                      >
                        Singles
                      </Button>
                      <Button
                        flex={1}
                        bg={matchType === "doubles" ? "$color9" : "$color3"}
                        onPress={() => setMatchType("doubles")}
                        color={matchType === "doubles" ? "$color1" : "$color9"}
                      >
                        Doubles
                      </Button>
                    </XStack>
                  </YStack>

                  {/* User team selectors */}
                  <YStack space="$3">
                    <Text fontSize="$3" fontWeight="500">
                      {matchType === "singles" ? "You" : "Your Team"}
                    </Text>
                    <Select value={userName}>
                      <Select.Trigger
                        backgroundColor="$color4"
                        borderColor="$borderColor"
                        width="100%"
                      >
                        <Select.Value>{userName || "Select Player 1"}</Select.Value>
                      </Select.Trigger>
                    </Select>

                    {matchType === "doubles" && (
                      <PlayerPicker
                        value={yourPlayer2}
                        onValueChange={(value) => {
                          setYourPlayer2(value);
                          if (value === opponentPlayer1) setOpponentPlayer1("");
                          if (value === opponentPlayer2) setOpponentPlayer2("");
                        }}
                        items={availableYourPlayer2}
                        placeholder="Select Player 2"
                        label="Select Player 2"
                      />
                    )}
                  </YStack>

                  {/* Opponent team selectors */}
                  <YStack space="$3">
                    <Text fontSize="$3" fontWeight="500">
                      {matchType === "singles" ? "Opponent" : "Opponent Team"}
                    </Text>
                    <PlayerPicker
                      value={opponentPlayer1}
                      onValueChange={(value) => {
                        setOpponentPlayer1(value);
                        if (value === yourPlayer2) setYourPlayer2("");
                        if (value === opponentPlayer2) setOpponentPlayer2("");
                      }}
                      items={availableOpponentPlayer1}
                      placeholder="Select Player 1"
                      label="Select Player 1"
                    />

                    {matchType === "doubles" && (
                      <PlayerPicker
                        value={opponentPlayer2}
                        onValueChange={(value) => {
                          setOpponentPlayer2(value);
                          if (value === yourPlayer2) setYourPlayer2("");
                          if (value === opponentPlayer1) setOpponentPlayer1("");
                        }}
                        items={availableOpponentPlayer2}
                        placeholder="Select Player 2"
                        label="Select Player 2"
                      />
                    )}
                  </YStack>

                  {/* Placeholder quick add – reserved for future enhancements */}
                  <Button
                    bg="$color9"
                    onPress={() => {
                      // Placeholder for future quick add functionality
                    }}
                    mt="$1"
                    color="$color1"
                  >
                    Quick Add Player
                  </Button>
                </YStack>
              </Card>
            )}
          </YStack>
        </ScrollView>

        {/* Date picker modal */}
        <Dialog
          modal
          open={showDatePicker}
          onOpenChange={(open) => {
            setShowDatePicker(open);
            if (!open) {
              setDraftDate(date);
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay opacity={0.4} bg="black" />
            <Dialog.Content bordered elevate key="date-content">
              <Card
                p="$4"
                backgroundColor="$background"
                borderRadius="$4"
                style={{ width: 320, maxWidth: "90%" }}
                key="date-card"
              >
                <Dialog.Title>Select Match Date</Dialog.Title>
                <Paragraph color="$color10" mt="$2" mb="$3">
                  Choose the date this match was played.
                </Paragraph>
                <YStack space="$3" style={{ alignItems: "center" }} key="date-stack">
                  <DateTimePicker
                    value={draftDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "spinner"}
                    onChange={onDraftDateChange}
                    textColor="black"
                    maximumDate={new Date()}
                    key="date-picker"
                    style={{
                      alignSelf: "center",
                      height: Platform.OS === "ios" ? 180 : 140
                    }}
                  />
                  <XStack space="$3" key="date-buttons">
                    <Dialog.Close key="date-cancel" asChild>
                      <Button
                        key="date-cancel-button"
                        variant="outlined"
                        onPress={() => {
                          setDraftDate(date);
                        }}
                      >
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Dialog.Close key="date-done" asChild>
                      <Button
                        key="date-done-button"
                        bg="$color9"
                        color="$color1"
                        onPress={confirmDateSelection}
                      >
                        Done
                      </Button>
                    </Dialog.Close>
                  </XStack>
                </YStack>
              </Card>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>

        {/* Time picker modal */}
        <Dialog
          modal
          open={showTimePicker}
          onOpenChange={(open) => {
            setShowTimePicker(open);
            if (!open) {
              setDraftDate(date);
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay opacity={0.4} bg="black" />
            <Dialog.Content bordered elevate key="time-content">
              <Card
                p="$4"
                backgroundColor="$background"
                borderRadius="$4"
                key="time-card"
                style={{ width: 320, maxWidth: "90%" }}
              >
                <Dialog.Title>Select Match Time</Dialog.Title>
                <Paragraph color="$color10" mt="$2" mb="$3">
                  Choose the start time for this match.
                </Paragraph>
                <YStack space="$3" style={{ alignItems: "center" }} key="time-stack">
                  <DateTimePicker
                    value={draftDate}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "spinner"}
                    onChange={onDraftTimeChange}
                    textColor="black"
                    key="time-picker"
                    style={{
                      alignSelf: "center",
                      height: Platform.OS === "ios" ? 180 : 140
                    }}
                  />
                  <XStack space="$3" key="time-buttons">
                    <Dialog.Close key="time-cancel" asChild>
                      <Button
                        key="time-cancel-button"
                        variant="outlined"
                        onPress={() => {
                          setDraftDate(date);
                        }}
                      >
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Dialog.Close key="time-done" asChild>
                      <Button
                        key="time-done-button"
                        bg="$color9"
                        color="$color1"
                        onPress={confirmTimeSelection}
                      >
                        Done
                      </Button>
                    </Dialog.Close>
                  </XStack>
                </YStack>
              </Card>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>

        {/* Footer controls: Back button, reset score shortcut, and Next/Save primary action */}
        <XStack
          px="$4"
          py="$3"
          verticalAlign="center"
          justify="space-between"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          bg="$background"
        >
          {currentStep > 0 ? (
            <Button variant="outlined" size="$4" onPress={goToPreviousStep}>
              Back
            </Button>
          ) : (
            <View width={88} />
          )}

          <XStack space="$3" verticalAlign="center">
            {currentStep === 1 && (
              <Button
                size="$3"
                bg="$color3"
                borderColor="$borderColor"
                style={{ borderRadius: 8 }}
                width={44}
                height={44}
                p="$2"
                onPress={resetGame}
              >
                <Ionicons name="refresh" size={18} color="$color9" />
              </Button>
            )}
            <Button
              size="$4"
              bg="$color9"
              color="$color1"
              onPress={handlePrimaryAction}
            >
              {currentStep === totalSteps - 1 ? "Save match scores" : "Next"}
            </Button>
          </XStack>
        </XStack>
      </View >
    </SafeAreaWrapper >
  );
}




