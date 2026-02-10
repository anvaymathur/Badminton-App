/**
 * @fileoverview Firebase Firestore Services
 * 
 * Service layer providing all database operations for the Badminton App including
 * user management, group operations, event CRUD, voting system, and attendance tracking.
 */

// services/firestore.ts
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc, writeBatch, onSnapshot,
  increment, arrayUnion, CollectionReference, QueryDocumentSnapshot, DocumentData, getDocs, query, where,
  Timestamp, deleteDoc, documentId, or, addDoc
} from "firebase/firestore";
import { db, storage} from "./index";
import { UserDoc, GroupDoc, EventDoc, VoteShard, VoteStatus, newMatchHistory, AttendanceRecord, GroupInviteDoc } from "./types_index";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import * as ImageManipulator from 'expo-image-manipulator'

/**
 * Number of shards used for distributed vote counting to ensure scalability
 */
const NUM_SHARDS = 10;

// --- STORAGE ---
// Alternative: Convert image to Base64 for Firestore storage
export async function imageToBase64(uri: string): Promise<string> {
  try {
    // Target: keep under ~1,048,487 bytes (Firestore field limit in this app context)
    const MAX_BASE64_LENGTH = 1_048_000; // safe margin

    // Start with moderate target size/quality
    let width = 800; // downscale long edge
    let quality = 0.7; // JPEG quality

    for (let attempt = 0; attempt < 5; attempt++) {
      const actions: ImageManipulator.Action[] = [{ resize: { width } }];
      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      } as any);

      const dataUrl = `data:image/jpeg;base64,${result.base64 ?? ''}`;
      if (dataUrl.length <= MAX_BASE64_LENGTH) {
        console.log('Image converted to Base64 within limit:', dataUrl.length);
        return dataUrl;
      }

      // tighten constraints and try again
      width = Math.floor(width * 0.8);
      quality = Math.max(0.4, quality - 0.1);
    }

    // Final attempt with aggressive compression
    const finalResult = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 480 } }], {
      compress: 0.4,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    } as any);
    const finalDataUrl = `data:image/jpeg;base64,${finalResult.base64 ?? ''}`;
    console.log('Final compressed size:', finalDataUrl.length);
    return finalDataUrl;
  } catch (error) {
    console.error('Error converting image to Base64:', error);
    throw error;
  }
}

// Test function to verify Firebase Storage connectivity
export async function testStorageConnection(): Promise<boolean> {
  try {
    console.log('Testing Firebase Storage connection...');
    console.log('Storage bucket:', storage.app.options.storageBucket);
    
    // Try to create a simple test file
    const testRef = ref(storage, 'test-connection.txt');
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    
    await uploadBytes(testRef, testBlob);
    console.log('Storage connection test successful');
    
    // Clean up test file
    try {
      await deleteObject(testRef);
      console.log('Test file cleaned up');
    } catch (cleanupError) {
      console.log('Cleanup failed (not critical):', cleanupError);
    }
    
    return true;
  } catch (error) {
    console.error('Storage connection test failed:', error);
    return false;
  }
}
export async function uploadImage(uri: string, path: string): Promise<string> {
  try {
    console.log('Starting image upload for URI:', uri);
    console.log('Upload path:', path);
    
    // For React Native, we need to handle file URIs differently
    // Convert URI to blob with proper error handling
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log('Blob created, size:', blob.size);
    
    // Create storage reference
    const storageRef = ref(storage, path);
    
    // Upload blob with metadata
    const metadata = {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    };
    
    console.log('Uploading to Firebase Storage...');
    console.log('Storage bucket:', storage.app.options.storageBucket);
    
    // Try upload with retry logic
    let uploadResult;
    try {
      uploadResult = await uploadBytes(storageRef, blob, metadata);
      console.log('Upload completed successfully');
    } catch (uploadError) {
      console.error('Upload failed, trying alternative approach:', uploadError);
      
      // Alternative: Try without metadata
      uploadResult = await uploadBytes(storageRef, blob);
      console.log('Upload completed with alternative approach');
    }
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    console.log('Download URL obtained:', downloadURL);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      code: (error as any)?.code,
      serverResponse: (error as any)?.serverResponse
    });
    
    // Provide more specific error information
    if (error instanceof Error) {
      if (error.message.includes('storage/unauthorized')) {
        throw new Error('Storage access denied. Please check your authentication and storage rules.');
      } else if (error.message.includes('storage/quota-exceeded')) {
        throw new Error('Storage quota exceeded. Please try a smaller image.');
      } else if (error.message.includes('storage/unauthenticated')) {
        throw new Error('User not authenticated. Please log in again.');
      }
    }
    
    throw error;
  }
}

