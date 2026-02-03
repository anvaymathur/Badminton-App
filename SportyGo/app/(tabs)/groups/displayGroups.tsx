import React, { useEffect, useState } from "react";
import {
  Text,
  ScrollView,
  YStack,
  XStack,
  Input,
  Button,
  H2,
  H4,
  Paragraph,
  Square,
  Card,
  Theme,
  Avatar,
} from "tamagui";
import { Ionicons } from "@expo/vector-icons";
import { getGroups, getUserGroups } from '../../../firebase/services_firestore2';
import { useAuth0 } from "react-native-auth0";
import { router } from "expo-router";
import { GroupDoc } from '../../../firebase/types_index';
import { SafeAreaWrapper } from "../../components/SafeAreaWrapper";


function getGroupInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  let initials;
  if (parts.length === 1) {
    initials = parts[0].slice(0, 2).toUpperCase();
  } else {
    initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return initials;
}

export default function DisplayGroups() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("All Teams");
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const {user} = useAuth0()


  const loadGroups = async () => {
    if (user && user.sub) {
      try {
        setLoading(true);
        const groupsData = await getUserGroups(user.sub);
        
        setGroups(groupsData);
      } catch (error) {
        console.error("Error loading groups:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadGroups();
  }, [user]);

  const filteredTeams = groups.filter(group =>
    (group.Name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
      <SafeAreaWrapper>
        <YStack
          flex={1}
          p="$4"
        >
          {/* Header */}
          <YStack bg="$color1" px="$4" py="$3" borderBottomWidth={1} borderColor="$borderColor" mb="$4">
            <H2 color="$color" fontWeight="700">
              My Groups
            </H2>
            <Paragraph color="$color10" mt="$1">
              {loading ? 'Loading your groups...' : `${filteredTeams.length} ${filteredTeams.length === 1 ? 'group' : 'groups'}`}
            </Paragraph>
          </YStack>

          {/* Search Bar */}
          <YStack space="$4">
            <Input
              placeholder="Search groups..."
              value={searchQuery}
              onChangeText={(text: any) => setSearchQuery(text)}
              background="$color2"
              borderColor="$color6"
              px="$4"
              py="$3"
              color="$color"
              placeholderTextColor="$color10"
              style={{ fontSize: 16 }}

/>
          </YStack>

          {/* Groups List */}
          <ScrollView
            flex={1}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ pb: 20 }}
          >
            <YStack space="$3">
              {loading ? (
                <Text color="gray" verticalAlign="center" p="$4">
                  Loading groups...
                </Text>
              ) : filteredTeams.length === 0 ? (
                <Text color="gray" verticalAlign="center" p="$4">
                  No groups found. Create your first group or join a group!
                </Text>
              ) : (
                filteredTeams.map((group) => (
                  <Card
                    key={group.id}
                    bg="$color2"
                    borderRadius="$4"
                    p="$4"
                    borderWidth="$1"
                    borderColor="$color6"
                    onPress={() => {
                      
                      router.push({
                         pathname: '/groups/viewMembers',
                         params: { groupId: group.id }
                      });
                    }}
                    mt={20}
                  >
                  <XStack verticalAlign="center" space="$3">
                    {/* Group Avatar */}
                    <Avatar 
                      circular 
                      size="$8" 
                      borderWidth={1} 
                      borderColor="$color6" 
                      backgroundColor="$color9"
                    >
                      {(() => {
                        if (group.PhotoUrl && group.PhotoUrl.startsWith('data:')) {
                          return <Avatar.Image src={group.PhotoUrl} />;
                        } else {
                          const displayText = group.PhotoUrl && group.PhotoUrl.startsWith('INITIALS:') 
                            ? group.PhotoUrl.replace('INITIALS:', '') 
                            : getGroupInitials(group.Name || "?");
                          return (
                            <Avatar.Fallback backgroundColor="$color9" justifyContent="center" alignItems="center">
                              <Text color="$color1" fontSize="$4" fontWeight="bold" style={{   textAlign: 'center' }}>
                                {displayText}
                              </Text>
                            </Avatar.Fallback>
                          );
                        }
                      })()}
                    </Avatar>
                    
                    {/* Team Details */}
                    <YStack flex={1} space="$1">
                      <H4 color="$color" fontWeight="600">
                        {group.Name || "Unnamed Group"}
                      </H4>
                      <XStack verticalAlign="center" space="$2">
                        <Ionicons name="people" size={16} color="gray" />
                        <Text color="$color10" fontSize="$3">
                          {(group.MemberIds?.length || 0)} members
                        </Text>
                      </XStack>
                      {/* Show additional info if available */}
                      {group.Description && (
                        <Text color="gray" fontSize="$2">
                          {group.Description}
                        </Text>
                      )}
                      {group.HomeCourt && (
                        <Text color="gray" fontSize="$2">
                          Court: {group.HomeCourt}
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                </Card>
              ))
              )}
            </YStack>
            {/* Create Team Button */}
          <Button
            bg="$color9"
            color="$color1"
            borderWidth="$0" 
            onPress={() => router.push('/groups/createGroup')}
            p='$2'
            flexDirection="row"
            mt={10}
            verticalAlign="center"
          >
            <Ionicons name="add" size={20} color="white" />
              Create Group
          </Button>
          </ScrollView>
        </YStack>
      </SafeAreaWrapper>
  );
}
