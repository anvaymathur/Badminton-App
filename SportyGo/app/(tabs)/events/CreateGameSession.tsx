/**
 * @fileoverview CreateGameSession Component
 * 
 * Form component for creating new badminton events with group selection,
 * participant management, voting configuration, and form validation.
 */

import React, { useState, useEffect, JSX } from 'react';
import { Alert, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { createEvent, getUserGroups, getAllUserProfiles } from '../../../firebase/services_firestore2';
import { GroupDoc, UserDoc } from '../../../firebase/types_index';
import { useAuth0 } from 'react-native-auth0';
import { YStack, XStack, Button, Input, Label, Paragraph, H2, Text, Card, ScrollView } from 'tamagui';
import { SafeAreaWrapper } from '../../components/SafeAreaWrapper';

/**
 * Interface for form validation errors
 */
type FormErrors = {

  title?: string;
  gameDate?: string;
  gameTime?: string;
  location?: string;

  totalCost?: string;
  votingCutoff?: string;
  groups?: string;
  participants?: string;
};

/**
 * Main CreateGameSession component for creating new badminton events
 * @returns {JSX.Element} The rendered create game session form
 */
export default function CreateGameSession() {
  // Date setup for form defaults

  const today = new Date();
  const tomorrow = new Date(today);
  const { user } = useAuth0();
  let userId = 'default-user';
  const NO_GROUP_VALUE = '__NO_GROUP_SELECTED__';

  if (user && user.sub) {
    userId = user.sub;
  }

  tomorrow.setDate(tomorrow.getDate() + 1);

  // State for form fields
  const [title, setTitle] = useState('');
  const [gameDate, setGameDate] = useState(tomorrow);
  const [showGameDate, setShowGameDate] = useState(false);
  const [gameTime, setGameTime] = useState(new Date());
  const [showGameTime, setShowGameTime] = useState(false);
  const [location, setLocation] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [votingEnabled, setVotingEnabled] = useState(true);
  const [votingCutoff, setVotingCutoff] = useState(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return endOfToday;
  });
  const [showVotingCutoff, setShowVotingCutoff] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [excludedGroupParticipants, setExcludedGroupParticipants] = useState<string[]>([]);

  // State for groups and users
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // State for errors and success
  const [errors, setErrors] = useState<FormErrors>({});
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Fetches user groups and profiles on component mount
   * Loads data needed for group and participant selection
   */
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingGroups(true);
        setLoadingUsers(true);
        
        const [fetchedGroups, fetchedUsers] = await Promise.all([
          getUserGroups(userId),
          getAllUserProfiles()
        ]);
        
        setGroups(fetchedGroups);
        setUsers(fetchedUsers);
        setGroupsLoaded(true);
      } catch (error) {
        Alert.alert('Error', 'Failed to load groups and users. Becasue of ' + error);
      } finally {
        setLoadingGroups(false);
        setLoadingUsers(false);
      }
    };

    fetchData();
  }, []);

  // Clear exclusions whenever the selected group changes
  useEffect(() => {
    setExcludedGroupParticipants([]);
  }, [selectedGroup]);

  /**
   * Validates all form fields and sets error messages
   * 
   * @returns {boolean} True if validation passes, false otherwise
   */
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    
    // Title validation
    if (!title || title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    
    // Date validation
    if (!gameDate || gameDate < new Date(today.setHours(0, 0, 0, 0))) {
      newErrors.gameDate = 'Game date cannot be in the past';
    }
    
    // Time validation
    if (!gameTime) {
      newErrors.gameTime = 'Game time is required';
    }
    
    // Location validation
    if (!location || location.trim().length < 3) {
      newErrors.location = 'Location must be at least 3 characters';
    }
    
    // Cost validation
    if (totalCost && (isNaN(Number(totalCost)) || Number(totalCost) < 0)) {
      newErrors.totalCost = 'Total cost must be a valid positive number';
    }
    
    // Voting cutoff validation
    if (votingEnabled) {
      if (!votingCutoff) {
        newErrors.votingCutoff = 'Voting cutoff date is required';
      } else {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Set to 12:00am
        if (votingCutoff < now) {
          newErrors.votingCutoff = 'Voting cutoff cannot be in the past';
        }
        // Allow voting cutoff on the same date as the game
        // The voting will automatically close when the event starts
      }
    }
    
    // Check minimum participants requirement
    const effectiveGroupId = getEffectiveSelectedGroupId();
    const selectedGroupData = effectiveGroupId ? groups.find(g => g.id === effectiveGroupId) : null;
    const groupMemberCount = selectedGroupData ? selectedGroupData.MemberIds.length : 0;
    const individualCount = selectedParticipants.length + (!effectiveGroupId && !selectedParticipants.includes(userId) ? 1 : 0);
    const totalParticipants = groupMemberCount + individualCount;
    
    if (totalParticipants < 2) {
      newErrors.participants = 'You need at least 2 participants total (group and/or individuals)';
    }
    

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handles date picker changes for game date
   * 
   * @param {any} event - The picker event
   * @param {Date | undefined} selectedDate - The selected date
   */
  const onChangeGameDate = (event: any, selectedDate?: Date): void => {
    setShowGameDate(false);
    if (selectedDate) setGameDate(selectedDate);
  };

  /**
   * Handles time picker changes for game time
   * 
   * @param {any} event - The picker event
   * @param {Date | undefined} selectedTime - The selected time
   */
  const onChangeGameTime = (event: any, selectedTime?: Date): void => {
    setShowGameTime(false);
    if (selectedTime) setGameTime(selectedTime);
  };

  /**
   * Handles date picker changes for voting cutoff
   * Sets the cutoff to the end of the selected date (23:59:59)
   * 
   * @param {any} event - The picker event
   * @param {Date | undefined} selectedDate - The selected date
   */
  const onChangeVotingCutoff = (event: any, selectedDate?: Date): void => {
    setShowVotingCutoff(false);
    if (selectedDate) {
      // Set the voting cutoff to the end of the selected date (23:59:59)
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      setVotingCutoff(endOfDay);
    }
  };

  /**
   * Handles form submission and event creation
   * Validates form data and creates the event in Firestore
   */
  const handleSubmit = async (): Promise<void> => {
    if (!validate()) return;
    
    setLoading(true);
    try {
      // Ensure creator is always included as a participant
      let finalIndividualParticipants = [...selectedParticipants];
      
      // If no group is selected, creator must be in individual participants
      if (!getEffectiveSelectedGroupId() && !finalIndividualParticipants.includes(userId)) {
        finalIndividualParticipants.push(userId);
      }
      
      // Build EventDoc object
      const event = {
        id: '', // Firestore will generate the ID
        GroupIDs: (() => { const gid = getEffectiveSelectedGroupId(); return gid ? [gid] : []; })(),
        IndividualParticipantIDs: finalIndividualParticipants,

        Title: title.trim(),
        EventDate: new Date(
          gameDate.getFullYear(),
          gameDate.getMonth(),
          gameDate.getDate(),
          gameTime.getHours(),
          gameTime.getMinutes()
        ),
        Location: location,
        TotalCost: totalCost ? Number(totalCost) : 0,
        CutoffDate: votingEnabled ? votingCutoff : new Date('1970-01-01'),
        CreatorID: userId,
        VotingEnabled: votingEnabled,
      };

      await createEvent(event);
      setLoading(false);
      setSuccess(true);
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'Failed to create event. Becasue of ' + e);
      console.log(e);
    }
  };

  /**
   * Handles form cancellation with confirmation dialog
   */
  const handleCancel = (): void => {

    Alert.alert('Cancel', 'Are you sure you want to cancel? All entered data will be lost.', [
      { text: 'No' },
      { text: 'Yes', onPress: () => router.back() },
    ]);
  };

  /**
   * Resets the form to initial state
   * Clears all fields and resets to default values
   */
  const resetForm = (): void => {

    setTitle('');
    setGameDate(tomorrow);
    setGameTime(new Date());
    setLocation('');
    setTotalCost('');
    setVotingEnabled(true);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    setVotingCutoff(endOfToday);
    setSelectedGroup(null);
    setSelectedParticipants([]);
    setUserSearchQuery('');
    setExcludedGroupParticipants([]);
    setErrors({});
    setSuccess(false);
    setLoading(false);
  };

  /**
   * Handles "Create Another" action after successful event creation
   */
  const handleCreateAnother = (): void => {
    resetForm();
  };

  /**
   * Navigates to the events list after successful event creation
   */
  const handleViewSessions = (): void => {
    router.push('/events/EventsList');
  };

  /**
   * Toggles a participant's selection status
   * 
   * @param {string} userId - The user ID to toggle
   */
  const toggleParticipant = (targetUserId: string): void => {
    const effectiveGroupId = getEffectiveSelectedGroupId();
    const selectedGroupData = effectiveGroupId ? groups.find(g => g.id === effectiveGroupId) : null;
    const isInSelectedGroup = selectedGroupData ? selectedGroupData.MemberIds.includes(targetUserId) : false;
    const isIndividuallySelected = selectedParticipants.includes(targetUserId);
    const isExcluded = excludedGroupParticipants.includes(targetUserId);
    const isSelf = targetUserId === userId;

    if (isIndividuallySelected) {
      // Remove individual selection; if highlighted via group or self, exclude to unhighlight
      setSelectedParticipants(prev => prev.filter(id => id !== targetUserId));
      if ((effectiveGroupId && isInSelectedGroup && !isExcluded) || (isSelf && !isExcluded)) {
        setExcludedGroupParticipants(prev => [...prev, targetUserId]);
      }
      return;
    }

    if (effectiveGroupId && isInSelectedGroup) {
      if (!isExcluded) {
        // Exclude from group highlight
        setExcludedGroupParticipants(prev => [...prev, targetUserId]);
        return;
      } else {
        // Remove exclusion and select individually
        setExcludedGroupParticipants(prev => prev.filter(id => id !== targetUserId));
        setSelectedParticipants(prev => [...prev, targetUserId]);
        return;
      }
    }

    if (isSelf) {
      if (!isExcluded) {
        // Exclude from self auto-highlight
        setExcludedGroupParticipants(prev => [...prev, targetUserId]);
        return;
      } else {
        // Remove exclusion and select individually
        setExcludedGroupParticipants(prev => prev.filter(id => id !== targetUserId));
        setSelectedParticipants(prev => [...prev, targetUserId]);
        return;
      }
    }

    // Default: select individually
    setSelectedParticipants(prev => [...prev, targetUserId]);
  };

  // Normalize group selection from Picker (coerce 'null' or '' to null)
  const handleGroupChange = (value: any): void => {
    const normalized = value === null || value === undefined || value === 'null' || value === '' || value === NO_GROUP_VALUE ? null : value;
    setSelectedGroup(normalized);
  };

  /**
   * Gets the names of selected participants
   * 
   * @returns {string[]} Array of participant names
   */
  const getSelectedParticipantNames = (): string[] => {
    return selectedParticipants.map(userId => 
      users.find(u => u.id === userId)?.Name || 'Unknown User'
    );
  };

  /**
   * Filters users based on search query and selected group
   * Only shows users from the selected group
   * 
   * @returns {UserDoc[]} Filtered array of users
   */
  const getFilteredUsers = (): UserDoc[] => {
    const effectiveGroupId = getEffectiveSelectedGroupId();
    
    // If no group is selected, return empty array
    if (!effectiveGroupId) {
      return [];
    }
    
    // Get the selected group data
    const selectedGroupData = groups.find(g => g.id === effectiveGroupId);
    if (!selectedGroupData) {
      return [];
    }
    
    // Filter users to only include those in the selected group
    const groupUsers = users.filter(user => 
      selectedGroupData.MemberIds.includes(user.id)
    );
    
    // Apply search filter if there's a search query
    if (!userSearchQuery.trim()) return groupUsers;
    
    return groupUsers.filter(user => 
      user.Name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      user.Email.toLowerCase().includes(userSearchQuery.toLowerCase())
    );
  };

  // Returns a normalized group id if a real group is selected, otherwise null
  const getEffectiveSelectedGroupId = (): string | null => {
    if (!selectedGroup || selectedGroup === 'null' || selectedGroup === '' || selectedGroup === NO_GROUP_VALUE) return null;
    return selectedGroup;
  };

  // Determine if a user should be highlighted (selected or part of selected group)
  const isUserHighlighted = (candidateId: string): boolean => {
    const effectiveGroupId = getEffectiveSelectedGroupId();
    const selectedGroupData = effectiveGroupId ? groups.find(g => g.id === effectiveGroupId) : null;
    const isInSelectedGroup = selectedGroupData ? selectedGroupData.MemberIds.includes(candidateId) : false;
    const isExcluded = excludedGroupParticipants.includes(candidateId);
    const isSelf = candidateId === userId;
    return (
      selectedParticipants.includes(candidateId) ||
      ((isInSelectedGroup || isSelf) && !isExcluded)
    );
  };

  /**
   * FieldError component for displaying validation errors
   * 
   * @param {Object} props - Component props
   * @param {string | undefined} props.message - Error message to display
   * @returns {JSX.Element | null} Error message component or null
   */
  const FieldError = ({ message }: { message?: string }): JSX.Element | null =>
    message ? (
      <Paragraph fontSize={13} mt={2} color="#EF4444">{message}</Paragraph>
    ) : null;

  /**
   * InputLikeButton component for date/time picker triggers
   * 
   * @param {Object} props - Component props
   * @param {React.ReactNode} props.children - Button content
   * @param {() => void} props.onPress - Press handler
   * @param {boolean | undefined} props.disabled - Disabled state
   * @returns {JSX.Element} Button component styled like an input
   */
  const InputLikeButton = ({
    children,
    onPress,
    disabled,
  }: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
  }): JSX.Element => (

    <Button
      onPress={onPress}
      disabled={disabled}
      unstyled
      borderWidth={1}
      borderColor="$borderColor"
      rounded="$3"
      p={10}
      bg="$color1"
      verticalAlign="flex-start"
    >
      <Text style={{ fontSize: 16 }} color="$color">
        {children}
      </Text>
    </Button>
  );

  /**
   * FormGroup component for consistent form layout
   * 
   * @param {Object} props - Component props
   * @param {React.ReactNode} props.children - Form group content
   * @returns {JSX.Element} Form group wrapper
   */
  const FormGroup = ({ children }: { children: React.ReactNode }): JSX.Element => (
    <YStack mb={12}>{children}</YStack>

  );

  return (
      <SafeAreaWrapper>
      <YStack flex={1} bg="$background">
        <YStack p={20} pb={12}>
          <Text onPress={() => router.back()} color="$color9" fontWeight="600" style={{ fontSize: 16 }} mb={12}>
            ← Back
          </Text>
          <H2 verticalAlign="center" mb={2}>
            Create New Game Session
          </H2>
          <Paragraph verticalAlign="center" color="$color10" style={{ fontSize: 16 }} mb={16}>
            Set up a new game session for your group
          </Paragraph>
        </YStack>

        {!success ? (
          <ScrollView keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag">
            <YStack px={16} pb={20}>
              <Card
                backgroundColor="$color2"
                padding={16}
                borderRadius={12}
                shadowColor="$shadowColor"
                borderWidth={1}
                borderColor="$borderColor"
              >
                <YStack>
                  {/* Title */}
                  <YStack mb={12}>
                    <Label htmlFor="title" style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Event Title
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Enter event title (e.g., 'Weekend Tournament')"
                      autoCapitalize="words"
                      blurOnSubmit={false}
                       borderColor={errors.title ? "#EF4444" : "$borderColor"}
                      bg="$color1"
                    />
                    <FieldError message={errors.title} />
                  </YStack>  

                  {/* Game Date */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Game Date
                    </Label>
                    <InputLikeButton onPress={() => setShowGameDate(true)} >
                      {gameDate ? gameDate.toLocaleDateString() : 'Select date'}

                    </InputLikeButton>
                    {showGameDate && (
                      <DateTimePicker
                        value={gameDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={today}
                        onChange={onChangeGameDate}
                      />
                    )}
                    <FieldError message={errors.gameDate} />

                  </YStack>

                  {/* Game Time */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>

                      Game Time
                    </Label>
                    <InputLikeButton onPress={() => setShowGameTime(true)}>
                      {gameTime
                        ? gameTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Select time'}
                    </InputLikeButton>
                    {showGameTime && (
                      <DateTimePicker
                        value={gameTime}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={onChangeGameTime}
                      />
                    )}
                    <FieldError message={errors.gameTime} />
                  </YStack>

                  {/* Location */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Location
                    </Label>
                    <Input
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Enter game location"
                      autoCapitalize="words"
                      blurOnSubmit={false}
                       borderColor={errors.location ? "#EF4444" : "$borderColor"}
                      bg="$color1"
                    />
                    <FieldError message={errors.location} />
                  </YStack>

                  {/* Total Cost */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Total Cost (Optional)
                    </Label>
                    <Input
                      value={totalCost}
                      onChangeText={setTotalCost}
                      placeholder="Enter total cost (e.g., 50.00)"
                      keyboardType="numeric"
                      blurOnSubmit={false}
                       borderColor={errors.totalCost ? "#EF4444" : "$borderColor"}
                      bg="$color1"
                    />
                    <FieldError message={errors.totalCost} />
                  </YStack>

                  {/* Voting Toggle */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Enable Voting
                    </Label>
                    <XStack verticalAlign="center" space={12}>
                      <Button
                        size="$3"
                        bg={votingEnabled ? '$color9' : '$color3'}
                        color={votingEnabled ? '$color1' : '$color'}
                        onPress={() => setVotingEnabled(true)}
                        disabled={loading}
                      >
                        Yes
                      </Button>
                      <Button
                        size="$3"
                        bg={!votingEnabled ? '$color9' : '$color3'}
                        color={!votingEnabled ? '$color1' : '$color'}
                        onPress={() => setVotingEnabled(false)}
                        disabled={loading}
                      >
                        No
                      </Button>
                    </XStack>
                  </YStack>

                  {/* Voting Cutoff - Only show if voting is enabled */}
                  {votingEnabled && (
                  <YStack mb={12}>
                      <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Voting closes on:
                    </Label>
                                          <InputLikeButton onPress={() => setShowVotingCutoff(true)}>
                        {votingCutoff ? votingCutoff.toLocaleDateString() : 'Select date'}
                      </InputLikeButton>
                    {showVotingCutoff && (
                      <DateTimePicker
                        value={votingCutoff}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          minimumDate={new Date(today.setHours(0, 0, 0, 0))}
                        onChange={onChangeVotingCutoff}
                      />
                    )}
                    <FieldError message={errors.votingCutoff} />
                  </YStack>
                  )}

                  {/* Group Selection */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Group (Optional)
                    </Label>
                    {loadingGroups ? (
                      <YStack p={12} bg="$color3" verticalAlign="center">
                        <Text fontSize={14} color="$color10">
                          Loading your groups...
                        </Text>
                      </YStack>
                                        ) : (
                      <YStack>
                    <YStack borderWidth={1} borderColor="$borderColor" overflow="hidden" bg="$color1">
                          <Picker 
                            selectedValue={selectedGroup ?? NO_GROUP_VALUE} 
                            onValueChange={handleGroupChange} 
                            enabled={!loadingGroups && groupsLoaded}
                            style={{ 
                              backgroundColor: 'transparent',
                              color: Platform.OS === 'ios' ? '#000' : '#000'
                            }}
                          >
                            <Picker.Item 
                              label="No group selected" 
                              value={NO_GROUP_VALUE}
                              color={Platform.OS === 'ios' ? '#666' : undefined}
                            />
                        {groups.map((g) => (
                              <Picker.Item 
                                key={g.id} 
                                label={g.Name} 
                                value={g.id}
                                color={Platform.OS === 'ios' ? '#000' : undefined}
                              />
                        ))}
                      </Picker>
                    </YStack>
                        {getEffectiveSelectedGroupId() && (
                          <Card mt={4} p={8} bg="$color3" borderRadius="$2">
                            <Text fontSize={12} color="$color10">
                              Selected: {groups.find(g => g.id === getEffectiveSelectedGroupId())?.Name}
                            </Text>
                          </Card>
                        )}


                      </YStack>
                    )}
                  </YStack>

                                    {/* Individual Participants Selection */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Individual Participants 
                    </Label>
                    {!getEffectiveSelectedGroupId() ? (
                      <Card p={16} bg="$color3" borderRadius="$2">
                        <Text color="$color10" fontSize={14} style={{ textAlign: 'center' }}>
                          Please select a group first to choose individual participants
                        </Text>
                      </Card>
                    ) : (
                      <>
                        <Input
                          placeholder="Search group members by name or email..."
                          value={userSearchQuery}
                          onChangeText={setUserSearchQuery}
                          mb={8}
                          bg="$color1"
                          borderColor="$borderColor"
                          blurOnSubmit={false}
                        />
                        <YStack space="$2" height={200}>
                          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
                            {/* Selected users at the top */}
                            {getFilteredUsers()
                              .filter(user => isUserHighlighted(user.id))
                              .map((user) => (
                                <Card
                                  key={user.id}
                                  onPress={() => toggleParticipant(user.id)}
                                  disabled={loadingUsers}
                                  p={8}
                                  bg="$color9"
                                  borderWidth={1}
                                  borderColor="$color9"
                                  borderRadius="$2"
                                  mb={2}
                                  
                                >
                                  <Text
                                    fontSize={13}
                                    fontWeight="500"
                                    color="$color1"
                                  >
                                    {user.Name}
                                  </Text>
                                  <Text
                                    fontSize={11}
                                    color="$color1"
                                    mt={1}
                                  >
                                    {user.Email}
                                  </Text>
                                </Card>
                              ))}
                            
                            {/* Unselected users below */}
                            {getFilteredUsers()
                              .filter(user => !isUserHighlighted(user.id))
                              .map((user) => (
                                <Card
                                  key={user.id}
                                  onPress={() => toggleParticipant(user.id)}
                                  disabled={loadingUsers}
                                  p={8}
                                  bg="$color1"
                                  borderWidth={1}
                                  borderColor="$borderColor"
                                  borderRadius="$2"
                                  mb={2}
                                >
                                  <Text
                                    fontSize={13}
                                    fontWeight="500"
                                    color="$color"
                                  >
                                    {user.Name}
                                  </Text>
                                  <Text
                                    fontSize={11}
                                    color="$color10"
                                    mt={1}
                                  >
                                    {user.Email}
                                  </Text>
                                </Card>
                              ))}
                            
                            {getFilteredUsers().length === 0 && !loadingUsers && (
                              <Card p={16} bg="$color3" borderRadius="$2">
                                <Text color="$color10" fontSize={14} style={{ textAlign: 'center' }}>
                                  {userSearchQuery ? 'No group members found matching your search' : 'No group members available'}
                                </Text>
                              </Card>
                            )}
                            {loadingUsers && (
                              <Card p={16} bg="$color3" borderRadius="$2">
                                <Text color="$color10" fontSize={14} style={{ textAlign: 'center' }}>
                                  Loading group members...
                                </Text>
                              </Card>
                            )}
                          </ScrollView>
                        </YStack>
                      </>
                    )}
                    <FieldError message={errors.participants} />
                  </YStack>

                  {/* Participants Summary */}
                  <YStack mb={12}>
                    <Label style={{ fontSize: 16, fontWeight: '500' }} mb={4}>
                      Participants Summary
                    </Label>
                    <Card p={12} bg="$color3" borderRadius="$2">
                      {(() => {
                        const effectiveGroupId = getEffectiveSelectedGroupId();
                        const selectedGroupData = effectiveGroupId ? groups.find(g => g.id === effectiveGroupId) : null;
                        const groupMemberCount = selectedGroupData ? selectedGroupData.MemberIds.length : 0;
                        const individualCount = selectedParticipants.length + (!effectiveGroupId && !selectedParticipants.includes(userId) ? 1 : 0);
                        const totalParticipants = groupMemberCount + individualCount;
                        
                        return (
                          <>
                            <Text fontSize={14} fontWeight="500" mb={4}>
                              Total Participants: {totalParticipants}
                            </Text>
                            <Text fontSize={12} color="$color10">
                              Group: {effectiveGroupId ? `${selectedGroupData?.Name} (${groupMemberCount} members)` : 'No'} | Individuals: {individualCount}
                              {!effectiveGroupId && !selectedParticipants.includes(userId) && ' (including you)'}
                            </Text>

                            {totalParticipants < 2 && (
                              <Text fontSize={12} color="#EF4444" mt={4}>
                                ⚠️ Minimum 2 participants required
                              </Text>
                            )}
                          </>
                        );
                      })()}
                    </Card>
                  </YStack>

                  {/* Actions */}
                  <XStack flexDirection="row" justify="space-between" mt={12}>
                    <Button
                      flex={1}
                      bg="$color2"
                      color="$color"
                      onPress={handleCancel}
                      disabled={loading}
                      mx={4}
                    >
                      Cancel
                    </Button>
                    <Button
                      flex={1}
                      bg="$color9"
                      color="$color1"
                      opacity={loading ? 0.7 : 1}
                      onPress={handleSubmit}
                      disabled={loading}
                      mx={4}
                    >
                      {/* {loading ? 'Creating...' : 'Create Session'} */}
                      Create
                    </Button>
                  </XStack>
                </YStack>
              </Card>
            </YStack>
          </ScrollView>
        ) : (
          <YStack verticalAlign="center" justify="center" p={32}>
            <Text style={{ fontSize: 48 }} color="$color9" mb={12}>
              ✓
            </Text>
            <H2 verticalAlign="center" mb={8}>
              Game Session Created Successfully!
            </H2>
            <Paragraph verticalAlign="center" color="$color" style={{ fontSize: 16 }} mb={24}>
              Your game session has been created and participants will be notified.
            </Paragraph>
            <XStack justify="center" verticalAlign="center" space="$3" width="100%" mt={8}>
              <Button bg="$color2" color="$color" onPress={handleCreateAnother} minW={160} mx={4}>
                Create Another Session
              </Button>
              <Button bg="$color9" color="$color1" onPress={handleViewSessions} minW={160} mx={4}>
                View All Sessions
              </Button>
            </XStack>
          </YStack>
        )}
      </YStack>
      </SafeAreaWrapper>
  );
} 