// --- USERS ---

/**
 * Creates a new user profile in Firestore
 * @param {string} uid - Unique user identifier (Auth0 sub)
 * @param {UserDoc} userDoc - Complete user document data
 * @returns {Promise<void>} Promise that resolves when user is created
 */
export async function createUserProfile(uid: string, userDoc: UserDoc): Promise<void> {
  console.log('createUserProfile', uid, userDoc)
  return setDoc(doc(db, "users", uid), userDoc);
}

/**
 * Retrieves a user profile from Firestore
 * @param {string} uid - Unique user identifier (Auth0 sub)
 * @returns {Promise<UserDoc | undefined>} User document or undefined if not found
 */
export async function getUserProfile(uid: string): Promise<UserDoc | undefined> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } as UserDoc : undefined;
}

export async function updateUserProfile(uid: string, data: Partial<UserDoc>): Promise<void> {
  return updateDoc(doc(db, "users", uid), data);
}

export async function getAllUserProfiles(): Promise<UserDoc[]> {
  const usersCol = collection(db, "users");
  const snapshot = await getDocs(usersCol);
  const users: UserDoc[] = [];
  snapshot.forEach(doc => {
    users.push({ id: doc.id, ...doc.data() } as UserDoc);
  });
  return users;
}

export async function getEventUserProfiles(eventId: string): Promise<UserDoc[]> {
  // First get the event to find users who voted
  const eventSnap = await getDoc(doc(db, "events", eventId));
  if (!eventSnap.exists()) {
    return [];
  }

  // Get all user votes for this event
  const userVotesCol = collection(db, "events", eventId, "userVotes");
  const userVotesSnapshot = await getDocs(userVotesCol);
  
  // Extract user IDs from votes where status is "going" (yes)
  const userIds = new Set<string>();
  userVotesSnapshot.forEach(doc => {
    const voteData = doc.data();
    if (voteData.userId && voteData.status === "going") {
      userIds.add(voteData.userId);
    }
  });

  // Get user profiles for all users who voted "going"
  const users: UserDoc[] = [];
  for (const userId of userIds) {
    const userProfile = await getUserProfile(userId);
    if (userProfile) {
      users.push(userProfile);
    }
  }

  return users;
}

// --- GROUPS ---
import { v4 as uuidv4 } from 'uuid';


export async function createGroup(userId: string, group: Omit<GroupDoc, "ownerId" | "memberIds" | "createdAt">): Promise<string> {
  const groupRef = doc(collection(db, "groups"));
  const groupId = groupRef.id
  const now = new Date();
  const batch = writeBatch(db);
  batch.set(groupRef, {
    ...group,
    id: groupId,
    createdAt: now
  });
  const userRef = doc(db, "users", userId);
  batch.set(userRef, { Groups: arrayUnion(groupId) }, { merge: true });
  await batch.commit();
  return groupId;
}

export async function getGroups(): Promise<GroupDoc[]> {
  const groupsCol = collection(db, "groups");
  const snapshot = await getDocs(groupsCol);
  const groups: GroupDoc[] = [];
  snapshot.forEach(doc => {
    groups.push({ id: doc.id, ...doc.data() } as GroupDoc);
  });
  return groups;
}

export async function getUserGroups(userId: string): Promise<GroupDoc[]> {
  const groupsCol = collection(db, "groups");
  const q = query(groupsCol, where("MemberIds", "array-contains", userId));
  const snapshot = await getDocs(q);
  const groups: GroupDoc[] = [];
  snapshot.forEach(doc => {
    groups.push({ id: doc.id, ...doc.data() } as GroupDoc);
  });
  return groups;
}

