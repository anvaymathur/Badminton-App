import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { YStack, XStack, Text, Card, Button, H2, Paragraph, ScrollView, Spinner } from "tamagui";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserProfile, getUserMatchHistory, migrateMatchRefs, markTempClaimed } from "../../firebase/services_firestore2";
import { UserDoc } from "../../firebase/types_index";
import { SafeAreaWrapper } from "../components/SafeAreaWrapper";
import { Ionicons } from "@expo/vector-icons";

interface TempPreview {
  doc: UserDoc;
  matchCount: number;
  claimed: boolean; // user's opt-in toggle
}

export default function ClaimTempUsers() {
  const { user } = useAuth0();
  const params = useLocalSearchParams();
  const [previews, setPreviews] = useState<TempPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);

  // Parse the temp IDs from the route param
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const raw = typeof params.ids === "string" ? params.ids : "";
        const ids: string[] = raw ? JSON.parse(raw) : [];

        const results: TempPreview[] = [];
        for (const id of ids) {
          const doc = await getUserProfile(id);
          if (!doc || !doc.isTemp) continue; // skip if not found or not a temp
          const matches = await getUserMatchHistory(id);
          results.push({ doc, matchCount: matches.length, claimed: false });
        }
        setPreviews(results);
      } catch (e) {
        console.error("ClaimTempUsers: failed to load previews", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.ids]);

  const toggleClaim = (index: number) => {
    setPreviews(prev =>
      prev.map((p, i) => (i === index ? { ...p, claimed: !p.claimed } : p))
    );
  };

  const handleClaim = async () => {
    if (!user?.sub) return;
    const selected = previews.filter(p => p.claimed);
    if (selected.length === 0) {
      Alert.alert("Nothing selected", "Toggle at least one player to claim, or tap Skip.");
      return;
    }

    setMigrating(true);
    try {
      for (const item of selected) {
        // Step 1: migrate all matchHistory references (idempotent)
        await migrateMatchRefs(item.doc.id, user.sub);
        // Step 2: mark temp as claimed
        await markTempClaimed(item.doc.id, user.sub);
      }

      // Step 3: invalidate stale caches
      await AsyncStorage.removeItem("playerNames");

      router.replace("/dashboard");
    } catch (e) {
      console.error("ClaimTempUsers: migration failed", e);
      Alert.alert(
        "Migration error",
        "Something went wrong while linking the account. You can try again on next login.",
        [{ text: "OK" }]
      );
    } finally {
      setMigrating(false);
    }
  };

  const handleSkip = () => {
    router.replace("/dashboard");
  };

  // --- Render states ---

  if (loading) {
    return (
      <SafeAreaWrapper backgroundColor="$background">
        <YStack flex={1} p="$4" style={{ justifyContent: "center", alignItems: "center" }}>
          <Spinner color="$color9" />
          <Text color="$color10" mt="$3">Loading...</Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  // If no claimable temps (shouldn't normally happen), go straight to dashboard
  if (previews.length === 0) {
    router.replace("/dashboard");
    return null;
  }

  return (
    <SafeAreaWrapper backgroundColor="$background">
      <YStack flex={1} p="$4" space="$4">
        {/* Header */}
        <YStack space="$2" mt="$4">
          <H2 color="$color9">We found your players</H2>
          <Paragraph color="$color10">
            These temporary players match your email or phone number. Claim the ones that belong to you — their match history will transfer to your account.
          </Paragraph>
        </YStack>

        {/* Scrollable list of temp users */}
        <ScrollView flex={1} showsVerticalScrollIndicator={false}>
          <YStack space="$3">
            {previews.map((item, index) => (
              <Card
                key={item.doc.id}
                elevate
                bordered
                p="$4"
                borderWidth={1}
                borderColor={item.claimed ? "$color9" : "$borderColor"}
                bg={item.claimed ? "$color2" : "$color1"}
              >
                <XStack verticalAlign="center" justify="space-between">
                  <YStack flex={1} space="$1">
                    <Text color="$color" fontSize="$5" fontWeight="600">
                      {item.doc.Name}
                    </Text>
                    {item.doc.Email ? (
                      <XStack verticalAlign="center" space="$2">
                        <Ionicons name="mail-outline" size={14} color="#888" />
                        <Text color="$color10" fontSize="$3">{item.doc.Email}</Text>
                      </XStack>
                    ) : null}
                    {item.doc.Phone ? (
                      <XStack verticalAlign="center" space="$2">
                        <Ionicons name="call-outline" size={14} color="#888" />
                        <Text color="$color10" fontSize="$3">{item.doc.Phone}</Text>
                      </XStack>
                    ) : null}
                    <XStack verticalAlign="center" space="$2" mt="$1">
                      <Ionicons name="trophy-outline" size={14} color="#888" />
                      <Text color="$color10" fontSize="$3">
                        {item.matchCount} {item.matchCount === 1 ? "match" : "matches"} played
                      </Text>
                    </XStack>
                  </YStack>

                  {/* Claim toggle */}
                  <Button
                    size="$4"
                    bg={item.claimed ? "$color9" : "$color3"}
                    color={item.claimed ? "$color1" : "$color9"}
                    borderColor="$color9"
                    borderWidth={1}
                    onPress={() => toggleClaim(index)}
                    minWidth={80}
                  >
                    {item.claimed ? "Claimed" : "Claim"}
                  </Button>
                </XStack>
              </Card>
            ))}
          </YStack>
        </ScrollView>

        {/* Action buttons */}
        <YStack space="$3" pb="$4">
          <Button
            size="$5"
            bg="$color9"
            color="$color1"
            onPress={handleClaim}
            disabled={migrating || previews.every(p => !p.claimed)}
          >
            {migrating ? "Linking..." : "Claim Selected"}
          </Button>
          <Button
            size="$4"
            variant="outlined"
            onPress={handleSkip}
            disabled={migrating}
          >
            Skip for now
          </Button>
        </YStack>
      </YStack>
    </SafeAreaWrapper>
  );
}
