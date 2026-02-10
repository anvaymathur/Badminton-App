/**
 * @fileoverview EventsList Component
 * 
 * Displays and manages badminton events with real-time voting functionality.
 * Features search, filtering, and navigation to event details and creation.
 */

import React from 'react';

import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { listenGroupEvents, listenUserGroupEvents, listenAllEvents, getVoteCounts, getUserVote, getUserGroups, hasEventStarted } from '../../../firebase/services_firestore2';
import { VoteStatus } from '../../../firebase/types_index';
import { useAuth0 } from 'react-native-auth0';
import { YStack, XStack, Text, Card, ScrollView, Button, Input, Paragraph, H2 } from 'tamagui';
import { SafeAreaWrapper } from '@/components/SafeAreaWrapper';

/**
 * Interface for mapped event data used in the UI
 */
interface MappedEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  totalCost?: number;
  group: string;
  individualParticipants: number;
  description: string;
  attendeeCount: number;
  votingCutoff: string;
  isVotingOpen: boolean;
  userVote: VoteStatus | null;
  eventDate: Date;
  votingEnabled: boolean;
  eventStarted: boolean;
  isAdmin: boolean;
}

/**
 * Filter options for the events list
 */
type FilterType = 'all' | 'voting-open' | 'voting-closed' | 'my-events';

/**
 * Main EventsList component that displays and manages badminton events
 * 
 * @returns {JSX.Element} The rendered events list component
 */