export async function getGroupById(groupId: string): Promise<GroupDoc | undefined> {
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as GroupDoc) : undefined;
}

export async function getUsersByIds(userIds: string[]): Promise<UserDoc[]> {
  const users: UserDoc[] = [];
  for (const uid of userIds) {
    const profile = await getUserProfile(uid);
    if (profile) users.push(profile);
  }
  return users;
}

// Batched fetch for user profiles using documentId() and chunking (max 10 IDs per query)
export async function getUserProfilesByIds(userIds: string[]): Promise<Record<string, UserDoc | undefined>> {
  if (!userIds || userIds.length === 0) return {};
  const usersCol = collection(db, "users");
  const result: Record<string, UserDoc | undefined> = {};
  const chunkSize = 10; // Firestore limit for 'in' queries
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const q = query(usersCol, where(documentId(), 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach(d => {
      result[d.id] = { id: d.id, ...d.data() } as UserDoc;
    });
    // Any IDs not returned will remain undefined
  }
  return result;
}

function incrementOrPushToArray(groupId: string) {
  // This is a placeholder. In a real implementation, you'd use arrayUnion
  // For now, we'll handle group membership separately if needed
  return groupId;
}

// --- EVENTS ---
export async function createEvent(event: EventDoc) {
  const eventRef = doc(collection(db, "events"));
  const batch = writeBatch(db);
  
  // Create event document with the generated ID included
  // Destructure to exclude the id field and then add the generated ID
  const { id, ...eventWithoutId } = event;
  const eventWithId = {
    ...eventWithoutId,
    id: eventRef.id
  };
  batch.set(eventRef, eventWithId);

  // Pre-seed vote shards only if voting is enabled
  if (event.VotingEnabled !== false) {
    for (let i = 0; i < NUM_SHARDS; i++) {
      batch.set(doc(collection(eventRef, "voteShards"), i.toString()), {
        going: 0, maybe: 0, not: 0
      });
    }
  }
  await batch.commit();
  return eventRef.id;
}

export async function updateEvent(eventId: string, updates: Partial<EventDoc>) {
  return updateDoc(doc(db, "events", eventId), updates);
}

export async function deleteEvent(eventId: string) {
  await deleteDoc(doc(db, "events", eventId));
}

export async function getEvent(eventId: string) {
  const snap = await getDoc(doc(db, "events", eventId));
  return snap.exists() ? snap.data() : undefined;
}

// --- HELPER FUNCTIONS ---

// Check if two events overlap in time
function eventsOverlap(event1: any, event2: any): boolean {
  const start1 = new Date(event1.EventDate);
  const start2 = new Date(event2.EventDate);
  
  // Assume events last 2 hours by default (can be made configurable)
  const duration = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  const end1 = new Date(start1.getTime() + duration);
  const end2 = new Date(start2.getTime() + duration);
  
  // Check if events overlap
  return start1 < end2 && start2 < end1;
}

// DEPRECATED: This function is too slow - queries all events and all votes
// Get all events where user has voted 'going'
async function getUserGoingEvents(userId: string): Promise<any[]> {
  const eventsCol = collection(db, "events");
  const snapshot = await getDocs(eventsCol);
  const userEvents: any[] = [];
  
  for (const eventDoc of snapshot.docs) {
    const eventData = eventDoc.data();
    const userVote = await getUserVote(eventDoc.id, userId);
    
    if (userVote === 'going') {
      userEvents.push({
        id: eventDoc.id,
        ...eventData
      });
    }
  }
  
  return userEvents;
}

// OPTIMIZED: Future implementation could use indexed queries
// async function getUserGoingEventsOptimized(userId: string): Promise<any[]> {
//   // This would require a composite index on (userId, status) in userVotes subcollection
//   // and would be much faster than the current implementation
//   return [];
// }

// Check if voting for this event would conflict with user's existing 'going' votes
async function checkTimeConflict(eventId: string, userId: string): Promise<{ hasConflict: boolean; conflictingEvent?: any }> {
  const currentEventRef = doc(db, "events", eventId);
  const currentEventSnap = await getDoc(currentEventRef);
  
  if (!currentEventSnap.exists()) {
    throw new Error('Event not found');
  }
  
  const currentEvent = currentEventSnap.data();
  const userGoingEvents = await getUserGoingEvents(userId);
  
  // Check for conflicts with existing 'going' votes
  for (const userEvent of userGoingEvents) {
    if (userEvent.id !== eventId && eventsOverlap(currentEvent, userEvent)) {
      return {
        hasConflict: true,
        conflictingEvent: userEvent
      };
    }
  }
  
  return { hasConflict: false };
}

// --- SHARDED VOTE SYSTEM ---
export async function castVote(eventId: string, status: keyof VoteShard, userId: string = 'default-user') {
  // First check if voting is enabled for this event
  const eventRef = doc(db, "events", eventId);
  const eventSnap = await getDoc(eventRef);
  
  if (!eventSnap.exists()) {
    throw new Error('Event not found');
  }
  
  const eventData = eventSnap.data();
  if (eventData.VotingEnabled === false) {
    throw new Error('Voting is not enabled for this event');
  }

  // Check if event has started (naturally or early)
  const eventStarted = hasEventStarted(eventData.EventDate);
  const startedEarly = eventData.StartedEarly === true;
  
  if (eventStarted || startedEarly) {
    throw new Error('Voting is closed because the event has started');
  }

  // Check if voting cutoff has passed
  if (eventData.CutoffDate) {
    const cutoffDate = new Date(eventData.CutoffDate.toDate ? eventData.CutoffDate.toDate() : eventData.CutoffDate);
    const now = new Date();
    if (now > cutoffDate) {
      throw new Error('Voting cutoff time has passed');
    }
  }

  // COMMENTED OUT FOR PERFORMANCE - Re-enable if needed
  // Check for time conflicts if user is voting 'going'
  // if (status === 'going') {
  //   const conflictCheck = await checkTimeConflict(eventId, userId);
  //   if (conflictCheck.hasConflict) {
  //     const conflictingEvent = conflictCheck.conflictingEvent;
  //     const conflictingDate = new Date(conflictingEvent.EventDate).toLocaleDateString();
  //     const conflictingTime = new Date(conflictingEvent.EventDate).toLocaleTimeString([], { 
  //       hour: '2-digit', 
  //       minute: '2-digit' 
  //     });
  //     throw new Error(`You cannot attend this event because it conflicts with "${conflictingEvent.Title}" on ${conflictingDate} at ${conflictingTime}. You can only attend one event at a time.`);
  //   }
  // }

  // Check if user has already voted
  const userVoteRef = doc(db, "events", eventId, "userVotes", userId);
  const userVoteSnap = await getDoc(userVoteRef);
  
  // Use consistent shard selection based on userId for better performance
  const getUserShard = (userId: string) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % NUM_SHARDS;
  };
  
  const batch = writeBatch(db);
  
  if (userVoteSnap.exists()) {
    // User has voted before - update their vote
    const previousVote = userVoteSnap.data()?.status;
    
    if (previousVote === status) {
      // Same vote - no change needed
      return;
    }
    
    // Use consistent shard for this user
    const userShard = getUserShard(userId);
    const shardRef = doc(db, "events", eventId, "voteShards", userShard.toString());
    
    // Update vote counts in single shard operation
    batch.update(shardRef, { 
      [previousVote]: increment(-1),
      [status]: increment(1)
    });
    
    // Update user's vote record
    batch.set(userVoteRef, {
      status,
      votedAt: new Date(),
      userId
    });
  } else {
    // First time voting - just add the vote
    const userShard = getUserShard(userId);
    const shardRef = doc(db, "events", eventId, "voteShards", userShard.toString());
    batch.update(shardRef, { [status]: increment(1) });
    
    // Record user's vote
    batch.set(userVoteRef, {
      status,
      votedAt: new Date(),
      userId
    });
  }
  
  await batch.commit();
}

