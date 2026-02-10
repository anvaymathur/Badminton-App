import React, { useState, useEffect } from "react";
import { View, Alert, ScrollView, Share, Platform, Clipboard } from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
  Button, 
  YStack, 
  XStack, 
  Text, 
  H2, 
  H3,
  Card,
  Select,
  Adapt,
  Sheet,
  Spinner,
  Input
} from 'tamagui';
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import { GroupDoc } from "../../../firebase/types_index";
import { getGroupById, getGroupInvites } from "../../../firebase/services_firestore2";
import { Picker } from '@react-native-picker/picker';
import { createGroupInvite } from "../../../firebase/services_firestore2";
import { GroupInviteDoc } from "../../../firebase/types_index";
import { nanoid } from "nanoid/non-secure";
import { SafeAreaWrapper } from "@/components/SafeAreaWrapper";

export default function AddMembers() {
  const [inviteLink, setInviteLink] = useState('');
  const [isLinkGenerated, setIsLinkGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiryDate, setExpiryDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); // Default: 7 days from now
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [maxUses, setMaxUses] = useState('10');
  const [maxUsesInput, setMaxUsesInput] = useState('10');
  const [showMaxUsesPicker, setShowMaxUsesPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<GroupInviteDoc[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const { user } = useAuth0();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const [group, setGroup] = useState<GroupDoc | null>(null);


  const maxUsesOptions = [
    { value: '5', label: '5 uses' },
    { value: '10', label: '10 uses' },
    { value: '25', label: '25 uses' },
    { value: 'unlimited', label: 'Unlimited' }
  ];

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setExpiryDate(selectedDate);
      // Show time picker after date is selected
      setTimeout(() => {
        setShowTimePicker(true);
      }, 100);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      // Combine the selected date with the selected time
      const newDate = new Date(expiryDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setExpiryDate(newDate);
    }
  };

  const handleMaxUsesChange = (event: any, selectedValue?: string) => {
    setShowMaxUsesPicker(false);
    if (selectedValue) {
      setMaxUses(selectedValue);
      setMaxUsesInput(selectedValue);
    }
  };

  const handleMaxUsesInputChange = (text: string) => {
    const onlyDigits = text.replace(/[^0-9]/g, '');
    if (onlyDigits === '') {
      setMaxUsesInput('');
      setMaxUses('1');
      return;
    }
    const parsed = parseInt(onlyDigits, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 999) {
      setMaxUsesInput(onlyDigits);
      setMaxUses(parsed.toString());
    }
  };

  // Load group data and invites
  useEffect(() => {
    const loadGroupAndInvites = async () => {
      const gid = (typeof groupId === 'string' && groupId);
      if (!gid) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setLoadingInvites(true);
        
        // Load group data
        const groupData = await getGroupById(gid);
        setGroup(groupData || null);
        
        // Load invites
        const groupInvites = await getGroupInvites(gid);
        setInvites(groupInvites);
      } catch (error) {
        console.error('Error loading group or invites:', error);
        Alert.alert("Error", "Failed to load group information");
      } finally {
        setLoading(false);
        setLoadingInvites(false);
      }
    };

    loadGroupAndInvites();
  }, [groupId]);

  const generateInviteLink = async () => {
    const inviteCode = nanoid(6);
    const inviteLink = `https://sportygo-sparkpro.web.app/groups/${inviteCode}`;

    if (!group) {
        Alert.alert("Error", "Failed to load group information");
        return;
    } else if (group.id === undefined) {
        Alert.alert("Error", "There was an error generating the invite link, please try again later");
        return;
    } else if (maxUses === 'undefined') {
        Alert.alert("Error", "Max uses cannot be undefined");
        return;
    }

    const invite: GroupInviteDoc = {
        groupId: group?.id || '',
        inviteCode: inviteCode,
        inviteLink: inviteLink,
        validUntil: expiryDate,
        maxUses: parseInt(maxUses),
        expired: false,
        used: 0
    };
    await createGroupInvite(invite);
    setInviteLink(inviteLink);
    setIsLinkGenerated(true);
    
    // Refresh the invites list
    if (group.id) {
      try {
        const updatedInvites = await getGroupInvites(group.id);
        setInvites(updatedInvites);
      } catch (error) {
        console.error('Error refreshing invites:', error);
      }
    }
    
    const expiryText = expiryDate.toLocaleString();
    const maxUsesText = maxUses === 'unlimited' ? 'Unlimited uses' : `${maxUsesOptions.find(opt => opt.value === maxUses)?.label}`;
    
    Alert.alert(
      "Success", 
      `Invite link generated successfully!\n\nSettings:\n• Expires at: ${expiryText}\n• Max uses: ${maxUsesText}`
    );
  };

  const copyToClipboard = async () => {
    try {
      Clipboard.setString(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Alert.alert("Copied!", "Invite link copied to clipboard");
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert("Error", "Failed to copy link");
    }
  };

  const shareInviteLink = async () => {
    try {
      await Share.share({
        message: `Join my badminton group! Use this invite link: ${inviteLink}`,
        title: 'Badminton Group Invite'
      });
    } catch (error) {
      Alert.alert("Error", "Failed to share link");
    }
  };

  const resetLink = () => {
    setInviteLink('');
    setIsLinkGenerated(false);
    setCopied(false);
  };

  // Helper functions for invite display
  const getInviteStatus = (invite: GroupInviteDoc) => {
    const now = new Date();
    const validUntil = new Date(invite.validUntil);
    
    if (invite.expired || validUntil < now) {
      return { status: 'Expired', color: '#ef4444' };
    }
    
    if (invite.maxUses && invite.used >= invite.maxUses) {
      return { status: 'Max Uses Reached', color: '#f59e0b' };
    }
    
    return { status: 'Active', color: '#22c55e' };
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - new Date(date).getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return '1 day ago';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return new Date(date).toLocaleDateString();
    }
  };

  return (
    <SafeAreaWrapper backgroundColor="white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <YStack flex={1} p="$4" space="$6">
          {/* Header */}
          <YStack space="$2">
            <H2 color="$color9" fontWeight="bold" style={{ textAlign: 'center' }}>
              Invite Members
            </H2>
            <Text color="$color8" fontSize="$4" style={{ textAlign: 'center' }}>
              Generate and share invite links to add members to your group
            </Text>
          </YStack>

          {/* Loading State */}
          {loading ? (
            <Card p="$4" bg="$color2" borderColor="$color6">
              <YStack space="$3" verticalAlign="center">
                <Spinner size="large" color="$color9" />
                <Text color="$color8" fontSize="$4">Loading group information...</Text>
              </YStack>
            </Card>
          ) : group ? (
            /* Current Group Info */
            <Card p="$4" bg="$color2" borderColor="$color6">
              <YStack space="$3">
                <XStack verticalAlign="center" space="$2">
                  <Ionicons name="people" size={20} color="#666" />
                  <Text fontWeight="bold" fontSize="$5">Group: {group.Name}</Text>
                </XStack>
                <Text color="$color8" fontSize="$4">
                  Current members: {group.MemberIds?.length || 0} • Max capacity: 20
                </Text>
                {group.Description && (
                  <Text color="$color8" fontSize="$3" fontStyle="italic">
                    {group.Description}
                  </Text>
                )}
              </YStack>
            </Card>
          ) : (
            /* Error State */
            <Card p="$4" bg="$color2" borderColor="$color6">
              <YStack space="$3" verticalAlign="center">
                <Ionicons name="alert-circle" size={24} color="#ef4444" />
                <Text color="$color8" fontSize="$4">Failed to load group information</Text>
                <Button
                  bg="$color2"
                  borderColor="$color6"
                  borderWidth="$1"
                  onPress={() => router.back()}
                >
                  <Text color="$color">Go Back</Text>
                </Button>
              </YStack>
            </Card>
          )}

                    {/* Generate Link Section */}
          {group && !isLinkGenerated ? (
            <Card p="$4" borderColor="$color6">
              <YStack space="$4">
                <YStack space="$2">
                  <H3 color="$color9">Generate Invite Link</H3>
                  <Text color="$color8" fontSize="$4">
                    Create a new invite link for your group members
                  </Text>
                </YStack>

                <Button
                  bg="$color2"
                  borderColor="$color6"
                  borderWidth="$1"
                  onPress={generateInviteLink}
                >
                  <XStack verticalAlign="center" space="$2">
                    <Ionicons name="link" size={16} color="#666" />
                    <Text color="$color">Generate Link</Text>
                  </XStack>
                </Button>
              </YStack>
            </Card>
          ) : group && isLinkGenerated ? (
            /* Generated Link Display */
            <Card p="$4" borderColor="$color6">
              <YStack space="$4">
                <YStack space="$2">
                  <XStack verticalAlign="center" space="$2">
                    <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                    <H3 color="$color9">Invite Link Generated</H3>
                  </XStack>
                  <Text color="$color8" fontSize="$4">
                    Share this link with people you want to invite
                  </Text>
                </YStack>

                {/* Link Display */}
                <Card p="$3" bg="$color2" borderColor="$color5">
                  <YStack space="$2">
                    <Text color="$color8" fontSize="$3" fontWeight="bold">
                      Invite Link:
                    </Text>
                    <Text 
                      color="$color9" 
                      fontSize="$4" 
                      style={{ fontFamily: 'monospace' }}
                      selectable
                    >
                      {inviteLink}
                    </Text>
                  </YStack>
                </Card>

                {/* Action Buttons */}
                <YStack space="$3">
                  <Button
                    bg="$color2"
                    borderColor="$color6"
                    borderWidth="$1"
                    onPress={copyToClipboard}
                  >
                    <XStack verticalAlign="center" space="$2">
                      <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={16} color="#666" />
                      <Text color="$color">{copied ? "Copied!" : "Copy Link"}</Text>
                    </XStack>
                  </Button>
                  
                  <Button
                    bg="$color2"
                    borderColor="$color6"
                    borderWidth="$1"
                    onPress={shareInviteLink}
                  >
                    <XStack verticalAlign="center" space="$2">
                      <Ionicons name="share-outline" size={16} color="#666" />
                      <Text color="$color">Share</Text>
                    </XStack>
                  </Button>

                  <Button
                    bg="$color2"
                    borderColor="$color6"
                    borderWidth="$1"
                    onPress={resetLink}
                  >
                    Reset Link
                  </Button>
                </YStack>
              </YStack>
            </Card>
          ) : null}

          {/* Link Settings */}
          {group && (
            <Card p="$4" borderColor="$color6">
              <YStack space="$4">
                <H3 color="$color9">Link Settings</H3>
                
                <YStack space="$3">
                                  <YStack space="$2">
                  <Text color="$color8" fontSize="$4" fontWeight="bold">
                    Expires at:
                  </Text>
                  <YStack space="$2">
                    <Button
                      bg="$color2"
                      borderColor="$color6"
                      borderWidth="$1"
                      onPress={() => setShowDatePicker(true)}
                    >
                      <XStack verticalAlign="center" space="$2">
                        <Ionicons name="calendar-outline" size={16} color="#666" />
                        <Text color="$color">Date: {expiryDate.toLocaleDateString()}</Text>
                      </XStack>
                    </Button>
                    <Button
                      bg="$color2"
                      borderColor="$color6"
                      borderWidth="$1"
                      onPress={() => setShowTimePicker(true)}
                    >
                      <XStack verticalAlign="center" space="$2">
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text color="$color">Time: {expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </XStack>
                    </Button>
                  </YStack>
                  {showDatePicker && (
                    <DateTimePicker
                      value={expiryDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleDateChange}
                      minimumDate={new Date()}
                    />
                  )}
                  {showTimePicker && (
                    <DateTimePicker
                      value={expiryDate}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleTimeChange}
                    />
                  )}
                </YStack>

                                  <YStack space="$2">
                  <Text color="$color8" fontSize="$4" fontWeight="bold">
                    Maximum uses:
                  </Text>
                  <YStack space="$2">
                    <Input
                      bg="$color2"
                      borderColor="$color6"
                      borderWidth="$1"
                      keyboardType="numeric"
                      inputMode="numeric"
                      maxLength={3}
                      value={maxUsesInput}
                      onChangeText={(text: any) => handleMaxUsesInputChange(text)}
                      placeholder="Enter number (1-999)"
                    />
                    <Text color="$color8" fontSize="$3">Or select from options:</Text>
                    <Button
                      bg="$color2"
                      borderColor="$color6"
                      borderWidth="$1"
                      onPress={() => setShowMaxUsesPicker(true)}
                    >
                      <XStack verticalAlign="center" space="$2">
                        <Ionicons name="list-outline" size={16} color="#666" />
                        <Text color="$color">
                          {maxUses === 'unlimited' ? 'Unlimited' : `${maxUses} uses`}
                        </Text>
                      </XStack>
                    </Button>
                  </YStack>
                  {showMaxUsesPicker && (
                    <Picker
                      selectedValue={maxUses}
                      onValueChange={(itemValue: string) => {
                        setMaxUses(itemValue);
                        setMaxUsesInput(itemValue === 'unlimited' ? '999' : itemValue);
                        setShowMaxUsesPicker(false);
                      }}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                        <Picker.Item key={num} label={`${num} uses`} value={num.toString()} />
                      ))}
                      <Picker.Item label="Unlimited" value="unlimited" />
                    </Picker>
                  )}
                </YStack>
                </YStack>
              </YStack>
            </Card>
          )}

          {/* Recent Invites */}
          {group && (
            <Card p="$4" borderColor="$color6">
              <YStack space="$4">
                <H3 color="$color9">Recent Invites</H3>
                
                {loadingInvites ? (
                  <YStack space="$3" verticalAlign="center">
                    <Spinner size="small" color="$color9" />
                    <Text color="$color8" fontSize="$4">Loading invites...</Text>
                  </YStack>
                ) : invites.length === 0 ? (
                  <Card p="$3" bg="$color2">
                    <YStack space="$2" verticalAlign="center">
                      <Ionicons name="link-outline" size={24} color="#666" />
                      <Text color="$color8" fontSize="$4" style={{ textAlign: 'center' }}>
                        No invite links created yet
                      </Text>
                      <Text color="$color8" fontSize="$3" style={{ textAlign: 'center' }}>
                        Generate your first invite link above
                      </Text>
                    </YStack>
                  </Card>
                ) : (
                  <YStack space="$3">
                    {invites.slice(0, 2).map((invite, index) => {
                      const status = getInviteStatus(invite);
                      const timeAgo = formatTimeAgo(invite.validUntil);
                      const maxUsesText = invite.maxUses === 999 ? 'Unlimited' : invite.maxUses.toString();
                      
                      return (
                        <Card key={invite.id || index} p="$3" bg="$color2">
                          <YStack space="$2">
                            <XStack justify="space-between" verticalAlign="center">
                              <Text color="$color9" fontWeight="bold" fontSize="$3" numberOfLines={1}>
                                {invite.inviteLink}
                              </Text>
                              <Text color="$color" fontSize="$3" style={{ color: status.color }}>
                                {status.status}
                              </Text>
                            </XStack>
                            <Text color="$color8" fontSize="$3">
                              Created: {timeAgo} • Used: {invite.used}/{maxUsesText} times
                            </Text>
                            <Text color="$color8" fontSize="$3">
                              Expires: {new Date(invite.validUntil).toLocaleDateString()}
                            </Text>
                          </YStack>
                        </Card>
                      );
                    })}
                  </YStack>
                )}
              </YStack>
            </Card>
          )}

          {/* Navigation */}
          <YStack space="$3">
            <Button
              bg="$color4"
              color="$color9"
              onPress={() => router.back()}
            >
              Back to Group
            </Button>
          </YStack>
        </YStack>
      </ScrollView>
    </SafeAreaWrapper>
  );
}
