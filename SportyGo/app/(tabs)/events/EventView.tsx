/**
 * EventView Component - Event details and voting interface
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth0 } from 'react-native-auth0';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/index';
import { castVote, listenVoteCounts, getEvent, getUserVote, hasEventStarted } from '../../../firebase/services_firestore2';
import { useConnectedUsers } from '@/hooks/useConnectedUsers';
import { VoteStatus } from '../../../firebase/types_index';
import { SafeAreaWrapper } from '@/components/SafeAreaWrapper';
import { YStack, XStack, Text, Paragraph, H3, Card, Button, ScrollView, Separator, Spinner, Theme } from 'tamagui';
import { deleteEvent } from '../../../firebase/services_firestore2';


type VoteFilter = 'all' | 'going' | 'maybe' | 'not';

export default function EventView() {
  // Route parameters and authentication
  const params = useLocalSearchParams();
  const eventId = params.eventId as string; // Use string for Firestore
  const { user } = useAuth0();
  const userId = user?.sub || 'default-user';

  // Component state
  const [eventData, setEventData] = useState<any>(null);
  const [currentFilter, setCurrentFilter] = useState<VoteFilter>('all');
  const [isVotingOpen, setIsVotingOpen] = useState(true);
  const [countdown, setCountdown] = useState('');
  const [userVoteStatus, setUserVoteStatus] = useState('Select your response above');
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Voting and UI state
  const [voteCounts, setVoteCounts] = useState({ going: 0, maybe: 0, not: 0 });
  const [userVote, setUserVote] = useState<null | VoteStatus>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [eventStarted, setEventStarted] = useState(false);

  // Names by category (UI enhancement)
  const [votersLoading, setVotersLoading] = useState(false);
  const [votersByStatus, setVotersByStatus] = useState<any>({ going: [], maybe: [], not: [] });
  const [allVotersWithStatus, setAllVotersWithStatus] = useState<any[]>([]);

  // Fetch connected users for voter list
  const { connectedUsers } = useConnectedUsers(userId);

  /**
   * Fetches event data and validates access
   * Loads event information and checks user permissions
   */
  useEffect(() => {
    if (!eventId) return;

    const fetchEventData = async () => {
      try {
        setIsLoading(true);
        const data = await getEvent(eventId);
        if (data) {
          setEventData(data);
          // Check if current user is the event creator (admin)
          setIsAdmin(data.CreatorID === userId);
          // Check if event has started
          setEventStarted(hasEventStarted(data.EventDate));
        } else {
          // Handle case where event doesn't exist
          Alert.alert('Error', 'Event not found');
          router.back();
        }
      } catch (error) {
        console.error('Error fetching event:', error);
        Alert.alert('Error', 'Failed to load event');
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventData();
  }, [eventId]);

  /**
   * Sets up real-time listener for vote count updates
   * Provides live updates of voting statistics
   */
  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = listenVoteCounts(eventId, (counts) => {
      setVoteCounts(counts);
    });
    return unsubscribe;
  }, [eventId]);

  /**
   * Fetches user's previous vote and updates UI
   * Loads existing vote data for the current user
   */
  useEffect(() => {
    if (!eventId || !userId) return;

    const fetchUserVote = async () => {
      try {
        const previousVote = await getUserVote(eventId, userId);
        setUserVote(previousVote);
        if (previousVote) {
          setUserVoteStatus(`You voted: ${previousVote.charAt(0).toUpperCase() + previousVote.slice(1)}`);
        } else {
          setUserVoteStatus('Select your response above');
        }
      } catch (error) {
        console.error('Error fetching user vote:', error);
      }
    };

    fetchUserVote();
  }, [eventId, userId]);

  /**
   * Manages countdown timer and voting status
   * Updates voting open/closed status based on cutoff time and event start
   */
  useEffect(() => {
    if (!eventData?.CutoffDate || eventData?.VotingEnabled === false) {
      setIsVotingOpen(false);
      setCountdown('No voting');
      return;
    }

    const votingCutoff = new Date(eventData.CutoffDate.toDate ? eventData.CutoffDate.toDate() : eventData.CutoffDate);

    const updateCountdown = () => {
      const now = new Date();
      const timeLeft = votingCutoff.getTime() - now.getTime();
      const eventStarted = hasEventStarted(eventData.EventDate);
      const startedEarly = eventData.StartedEarly === true;

      // Close voting if cutoff time has passed OR event has started OR started early
      if (timeLeft <= 0 || eventStarted || startedEarly) {
        setIsVotingOpen(false);
        if (startedEarly) {
          setCountdown('Event Started Early');
        } else if (eventStarted) {
          setCountdown('Event Started');
        } else {
          setCountdown('Voting Closed');
        }
        return;
      }

      setIsVotingOpen(true);

      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

      let countdownText = 'Closes in ';
      if (days > 0) {
        countdownText += `${days} day${days > 1 ? 's' : ''}, `;
      }
      countdownText += `${hours} hour${hours > 1 ? 's' : ''}`;

      if (days === 0 && hours < 2) {
        countdownText += `, ${minutes} minute${minutes > 1 ? 's' : ''}`;
      }

      setCountdown(countdownText);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [eventData]);

  /**
   * Fetches voter names per category and updates UI
   * Loads existing vote data for the current user
   */
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false as boolean;

    const loadVoters = async () => {
      try {
        setVotersLoading(true);
        const users = connectedUsers;
        const results = await Promise.all(
          users.map(async (u: any) => {
            try {
              const v = await getUserVote(eventId, u.id);
              return { user: u, vote: v } as { user: any; vote: 'going' | 'maybe' | 'not' | null };
            } catch {
              return { user: u, vote: null };
            }
          })
        );
        if (cancelled) return;
        const going = results.filter(r => r.vote === 'going').map(r => r.user);
        const maybe = results.filter(r => r.vote === 'maybe').map(r => r.user);
        const not = results.filter(r => r.vote === 'not').map(r => r.user);
        setVotersByStatus({ going, maybe, not });
        setAllVotersWithStatus(results.filter(r => !!r.vote));
      } finally {
        if (!cancelled) setVotersLoading(false);
      }
    };

    loadVoters();
    return () => { cancelled = true; };
  }, [eventId, voteCounts.going, voteCounts.maybe, voteCounts.not, connectedUsers]);

  /**
   * Handles user voting with validation and error handling
   * 
   * @param {VoteStatus} vote - The vote to cast ('going', 'maybe', 'not')
   */
  const handleVote = async (vote: VoteStatus): Promise<void> => {
    if (!eventData?.VotingEnabled) {
      Alert.alert('Voting Disabled', 'Voting is not enabled for this event.');
      return;
    }

    if (!isVotingOpen) {
      Alert.alert('Voting Closed', 'Voting has closed for this event.');
      return;
    }

    if (!eventId) {
      Alert.alert('Error', 'Event ID is missing.');
      return;
    }

    if (isVoting) {
      return; // Prevent double-voting
    }

    try {
      setIsVoting(true);
      await castVote(eventId, vote, userId);
      setUserVote(vote);
      setUserVoteStatus(`You voted: ${vote.charAt(0).toUpperCase() + vote.slice(1)}`);
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true })
      ]).start();
    } catch (error: any) {
      console.error('Error casting vote:', error);

      // Check if it's a time conflict error
      if (error.message && error.message.includes('conflicts with')) {
        Alert.alert('Time Conflict', error.message);
      } else {
        Alert.alert('Error', 'Failed to cast vote. Please try again.');
      }
    } finally {
      setIsVoting(false);
    }
  };

  /**
   * Handles early event start for admin users
   * Closes voting and enables attendance tracking
   */
  const handleStartEventEarly = async (): Promise<void> => {
    if (!eventId) {
      Alert.alert('Error', 'Event ID is missing.');
      return;
    }

    Alert.alert(
      'Start Event',
      'This will close voting and open attendance tracking. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Event',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update the event to mark it as started early
              const eventRef = doc(db, 'events', eventId);
              await updateDoc(eventRef, {
                StartedEarly: true,
                StartedEarlyAt: new Date()
              });

              // Refresh the event data by refetching
              const data = await getEvent(eventId);
              if (data) {
                setEventData(data);
                setIsAdmin(data.CreatorID === userId);
                setEventStarted(hasEventStarted(data.EventDate));
              }

              Alert.alert('Success', 'Event started! Voting is now closed and attendance tracking is available.', [
                {
                  text: 'OK',
                  onPress: () => {
                    router.push({
                      pathname: '/events/EventAttendance',
                      params: { eventId: eventId }
                    } as any);
                  }
                }
              ]);
            } catch (error) {
              console.error('Error starting event early:', error);
              Alert.alert('Error', 'Failed to start event early. Please try again.');
            }
          }
        }
      ]
    );
  };

  /**
   * Handles deleting the event
   */
  const handleDeleteEvent = async (): Promise<void> => {
    if (!isAdmin) {
      Alert.alert('Unauthorized', 'Only the event creator can delete this event.');
      return;
    }
    if (!eventId) {
      Alert.alert('Error', 'Event ID is missing.');
      return;
    }

    Alert.alert(
      'Delete Event',
      'This will permanently delete the event and its data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEvent(eventId);
              Alert.alert('Deleted', 'Event has been deleted.', [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                }
              ]);
            } catch (error) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete event. Please try again.');
            }
          }
        }
      ]
    );
  };

  /**
   * Gets the appropriate icon for a vote response
   * 
   * @param {string} response - The vote response ('going', 'maybe', 'not')
   * @returns {string} The icon character for the response
   */
  const getResponseIcon = (response: string): string => {
    const icons = { 'going': '✓', 'maybe': '?', 'not': '✗' };
    return icons[response as keyof typeof icons] || '';
  };

  /**
   * Calculates the total number of responses
   * 
   * @returns {number} Total number of vote responses
   */
  const getTotalResponses = (): number => {
    return voteCounts.going + voteCounts.maybe + voteCounts.not;
  };

  /**
   * Gets the count for the currently selected filter
   * 
   * @returns {number} Count for the current filter
   */
  const getFilteredCount = (): number => {
    if (currentFilter === 'all') {
      return getTotalResponses();
    }
    return voteCounts[currentFilter] || 0;
  };

  // Loading state (UI-only Tamagui)
  if (isLoading) {
    return (
      <SafeAreaWrapper>
        <YStack flex={1} bg="$background" p="$4" space="$4" justify="center" verticalAlign="center">
          <Spinner size="large" color="$color9" />
          <Text color="$color10">Loading event...</Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper>
      <ScrollView flex={1} bg="$background" showsVerticalScrollIndicator={false}>
        <YStack p="$4" space="$4">
          {/* Header */}
          <XStack justify="space-between" verticalAlign="center">
            <Button size="$3" bg="$color2" color="$color" borderColor="$borderColor" borderWidth={1} onPress={() => router.back()}>
              <Text color="$color">← Back</Text>
            </Button>
            {isAdmin && (
              <Button size="$3" bg="$danger" color="$color1" borderWidth={0} onPress={handleDeleteEvent}>
                <Text color="$color1">Delete</Text>
              </Button>
            )}
          </XStack>

          {/* Event Header */}
          <Card p="$4" bg="$color1" borderColor="$borderColor" borderWidth={1} borderRadius="$4">
            <YStack space="$3">
              <H3 color="$color">{eventData?.Title || 'Event'}</H3>

              <XStack space="$3" verticalAlign="start">
                <Text>📅</Text>
                <YStack flex={1}>
                  <Text color="$color10">Date & Time</Text>
                  <Text color="$color" fontWeight="700">
                    {eventData?.EventDate ?
                      (eventData.EventDate instanceof Date ?
                        eventData.EventDate.toDateString() :
                        new Date(eventData.EventDate.seconds ? eventData.EventDate.seconds * 1000 : eventData.EventDate).toDateString()
                      ) : 'Date not set'
                    }
                  </Text>
                  <Text color="$color10">
                    {eventData?.EventDate ?
                      (eventData.EventDate instanceof Date ?
                        eventData.EventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
                        new Date(eventData.EventDate.seconds ? eventData.EventDate.seconds * 1000 : eventData.EventDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      ) : 'Time not set'
                    }
                  </Text>
                </YStack>
              </XStack>

              <XStack space="$3" verticalAlign="start">
                <Text>📍</Text>
                <YStack flex={1}>
                  <Text color="$color10">Location</Text>
                  <Text color="$color" fontWeight="700">
                    {typeof eventData?.Location === 'string' ? eventData.Location :
                      (eventData?.Location && typeof eventData.Location === 'object' && eventData.Location._lat && eventData.Location._long)
                        ? `${eventData.Location._lat.toFixed(6)}, ${eventData.Location._long.toFixed(6)}`
                        : 'Location not specified'
                    }
                  </Text>
                </YStack>
              </XStack>

              {typeof eventData?.TotalCost === 'number' && Number.isFinite(eventData.TotalCost) && (
                <XStack space="$3" verticalAlign="start">
                  <Text>💰</Text>
                  <YStack flex={1}>
                    <Text color="$color10">Total Cost</Text>
                    <Text color="$color" fontWeight="700">{`$${eventData.TotalCost.toFixed(2)}`}</Text>
                    {voteCounts.going > 0 && (
                      <Text color="$color10">{`~$${(eventData.TotalCost / voteCounts.going).toFixed(2)} per person`}</Text>
                    )}
                  </YStack>
                </XStack>
              )}

              <XStack space="$3" verticalAlign="start">
                <Text>⏰</Text>
                <YStack flex={1}>
                  <Text color="$color10">
                    {eventData?.VotingEnabled === false ? 'Voting Status' : 'Voting Closes'}
                  </Text>
                  <Text color="$color" fontWeight="700">
                    {eventData?.VotingEnabled === false ? 'Voting Disabled' :
                      eventData?.CutoffDate ?
                        (eventData.CutoffDate instanceof Date ?
                          eventData.CutoffDate.toDateString() :
                          new Date(eventData.CutoffDate.seconds ? eventData.CutoffDate.seconds * 1000 : eventData.CutoffDate).toDateString()
                        ) : 'Date not set'
                    }
                  </Text>
                  {eventData?.VotingEnabled !== false && (
                    <Text color={isVotingOpen ? '$color9' : '$color'}>{countdown}</Text>
                  )}
                </YStack>
              </XStack>
            </YStack>
          </Card>

          {/* Voting Section */}
          <Card p="$4" bg="$color1" borderColor="$borderColor" borderWidth={1} borderRadius="$4">
            <YStack space="$3">
              <Text color="$color" fontWeight="800" fontSize={20}>Will you be attending?</Text>

              {eventData?.VotingEnabled === false ? (
                <YStack space="$2">
                  <Card p="$3" bg="$color2" borderColor="$borderColor" borderWidth={1}>
                    <Text color="$color" fontWeight="700">Voting Disabled</Text>
                    <Text color="$color10" mt="$2">
                      This event does not have voting enabled. Contact the event organizer for more information.
                    </Text>
                  </Card>
                </YStack>
              ) : (
                <YStack space="$3">
                  <XStack verticalAlign="center" space="$2">
                    <Card p="$2" bg={isVotingOpen ? ('$color3' as any) : ('$color2' as any)} borderColor="$borderColor" borderWidth={1}>
                      <Text color="$color">{isVotingOpen ? 'Voting Open' : 'Voting Closed'}</Text>
                    </Card>
                    {isVoting && (
                      <Text color="$color10">Submitting your vote...</Text>
                    )}
                  </XStack>

                  <XStack space="$2">
                    <Button
                      flex={1}
                      bg="$success"
                      color="$color1"
                      borderWidth={0}
                      p="$4"
                      minH="$8"
                      disabled={!isVotingOpen || isVoting}
                      onPress={() => handleVote('going')}
                      style={{ borderRadius: 10 }}
                    >
                      <YStack width="100%" verticalAlign="center" space="$1">
                        <Text color="$color1">✓</Text>
                        <Text color="$color1" fontWeight="700" fontSize="$5">Going</Text>
                        <Text color="$color1">{voteCounts.going}</Text>
                      </YStack>
                    </Button>
                    <Button
                      flex={1}
                      bg="$warning"
                      color="$color1"
                      borderWidth={0}
                      p="$4"
                      minH="$8"
                      disabled={!isVotingOpen || isVoting}
                      onPress={() => handleVote('maybe')}
                      style={{ borderRadius: 10 }}
                    >
                      <YStack width="100%" verticalAlign="center" space="$1">
                        <Text color="$color1">?</Text>
                        <Text color="$color1" fontWeight="700" fontSize="$5">Maybe</Text>
                        <Text color="$color1">{voteCounts.maybe}</Text>
                      </YStack>
                    </Button>
                    <Button
                      flex={1}
                      bg="$danger"
                      color="$color1"
                      borderWidth={0}
                      p="$4"
                      minH="$8"
                      disabled={!isVotingOpen || isVoting}
                      onPress={() => handleVote('not')}
                      style={{ borderRadius: 10 }}
                    >
                      <YStack width="100%" verticalAlign="center" space="$1">
                        <Text color="$color1">✗</Text>
                        <Text color="$color1" fontWeight="700" fontSize="$5">Not Going</Text>
                        <Text color="$color1">{voteCounts.not}</Text>
                      </YStack>
                    </Button>
                  </XStack>

                  <Separator />
                  <Text color="$color10" style={{ textAlign: 'center' }}>{userVoteStatus}</Text>
                </YStack>
              )}
            </YStack>
          </Card>

          {/* Vote Summary Section - Only show if voting is enabled */}
          {eventData?.VotingEnabled !== false && (
            <Card p="$4" bg="$color1" borderColor="$borderColor" borderWidth={1} borderRadius="$4">
              <YStack space="$3">
                <XStack justify="space-between" verticalAlign="center">
                  <Text color="$color" fontWeight="800" fontSize={20}>Vote Summary</Text>
                  <Text color="$color10">{getTotalResponses()} total responses</Text>
                </XStack>

                <XStack space="$2">
                  <Button style={{ flex: 1 }} minH="$6" minW="$5" bg={currentFilter === 'all' ? ('$color9') : ('$color2')} color={currentFilter === 'all' ? ('$color1') : ('$color')} onPress={() => setCurrentFilter('all')}>
                    <YStack width="100%" verticalAlign="center">
                      <Text color={currentFilter === 'all' ? '$color1' : '$color'}>All</Text>
                      <Text color={currentFilter === 'all' ? '$color1' : '$color10'}>{getTotalResponses()}</Text>
                    </YStack>
                  </Button>

                  <Button flex={1} minH="$6" minW="$5" bg={currentFilter === 'going' ? ('$color9' as any) : ('$color2' as any)} color={currentFilter === 'going' ? ('$color1' as any) : ('$color' as any)} onPress={() => setCurrentFilter('going')}>
                    <YStack width="100%" verticalAlign="center">
                      <Text color={currentFilter === 'going' ? '$color1' : '$color'}>Going</Text>
                      <Text color={currentFilter === 'going' ? '$color1' : '$color10'}>{voteCounts.going}</Text>
                    </YStack>
                  </Button>
                </XStack>
                <XStack space="$2">
                  <Button flex={1} minH="$6" minW="$7" bg={currentFilter === 'maybe' ? ('$color9' as any) : ('$color2' as any)} color={currentFilter === 'maybe' ? ('$color1' as any) : ('$color' as any)} onPress={() => setCurrentFilter('maybe')}>
                    <YStack width="100%" verticalAlign="center">
                      <Text color={currentFilter === 'maybe' ? '$color1' : '$color'}>Maybe</Text>
                      <Text color={currentFilter === 'maybe' ? '$color1' : '$color10'}>{voteCounts.maybe}</Text>
                    </YStack>
                  </Button>

                  <Button flex={1} minH="$6" minW="$7" bg={currentFilter === 'not' ? ('$color9' as any) : ('$color2' as any)} color={currentFilter === 'not' ? ('$color1' as any) : ('$color' as any)} onPress={() => setCurrentFilter('not')}>
                    <YStack width="100%" verticalAlign="center">
                      <Text color={currentFilter === 'not' ? '$color1' : '$color'}>Not Going</Text>
                      <Text color={currentFilter === 'not' ? '$color1' : '$color10'}>{voteCounts.not}</Text>
                    </YStack>
                  </Button>
                </XStack>

                <Separator />
                <Text color="$color10" style={{ textAlign: 'center' }}>
                  {currentFilter === 'all'
                    ? `Total responses: ${getTotalResponses()}`
                    : `${currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}: ${getFilteredCount()}`
                  }
                </Text>

                {/* Names list by current filter */}
                {votersLoading ? (
                  <XStack verticalAlign="center" p="$2">
                    <Spinner size="small" color="$color9" />
                    <Text m="$2" color="$color10">Loading names...</Text>
                  </XStack>
                ) : (
                  <YStack space="$2">
                    {currentFilter === 'all' ? (
                      allVotersWithStatus.length === 0 ? (
                        <Text color="$color10">No voters yet.</Text>
                      ) : (
                        allVotersWithStatus.map((r: any) => (
                          <XStack key={r.user.id} justify="space-between" p="$2" bg="$color2" borderColor="$borderColor" borderWidth={1} style={{ borderRadius: 10 }}>
                            <Text color="$color">{r.user.Name || r.user.Email || r.user.id}</Text>
                            <Text color="$color10">{r.vote === 'going' ? 'Going' : r.vote === 'maybe' ? 'Maybe' : 'Not Going'}</Text>
                          </XStack>
                        ))
                      )
                    ) : currentFilter === 'going' ? (
                      votersByStatus.going.length === 0 ? (
                        <Text color="$color10">No one yet.</Text>
                      ) : (
                        votersByStatus.going.map((u: any) => (
                          <Text key={u.id} color="$color">{u.Name || u.Email || u.id}</Text>
                        ))
                      )
                    ) : currentFilter === 'maybe' ? (
                      votersByStatus.maybe.length === 0 ? (
                        <Text color="$color10">No one yet.</Text>
                      ) : (
                        votersByStatus.maybe.map((u: any) => (
                          <Text key={u.id} color="$color">{u.Name || u.Email || u.id}</Text>
                        ))
                      )
                    ) : (
                      votersByStatus.not.length === 0 ? (
                        <Text color="$color10">No one yet.</Text>
                      ) : (
                        votersByStatus.not.map((u: any) => (
                          <Text key={u.id} color="$color">{u.Name || u.Email || u.id}</Text>
                        ))
                      )
                    )}
                  </YStack>
                )}
              </YStack>
            </Card>
          )}

          {/* Event Management Section - Admin only, at the bottom */}
          {isAdmin && (
            <Theme name="earthy-sport-light">
              <Card
                backgroundColor="$color2"
                padding="$4"
                borderRadius="$4"
                borderWidth={1}
                borderColor="$borderColor"
              >
                <YStack space="$3">
                  <H3 color="$color" fontWeight="600">
                    Event Management
                  </H3>

                  {/* Single button that changes based on event status */}
                  {(eventStarted || eventData?.StartedEarly === true) ? (
                    <Button
                      bg="$color8"
                      color="$color1"
                      size="$4"
                      onPress={() => {
                        router.push({
                          pathname: '/events/EventAttendance',
                          params: { eventId: eventId }
                        } as any);
                      }}
                    >
                      <Text color="$color1" fontWeight="600">
                        📋 Manage Attendance
                      </Text>
                    </Button>
                  ) : (
                    <Button
                      bg="$color9"
                      color="$color1"
                      size="$4"
                      onPress={handleStartEventEarly}
                    >
                      <Text color="$color1" fontWeight="600">
                        🚀 Start Event
                      </Text>
                    </Button>
                  )}
                </YStack>
              </Card>
            </Theme>
          )}
        </YStack>
      </ScrollView>
    </SafeAreaWrapper>
  );
}