export async function getUserVote(eventId: string, userId: string = 'default-user'): Promise<VoteStatus | null> {
  const userVoteRef = doc(db, "events", eventId, "userVotes", userId);
  const userVoteSnap = await getDoc(userVoteRef);
  
  if (userVoteSnap.exists()) {
    return userVoteSnap.data()?.status || null;
  }
  return null;
}

export function listenVoteCounts(
  eventId: string,
  callback: (totals: VoteShard) => void
) {
  return onSnapshot(collection(db, "events", eventId, "voteShards"), snap => {
    const totals = { going: 0, maybe: 0, not: 0 };
    snap.forEach(doc => {
      const v = doc.data() as VoteShard;
      totals.going += v.going || 0;
      totals.maybe += v.maybe || 0;
      totals.not += v.not || 0;
    });
    callback(totals);
  }, (error) => {
    // If vote shards don't exist (e.g., voting disabled), return zeros
    callback({ going: 0, maybe: 0, not: 0 });
  });
}

export async function getVoteCounts(eventId: string): Promise<VoteShard> {
  try {
    const snapshot = await getDocs(collection(db, "events", eventId, "voteShards"));
    const totals = { going: 0, maybe: 0, not: 0 };
    snapshot.forEach(doc => {
      const v = doc.data() as VoteShard;
      totals.going += v.going || 0;
      totals.maybe += v.maybe || 0;
      totals.not += v.not || 0;
    });
    return totals;
  } catch (error) {
    // If vote shards don't exist (e.g., voting disabled), return zeros
    return { going: 0, maybe: 0, not: 0 };
  }
}


