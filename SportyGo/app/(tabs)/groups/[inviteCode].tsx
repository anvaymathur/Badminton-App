import React, { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Alert } from "react-native";
import { YStack, Card, Button, Text, Paragraph, H3, Spinner } from "tamagui";
import { getGroupInvite, addGroupMember, getGroupById } from "../../../firebase/services_firestore2";
import { useAuth0 } from "react-native-auth0";
import { GroupInviteDoc } from "../../../firebase/types_index";
import { SafeAreaWrapper } from "../../components/SafeAreaWrapper";

export default function GroupInviteScreen() {
  const localParams = useLocalSearchParams<{ inviteCode?: string }>();
  const [invite, setInvite] = useState<GroupInviteDoc | null>(null);
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "expired" | "already_member">("checking");
  const [inviteCode, setInviteCode] = useState<string | undefined>(localParams.inviteCode);

  const { user } = useAuth0();
  let userId: string | null = null;
  if (user && user.sub) {
    userId = user.sub;
  } else {  
    Alert.alert("Error", "Please login to continue");
    router.replace("/index" as any);
  }

  // Listen for incoming deep links
  useEffect(() => {
    const handleUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("inviteCode");
        if (code) setInviteCode(code);
      } catch (err) {
        console.warn("Invalid URL:", url);
      }
    };

    Linking.getInitialURL().then(url => {
      if (url) handleUrl(url);
    });

    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  // Verify invite whenever inviteCode changes
  useEffect(() => {
    if (!inviteCode || !userId) return;

    async function verifyInvite() {
      setStatus("checking");
      if (!inviteCode || !userId) return;
      let invite = await getGroupInvite(inviteCode);
      
      // Convert Firestore Timestamp to JavaScript Date right after fetching
      if (invite && invite.validUntil) {
        const validUntilDate = typeof invite.validUntil === 'object' && 'toDate' in invite.validUntil
          ? (invite.validUntil as any).toDate()
          : new Date(invite.validUntil);
        invite = { ...invite, validUntil: validUntilDate };
      }
      
      if (invite) setInvite(invite);

      if (!invite) {
        setStatus("invalid");
      } else if (invite.expired) {
        setStatus("expired");
      } else if (invite.maxUses && invite.used && invite.maxUses <= invite.used) {
        setStatus("invalid");
      } else if (invite.validUntil && invite.validUntil < new Date()) {
        setStatus("invalid");
      } else {
        // Check if user is already a member of the group
        const group = await getGroupById(invite.groupId);
        if (group && group.MemberIds && group.MemberIds.includes(userId)) {
          setStatus("already_member");
        } else {
          setStatus("valid");
        }
      }
    }

    verifyInvite();
  }, [inviteCode, userId]);

  const handleAddGroupMember = async () => {
    if (invite && userId) {
      const result = await addGroupMember(userId, invite.groupId);
      if (result) {
        router.push({
          pathname: '/groups/viewMembers',
          params: { groupId: invite.groupId }
       })
      }
      else if (result === false) {
        Alert.alert("Error", "You are already a member of this group")
      }
      else {
        Alert.alert("Error", "Failed to add group member")
      }
    }
  };

  if (!inviteCode) {
    return (
      <SafeAreaWrapper>
        <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Text>No invite code found</Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  if (status === "checking") {
    return (
      <SafeAreaWrapper>
        <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Spinner color="$color9" />
          <Text color="$color10">Verifying invite code...</Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  if (status === "expired") return (
    <SafeAreaWrapper>
      <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Card elevate bordered p="$5" width="100%" style={{ maxWidth: 420, alignItems: 'center' }}>
          <H3>Invite Expired</H3>
          <Paragraph>This invite link has expired and is no longer valid.</Paragraph>
        </Card>
      </YStack>
    </SafeAreaWrapper>
  );

  if (status === "invalid") return (
    <SafeAreaWrapper>
      <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Card elevate bordered p="$5" width="100%" style={{ maxWidth: 420, alignItems: 'center' }}>
          <H3>Invalid Invite</H3>
          <Paragraph>This invite link is invalid or has reached its maximum uses.</Paragraph>
        </Card>
      </YStack>
    </SafeAreaWrapper>
  );

  if (status === "already_member") return (
    <SafeAreaWrapper>
      <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Card elevate bordered p="$5" width="100%" style={{ maxWidth: 420, alignItems: 'center' }}>
          <H3>Already a Member</H3>
          <Paragraph>You are already a member of this group!</Paragraph>
          <Button 
            bg="$color9"
            color="$color1"
            borderWidth="$0"
            onPress={() => router.push({
              pathname: '/groups/viewMembers',
              params: { groupId: invite?.groupId }
            })}
            mt="$3"
          >
            View Group
          </Button>
        </Card>
      </YStack>
    </SafeAreaWrapper>
  );

  return (
    <SafeAreaWrapper>
      <YStack flex={1} p="$4" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Card elevate bordered p="$5" width="100%" style={{ maxWidth: 420, alignItems: 'center' }}>
          <H3>Join Group</H3>
          <Paragraph>You've been invited to join this group!</Paragraph>
          <Button 
            bg="$color9"
            color="$color1"
            borderWidth="$0"
            onPress={handleAddGroupMember}
            mt="$3"
          >
            Join Group
          </Button>
        </Card>
      </YStack>
    </SafeAreaWrapper>
  );
}
