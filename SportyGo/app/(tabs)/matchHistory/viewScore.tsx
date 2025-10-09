import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  Button,
  XStack,
  YStack,
  Card,
  H4,
  H5,
  Paragraph,
  Avatar,
  
  Separator,
  Spinner
} from "tamagui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlatList, ViewToken } from 'react-native';
import { getUserProfile, getUserMatchHistory, getUserProfilesByIds } from '../../../firebase/services_firestore2';
import { newMatchHistory } from "@/firebase/types_index";
import { UserContext } from '../../components/userContext';
import { SafeAreaWrapper } from '../../components/SafeAreaWrapper';

// Light status colors for win/tie/lose
const STATUS_COLORS = {
  winBg: '#D1FAE5',   // light green
  tieBg: '#FEF9C3',   // light yellow
  loseBg: '#FEE2E2',  // light red
} as const;

// Cache TTL: 10 minutes
const CACHE_TTL_MS = 10 * 60 * 1000;

export default function ViewScore() {
  const router = useRouter();
  const { user } = useAuth0();
  const {globalUser} = useContext(UserContext)
  const [matchHistory, setMatchHistory] = useState<newMatchHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const loadedNamesFromCacheRef = useRef(false);
  const visibleIdsRef = useRef<Set<string>>(new Set());

  const userName: string = globalUser?.name ?? "";
  const userID: string = user?.sub ?? "";

  const isFresh = (ts?: number) => ts && (Date.now() - ts) < CACHE_TTL_MS;

  const mhStorageKey = userID ? `mh:${userID}` : undefined;

  const refreshFromNetwork = useCallback(async (showSpinner: boolean) => {
    if (!userID) return;
    if (showSpinner) setLoading(true);
    try {
      const userMatchHistory = await getUserMatchHistory(userID);
      setMatchHistory(userMatchHistory ?? []);
      if (mhStorageKey) {
        await AsyncStorage.setItem(mhStorageKey, JSON.stringify({ ts: Date.now(), data: userMatchHistory ?? [] }));
      }
    } catch {
      // keep whatever we had
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [userID, mhStorageKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFromNetwork(false);
    } finally {
      setRefreshing(false);
    }
  }, [refreshFromNetwork]);

  // Load cached match history immediately, then refresh in background
  useEffect(() => {
    const loadAndRefresh = async () => {
      if (!userID || !mhStorageKey) return;

      try {
        const cached = await AsyncStorage.getItem(mhStorageKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; data: newMatchHistory[] };
          setMatchHistory(parsed.data ?? []);
          setLoading(false);
          if (isFresh(parsed.ts)) {
            // Fresh enough, also kick off a silent refresh
            refreshFromNetwork(false);
            return;
          }
        }
      } catch {}

      // No cache or stale cache: fetch and show
      await refreshFromNetwork(true);
    };

    loadAndRefresh();
  }, [userID, mhStorageKey, refreshFromNetwork]);

  // Preload cached player names once, then ensure we fetch any missing names for visible items first
  useEffect(() => {
    const loadNamesCache = async () => {
      if (loadedNamesFromCacheRef.current) return;
      try {
        const cached = await AsyncStorage.getItem('playerNames');
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; data: Record<string, string> };
          setPlayerNames(parsed.data ?? {});
        }
      } catch {}
      loadedNamesFromCacheRef.current = true;
    };
    loadNamesCache();
  }, []);

  // Lazy-load names for visible items first
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    const ids = new Set<string>(visibleIdsRef.current);
    for (const v of viewableItems) {
      const item = v.item as newMatchHistory;
      if (item?.team1?.[0]) ids.add(item.team1[0]);
      if (item?.team1?.[1]) ids.add(item.team1[1]);
      if (item?.team2?.[0]) ids.add(item.team2[0]);
      if (item?.team2?.[1]) ids.add(item.team2[1]);
    }
    visibleIdsRef.current = ids;
  }).current;

  useEffect(() => {
    const populateVisibleNames = async () => {
      const idsToFetch = Array.from(visibleIdsRef.current).filter((id) => !(id in playerNames));
      if (idsToFetch.length === 0) return;
      try {
        const map = await getUserProfilesByIds(idsToFetch);
        const newMap: Record<string, string> = {};
        for (const id of idsToFetch) {
          const profile = map[id];
          newMap[id] = profile?.Name ?? id;
        }
        if (Object.keys(newMap).length > 0) {
          setPlayerNames((prev) => {
            const merged = { ...prev, ...newMap };
            AsyncStorage.setItem('playerNames', JSON.stringify({ ts: Date.now(), data: merged })).catch(() => {});
            return merged;
          });
        }
      } catch {}
    };
    populateVisibleNames();
  });

  const getCurrentUserTeam = (match: newMatchHistory) => {
    
    if (match.team1[0] === userID || match.team1[1] === userID) {
      return "team1";
    } else if (match.team2[0] === userID || match.team2[1] === userID) {
      return "team2";
    }
    return null;
  };

  const getTeamResult = (match: newMatchHistory) => {
    if (!match?.team1 || !match?.team2) return "tie";
    if (typeof match.team1[2] !== "number" || typeof match.team2[2] !== "number") return "tie";
  
    if (match.team1[2] > match.team2[2]) {
      return "team1";
    } else if (match.team2[2] > match.team1[2]) {
      return "team2";
    }
    return "tie";
  };

  const getCardBackgroundColor = (match: newMatchHistory) => {
    const userTeam = getCurrentUserTeam(match);
    const winningTeam = getTeamResult(match);
    if (!userTeam) return STATUS_COLORS.winBg;
    
    if (userTeam === winningTeam) {
      return STATUS_COLORS.winBg;
    } else if (winningTeam === "tie") {
      return STATUS_COLORS.tieBg;
    } else {
      return STATUS_COLORS.loseBg;
    }
  };

  const formatDate = (date: Date | string | any) => {
    // Convert to Date object if it's not already
    let dateObj: Date;
    
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date && date.toDate) {
      // Handle Firestore Timestamp
      dateObj = date.toDate();
    } else {
      // Fallback for any other format
      dateObj = new Date(date);
    }
    
    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    
    // Check if the date has time information (not just midnight)
    const hasTime = dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0;
    
    if (hasTime) {
      // Show both date and time
      return dateObj.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      // Show only date
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const getPlayerDisplay = (player1: string, player2?: string) => {
    const player1Name = playerNames[player1] ?? player1;
    if (player2) {
      const player2Name = playerNames[player2] ?? player2;
      return `${player1Name} & ${player2Name}`;
    }
    return player1Name;
  };

  const renderItem = useCallback(({ item }: { item: newMatchHistory }) => {
    const match = item;
    const userTeam = getCurrentUserTeam(match);
    const winningTeam = getTeamResult(match);
    const isUserWinner = userTeam === winningTeam;
    const isTie = winningTeam === "tie";

    return (
      <Card
        padding="$4"
        backgroundColor={getCardBackgroundColor(match)}
        borderWidth={1}
        borderColor="$borderColor"
        elevation={2}
        onPress={() => (router as any).push({ pathname: '/matchHistory/viewIndividualScore', params: { matchId: match.id } })}
      >
        <YStack space="$3">
          <XStack justify="space-between" verticalAlign="center">
            <YStack>
              <Text fontSize="$2" color="$color">
                {formatDate(match.date)}
              </Text>
            </YStack>
          </XStack>

          <Separator />

          <YStack space="$3">
            <XStack justify="space-between" verticalAlign="center">
              <YStack flex={1}>
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {getPlayerDisplay(match.team1[0], match.team1[1])}
                </Text>
                <Text fontSize="$2" color="$color10">
                  Team 1
                </Text>
              </YStack>
              <XStack space="$2" verticalAlign="center">
                <Text fontSize="$6" fontWeight="bold" color="$color">
                  {match.team1[2]}
                </Text>
                {winningTeam === "team1" && (
                  <Ionicons name="trophy" size={20} color="#FFD700" />
                )}
              </XStack>
            </XStack>

            <XStack justify="center" verticalAlign="center">
              <Card
                padding="$2"
                bg="$color9"
                borderRadius="$2"
                minWidth={40}
                alignItems="center"
              >
                <Text fontWeight="bold" color="$color1" fontSize="$2">
                  VS
                </Text>
              </Card>
            </XStack>

            <XStack justify="space-between" verticalAlign="center">
              <YStack flex={1}>
                <Text fontSize="$3" fontWeight="600" color="$color">
                  {getPlayerDisplay(match.team2[0], match.team2[1])}
                </Text>
                <Text fontSize="$2" color="$color10">
                  Team 2
                </Text>
              </YStack>
              <XStack space="$2" verticalAlign="center">
                <Text fontSize="$6" fontWeight="bold" color="$color">
                  {match.team2[2]}
                </Text>
                {winningTeam === "team2" && (
                  <Ionicons name="trophy" size={20} color="#FFD700" />
                )}
              </XStack>
            </XStack>
          </YStack>

          {userTeam && (
            <Card
              padding="$2"
              backgroundColor={isUserWinner ? STATUS_COLORS.winBg : isTie ? STATUS_COLORS.tieBg : STATUS_COLORS.loseBg}
              borderRadius="$2"
              alignItems="center"
            >
              <Text
                fontSize="$2"
                fontWeight="600"
                color="$color"
              >
                {isUserWinner ? "🏆 You Won!" : isTie ? "🤝 It's a Tie!" : "😔 You Lost"}
              </Text>
            </Card>
          )}
        </YStack>
      </Card>
    );
  }, [playerNames]);

  const keyExtractor = useCallback((item: newMatchHistory, index: number) => {
    return (item as any).id || `${item.team1?.[0] ?? 't1a'}-${item.team2?.[0] ?? 't2a'}-${(item as any)?.date?.toString?.() ?? index}`;
  }, []);

  if (loading || !userID) {
      return (
      <YStack flex={1} bg="$background" justify="center" verticalAlign="center" space="$4">
          <Spinner size="large" color="$color9" />
          <Text color="gray">Loading match history...</Text>
    </YStack>
  );
}

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
          
          <H4 style={{textAlign: "center", flex: 1}}>Match History</H4>
          <Button
            variant="outlined"
            size="$3"
            onPress={() => router.push('/matchHistory/addScore')}
            icon={<Ionicons name="add" size={20} />}
          />
        </XStack>

        <FlatList
          data={matchHistory}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 25 }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={() => (
            <Card padding="$6" backgroundColor="$color2" borderWidth={1} borderColor="$borderColor">
              <YStack space="$3" verticalAlign="center">
                <Ionicons name="trophy-outline" size={48} color="#666" />
                <H5 color="$color">No matches yet</H5>
                <Paragraph color="$color10" style={{textAlign: "center"}}>
                  Start playing matches to see your history here
                </Paragraph>
                <Button
                  bg="$color9"
                  color="$color1"
                  onPress={() => router.push('/matchHistory/addScore')}
                  mt="$2"
                >
                  Add First Match
                </Button>
              </YStack>
            </Card>
          )}
        />
      </View>
    </SafeAreaWrapper>
  );
}