// --- REAL-TIME EVENT LISTENER ---
export function listenGroupEvents(groupId: string, callback: (events: EventDoc[]) => void) {
  const eventsCol = collection(db, "events");
  return onSnapshot(eventsCol, snap => {
    const result: EventDoc[] = [];
    snap.forEach(doc => {
      const evt = doc.data();
      // Check if the event has the group in its GroupIDs array
      if (evt.GroupIDs && evt.GroupIDs.includes(groupId)) {
        result.push({ 
          id: doc.id, 
          GroupIDs: evt.GroupIDs,
          IndividualParticipantIDs: evt.IndividualParticipantIDs,
          Title: evt.Title,
          EventDate: evt.EventDate,
          Location: evt.Location,
          TotalCost: evt.TotalCost,
          CutoffDate: evt.CutoffDate,
          CreatorID: evt.CreatorID,
          VotingEnabled: evt.VotingEnabled
        } as EventDoc);
      }
    });
    callback(result);
  });
}

export function listenUserGroupEvents(userGroupIds: string[], userId: string, callback: (events: EventDoc[]) => void) {
  const eventsCol = collection(db, "events");
  return onSnapshot(eventsCol, snap => {
    const result: EventDoc[] = [];
    snap.forEach(doc => {
      const evt = doc.data();
      // Check if user is in any of the groups OR is an individual participant
      const isInGroup = evt.GroupIDs && evt.GroupIDs.some((groupId: string) => userGroupIds.includes(groupId));
      const isIndividualParticipant = evt.IndividualParticipantIDs && evt.IndividualParticipantIDs.includes(userId);
      
      if (isInGroup || isIndividualParticipant) {
        result.push({ 
          id: doc.id, 
          GroupIDs: evt.GroupIDs,
          IndividualParticipantIDs: evt.IndividualParticipantIDs,
          Title: evt.Title,
          EventDate: evt.EventDate,
          Location: evt.Location,
          TotalCost: evt.TotalCost,
          CutoffDate: evt.CutoffDate,
          CreatorID: evt.CreatorID,
          VotingEnabled: evt.VotingEnabled
        } as EventDoc);
      }
    });
    callback(result);
  });
}

