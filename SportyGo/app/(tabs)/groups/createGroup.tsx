import React, { useState } from "react";
import { View, Alert, Dimensions, Platform } from "react-native";
import { 
  Button, Input, 
  YStack, XStack, 
  Text, Avatar, 
  H2, Select,
  TextArea, Sheet,
  ScrollView, Card,
  Stack
} from 'tamagui';
import { Adapt } from '@tamagui/adapt'
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';

import { router } from "expo-router";
import { useAuth0 } from "react-native-auth0";
import { createGroup, uploadImage, testStorageConnection, imageToBase64 } from '../../../firebase/services_firestore2';
import { GroupDoc } from '../../../firebase/types_index';
import { SafeAreaWrapper } from '../../components/SafeAreaWrapper';
import { Ionicons } from "@expo/vector-icons";


export default function CreateGroup() {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [privacy, setPrivacy] = useState('');
  const [homeCourt, setHomeCourt] = useState('');
  const [meetingSchedule, setMeetingSchedule] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const {user} = useAuth0();

  // Count only non-space characters (spaces don't count toward the limit)
  const countNonSpaceChars = (val: string) => val.replace(/ /g, '').length;
  const DESCRIPTION_LIMIT = 150;

  // Function to generate group initials
  const generateGroupInitials = (name: string): string => {
    const initials = name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
    console.log('Generated initials for:', name, '=', initials);
    return initials;
  };

  const skillLevels = [
    { value: 'recreational', label: 'Recreational' },
    { value: 'competitive', label: 'Competitive' },
    { value: 'professional', label: 'Professional' }
  ];

  const privacyOptions = [
    { value: 'open', label: 'Open' },
    { value: 'invite-only', label: 'Invite only' },
    { value: 'private', label: 'Private' }
  ];

  const frequencyOptions = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'bi-weekly', label: 'Bi-weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'as-needed', label: 'As needed' }
  ];

  // Compute a sheet snap point (%) that fits the number of items comfortably
  const getSheetSnapPercentForItems = (count: number, rowHeight = 56, basePadding = 160) => {
    const screenHeight = Dimensions.get('window').height || 800;
    const desiredPx = count * rowHeight + basePadding;
    const pct = Math.round((desiredPx / screenHeight) * 100);
    return Math.max(35, Math.min(90, pct));
  };

  const skillSnap = getSheetSnapPercentForItems(skillLevels.length);
  const privacySnap = getSheetSnapPercentForItems(privacyOptions.length);
  const meetingSnap = getSheetSnapPercentForItems(frequencyOptions.length);

  const pickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to select a photo.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const generateInitials = () => {
    // Generate group initials if no photo is selected
    const initials = generateGroupInitials(groupName);
    console.log('Generated initials:', initials);
    // Store initials as a special format that can be detected later
    return  `INITIALS:${initials}`;
  }

  const clearPhoto = () => {
    setSelectedPhoto(null);
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Missing Information", "Please enter a group name.");
      return;
    }

    if (user && user.sub){
      setUploadingPhoto(true);
      let photoUrl = '';

      try {

        // Convert photo to Base64 for Firestore storage (no Firebase Storage needed)
        if (selectedPhoto) {
          console.log('Converting photo to Base64...');
          photoUrl = await imageToBase64(selectedPhoto);
          console.log('Photo converted to Base64 successfully');
        } else {
          // Generate group initials if no photo is selected
          photoUrl = generateInitials();
        }

        const groupInfo: GroupDoc={
          id: '',
          Name: groupName,
          OwnerId: user.sub,
          MemberIds: [user.sub],
          Description: description,
          SkillLevel: skillLevel,
          Privacy: privacy,
          HomeCourt: homeCourt,
          MeetingSchedule: meetingSchedule,
          PhotoUrl: photoUrl || undefined
        }
        
        await createGroup(user.sub, groupInfo);
        router.push('/groups/displayGroups');
      } catch (error) {
        console.error('Error creating group:', error);
        console.log(error);
        
        // Provide more specific error messages
        let errorMessage = "Failed to create group. Please try again.";
        if (error instanceof Error) {
          if (error.message.includes('storage/unauthorized')) {
            errorMessage = "Storage access denied. Please check your permissions.";
          } else if (error.message.includes('storage/quota-exceeded')) {
            errorMessage = "Storage quota exceeded. Please try a smaller image.";
          } else if (error.message.includes('Failed to fetch image')) {
            errorMessage = "Failed to process image. Please try selecting a different image.";
          }
        }
        
        Alert.alert("Error", errorMessage);
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  return (
    <SafeAreaWrapper backgroundColor="white">
      <ScrollView>
        <YStack flex={1} p="$4" space="$6" z={1}>
          {/* Header */}
          <XStack justify="flex-start" verticalAlign="center" mb="$2">
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
          </XStack>
            <H2 color="$color9" fontWeight="bold" flex={1} style={{ textAlign: 'center' }} pb="$8">
              Group Details
            </H2>

          {/* Group Photo Placeholder */}
          <YStack mb="$6" style={{ alignItems: 'center' }} p="$4">
            <Stack>
              <Button
                onPress={pickImage}
                bg="transparent"
                borderWidth={0}
                p={0}
                disabled={uploadingPhoto}
                circular
                size="$16"
              >
                <Avatar 
                  circular
                  size="$16" 
                  borderWidth={2} 
                  borderColor="$color9"
                  borderStyle={selectedPhoto ? "solid" : "dashed"}
                  background="transparent"
                  mb="$2"
                >
                  {selectedPhoto ? (
                    <Avatar.Image src={selectedPhoto} />
                  ) : groupName ? (
                    <Avatar.Fallback backgroundColor="$color9" justifyContent="center" alignItems="center">
                      <Text fontSize="$6" color="$color1" fontWeight="bold" style={{ textAlign: 'center' }}>
                        {generateGroupInitials(groupName)}
                      </Text>
                    </Avatar.Fallback>
                  ) : (
                    <Avatar.Fallback background="transparent">
                      <Text fontSize="$8" color="$color9">+</Text>
                    </Avatar.Fallback>
                  )}
                </Avatar> 

              </Button>
                <Text color="$color10" fontSize="$3" style={{ textAlign: 'center' }}>
                  {uploadingPhoto ? 'Uploading...' : selectedPhoto ? '' : groupName ? `Will show: ${generateGroupInitials(groupName)}` : 'Add Group Photo'}
                </Text>
            </Stack>
              <Button ml="$20" onPress={clearPhoto} bg="$color9"  borderWidth={10} p={0} disabled={uploadingPhoto}><Ionicons name="trash" size={20} color="white" /></Button>

          </YStack>

          {/* Form Fields */}
          <YStack space="$5" flex={1}>
            {/* Group Name */}
            <YStack space="$2">
              <Text color="$color" fontSize="$4" fontWeight="600">
                Group Name *
              </Text>
              <Input
                value={groupName}
                onChangeText={(text: any) => setGroupName(text)}
                placeholder="Enter group name"
                borderColor="$color6"
                borderWidth={1}
                background="$color2"
                color="$color"
                placeholderTextColor="$color10"
                p="$3"
                style={{ borderRadius: 8, fontSize: 16 }}
              />
            </YStack>

            {/* Description */}
            <YStack space="$2">
              <Text color="$color" fontSize="$4" fontWeight="600">
                Description
              </Text>
              <TextArea
                value={description}
                onChangeText={(text: any) => {
                  // Enforce limit based on non-space characters only
                  if (countNonSpaceChars(text) <= DESCRIPTION_LIMIT) {
                    setDescription(text);
                  }
                }}
                placeholder="What's this group about?"
                borderColor="$color6"
                borderWidth={1}
                background="$color2"
                color="$color"
                placeholderTextColor="$color10"
                p="$3"
                numberOfLines={5}
                maxLength={150}
                style={{ borderRadius: 8, textAlignVertical: 'top', minHeight: 120, fontSize: 16 }}
              />
              <XStack style={{ justifyContent: 'flex-end' }}>
                <Text color="$color10" fontSize="$2">
                  {countNonSpaceChars(description)}/{DESCRIPTION_LIMIT}
                </Text>
              </XStack>
            </YStack>

            {/* Group Skill Level */}
            <YStack space="$2" p="$1">
              <Text color="$color" fontSize="$4" fontWeight="600">
                Group Skill Level
              </Text>
              {Platform.OS === 'web' ? (
                <Select
                  value={skillLevel}
                  onValueChange={setSkillLevel}
                  defaultValue=""
                >
                  <Select.Trigger
                    borderWidth={2}
                    borderColor="$color6"
                    backgroundColor="$color2"
                    p="$3"
                    borderRadius={8}
                  >
                    <Select.Value placeholder="Select skill level" />
                  </Select.Trigger>

                  <Select.Content zIndex={1000}>
                    <Select.ScrollUpButton />
                    <Select.Viewport height={56 * skillLevels.length + 16}>
                      <Select.Group>
                        {skillLevels.map((level, index) => (
                          <Select.Item
                            key={level.value}
                            index={index}
                            value={level.value}
                          >
                            <Select.ItemText>{level.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Group>
                    </Select.Viewport>
                    <Select.ScrollDownButton />
                  </Select.Content>
                </Select>
              ) : (
                <Card borderRadius="$3" overflow="hidden" borderWidth={1} borderColor="$color6" bg="$color2">
                  <Picker
                    selectedValue={skillLevel}
                    onValueChange={setSkillLevel}
                    style={{ color: Platform.OS === 'ios' ? '#000' : undefined }}
                  >
                    <Picker.Item label="Select skill level" value="" color={Platform.OS === 'ios' ? '#000' : undefined} />
                    {skillLevels.map(l => <Picker.Item key={l.value} label={l.label} value={l.value} color={Platform.OS === 'ios' ? '#000' : undefined} />)}
                  </Picker>
                </Card>
              )}
            </YStack>

            {/* Privacy */}
            <YStack space="$2" p="$1">
              <Text color="$color" fontSize="$4" fontWeight="600">
                Privacy
              </Text>
              {Platform.OS === 'web' ? (
                <Select
                  value={privacy}
                  onValueChange={setPrivacy}
                  defaultValue=""
                >
                  <Select.Trigger
                    borderWidth={2}
                    borderColor="$color6"
                    backgroundColor="$color2"
                    p="$3"
                    borderRadius={8}
                  >
                    <Select.Value placeholder="Select privacy" />
                  </Select.Trigger>

                  <Select.Content zIndex={1000}>
                    <Select.ScrollUpButton />
                    <Select.Viewport>
                      <Select.Group>
                        {privacyOptions.map((level, index) => (
                          <Select.Item
                            key={level.value}
                            index={index}
                            value={level.value}
                          >
                            <Select.ItemText>{level.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Group>
                    </Select.Viewport>
                    <Select.ScrollDownButton />
                  </Select.Content>
                </Select>
              ) : (
                <Card borderRadius="$3" overflow="hidden" borderWidth={1} borderColor="$color6" bg="$color2">
                  <Picker
                    selectedValue={privacy}
                    onValueChange={(val) => setPrivacy(val)}
                    style={{ color: Platform.OS === 'ios' ? '#000' : undefined }}
                  >
                    <Picker.Item label="Select privacy" value="" color={Platform.OS === 'ios' ? '#000' : undefined} />
                    {privacyOptions.map((opt) => (
                      <Picker.Item key={opt.value} label={opt.label} value={opt.value} color={Platform.OS === 'ios' ? '#000' : undefined} />
                    ))}
                  </Picker>
                </Card>
              )}
            </YStack>

            {/* Home Court */}
            <YStack space="$2">
              <Text color="$color" fontSize="$4" fontWeight="600">
                Home Court
              </Text>
              <Input
                value={homeCourt}
                onChangeText={(text: any) => setHomeCourt(text)}
                placeholder="Enter court location"
                borderColor="$color6"
                borderWidth={1}
                background="$color2"
                color="$color"
                placeholderTextColor="$color10"
                p="$3"
                style={{ borderRadius: 8, fontSize: 16 }}
              />
            </YStack>

            {/* Meeting Schedule */}
            <YStack space="$2" p="$1">
              <Text color="$color" fontSize="$4" fontWeight="600">
                Meeting Schedule
              </Text>
              {Platform.OS === 'web' ? (
                <Select
                  value={meetingSchedule}
                  onValueChange={setMeetingSchedule}
                  defaultValue=""
                >
                  <Select.Trigger
                    borderWidth={2}
                    borderColor="$color6"
                    backgroundColor="$color2"
                    p="$3"
                    borderRadius={8}
                  >
                    <Select.Value placeholder="Select meeting schedule" />
                  </Select.Trigger>

                  <Select.Content zIndex={1000}>
                    <Select.ScrollUpButton />
                    <Select.Viewport>
                      <Select.Group>
                        {frequencyOptions.map((level, index) => (
                          <Select.Item
                            key={level.value}
                            index={index}
                            value={level.value}
                          >
                            <Select.ItemText>{level.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Group>
                    </Select.Viewport>
                    <Select.ScrollDownButton />
                  </Select.Content>
                </Select>
              ) : (
                <Card borderRadius="$3" overflow="hidden" borderWidth={1} borderColor="$color6" bg="$color2">
                  <Picker
                    selectedValue={meetingSchedule}
                    onValueChange={(val) => setMeetingSchedule(val)}
                    style={{ color: Platform.OS === 'ios' ? '#000' : undefined }}
                  >
                    <Picker.Item label="Select meeting schedule" value="" color={Platform.OS === 'ios' ? '#000' : undefined} />
                    {frequencyOptions.map((opt) => (
                      <Picker.Item key={opt.value} label={opt.label} value={opt.value} color={Platform.OS === 'ios' ? '#000' : undefined} />
                    ))}
                  </Picker>
                </Card>
              )}
            </YStack>
          </YStack>

          {/* Create Group Button */}
          
          <Button
            bg="$color9"
            color="$color1"
            onPress={handleCreateGroup}
            style={{ borderRadius: 8 }}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? 'Creating Group...' : 'Create Group'}
          </Button>
        </YStack>
      </ScrollView>
    </SafeAreaWrapper>
  );
}