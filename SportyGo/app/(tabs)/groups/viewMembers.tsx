import React, { useEffect, useMemo, useState } from "react";
import { YStack, XStack, Text, H2, H4, Input, Button, Card, ScrollView, Avatar } from "tamagui";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { GroupDoc, UserDoc } from "../../../firebase/types_index";
import { getGroupById, getUsersByIds } from "../../../firebase/services_firestore2";
import { SafeAreaWrapper } from "@/components/SafeAreaWrapper";

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ViewMembers() {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupDoc | undefined>(undefined);
  const [members, setMembers] = useState<UserDoc[]>([]);
  const [query, setQuery] = useState("");
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  useEffect(() => {
    const load = async () => {
      const gid = (typeof groupId === 'string' && groupId);
      if (!gid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const group = await getGroupById(gid);
      setGroup(group);
      if (group && Array.isArray(group.MemberIds) && group.MemberIds.length > 0) {
        const profiles = await getUsersByIds(group.MemberIds);
        setMembers(profiles);
      } else {
        setMembers([]);
      }
      setLoading(false);
    };
    load();
  }, [groupId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.Name || "").toLowerCase().includes(q) ||
      (m.Email || "").toLowerCase().includes(q) ||
      (m.Phone || "").toLowerCase().includes(q)
    );
  }, [members, query]);

  return (
    <SafeAreaWrapper>
      <YStack flex={1} p="$4" bg="$background">
        <YStack mb={20}>
          <XStack justify="space-between" verticalAlign="center" mb={10}>
            <Button
              bg="$color2"
              borderColor="$color6"
              borderWidth="$1"
              onPress={() => router.replace('/groups/displayGroups')}
              px="$3"
              py="$2"
            >
              <XStack verticalAlign="center" space="$2">
                <Ionicons name="arrow-back" size={18} color="#888" />
                <Text color="$color">Back</Text>
              </XStack>
            </Button>
            <Button
              bg="$color2"
              borderColor="$color6"
              borderWidth="$1"
              onPress={() => {
                // TODO: Navigate to group settings
                console.log("Settings pressed for group:", group?.id);
              }}
              px="$3"
              py="$2"
            >
              <XStack verticalAlign="center" space="$2">
                <Ionicons name="settings-outline" size={18} color="#888" />
                <Text color="$color">Settings</Text>
              </XStack>
            </Button>
          </XStack>
          <Text 
            color="$color9" 
            fontWeight="bold" 
            fontSize="$10"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{ textAlign: 'center' }}
          >
            {group?.Name || "Group Members"}
          </Text>
        </YStack>

        <Input
          placeholder="Search members..."
          value={query}
          onChangeText={(text: any) => setQuery(text)}
          background="$color2"
          borderColor="$color6"
          px="$4"
          py="$3"
          color="$color"
          placeholderTextColor="$color10"
          style={{ fontSize: 16 }}
          mb={10}
        />

        <Text color="$color10" mb={10}>
          {loading ? "Loading members..." : `${filtered.length} member${filtered.length === 1 ? "" : "s"}`}
        </Text>

        <ScrollView flex={1} showsVerticalScrollIndicator>
          <YStack space="$3" pb="$4">
            {!loading && filtered.length === 0 ? (
              <Text color="$color10">No members found.</Text>
            ) : (
              filtered.map((u) => (
                <Card
                  key={u.id}
                  bg="$color2"
                  borderRadius="$4"
                  p="$3"
                  borderWidth="$1"
                  borderColor="$color6"
                >
                  <XStack verticalAlign="center" space="$3">
                    <Avatar circular size="$6" borderWidth={1} borderColor="$color6" backgroundColor="$color2">
                      <Avatar.Image src={require("../../../assets/images/defaultUserProfileImage.png")} />
                      <Avatar.Fallback backgroundColor="$color2">
                        <Text color="$color9">{getInitials(u.Name)}</Text>
                      </Avatar.Fallback>
                    </Avatar>
                    <YStack flex={1}>
                      <H4 color="$color" fontWeight="600">{u.Name}</H4>
                      <Text color="$color10" fontSize="$2">{u.Email}</Text>
                      {!!u.Phone && (
                        <Text color="$color10" fontSize="$2">{u.Phone}</Text>
                      )}
                    </YStack>
                  </XStack>
                </Card>
              ))
            )}
          </YStack>
        </ScrollView>
        
        {/* Add Members Button */}
        <Button
          bg="$color9"
          color="$color1"
          borderWidth="$0"
          onPress={() => {
            router.push({
              pathname: '/groups/addMembers',
              params: { groupId: group?.id }
            });
          }}
          p="$3"
          mt="$4"
          style={{ borderRadius: 8 }}
        >
          <XStack verticalAlign="center" space="$2">
            <Ionicons name="person-add-outline" size={20} color="white" />
            <Text color="$color1" fontWeight="600">Add Members</Text>
          </XStack>
        </Button>
      </YStack>
    </SafeAreaWrapper>
  );
}