export function listenAllEvents(userId: string, callback: (events: EventDoc[]) => void) {
  const eventsCol = collection(db, "events");
  return onSnapshot(eventsCol, snap => {
    const result: EventDoc[] = [];
    snap.forEach(doc => {
      const evt = doc.data();
      // Check if user is an individual participant or the creator
      const isIndividualParticipant = evt.IndividualParticipantIDs && evt.IndividualParticipantIDs.includes(userId);
      const isCreator = evt.CreatorID === userId;
      
      if (isIndividualParticipant || isCreator) {
        result.push({ 
          id: doc.id, 
          GroupIDs: evt.GroupIDs,
          IndividualParticipantIDs: evt.IndividualParticipantIDs,
          Title: evt.Title,
          EventDate: evt.EventDate,
          Location: evt.Location,
          TotalCost: evt.TotalCost,
          CutoffDate: evt.CutoffDate,
          CreatorID: evt.CreatorID,
          VotingEnabled: evt.VotingEnabled
        } as EventDoc);
      }
    });
    callback(result);
  });
}

// --- MATCH HISTORY ---
export async function createMatchHistory(matchData: newMatchHistory) {
  const matchHistoryRef = doc(collection(db, "matchHistory"));
  const { id, ...matchDataWithoutId } = matchData;
  const matchDataWithId = {
    ...matchDataWithoutId,
    id: matchHistoryRef.id
  };
  return setDoc(matchHistoryRef, matchDataWithId);
}

export async function updateMatchHistory(
  matchId: string,
  updates: Partial<newMatchHistory>
) {
  const { id: _ignored, ...rest } = updates as Record<string, unknown>;
  return updateDoc(doc(db, "matchHistory", matchId), rest);
}

export async function getUserMatchHistory(userId: string): Promise<newMatchHistory[]> {
  const matchHistoryCol = collection(db, "matchHistory");
  // Query only documents where userId is in either team1 or team2
  const q = query(
    matchHistoryCol,
    or(
      where('team1', 'array-contains', userId),
      where('team2', 'array-contains', userId)
    )
  );
  const snapshot = await getDocs(q);
  const userMatches: newMatchHistory[] = snapshot.docs.map(d => {
    const data = d.data() as newMatchHistory;
    return { ...data, id: (data as any).id ?? d.id } as newMatchHistory;
  });
  
  // Sort by date (most recent first) with proper Firestore timestamp handling
  return userMatches.sort((a, b) => {
    let dateA: Date, dateB: Date;
    
    // Handle Firestore timestamps
    if (a.date && typeof a.date === 'object' && 'toDate' in a.date) {
      dateA = (a.date as any).toDate();
    } else {
      dateA = new Date(a.date);
    }
    
    if (b.date && typeof b.date === 'object' && 'toDate' in b.date) {
      dateB = (b.date as any).toDate();
    } else {
      dateB = new Date(b.date);
    }
    
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });
}

// --- ATTENDANCE FUNCTIONS ---

// Update attendance records for an event
export async function updateAttendance(eventId: string, attendanceRecords: AttendanceRecord[]) {
  const eventRef = doc(db, "events", eventId);
  
  // Convert dates to Firestore timestamps
  const recordsWithTimestamps = attendanceRecords.map(record => ({
    ...record,
    arrivalTime: record.arrivalTime ? Timestamp.fromDate(record.arrivalTime) : undefined
  }));

  await updateDoc(eventRef, {
    AttendanceRecords: recordsWithTimestamps
  });
}

// Get attendance records for an event
export async function getAttendanceRecords(eventId: string): Promise<AttendanceRecord[]> {
  const eventRef = doc(db, "events", eventId);
  const eventSnap = await getDoc(eventRef);
  
  if (!eventSnap.exists()) {
    throw new Error('Event not found');
  }
  
  const eventData = eventSnap.data();
  const records = eventData.AttendanceRecords || [];
  
  // Convert Firestore timestamps back to Date objects
  return records.map((record: any) => ({
    ...record,
    arrivalTime: record.arrivalTime ? record.arrivalTime.toDate() : undefined
  }));
}

