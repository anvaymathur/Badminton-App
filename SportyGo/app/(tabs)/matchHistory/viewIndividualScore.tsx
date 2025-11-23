// Detailed match view screen.
// Shows a single match's metadata, winner banner, team avatars, and score breakdown
// after navigating from history, enriching entries with player profile data.
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  XStack,
  YStack,
  Card,
  H4,
  Paragraph,
  Separator,
  Spinner,
  Avatar,
} from "tamagui";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getMatchHistoryById,
  getUserProfile,
} from "../../../firebase/services_firestore2";
import type { newMatchHistory } from "@/firebase/types_index";
import { SafeAreaWrapper } from "../../components/SafeAreaWrapper";

// Lightweight profile model used to render names + avatars alongside scores.
type PlayerProfile = {
  id: string;
  name: string;
  photoUrl: string | null;
};

const sanitizePlayerId = (value: any): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Generates initials for avatar fallbacks (first + last letter where available).
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  const hasTime = dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0;
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

const WINNER_ACCENT_COLOR = "#047857";

type TeamCardProps = {
  nameString: string;
  profiles: PlayerProfile[];
  fallbackIds: (string | null)[];
  score: number;
  winner: boolean;
  tied?: boolean;
};

function getPlayerDisplayName(
  profile: PlayerProfile | undefined,
  fallbackName?: string,
  fallbackId?: string | null
) {
  if (profile?.name?.trim()) return profile.name.trim();
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();
  if (fallbackId && fallbackId.trim()) return fallbackId.trim();
  return "Player";
}

function TeamCard({ nameString, profiles, fallbackIds, score, winner, tied = false }: TeamCardProps) {
  const nameParts = nameString
    ? nameString.split("&").map((part) => part.trim()).filter(Boolean)
    : [];
  const cleanedFallbackIds = fallbackIds?.map((value) => value ?? undefined) ?? [];
  const slotCount = Math.min(
    2,
    Math.max(
      profiles.filter((player) => !!player).length,
      nameParts.length,
      cleanedFallbackIds.filter((value) => !!value).length,
      1
    )
  );
  const slots = Array.from({ length: slotCount }, (_, index) => index);
  const statusLabel = tied ? "Tied" : winner ? "Winner" : "Runner-up";

  return (
    <Card
      flex={1}
      minWidth={180}
      p="$4"
      bg="$color2"
      borderRadius="$4"
      borderWidth={winner ? 2 : 1}
      borderColor={winner ? WINNER_ACCENT_COLOR : "$borderColor"}
    >
      <YStack space="$4" items="center">
        <XStack space="$4" items="center" justify="center">
          {slots.map((index) => {
            const profile = profiles[index];
            const fallbackName = nameParts[index];
            const fallbackId = cleanedFallbackIds[index];
            const displayName = getPlayerDisplayName(profile, fallbackName, fallbackId);

            return (
              <YStack
                key={`player-${index}-${fallbackId ?? displayName}`}
                space="$3"
                items="center"
              >
                <Avatar size="$4" circular borderWidth={1} borderColor="$borderColor">
                  {profile?.photoUrl ? (
                    <Avatar.Image src={profile.photoUrl} accessibilityLabel={displayName} />
                  ) : null}
                  <Avatar.Fallback bg="$color9" items="center" justify="center">
                    <Text color="$color1" fontSize={14}>
                      {getInitials(displayName)}
                    </Text>
                  </Avatar.Fallback>
                </Avatar>
                <Text
                  color="$color10"
                  fontSize="$2"
                  numberOfLines={2}
                  style={{ textAlign: "center" }}
                >
                  {displayName}
                </Text>
              </YStack>
            );
          })}
        </XStack>
        <YStack space="$3" items="center" width="100%">
          <Text
            fontSize="$5"
            fontWeight="700"
            color="$color"
            numberOfLines={2}
            style={{ textAlign: "center" }}
          >
            {nameString || "Team"}
          </Text>
          <Text fontSize="$2" fontWeight="600" color="$color10" style={{ textAlign: "center" }}>
            {statusLabel}
          </Text>
        </YStack>
        <Text fontSize="$6" fontWeight="900" color="$color" style={{ textAlign: "center" }}>
          {score}
        </Text>
      </YStack>
    </Card>
  );
}

