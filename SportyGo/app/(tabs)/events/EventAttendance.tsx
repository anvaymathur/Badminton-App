/**
 * EventAttendance Component - Attendance tracking for events
 */

import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getEvent, getUserVote, updateAttendance, getAttendanceRecords, getGroupById, getUsersByIds } from '../../../firebase/services_firestore2';
import { useConnectedUsers } from '@/hooks/useConnectedUsers';
import { useAuth0 } from 'react-native-auth0';
import { SafeAreaWrapper } from '@/components/SafeAreaWrapper';
import { YStack, XStack, Text, Card, ScrollView, Button, Paragraph, H3 } from 'tamagui';


interface AttendanceRecord {
  userId: string;
  userName: string;
  userEmail: string;
  votedStatus: 'going' | 'maybe' | 'not' | null;
  hasArrived: boolean;
  arrivalTime?: Date;
}

export default function EventAttendance() {
  // Route parameters and authentication
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;
  const { user } = useAuth0();
  const userId = user?.sub || 'default-user';

  // Component state
  const [eventData, setEventData] = useState<any>(null);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch connected users for fallback and voting checks
  const { connectedUsers } = useConnectedUsers(userId);

  /**
   * Fetches event data and validates admin access
   * Loads event information and checks if current user is the event creator
   */
  useEffect(() => {
    const fetchEventData = async () => {
      if (!eventId) return;

      try {
        setLoading(true);
        const data = await getEvent(eventId);
        if (data) {
          setEventData(data);
          // Check if current user is the event creator (admin)
          setIsAdmin(data.CreatorID === userId);
        } else {
          Alert.alert('Error', 'Event not found');
          router.back();
        }
      } catch (error) {
        console.error('Error fetching event:', error);
        Alert.alert('Error', 'Failed to load event');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchEventData();
  }, [eventId, userId]);

  /**
   * Fetches attendance data for all participants
   * If voting is enabled, includes users who voted 'going' or 'maybe'.
   * If voting is disabled, uses selected participants (group + individuals).
   */
  useEffect(() => {
    const fetchAttendanceData = async () => {
      if (!eventData || !isAdmin) return;

      try {
        const existingAttendance = await getAttendanceRecords(eventId).catch(() => []);

        if (eventData?.VotingEnabled === false) {
          // Build participant list from group and individuals
          const groupIds: string[] = Array.isArray(eventData.GroupIDs) ? eventData.GroupIDs : [];
          const individualIdsRaw: string[] = Array.isArray(eventData.IndividualParticipantIDs) ? eventData.IndividualParticipantIDs : [];

          // Ensure at least creator is included if nothing else was selected
          const individualIds = individualIdsRaw.length === 0 && groupIds.length === 0 && eventData?.CreatorID
            ? [eventData.CreatorID]
            : individualIdsRaw;

          // Gather group member IDs by loading groups in parallel
          let groupMemberIds: string[] = [];
          if (groupIds.length > 0) {
            const groups = await Promise.all(groupIds.map((gid) => getGroupById(gid).catch(() => null)));
            groupMemberIds = groups
              .filter((g: any) => g && Array.isArray(g.MemberIds))
              .flatMap((g: any) => g.MemberIds as string[]);

            const uniqueIds = Array.from(new Set([...individualIds, ...groupMemberIds]));
            const users = await getUsersByIds(uniqueIds).catch(async () => {
              // Fallback: use connected users and filter locally
              const allUsers = connectedUsers;
              const setIds = new Set(uniqueIds);
              return allUsers.filter((u: any) => setIds.has(u.id));
            });

            // Build attendance records, including placeholders for missing profiles
            const fetchedIdSet = new Set(users.map((u: any) => u.id));
            const missingIds = uniqueIds.filter(id => !fetchedIdSet.has(id));

            const attendanceRecords: AttendanceRecord[] = [
              ...users.map((u: any) => {
                const existingRecord = existingAttendance.find((r: any) => r.userId === u.id);
                return {
                  userId: u.id,
                  userName: u.Name,
                  userEmail: u.Email,
                  votedStatus: null,
                  hasArrived: existingRecord ? existingRecord.hasArrived : false,
                  arrivalTime: existingRecord ? existingRecord.arrivalTime : undefined,
                };
              }),
              ...missingIds.map((id) => {
                const existingRecord = existingAttendance.find((r: any) => r.userId === id);
                return {
                  userId: id,
                  userName: 'Unknown User',
                  userEmail: '',
                  votedStatus: null,
                  hasArrived: existingRecord ? existingRecord.hasArrived : false,
                  arrivalTime: existingRecord ? existingRecord.arrivalTime : undefined,
                };
              })
            ];

            setAttendanceList(attendanceRecords);
            return;
          } else {
            // No group selected; use only individuals
            const uniqueIds = Array.from(new Set(individualIds));

            // If still empty, include creator as last-resort fallback
            const ensuredIds = uniqueIds.length === 0 && eventData?.CreatorID ? [eventData.CreatorID] : uniqueIds;

            const users = ensuredIds.length > 0
              ? await getUsersByIds(ensuredIds)
              : [];

            const fetchedIdSet = new Set(users.map((u: any) => u.id));
            const missingIds = ensuredIds.filter(id => !fetchedIdSet.has(id));

            const attendanceRecords: AttendanceRecord[] = [
              ...users.map((u: any) => {
                const existingRecord = existingAttendance.find((r: any) => r.userId === u.id);
                return {
                  userId: u.id,
                  userName: u.Name,
                  userEmail: u.Email,
                  votedStatus: null,
                  hasArrived: existingRecord ? existingRecord.hasArrived : false,
                  arrivalTime: existingRecord ? existingRecord.arrivalTime : undefined,
                };
              }),
              ...missingIds.map((id) => {
                const existingRecord = existingAttendance.find((r: any) => r.userId === id);
                return {
                  userId: id,
                  userName: 'Unknown User',
                  userEmail: '',
                  votedStatus: null,
                  hasArrived: existingRecord ? existingRecord.hasArrived : false,
                  arrivalTime: existingRecord ? existingRecord.arrivalTime : undefined,
                };
              })
            ];

            setAttendanceList(attendanceRecords);
            return;
          }
        }

        // Voting enabled: include users who voted 'going' or 'maybe'
        const allUsers = connectedUsers;
        const attendanceRecords: AttendanceRecord[] = [];

        for (const u of allUsers) {
          try {
            const userVote = await getUserVote(eventId, u.id);
            if (userVote === 'going' || userVote === 'maybe') {
              const existingRecord = existingAttendance.find((record: any) => record.userId === u.id);
              attendanceRecords.push({
                userId: u.id,
                userName: u.Name,
                userEmail: u.Email,
                votedStatus: userVote,
                hasArrived: existingRecord ? existingRecord.hasArrived : false,
                arrivalTime: existingRecord ? existingRecord.arrivalTime : undefined,
              });
            }
          } catch (error) {
            console.error(`Error fetching vote for user ${u.id}:`, error);
          }
        }

        setAttendanceList(attendanceRecords);
      } catch (error) {
        console.error('Error fetching attendance data:', error);
        Alert.alert('Error', 'Failed to load attendance data');
      }
    };

    fetchAttendanceData();
  }, [eventData, isAdmin, eventId, connectedUsers]);

  /**
   * Toggles attendance status for a specific user
   * Updates arrival time when marking as arrived
   * 
   * @param {string} userId - The user ID to toggle attendance for
   */
  const toggleAttendance = (userId: string): void => {
    setAttendanceList(prev =>
      prev.map(record =>
        record.userId === userId
          ? {
            ...record,
            hasArrived: !record.hasArrived,
            // Firestore rejects undefined; we'll normalize to null on save
            arrivalTime: !record.hasArrived ? new Date() : undefined
          }
          : record
      )
    );
  };

  /**
   * Saves attendance data to Firestore
   * Persists all attendance records for the event
   */
  const saveAttendance = async (): Promise<void> => {
    if (!eventId) return;

    try {
      setSaving(true);
      // Persist only arrived attendees (unchecked are effectively deleted)
      const normalized = attendanceList
        .filter((r) => r.hasArrived)
        .map((r) => ({
          userId: r.userId,
          userName: r.userName,
          userEmail: r.userEmail,
          votedStatus: r.votedStatus,
          hasArrived: true,
          arrivalTime: r.arrivalTime ?? new Date(),
        }));
      await updateAttendance(eventId, normalized as any);
      Alert.alert('Success', 'Attendance saved successfully');
    } catch (error) {
      console.error('Error saving attendance:', error);
      Alert.alert('Error', 'Failed to save attendance: ' + error);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Gets the count of participants who have arrived
   * 
   * @returns {number} Number of participants who have arrived
   */
  const getArrivedCount = (): number => {
    return attendanceList.filter(record => record.hasArrived).length;
  };

  /**
   * Gets the total number of expected participants
   * 
   * @returns {number} Total number of expected participants
   */
  const getTotalExpected = (): number => {
    return attendanceList.length;
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaWrapper>
        <YStack flex={1} bg="$background" justify="center" style={{ alignItems: 'center' }}>
          <Text color="$color10">Loading attendance...</Text>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  // Access denied state for non-admins
  if (!isAdmin) {
    return (
      <SafeAreaWrapper>
        <YStack>
          <YStack bg="$color1" px="$4" py="$3" borderBottomWidth={1} borderColor="$borderColor">
            <Button bg="$color2" borderColor="$borderColor" borderWidth={1} onPress={() => router.back()} px="$3" py="$2">
              <Text color="$color">← Back</Text>
            </Button>
          </YStack>
          <YStack flex={1} justify="center" style={{ alignItems: 'center' }} p="$4">
            <Text style={{ fontSize: 20, fontWeight: 'bold' }} color="$color">Access Denied</Text>
            <Text style={{ fontSize: 16 }} color="$color10">Only the event creator can manage attendance</Text>
          </YStack>
        </YStack>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper>
      <YStack>
        {/* Header */}
        <YStack bg="$color1" px="$4" py="$3" borderBottomWidth={1} borderColor="$borderColor">
          <XStack>
            <Button bg="$color2" borderColor="$borderColor" borderWidth={1} onPress={() => router.back()} px="$3" py="$2">
              <Text color="$color">← Back</Text>
            </Button>
          </XStack>
          <Text style={{ fontSize: 18, fontWeight: 'bold' }} color="$color" mt="$2">Event Attendance</Text>
        </YStack>

        <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
          {/* Event Info */}
          <Card bg="$color1" borderColor="$borderColor" borderWidth={1} p="$3" mb="$3" style={{ borderRadius: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }} color="$color">{eventData?.Title}</Text>
            <Text style={{ fontSize: 16 }} color="$color10" mt="$1">
              {eventData?.EventDate ?
                (eventData.EventDate.toDate ? eventData.EventDate.toDate().toLocaleString() : new Date(eventData.EventDate).toLocaleString())
                : 'Date not set'}
            </Text>
            <Text style={{ fontSize: 16 }} color="$color10">
              {typeof eventData?.Location === 'string' ? eventData.Location : 'Location not specified'}
            </Text>
          </Card>

          {/* Attendance Summary */}
          <Card bg="$color1" borderColor="$borderColor" borderWidth={1} p="$3" mb="$3" style={{ borderRadius: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }} color="$color" mb="$2">Attendance Summary</Text>
            <XStack justify="space-around">
              <YStack style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold' }} color="$color9">{getArrivedCount()}</Text>
                <Text style={{ fontSize: 14 }} color="$color10">Arrived</Text>
              </YStack>
              <YStack style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold' }} color="$color9">{getTotalExpected() - getArrivedCount()}</Text>
                <Text style={{ fontSize: 14 }} color="$color10">Not Arrived</Text>
              </YStack>
              <YStack style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold' }} color="$color9">{getTotalExpected()}</Text>
                <Text style={{ fontSize: 14 }} color="$color10">Total Expected</Text>
              </YStack>
            </XStack>
          </Card>

          {/* Attendance List */}
          <Card bg="$color1" borderColor="$borderColor" borderWidth={1} p="$3" mb="$3" style={{ borderRadius: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }} color="$color" mb="$2">Mark Attendance</Text>
            {attendanceList.length === 0 ? (
              <YStack style={{ alignItems: 'center' }} py="$4">
                <Text style={{ fontSize: 16, fontWeight: '600' }} color="$color10" mb="$1">No attendees found</Text>
                <Text style={{ fontSize: 14 }} color="$color10">{eventData?.VotingEnabled === false ? 'Selected participants will appear here' : "Users who voted 'going' or 'maybe' will appear here"}</Text>
              </YStack>
            ) : (
              attendanceList.map((record) => (
                <Button
                  key={record.userId}
                  onPress={() => toggleAttendance(record.userId)}
                  bg={record.hasArrived ? ('$success' as any) : ('$color2' as any)}
                  borderWidth={0}
                  p="$4"
                  mb="$3"
                  style={{ borderRadius: 10 }}
                  minH="$6"
                >
                  <XStack verticalAlign="center" space="$3">
                    {/* Left-aligned, vertically centered checkmark */}
                    <YStack>
                      <YStack width={40} height={40} style={{ borderRadius: 20, justifyContent: 'center', alignItems: 'center' }} bg={record.hasArrived ? ('$success' as any) : ('$color1' as any)}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold' }} color={record.hasArrived ? ('$color1' as any) : ('$color' as any)}>
                          {record.hasArrived ? '✓' : '○'}
                        </Text>
                      </YStack>
                    </YStack>
                    {/* Content column */}
                    <YStack flex={1}>
                      <Text style={{ fontSize: 18, fontWeight: '600' }} color={record.hasArrived ? ('$color1' as any) : ('$color' as any)}>{record.userName}</Text>
                      {eventData?.VotingEnabled !== false && record.votedStatus && (
                        <Text style={{ fontSize: 13 }} color={'$color9' as any} mt="$1">Voted: {record.votedStatus === 'going' ? 'Going' : 'Maybe'}</Text>
                      )}
                      {record.hasArrived && record.arrivalTime && (
                        <Text style={{ fontSize: 12 }} color={'$color10' as any} mt="$1">
                          {record.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                </Button>
              ))
            )}
          </Card>

          {/* Save Button */}
          <Button
            onPress={saveAttendance}
            disabled={saving}
            bg={saving ? ('$color2' as any) : ('$color9' as any)}
            color="$color1"
            p="$3"
            style={{ borderRadius: 12 }}
            mb="$6"
          >
            <Text color="$color1" style={{ fontWeight: 'bold' }}>{saving ? 'Saving...' : 'Save Attendance'}</Text>
          </Button>
        </ScrollView>
      </YStack>
    </SafeAreaWrapper>
  );
}