// Check if event has started (for showing attendance button)
export function hasEventStarted(eventDate: any): boolean {
  const now = new Date();
  let eventDateTime: Date;
  
  // Handle Firestore timestamps
  if (eventDate && typeof eventDate === 'object' && 'toDate' in eventDate) {
    eventDateTime = eventDate.toDate();
  } else {
    eventDateTime = new Date(eventDate);
  }
  
  return now >= eventDateTime;
}


// Add: fetch a single match by ID
export async function getMatchHistoryById(matchId: string): Promise<newMatchHistory | undefined> {
  const snap = await getDoc(doc(db, "matchHistory", matchId));
  return snap.exists() ? (snap.data() as newMatchHistory) : undefined;
}

export async function deleteMatchHistory(matchId: string) {
  return deleteDoc(doc(db, "matchHistory", matchId));
}

export async function createGroupInvite(groupInvite: GroupInviteDoc) {
  // Use the inviteCode as the document ID for easy retrieval
  const inviteRef = doc(db, "groupInvites", groupInvite.inviteCode);
  return setDoc(inviteRef, groupInvite);
}

export async function getGroupInvite(inviteCode: string): Promise<GroupInviteDoc | undefined> {
  // Direct document read using inviteCode as document ID
  const snap = await getDoc(doc(db, "groupInvites", inviteCode));
  return snap.exists() ? (snap.data() as GroupInviteDoc) : undefined;
}

export async function getGroupInvites(groupId: string): Promise<GroupInviteDoc[]> {
  const invitesCol = collection(db, "groupInvites");
  const q = query(invitesCol, where("groupId", "==", groupId));
  const snapshot = await getDocs(q);
  const invites: GroupInviteDoc[] = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    invites.push({
      ...data,
      id: doc.id
    } as GroupInviteDoc);
  });
  
  // Sort by validUntil date (most recent first)
  return invites.sort((a, b) => {
    const dateA = new Date(a.validUntil);
    const dateB = new Date(b.validUntil);
    return dateB.getTime() - dateA.getTime();
  });
}


export async function addGroupMember(userId: string, groupId: string){
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) {
    return;
  }
  const groupData = groupSnap.data() as GroupDoc;
  
  // Check if user is already a member
  if (groupData.MemberIds && groupData.MemberIds.includes(userId)) {
    return false; // User is already a member
  }
  
  const batch = writeBatch(db);
  
  // Add userId to group's MemberIds array (deduped)
  batch.set(groupRef, { MemberIds: arrayUnion(userId) }, { merge: true });
  
  // Add groupId to user's Groups array (deduped)
  const userRef = doc(db, "users", userId);
  batch.set(userRef, { Groups: arrayUnion(groupId) }, { merge: true });
  
  await batch.commit();
  return true;
}

// --- TEMPORARY USER OPERATIONS ---

/**
 * Writes a temporary user document into the users collection.
 * Caller is responsible for generating the uid (nanoid) and populating the doc
 * with isTemp, owners, and claimedBy fields.
 */
export async function createTempUser(userDoc: Omit<UserDoc, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, "users"), userDoc);
  return ref.id;
}

/**
 * Finds an unclaimed temp user by normalised email.
 * Returns undefined if no match or if email is empty.
 */