export default function ViewIndividualScore() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<newMatchHistory | undefined>(undefined);
  const [team1Names, setTeam1Names] = useState<string>("");
  const [team2Names, setTeam2Names] = useState<string>("");
  const [team1Profiles, setTeam1Profiles] = useState<PlayerProfile[]>([]);
  const [team2Profiles, setTeam2Profiles] = useState<PlayerProfile[]>([]);

  const loadMatch = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!matchId) {
        if (!silent) {
          setLoading(false);
        }
        setMatch(undefined);
        setTeam1Profiles([]);
        setTeam2Profiles([]);
        setTeam1Names("");
        setTeam2Names("");
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const data = await getMatchHistoryById(matchId);
        setMatch(data);

        if (data) {
          const team1Ids = [sanitizePlayerId(data.team1[0]), sanitizePlayerId(data.team1[1])].filter(
            (id): id is string => !!id
          );
          const team2Ids = [sanitizePlayerId(data.team2[0]), sanitizePlayerId(data.team2[1])].filter(
            (id): id is string => !!id
          );

          const fetchProfiles = async (ids: string[]) =>
            Promise.all(
              ids.map(async (id) => {
                try {
                  const profile = await getUserProfile(id);
                  const name = profile?.Name?.trim() ? profile.Name.trim() : id;
                  const photoUrl = profile?.PhotoUrl ?? null;
                  return { id, name, photoUrl } as PlayerProfile;
                } catch {
                  return { id, name: id, photoUrl: null } as PlayerProfile;
                }
              })
            );

          const [team1Data, team2Data] = await Promise.all([
            fetchProfiles(team1Ids),
            fetchProfiles(team2Ids),
          ]);

          setTeam1Profiles(team1Data);
          setTeam2Profiles(team2Data);

          const fallbackNames = (profiles: PlayerProfile[], ids: string[]) => {
            if (profiles.length > 0) {
              return profiles.map((profile) => profile.name).join(" & ");
            }
            if (ids.length > 0) {
              return ids.join(" & ");
            }
            return "";
          };

          setTeam1Names(fallbackNames(team1Data, team1Ids));
          setTeam2Names(fallbackNames(team2Data, team2Ids));
        } else {
          setTeam1Profiles([]);
          setTeam2Profiles([]);
          setTeam1Names("");
          setTeam2Names("");
        }
      } catch {
        setMatch(undefined);
        setTeam1Profiles([]);
        setTeam2Profiles([]);
        setTeam1Names("");
        setTeam2Names("");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [matchId]
  );

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  const handleStartEdit = useCallback(() => {
    if (!matchId) return;
    router.push({
      pathname: "/(tabs)/matchHistory/editScore",
      params: { matchId },
    });
  }, [router, matchId]);

  // Loading placeholder while we fetch the match + profiles.
  if (loading) {
    return (
      <YStack
        flex={1}
        bg="$background"
        items="center"
        justify="center"
        py="$6"
      >
        <Card
          bg="$color2"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$borderColor"
          p="$4"
        >
          <YStack space="$3" items="center">
            <Spinner
              size="large"
              color="$color9"
              style={{ transform: [{ scale: 1.15 }] }}
            />
            <Text color="$color10" fontSize="$3" fontWeight="600">
              Fetching match details…
            </Text>
          </YStack>
        </Card>
      </YStack>
    );
  }

  // If the match was deleted or missing, show a friendly message with a back action.
  if (!match) {
    return (
      <YStack flex={1} bg="$background" justify="center" verticalAlign="center" space="$4" p="$4">
        <H4 color="$color">Match not found</H4>
        <Paragraph color="$color10">We couldn't load this match. Try again from your history.</Paragraph>
        <Button variant="outlined" onPress={() => router.push("/(tabs)/matchHistory/viewScore")} mt="$2" icon={<Ionicons name="arrow-back" size={18} />}>Go Back</Button>
      </YStack>
    );
  }

  const isTeam1Winner = match.team1[2] > match.team2[2];
  const isTie = match.team1[2] === match.team2[2];
  const isDoubles = Boolean((match.team1[1] && match.team1[1].trim()) || (match.team2[1] && match.team2[1].trim()));
  const team1Score = match.team1[2];
  const team2Score = match.team2[2];
  const scoreDiff = Math.abs(team1Score - team2Score);
  const outcomeType = isTie ? "tie" : isTeam1Winner ? "win" : "loss";
  const outcomeColor =
    outcomeType === "win" ? "#047857" : outcomeType === "loss" ? "#DC2626" : "#B45309";
  const team1Label = team1Names && team1Names.trim() ? team1Names : "Team 1";
  const team2Label = team2Names && team2Names.trim() ? team2Names : "Team 2";
  const outcomeText = isTie ? "Match tied" : `${isTeam1Winner ? team1Label : team2Label} won`;
  const outcomeSubtext = `Final score ${team1Score}-${team2Score}${
    isTie ? "" : ` - ${scoreDiff} point${scoreDiff === 1 ? "" : "s"} difference`
  }`;

  // Convenience aliases so the JSX below reads nicely.
  const team1FallbackIds = [
    sanitizePlayerId(match.team1[0]),
    sanitizePlayerId(match.team1[1]),
  ];
  const team2FallbackIds = [
    sanitizePlayerId(match.team2[0]),
    sanitizePlayerId(match.team2[1]),
  ];
  const advantageTeamLabel = isTie ? "" : isTeam1Winner ? team1Label : team2Label;
  const scoreHighlightText = isTie
    ? "Deadlocked contest."
    : `${scoreDiff} point${scoreDiff === 1 ? "" : "s"} swing in favour of ${advantageTeamLabel}`;

  return (
    <SafeAreaWrapper>
      <View flex={1} bg="$background">
        {/* Header */}
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
          <Button
            variant="outlined"
            size="$3"
            onPress={() => router.push("/(tabs)/matchHistory/viewScore")}
            mr="$3"
            icon={<Ionicons name="arrow-back" size={20} />}
          />
          <H4 flex={1}>Match Details</H4>
          <Button
            variant="outlined"
            size="$3"
            onPress={handleStartEdit}
            disabled={!match}
            icon={<Ionicons name="create-outline" size={20} />}
          >
            Edit
          </Button>
        </XStack>

        {/* Content */}
        <YStack flex={1} p="$4" space="$4">
          {/* Outcome banner */}
          <Card backgroundColor={outcomeColor} borderRadius="$4" p="$4">
            <YStack space="$3">
              <Text
                color="#F9FAFB"
                fontSize="$2"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing={1}
              >
                {isTie ? "Tie" : outcomeType === "win" ? "Win" : "Loss"}
              </Text>
              <Text color="#FFFFFF" fontSize="$7" fontWeight="900" numberOfLines={2}>
                {outcomeText}
              </Text>
              <Text color="#F9FAFB" fontSize="$3">
                {outcomeSubtext}
              </Text>
            </YStack>
          </Card>

          {/* Match meta */}
          <Card p="$4" bg="$color2" borderWidth={1} borderColor="$borderColor" borderRadius="$4">
            <YStack space="$3">
              <Text
                color="$color10"
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Match Date
              </Text>
              <Text color="$color" fontSize="$5" fontWeight="700">
                {formatDate(match.date)}
              </Text>
              <Text color="$color10" fontSize="$3">
                {isDoubles ? "Doubles match" : "Singles match"}
              </Text>
            </YStack>
          </Card>

          {/* Final score */}
          <Card p="$4" bg="$color2" borderWidth={1} borderColor="$borderColor" borderRadius="$4">
            <YStack space="$4" items="center">
              <Text
                color="$color10"
                fontSize="$2"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing={1}
              >
                Final Score
              </Text>
              <XStack space="$6" items="center">
                <Text fontSize="$7" fontWeight="900" color="$color">
                  {team1Score}
                </Text>
                <Text fontSize="$4" fontWeight="800" color="$color10">
                  -
                </Text>
                <Text fontSize="$7" fontWeight="900" color="$color">
                  {team2Score}
                </Text>
              </XStack>
              {!isTie ? (
                <Card px="$4" py="$3" bg="$color9" borderRadius="$3">
                  <XStack space="$3" items="center">
                    <Ionicons
                      name={isTeam1Winner ? "arrow-up" : "arrow-down"}
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text color="$color1" fontSize="$3" fontWeight="700">
                      {scoreHighlightText}
                    </Text>
                  </XStack>
                </Card>
              ) : (
                <Text color="$color10" fontSize="$3">
                  {scoreHighlightText}
                </Text>
              )}
            </YStack>
          </Card>

          {/* Team cards */}
          <XStack space="$4" flexWrap="wrap" items="stretch">
            <TeamCard
              nameString={team1Label}
              profiles={team1Profiles}
              fallbackIds={team1FallbackIds}
              score={team1Score}
              winner={!isTie && isTeam1Winner}
              tied={isTie}
            />
            <TeamCard
              nameString={team2Label}
              profiles={team2Profiles}
              fallbackIds={team2FallbackIds}
              score={team2Score}
              winner={!isTie && !isTeam1Winner}
              tied={isTie}
            />
          </XStack>
        </YStack>
      </View>
    </SafeAreaWrapper>
  );
}