export default function EventsList() {
  // State management for events and UI
  const [events, setEvents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [mappedEvents, setMappedEvents] = useState<MappedEvent[]>([]);
  const [userGroups, setUserGroups] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingVoteData, setLoadingVoteData] = useState(false);
  
  // Auth and routing
  const { user } = useAuth0();
  const userId = user?.sub || 'default-user';
  const params = useLocalSearchParams();
  const GROUP_ID = params.groupId as string;

  /**
   * Parses Firestore date objects to JavaScript Date objects
   * @param {any} date - The date to parse
   * @returns {Date} The parsed JavaScript Date object
   */
  const parseFirestoreDate = (date: any): Date => {
    if (date instanceof Date) return date;
    return new Date(date.seconds ? date.seconds * 1000 : date);
  };


  /**
   * Formats a date to a readable string format
   * @param {any} date - The date to format
   * @returns {string} Formatted date string
   */
  const formatDate = (date: any): string => parseFirestoreDate(date).toDateString();

  /**
   * Formats a date to a readable time format
   * @param {any} date - The date to format
   * @returns {string} Formatted time string (HH:MM)
   */
  const formatTime = (date: any): string => parseFirestoreDate(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /**
   * Formats location data to a readable string
   * @param {any} location - The location data (string or coordinate object)
   * @returns {string} Formatted location string
   */
  const formatLocation = (location: any): string => {

    if (typeof location === 'string') return location;
    if (location?._lat && location?._long) return `${location._lat.toFixed(6)}, ${location._long.toFixed(6)}`;
    return 'Location not specified';
  };



  /**
   * Maps raw event data to UI-friendly format with vote counts and user status
   * @param {any} event - Raw event data from Firestore
   * @param {any} voteCounts - Vote count data for the event
   * @param {any} userVote - User's vote for this event
   * @returns {MappedEvent} Formatted event data for UI display
   */
  const mapEventToUI = (event: any, voteCounts: any, userVote: any): MappedEvent => ({

    id: event.id || event.docId || event._id,
    title: event.Title,
    date: formatDate(event.EventDate),
    time: formatTime(event.EventDate),
    location: formatLocation(event.Location),
    group: event.GroupIDs && event.GroupIDs.length > 0 ? 'Group selected' : 'No group',
    individualParticipants: event.IndividualParticipantIDs ? event.IndividualParticipantIDs.length : 0,
    description: event.Title,
    attendeeCount: event.VotingEnabled !== false ? (voteCounts.going + voteCounts.maybe + voteCounts.not) : 0,
    votingCutoff: event.CutoffDate ? formatDate(event.CutoffDate) : 'No voting',
    isVotingOpen: event.VotingEnabled !== false && event.CutoffDate ? 
      new Date() < parseFirestoreDate(event.CutoffDate) &&
      !hasEventStarted(event.EventDate) && !event.StartedEarly : false,
    userVote: event.VotingEnabled !== false ? userVote : null,
    eventDate: parseFirestoreDate(event.EventDate),
    votingEnabled: event.VotingEnabled !== false,
    eventStarted: hasEventStarted(event.EventDate),
    isAdmin: event.CreatorID === userId,
  });

  /**
   * Fetches user's groups on component mount
   * Sets up real-time listener for user's group events
   */
  useEffect(() => {
    const fetchUserGroups = async () => {
      if (user && user.sub) {
        try {
          setLoadingGroups(true);
          const groups = await getUserGroups(user.sub);
          const groupIds = groups.map(group => group.id);
          setUserGroups(groupIds);
        } catch (error) {
          console.error('Error fetching user groups:', error);
          setUserGroups([]);
        } finally {
          setLoadingGroups(false);
        }
      } else {
        setUserGroups([]);
        setLoadingGroups(false);
      }
    };

    fetchUserGroups();
  }, [user]);
  /**
   * Sets up real-time listeners for events based on user's groups
   * Falls back to single group or all events if no user groups found
   */
  useEffect(() => {
    if (loadingGroups) return; // Wait for groups to load first
    
    setLoadingEvents(true);
    
    if (userGroups.length > 0) {
      const unsubscribe = listenUserGroupEvents(userGroups, userId, (eventsList) => {
        setEvents(eventsList);
        setLoadingEvents(false);
      });
      return () => unsubscribe();
    } else if (GROUP_ID) {
      // Fallback to single group if no user groups found
      const unsubscribe = listenGroupEvents(GROUP_ID, (eventsList) => {
        setEvents(eventsList);
        setLoadingEvents(false);
      });
      return () => unsubscribe();
    } else {
      // Fallback to show events where user is an individual participant
      const unsubscribe = listenAllEvents(userId, (eventsList) => {
        setEvents(eventsList);
        setLoadingEvents(false);
      });
      return () => unsubscribe();
    }
  }, [userGroups, GROUP_ID, userId, loadingGroups]);

  /**
   * Fetches vote counts and user votes for all events
   * Optimized with parallel API calls for better performance
   */
  useEffect(() => {
    const fetchEventsWithVoteCounts = async () => {
      if (events.length === 0) {
        setMappedEvents([]);
        return;
      }

      setLoadingVoteData(true);
      
      try {
        const eventsWithCounts = await Promise.all(
          events.map(async (event) => {
            try {
              let voteCounts = { going: 0, maybe: 0, not: 0 };
              let userVote = null;
              
              if (event.VotingEnabled !== false) {
                const [voteCountsResult, userVoteResult] = await Promise.all([
                  getVoteCounts(event.id),
                  getUserVote(event.id, userId)
                ]);
                voteCounts = voteCountsResult;
                userVote = userVoteResult;
              }
              
              const totalAttendees = event.VotingEnabled !== false ? (voteCounts.going + voteCounts.maybe + voteCounts.not) : 0;
            
            return {
              id: event.id || event.docId || event._id,
              title: event.Title,
              date: event.EventDate instanceof Date ? event.EventDate.toDateString() : new Date(event.EventDate.seconds ? event.EventDate.seconds * 1000 : event.EventDate).toDateString(),
              time: event.EventDate instanceof Date ? event.EventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(event.EventDate.seconds ? event.EventDate.seconds * 1000 : event.EventDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              location: typeof event.Location === 'string' ? event.Location : 
                        (event.Location && typeof event.Location === 'object' && event.Location._lat && event.Location._long) 
                          ? `${event.Location._lat.toFixed(6)}, ${event.Location._long.toFixed(6)}` 
                          : 'Location not specified',
              totalCost: event.TotalCost,
              group: event.GroupIDs && event.GroupIDs.length > 0 ? 'Group selected' : 'No group',
              individualParticipants: event.IndividualParticipantIDs ? event.IndividualParticipantIDs.length : 0,
              description: event.Title,
              attendeeCount: totalAttendees,
              votingCutoff: event.CutoffDate ? (event.CutoffDate instanceof Date ? event.CutoffDate.toDateString() : new Date(event.CutoffDate.seconds ? event.CutoffDate.seconds * 1000 : event.CutoffDate).toDateString()) : 'No voting',
              isVotingOpen: event.VotingEnabled !== false && event.CutoffDate ? 
                new Date() < (event.CutoffDate instanceof Date ? event.CutoffDate : new Date(event.CutoffDate.seconds ? event.CutoffDate.seconds * 1000 : event.CutoffDate)) &&
                !hasEventStarted(event.EventDate) && !event.StartedEarly : false,
              userVote: event.VotingEnabled !== false ? userVote : null,
              eventDate: event.EventDate instanceof Date ? event.EventDate : new Date(event.EventDate.seconds ? event.EventDate.seconds * 1000 : event.EventDate),
              votingEnabled: event.VotingEnabled !== false,
               eventStarted: hasEventStarted(event.EventDate),
               isAdmin: event.CreatorID === userId,
             };
          } catch (error) {
            console.error('Error fetching vote counts for event:', event.id, error);
            return {
              id: event.id || event.docId || event._id,
              title: event.Title,
              date: event.EventDate instanceof Date ? event.EventDate.toDateString() : new Date(event.EventDate.seconds ? event.EventDate.seconds * 1000 : event.EventDate).toDateString(),
              time: event.EventDate instanceof Date ? event.EventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(event.EventDate.seconds ? event.EventDate.seconds * 1000 : event.EventDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              location: typeof event.Location === 'string' ? event.Location : 
                        (event.Location && typeof event.Location === 'object' && event.Location._lat && event.Location._long) 
                          ? `${event.Location._lat.toFixed(6)}, ${event.Location._long.toFixed(6)}` 
                          : 'Location not specified',
              totalCost: event.TotalCost,
              group: event.GroupIDs && event.GroupIDs.length > 0 ? 'Group selected' : 'No group',
              individualParticipants: event.IndividualParticipantIDs ? event.IndividualParticipantIDs.length : 0,
              description: event.Title,
              attendeeCount: 0, // Fallback if vote counts fail
              votingCutoff: event.CutoffDate ? (event.CutoffDate instanceof Date ? event.CutoffDate.toDateString() : new Date(event.CutoffDate.seconds ? event.CutoffDate.seconds * 1000 : event.CutoffDate).toDateString()) : 'No voting',
              isVotingOpen: event.VotingEnabled !== false && event.CutoffDate ? 
                new Date() < (event.CutoffDate instanceof Date ? event.CutoffDate : new Date(event.CutoffDate.seconds ? event.CutoffDate.seconds * 1000 : event.CutoffDate)) &&
                !hasEventStarted(event.EventDate) && !event.StartedEarly : false,
              userVote: null,
              eventDate: event.EventDate instanceof Date ? event.EventDate : new Date(event.EventDate.seconds ? event.EventDate.seconds * 1000 : event.EventDate),
                             votingEnabled: event.VotingEnabled !== false,
               hasTimeConflict: false, // Temporarily disabled for performance
               conflictingEvent: null, // Temporarily disabled for performance
               eventStarted: hasEventStarted(event.EventDate),
               isAdmin: event.CreatorID === userId,
             };
          }
        })
      );
      
        // Sort events by date (earliest first)
        const sortedEvents = eventsWithCounts.sort((a, b) => {
          return a.eventDate.getTime() - b.eventDate.getTime();
        });
        
        setMappedEvents(sortedEvents);
      } catch (error) {
        console.error('Error fetching vote data:', error);
        // Fallback: show events without vote data
        const fallbackEvents = events.map(event => ({
          id: event.id || event.docId || event._id,
          title: event.Title,
          date: formatDate(event.EventDate),
          time: formatTime(event.EventDate),
          location: formatLocation(event.Location),
          totalCost: event.TotalCost,
          group: event.GroupIDs && event.GroupIDs.length > 0 ? 'Group selected' : 'No group',
          individualParticipants: event.IndividualParticipantIDs ? event.IndividualParticipantIDs.length : 0,
          description: event.Title,
          attendeeCount: 0,
          votingCutoff: event.CutoffDate ? formatDate(event.CutoffDate) : 'No voting',
          isVotingOpen: event.VotingEnabled !== false && event.CutoffDate ? 
            new Date() < parseFirestoreDate(event.CutoffDate) &&
            !hasEventStarted(event.EventDate) && !event.StartedEarly : false,
          userVote: null,
          eventDate: parseFirestoreDate(event.EventDate),
          votingEnabled: event.VotingEnabled !== false,
          eventStarted: hasEventStarted(event.EventDate),
          isAdmin: event.CreatorID === userId,
        }));
        setMappedEvents(fallbackEvents);
      } finally {
        setLoadingVoteData(false);
      }
    };

    fetchEventsWithVoteCounts();
  }, [events, userId]);

  /**
   * Filters events based on search query and selected filter
   * 
   * @returns {MappedEvent[]} Filtered array of events
   */
  const filteredEvents = mappedEvents.filter((event: MappedEvent) => {
    const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (event.group && event.group.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (typeof event.location === 'string' && event.location.toLowerCase().includes(searchQuery.toLowerCase()));
    

    const matchesFilter = selectedFilter === 'all' ||
                         (selectedFilter === 'voting-open' && event.isVotingOpen) ||
                         (selectedFilter === 'voting-closed' && !event.isVotingOpen) ||
                         (selectedFilter === 'my-events' && event.userVote === 'going');
    return matchesSearch && matchesFilter;
  });

  /**
   * Calculates and formats the time until an event
   * 
   * @param {string} eventDate - The event date string
   * @returns {string} Human-readable time until event (e.g., "Tomorrow", "In 3 days")
   */
  const getTimeUntilEvent = (eventDate: string): string => {
    const eventDateObj = new Date(eventDate);
    const now = new Date();
    const timeDiff = eventDateObj.getTime() - now.getTime();
    
    // Check if event is in the past
    if (timeDiff < 0) {
      const daysAgo = Math.floor(Math.abs(timeDiff) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) return 'Today';
      if (daysAgo === 1) return 'Yesterday';
      if (daysAgo < 7) return `${daysAgo} days ago`;
      const weeksAgo = Math.floor(daysAgo / 7);
      return `${weeksAgo} week${weeksAgo > 1 ? 's' : ''} ago`;
    }    
    
    // Event is in the future
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `In ${days} days`;
    const weeks = Math.floor(days / 7);
    return `In ${weeks} week${weeks > 1 ? 's' : ''}`;
  };

  /**
   * Handles navigation to event details when an event card is pressed
   * 
   * @param {MappedEvent} event - The event to navigate to
   */
  const handleEventPress = (event: MappedEvent): void => {

    // Navigate to the EventView with the event data
    if (!event.id) {
      console.error('Event ID is missing:', event);
      return;
    }
    router.push({
      pathname: '/events/EventView',
      params: { eventId: event.id.toString() }
    });
  };

  // UI (Tamagui)
  return (
    <SafeAreaWrapper>
      <YStack flex={1} bg="$background">
        {/* Header */}
        <YStack bg="$color1" px="$4" py="$4" borderBottomWidth={1} borderColor="$borderColor">
          <H2 color="$color" mb="$2" style={{ fontSize: 28, fontWeight: 'bold' }}>
            Upcoming Events
          </H2>
          <Paragraph color="$color10" style={{ fontSize: 16 }}>
            {loadingGroups ? 'Loading your groups...' : 
             loadingEvents ? 'Loading events...' :
             loadingVoteData ? 'Loading event details...' :
             `${filteredEvents.length} events found`}
          </Paragraph>
        </YStack>

        {/* Search and Filter */}
        <YStack bg="$color1" px="$4" py="$3" borderBottomWidth={1} borderColor="$borderColor">
          <Input
            value={searchQuery}
            onChangeText={(text: any) => setSearchQuery(text)}
            placeholder="Search events..."
            placeholderTextColor="$color10"
            bg="$color1"
            borderWidth={1}
            borderColor="$borderColor"
            px="$4"
            py="$3"
            mb="$3"
          />
          <XStack>
            <Button
              flex={1}
              p="$2"
              borderWidth={1}
              mx="$2"
              bg={selectedFilter === 'all' ? ('$color9' as any) : ('$color2' as any)}
              borderColor={selectedFilter === 'all' ? ('$color9' as any) : ('$borderColor' as any)}
              onPress={() => setSelectedFilter('all')}
            >
              <Text style={{ fontSize: 12, fontWeight: '600' }} color={selectedFilter === 'all' ? ('$color1' as any) : ('$color' as any)}>All</Text>
            </Button>
            <Button
              flex={1}
              p="$2"
              borderWidth={1}
              mx="$2"
              bg={selectedFilter === 'my-events' ? ('$color9' as any) : ('$color2' as any)}
              borderColor={selectedFilter === 'my-events' ? ('$color9' as any) : ('$borderColor' as any)}
              onPress={() => setSelectedFilter('my-events')}
            >
              <Text style={{ fontSize: 12, fontWeight: '600' }} color={selectedFilter === 'my-events' ? ('$color1' as any) : ('$color' as any)}>My Events</Text>
            </Button>
            <Button
              flex={1}
              p="$2"
              borderWidth={1}
              mx="$2"
              bg={selectedFilter === 'voting-open' ? ('$color9' as any) : ('$color2' as any)}
              borderColor={selectedFilter === 'voting-open' ? ('$color9' as any) : ('$borderColor' as any)}
              onPress={() => setSelectedFilter('voting-open')}
            >
              <Text style={{ fontSize: 12, fontWeight: '600' }} color={selectedFilter === 'voting-open' ? ('$color1' as any) : ('$color' as any)}>Voting Open</Text>
            </Button>
            <Button
              flex={1}
              p="$2"
              borderWidth={1}
              mx="$2"
              bg={selectedFilter === 'voting-closed' ? ('$color9' as any) : ('$color2' as any)}
              borderColor={selectedFilter === 'voting-closed' ? ('$color9' as any) : ('$borderColor' as any)}
              onPress={() => setSelectedFilter('voting-closed')}
            >
              <Text style={{ fontSize: 12, fontWeight: '600' }} color={selectedFilter === 'voting-closed' ? ('$color1' as any) : ('$color' as any)}>Voting Closed</Text>
            </Button>
          </XStack>
        </YStack>

        {/* Events List */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 12, paddingTop: 12 }} >
          {filteredEvents.length === 0 ? (
            <YStack flex={1} justify="center" py={60} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 48, textAlign: 'center' }} mb="$3">📅</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center' }} color="$color" mb="$2">
                {loadingGroups ? 'Loading groups...' :
                 loadingEvents ? 'Loading events...' :
                 loadingVoteData ? 'Loading event details...' :
                 'No events found'}
              </Text>
              <Paragraph color="$color10" style={{ fontSize: 14, textAlign: 'center' }}>
                {loadingGroups || loadingEvents || loadingVoteData ? 
                 'Please wait while we load your events' : 
                 'Try adjusting your search or filters'}
              </Paragraph>
            </YStack>
          ) : (
            filteredEvents.map((event: MappedEvent) => (
              <Card
                key={event.id}
                bg="$color2"
                p="$4"
                mb="$3"
                elevation={2}
                style={{ borderRadius: 12 }}
                onPress={() => handleEventPress(event)}
              >
                <YStack>
                  {/* Card Header */}
                  <XStack justify="space-between" verticalAlign="start" mb="$3">
                    <XStack verticalAlign="center" space="$2">
                      <YStack px="$2" py="$1" style={{ borderRadius: 12 }} bg={
                        event.votingEnabled ? (event.isVotingOpen ? ('$color3' as any) : ('$color2' as any)) : ('$color2' as any)
                      }>
                        <Text style={{ fontSize: 10, fontWeight: '600' }}>
                          {!event.votingEnabled ? 'No Voting' : event.isVotingOpen ? 'Voting Open' : 'Voting Closed'}
                        </Text>
                      </YStack>
                      {event.userVote === 'going' && event.votingEnabled && (
                        <YStack ml="$2" px="$2" py="$1" style={{ borderRadius: 8 }} bg="$color9">
                          <Text style={{ fontSize: 10, fontWeight: '600' }} color="$color1">
                            Going
                          </Text>
                        </YStack>
                      )}
                      {event.isAdmin && event.eventStarted && (
                        <YStack ml="$2" px="$2" py="$1" style={{ borderRadius: 8 }} bg="$color9">
                          <Text style={{ fontSize: 10, fontWeight: '600' }} color="$color1">
                            📋 Manage
                          </Text>
                        </YStack>
                      )}
                    </XStack>
                    <YStack px="$2" py="$1" style={{ borderRadius: 12 }} bg="$color9">
                      <Text style={{ fontSize: 10, fontWeight: '600' }} color="$color1">{event.group}</Text>
                    </YStack>
                  </XStack>

                  {/* Title */}
                  <Text style={{ fontSize: 18, fontWeight: 'bold' }} color="$color" mb="$2">
                    {event.title}
                  </Text>

                  {/* Details */}
                  <YStack space="$3" mb="$4">
                    <XStack verticalAlign="start" justify="space-between">
                      <XStack verticalAlign="start" flex={1}>
                        <Text style={{ fontSize: 16, marginRight: 8, marginTop: 2 }}>📅</Text>
                        <YStack flex={1}>
                          <Text style={{ fontSize: 12 }} color="$color10" mb="$1">
                            Date & Time
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '600' }} color="$color">
                            {event.date}
                          </Text>
                          <Text style={{ fontSize: 12 }} color="$color10" mt="$1">
                            {event.time}
                          </Text>
                        </YStack>
                      </XStack>
                      <XStack verticalAlign="start" flex={1} justify="flex-end">
                        <Text style={{ fontSize: 16, marginRight: 8, marginTop: 2 }}>📍</Text>
                        <YStack flex={1}>
                          <Text style={{ fontSize: 12 }} color="$color10" mb="$1">
                            Location
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '600' }} color="$color">
                            {event.location}
                          </Text>
                        </YStack>
                      </XStack>
                    </XStack>

                    {event.totalCost !== undefined && event.totalCost !== null && (
                      <XStack mt="$2" justify="flex-start">
                        <Text style={{ fontSize: 16, marginRight: 8, marginTop: 2 }}>💰</Text>
                        <YStack>
                          <Text style={{ fontSize: 12 }} color="$color10" mb="$1">
                            Total Cost
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: '600' }} color="$color">
                            ${event.totalCost.toFixed(2)}
                          </Text>
                        </YStack>
                      </XStack>
                    )}
                  </YStack>

                  {/* Footer */}
                  <XStack justify="space-between" verticalAlign="center" pt="$3" borderTopWidth={1} borderColor="$borderColor">
                    <XStack verticalAlign="center">
                      <Text style={{ fontSize: 14, marginRight: 4 }}>👥</Text>
                      <Text style={{ fontSize: 12 }} color="$color10">
                        {event.votingEnabled ? `${event.attendeeCount} attending` : 'No attendance tracking'}
                      </Text>
                    </XStack>
                    <Text style={{ fontSize: 12, fontWeight: '600' }} color="$color9">
                      {getTimeUntilEvent(event.date)}
                    </Text>
                  </XStack>

                  {/* Overlay button for full-card press on web */}
                  <Button
                    position="absolute"
                    t={0}
                    l={0}
                    r={0}
                    b={0}
                    opacity={0}
                    onPress={() => handleEventPress(event)}
                  />
                </YStack>
              </Card>
            ))
          )}
        </ScrollView>

        {/* Floating Action Button */}
        <Button
          position="absolute"
          b={24}
          l={24}
          width={56}
          height={56}
          bg="$color9"
          onPress={() => router.push('/events/CreateGameSession')}
          style={{ borderRadius: 28 }}
        >
          <Text fontSize="$8" fontWeight="bold" color="$color1">+</Text>
        </Button>
      </YStack>
    </SafeAreaWrapper>
  );
}