export async function findUnclaimedTempByEmail(email: string): Promise<UserDoc | undefined> {
  if (!email || !email.trim()) return undefined;
  const usersCol = collection(db, "users");
  const q = query(usersCol,
    where("isTemp", "==", true),
    where("claimedBy", "==", null),
    where("Email", "==", email.toLowerCase().trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return undefined;
  const first = snap.docs[0];
  return { id: first.id, ...first.data() } as UserDoc;
}

/**
 * Finds an unclaimed temp user by normalised phone (digits only).
 * Returns undefined if no match or if phone is empty.
 */
export async function findUnclaimedTempByPhone(phone: string): Promise<UserDoc | undefined> {
  const normalized = phone ? phone.replace(/\D/g, '') : '';
  if (!normalized) return undefined;
  const usersCol = collection(db, "users");
  const q = query(usersCol,
    where("isTemp", "==", true),
    where("claimedBy", "==", null),
    where("Phone", "==", normalized)
  );
  const snap = await getDocs(q);
  if (snap.empty) return undefined;
  const first = snap.docs[0];
  return { id: first.id, ...first.data() } as UserDoc;
}

/**
 * Returns all unclaimed temp users owned by the given user.
 * Used to populate the player picker with temps the current user can reuse.
 */
export async function findUnclaimedTempsByOwner(ownerSub: string): Promise<UserDoc[]> {
  const usersCol = collection(db, "users");
  const q = query(usersCol,
    where("isTemp", "==", true),
    where("claimedBy", "==", null),
    where("owners", "array-contains", ownerSub)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc));
}

/**
 * Appends an owner to a temp user's owners array (idempotent via arrayUnion).
 */
export async function addTempOwner(tempId: string, ownerSub: string): Promise<void> {
  return updateDoc(doc(db, "users", tempId), { owners: arrayUnion(ownerSub) });
}

/**
 * Marks a temp user as claimed by setting claimedBy to the real user's Auth0 sub.
 * The document is never deleted — it persists as an audit trail.
 */
export async function markTempClaimed(tempId: string, realSub: string): Promise<void> {
  return updateDoc(doc(db, "users", tempId), { claimedBy: realSub });
}

/**
 * Migrates all matchHistory references from oldId to newId.
 * Replaces oldId with newId in positions 0 and 1 of both team arrays (the player ID slots).
 * Idempotent: documents where oldId is already gone are skipped.
 * Returns the number of documents actually updated.
 */
export async function migrateMatchRefs(oldId: string, newId: string): Promise<number> {
  const matchCol = collection(db, "matchHistory");
  const q = query(matchCol, or(
    where('team1', 'array-contains', oldId),
    where('team2', 'array-contains', oldId)
  ));
  const snap = await getDocs(q);
  let updated = 0;
  for (const matchDoc of snap.docs) {
    const data = matchDoc.data();
    const team1 = [...(data.team1 || [])];
    const team2 = [...(data.team2 || [])];
    let changed = false;
    if (team1[0] === oldId) { team1[0] = newId; changed = true; }
    if (team1[1] === oldId) { team1[1] = newId; changed = true; }
    if (team2[0] === oldId) { team2[0] = newId; changed = true; }
    if (team2[1] === oldId) { team2[1] = newId; changed = true; }
    if (changed) {
      await updateDoc(doc(db, "matchHistory", matchDoc.id), { team1, team2 });
      updated++;
    }
  }
  return updated;
}

/**
 * Merges the absorbed temp user into the survivor:
 *   1. Rewrites all match references from absorbed → survivor
 *   2. Unions the absorbed temp's owners onto the survivor
 *   3. Marks the absorbed temp as claimed with a synthetic merge marker
 */
export async function mergeTempUsers(survivorId: string, absorbedId: string): Promise<void> {
  await migrateMatchRefs(absorbedId, survivorId);

  const absorbedSnap = await getDoc(doc(db, "users", absorbedId));
  if (absorbedSnap.exists()) {
    const absorbedOwners: string[] = absorbedSnap.data()?.owners || [];
    if (absorbedOwners.length > 0) {
      await updateDoc(doc(db, "users", survivorId), { owners: arrayUnion(...absorbedOwners) });
    }
  }

  await updateDoc(doc(db, "users", absorbedId), { claimedBy: `__merged:${survivorId}` });
}

/**
 * Shared detection helper: finds all unclaimed temp users whose Email or Phone
 * matches the given values. Deduplicates by ID (both queries may return the same doc).
 * Used by the login / signup flow to decide whether to show the claiming screen.
 */
export async function checkForClaimableTemps(email: string, phone: string): Promise<UserDoc[]> {
  const [byEmail, byPhone] = await Promise.all([
    findUnclaimedTempByEmail(email),
    findUnclaimedTempByPhone(phone),
  ]);
  const seen = new Set<string>();
  const results: UserDoc[] = [];
  for (const tempDoc of [byEmail, byPhone]) {
    if (tempDoc && !seen.has(tempDoc.id)) {
      seen.add(tempDoc.id);
      results.push(tempDoc);
    }
  }
  return results;
}
